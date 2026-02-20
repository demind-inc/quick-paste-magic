/**
 * SnipDM Background Service Worker (Plasmo)
 * Handles: auth token storage, snippet sync, command routing
 * Uses @plasmohq/storage (chrome.storage.local) so it matches the popup.
 */

import { createClient } from "@supabase/supabase-js";
import { Storage } from "@plasmohq/storage";

const storage = new Storage({ area: "local" });

const SUPABASE_URL = process.env.PLASMO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.PLASMO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

let supabase: ReturnType<typeof createClient> | null = null;
let warnedInvalidSupabaseConfig = false;

const isValidSupabaseUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const getSupabaseClient = () => {
  if (!supabase) {
    if (
      !SUPABASE_URL ||
      !SUPABASE_PUBLISHABLE_KEY ||
      !isValidSupabaseUrl(SUPABASE_URL)
    ) {
      if (!warnedInvalidSupabaseConfig) {
        warnedInvalidSupabaseConfig = true;
      }
      return null;
    }
    supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabase;
};

// ─── Auth (@plasmohq/storage local, same as popup) ─────────────────────────────

type StoredSession = { access_token?: string; [key: string]: unknown } | null;

async function getSession(): Promise<StoredSession> {
  const session = await storage.get<StoredSession>("session");
  return session ?? null;
}

async function getApiKey(): Promise<string | null> {
  const apiKey = await storage.get<string>("apiKey");
  return apiKey ?? null;
}

async function clearStoredAuth(): Promise<void> {
  await storage.remove("session");
  await storage.remove("apiKey");
  await storage.remove("domainAllowlist");
}

// ─── Snippet sync ────────────────────────────────────────────────────────────

async function syncSnippets() {
  const client = getSupabaseClient();
  if (!client) return;
  const session = await getSession();
  const apiKey = await getApiKey();
  if (!session?.access_token || !apiKey) return;

  try {
    const { error: sessionError } = await client.auth.setSession(
      session as { access_token: string; refresh_token: string }
    );

    if (sessionError) {
      if (sessionError.status === 400) {
        await clearStoredAuth();
        return { sessionInvalid: true };
      }
      throw sessionError;
    }

    const { data: snippets, error } = await client
      .from("snippets")
      .select(
        "id,title,shortcut,body,shared_scope,snippet_tags(tag_name,tag_color)"
      );

    if (error) throw error;

    await storage.set("snippets", snippets);
    await storage.set("lastSynced", Date.now());

    try {
      const { data: userData } = await client.auth.getUser();
      const userId = userData?.user?.id;
      if (userId) {
        const { data: memberData } = await client
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", userId)
          .limit(1)
          .maybeSingle();
        const workspaceId = memberData?.workspace_id;
        if (workspaceId) {
          const { data: workspaceData } = await client
            .from("workspaces")
            .select("domain_allowlist")
            .eq("id", workspaceId)
            .maybeSingle();
          const allowlist = workspaceData?.domain_allowlist ?? [];
          await storage.set("domainAllowlist", allowlist);
        }
      }
    } catch {
      // Ignore allowlist sync failures
    }

    return snippets;
  } catch {
    // Sync failed; storage keeps previous snippets
  }
}

// Snippets are synced when the popup opens (SYNC_NOW), not on a timer.
// Keyboard shortcut (Ctrl+Shift+Space / Cmd+Shift+Space) is handled in the
// content script so it works reliably without chrome.commands.

// ─── Message handler ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_SNIPPETS") {
    storage.get("snippets").then((snippets) => {
      sendResponse({ snippets: snippets ?? [] });
    });
    return true;
  }

  if (message.type === "SYNC_NOW") {
    syncSnippets()
      .then((result) => {
        if (result && "sessionInvalid" in result && result.sessionInvalid) {
          sendResponse({ ok: false, sessionInvalid: true });
        } else {
          sendResponse({ ok: true });
        }
      })
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === "SET_SESSION") {
    syncSnippets()
      .then((result) => {
        if (result && "sessionInvalid" in result && result.sessionInvalid) {
          sendResponse({ ok: false, sessionInvalid: true });
        } else {
          sendResponse({ ok: true });
        }
      })
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === "RECORD_USE") {
    sendResponse({ ok: true });
  }
});
