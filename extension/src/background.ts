/**
 * SnipDM Background Service Worker (Plasmo)
 * Handles: auth token storage, snippet sync, command routing
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.PLASMO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.PLASMO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

const supabase =
  SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

// ─── Auth ───────────────────────────────────────────────────────────────────

async function getSession() {
  const { session } = await chrome.storage.local.get("session");
  return session ?? null;
}

async function setSession(session: unknown) {
  await chrome.storage.local.set({ session });
}

async function getApiKey() {
  const { apiKey } = await chrome.storage.local.get("apiKey");
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

    const { error: sessionError } = await supabase.auth.setSession(session);
    if (sessionError) throw sessionError;

    const { data: snippets, error } = await supabase
      .from("snippets")
      .select(
        "id,title,shortcut,body,shared_scope,snippet_tags(tag_id,tags(id,name,color))"
      );

    if (error) throw error;

    await chrome.storage.local.set({ snippets, lastSynced: Date.now() });
    return snippets;
  } catch (err) {
    console.error("[SnipDM] Sync failed:", err);
  }
}

// ─── Periodic sync (every 5 min) ─────────────────────────────────────────────

chrome.alarms.create("syncSnippets", { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "syncSnippets") void syncSnippets();
});

// ─── Keyboard command ────────────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "open-snippet-picker") {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: "OPEN_PICKER" });
    }
  }
});

// ─── Message handler ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_SNIPPETS") {
    chrome.storage.local.get("snippets").then(({ snippets }) => {
      sendResponse({ snippets: snippets ?? [] });
    });
    return true;
  }

  if (message.type === "SYNC_NOW") {
    syncSnippets().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "SET_SESSION") {
    setSession(message.session).then(() => {
      void syncSnippets();
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "RECORD_USE") {
    sendResponse({ ok: true });
  }
});

// Initial sync on install / startup
chrome.runtime.onInstalled.addListener(() => void syncSnippets());
chrome.runtime.onStartup.addListener(() => void syncSnippets());
