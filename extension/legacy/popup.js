/**
 * SnipDM Extension Popup
 *
 * Vanilla JS popup UI. In production you'd build this with React + Vite.
 * This scaffold demonstrates the required functionality:
 *   - Login form (paste API key)
 *   - Snippet search list
 *   - Click → insert into active tab or copy to clipboard
 *   - Placeholder fill modal
 */

const SUPABASE_URL = "https://YOUR_SUPABASE_URL.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

let snippets = [];
let filteredSnippets = [];

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const root = document.getElementById("root");

function detectVariables(body) {
  const regex = /\{([^}]+)\}/g;
  const seen = new Set();
  const results = [];
  let match;
  while ((match = regex.exec(body)) !== null) {
    const [name, defaultVal] = match[1].split("=");
    const key = name.trim();
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ name: key, defaultValue: defaultVal?.trim() });
    }
  }
  return results;
}

function resolveBody(body, values) {
  return body.replace(/\{([^}]+)\}/g, (_, raw) => {
    const [name, defaultVal] = raw.split("=");
    return values[name.trim()] ?? defaultVal?.trim() ?? `{${name.trim()}}`;
  });
}

// ─── Main render ──────────────────────────────────────────────────────────────

async function init() {
  const { session, apiKey } = await chrome.storage.local.get(["session", "apiKey"]);

  if (!session || !apiKey) {
    renderSetup();
    return;
  }

  chrome.runtime.sendMessage({ type: "GET_SNIPPETS" }, (res) => {
    snippets = res?.snippets ?? [];
    renderMain();
  });
}

function renderSetup() {
  root.innerHTML = `
    <div class="setup">
      <div class="logo">⚡ SnipDM</div>
      <p class="subtitle">Paste your workspace API key to sync snippets.</p>
      <input id="apiKeyInput" type="password" placeholder="Workspace API key…" />
      <input id="emailInput" type="email" placeholder="Email" />
      <input id="passwordInput" type="password" placeholder="Password" />
      <button id="connectBtn">Connect</button>
      <p id="error" class="error"></p>
    </div>
  `;

  document.getElementById("connectBtn").addEventListener("click", async () => {
    const apiKey = document.getElementById("apiKeyInput").value.trim();
    const email = document.getElementById("emailInput").value.trim();
    const password = document.getElementById("passwordInput").value;
    const errorEl = document.getElementById("error");

    if (!apiKey || !email || !password) {
      errorEl.textContent = "All fields are required.";
      return;
    }

    // Authenticate with Supabase
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      errorEl.textContent = data.error_description ?? "Login failed.";
      return;
    }

    await chrome.storage.local.set({ session: data, apiKey });
    chrome.runtime.sendMessage({ type: "SET_SESSION", session: data });
    init();
  });
}

function renderMain() {
  filteredSnippets = snippets;

  root.innerHTML = `
    <div class="header">
      <div class="logo">⚡ SnipDM</div>
      <button id="syncBtn" title="Sync now">↻</button>
    </div>
    <div class="search-wrap">
      <input id="search" type="text" placeholder="Search snippets…" autofocus />
    </div>
    <div id="list" class="list"></div>
    <div class="footer">
      <button id="logoutBtn">Sign out</button>
    </div>
  `;

  renderList(snippets);

  document.getElementById("search").addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase();
    filteredSnippets = snippets.filter(
      (s) =>
        s.title?.toLowerCase().includes(q) ||
        s.shortcut?.toLowerCase().includes(q) ||
        s.body?.toLowerCase().includes(q)
    );
    renderList(filteredSnippets);
  });

  document.getElementById("syncBtn").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "SYNC_NOW" }, () => {
      chrome.runtime.sendMessage({ type: "GET_SNIPPETS" }, (res) => {
        snippets = res?.snippets ?? [];
        renderList(snippets);
      });
    });
  });

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await chrome.storage.local.clear();
    init();
  });
}

function renderList(items) {
  const listEl = document.getElementById("list");
  if (!listEl) return;

  if (items.length === 0) {
    listEl.innerHTML = `<p class="empty">No snippets found.</p>`;
    return;
  }

  listEl.innerHTML = items
    .map(
      (s, i) => `
    <div class="item" data-index="${i}">
      <div class="item-title">${s.title}</div>
      ${s.shortcut ? `<code class="item-shortcut">${s.shortcut}</code>` : ""}
      <div class="item-actions">
        <button class="btn-insert" data-index="${i}">Insert</button>
        <button class="btn-copy" data-index="${i}">Copy</button>
      </div>
    </div>
  `
    )
    .join("");

  listEl.querySelectorAll(".btn-insert").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const i = Number(e.target.dataset.index);
      handleInsert(filteredSnippets[i], "insert");
    });
  });

  listEl.querySelectorAll(".btn-copy").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const i = Number(e.target.dataset.index);
      handleInsert(filteredSnippets[i], "copy");
    });
  });
}

function handleInsert(snippet, mode) {
  const vars = detectVariables(snippet.body);

  if (vars.length > 0) {
    renderFillModal(snippet, vars, (resolved) => doInsert(resolved, mode));
  } else {
    doInsert(snippet.body, mode);
  }
}

async function doInsert(text, mode) {
  if (mode === "copy") {
    await navigator.clipboard.writeText(text);
    showToast("Copied to clipboard!");
    return;
  }

  // Try to insert into active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    await navigator.clipboard.writeText(text);
    showToast("Copied! (no active tab)");
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (textToInsert) => {
        const el = document.activeElement;
        if (!el) return false;
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
          const start = el.selectionStart;
          const current = el.value;
          const nativeSetter =
            Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set ??
            Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
          nativeSetter?.call(el, current.slice(0, start) + textToInsert + current.slice(start));
          el.selectionStart = el.selectionEnd = start + textToInsert.length;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          return true;
        }
        if (el.isContentEditable) {
          document.execCommand("insertText", false, textToInsert);
          return true;
        }
        return false;
      },
      args: [text],
    });
    window.close();
  } catch {
    // Fallback: clipboard
    await navigator.clipboard.writeText(text);
    showToast("Copied! (insertion blocked)");
  }
}

function renderFillModal(snippet, vars, onInsert) {
  const existing = document.getElementById("snipdm-fill-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "snipdm-fill-modal";
  modal.className = "modal-overlay";

  modal.innerHTML = `
    <div class="modal">
      <h3>${snippet.title}</h3>
      <p class="modal-sub">Fill in placeholder values:</p>
      ${vars
        .map(
          (v) => `
        <div class="field-group">
          <label>{${v.name}${v.defaultValue ? "=" + v.defaultValue : ""}}</label>
          <input data-var="${v.name}" placeholder="${v.defaultValue ?? v.name}" />
        </div>
      `
        )
        .join("")}
      <div class="modal-actions">
        <button id="modal-cancel">Cancel</button>
        <button id="modal-insert">Insert</button>
      </div>
    </div>
  `;

  root.appendChild(modal);

  modal.querySelector("#modal-cancel").addEventListener("click", () => modal.remove());
  modal.querySelector("#modal-insert").addEventListener("click", () => {
    const values = {};
    modal.querySelectorAll("input[data-var]").forEach((input) => {
      values[input.dataset.var] = input.value;
    });
    modal.remove();
    onInsert(resolveBody(snippet.body, values));
  });
}

function showToast(msg) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

init();
