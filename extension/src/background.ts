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

const supabase =
  SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

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

// ─── Snippet sync ────────────────────────────────────────────────────────────

async function syncSnippets() {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    console.warn(
      "[SnipDM] Missing Supabase env vars. Set PLASMO_PUBLIC_SUPABASE_URL and PLASMO_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
    );
    return;
  }
  const session = await getSession();
  const apiKey = await getApiKey();
  if (!session?.access_token || !apiKey) return;

  try {
    if (!supabase) return;

    const { error: sessionError } = await supabase.auth.setSession(
      session as { access_token: string; refresh_token: string }
    );
    if (sessionError) throw sessionError;

    const { data: snippets, error } = await supabase
      .from("snippets")
      .select("id,title,shortcut,body,shared_scope,snippet_tags(tag_name,tag_color)");

    if (error) throw error;

    await storage.set("snippets", snippets);
    await storage.set("lastSynced", Date.now());
    return snippets;
  } catch (err) {
    console.error("[SnipDM] Sync failed:", err);
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
      .then(() => sendResponse({ ok: true }))
      .catch((err) => {
        console.error("[SnipDM] SYNC_NOW failed:", err);
        sendResponse({ ok: false });
      });
    return true;
  }

  if (message.type === "SET_SESSION") {
    void syncSnippets().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "RECORD_USE") {
    sendResponse({ ok: true });
  }
});
