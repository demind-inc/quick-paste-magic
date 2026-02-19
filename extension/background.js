/**
 * SnipDM Background Service Worker
 * Handles: auth token storage, snippet sync, command routing
 */

const SUPABASE_URL = "https://YOUR_SUPABASE_URL.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

// ─── Auth ───────────────────────────────────────────────────────────────────

async function getSession() {
  const { session } = await chrome.storage.local.get("session");
  return session ?? null;
}

async function setSession(session) {
  await chrome.storage.local.set({ session });
}

async function getApiKey() {
  const { apiKey } = await chrome.storage.local.get("apiKey");
  return apiKey ?? null;
}

// ─── Snippet sync ────────────────────────────────────────────────────────────

async function syncSnippets() {
  const session = await getSession();
  const apiKey = await getApiKey();
  if (!session?.access_token || !apiKey) return;

  try {
    // Fetch snippets for workspace matching the API key
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/snippets?select=id,title,shortcut,body,shared_scope,snippet_tags(tag_id,tags(id,name,color))`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!res.ok) throw new Error(await res.text());

    const snippets = await res.json();
    await chrome.storage.local.set({ snippets, lastSynced: Date.now() });
    return snippets;
  } catch (err) {
    console.error("[SnipDM] Sync failed:", err);
  }
}

// ─── Periodic sync (every 5 min) ─────────────────────────────────────────────

chrome.alarms.create("syncSnippets", { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "syncSnippets") syncSnippets();
});

// ─── Keyboard command ────────────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "open-snippet-picker") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
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
    return true; // async
  }

  if (message.type === "SYNC_NOW") {
    syncSnippets().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "SET_SESSION") {
    setSession(message.session).then(() => {
      syncSnippets();
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "RECORD_USE") {
    // Increment use_count server-side via RPC (not implemented in scaffold)
    sendResponse({ ok: true });
  }
});

// Initial sync on install / startup
chrome.runtime.onInstalled.addListener(syncSnippets);
chrome.runtime.onStartup.addListener(syncSnippets);
