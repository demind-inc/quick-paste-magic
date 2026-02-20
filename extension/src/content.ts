import "./content.css";
import type { PlasmoCSConfig } from "plasmo";

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_idle",
};

/**
 * SnipDM Content Script (Plasmo)
 * Detects focused editable fields, listens for typed shortcuts (e.g. /intro),
 * shows an overlay picker near caret, and inserts resolved snippet text.
 */

const TRIGGER_CHAR = "/";
let activeField: HTMLElement | null = null;
let overlay: HTMLDivElement | null = null;
let actionButton: HTMLButtonElement | null = null;
let snippets: any[] = [];
let typedBuffer = "";
let pickerOpen = false;
let isSignedIn = false;
let suppressBlurClose = false;
/** Current search filter text inside the overlay (when open). */
let overlaySearchFilter = "";
let domainAllowlist: string[] = [];

/** When set, insert this text when the tab window gets focus (popup closed). */
let pendingInsertOnWindowFocus: string | null = null;
/** When set, insert this text when the user next focuses an input (no field was focused when popup sent insert). */
let pendingInsertOnNextFocus: string | null = null;

/** Fill-modal root element (placeholder form in page). Focus inside it must not update activeField. */
let fillModalElement: HTMLElement | null = null;
/** When the fill modal is open, this is the field we will insert into (the one that had focus before opening the modal). */
let insertTargetField: HTMLElement | null = null;

// ─── Fetch snippets from background ──────────────────────────────────────────

async function loadSnippets() {
  return new Promise<any[]>((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_SNIPPETS" }, (res) => {
      snippets = res?.snippets ?? [];
      resolve(snippets);
    });
  });
}

void loadSnippets();

function normalizeAllowlist(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((d) => String(d).trim().toLowerCase()).filter(Boolean);
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((d) => String(d).trim().toLowerCase()).filter(Boolean);
      }
    } catch {
      // ignore
    }
    return raw
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
}

function isDomainAllowed() {
  if (domainAllowlist.length === 0) return true;
  const host = window.location.hostname.toLowerCase();
  return domainAllowlist.some((d) => host === d || host.endsWith(`.${d}`));
}

function loadAllowlist() {
  chrome.storage.local.get(["domainAllowlist"], (res) => {
    domainAllowlist = normalizeAllowlist(res?.domainAllowlist);
    if (!isDomainAllowed()) {
      closeOverlay();
      hideActionButton();
    }
  });
}

loadAllowlist();

function syncAuthState() {
  chrome.storage.local.get(["session", "apiKey"], (res) => {
    const parsedSession = res?.session ? JSON.parse(res?.session) : null;
    isSignedIn = Boolean(parsedSession?.access_token && res?.apiKey);
    if (!isSignedIn) {
      closeOverlay();
      hideActionButton();
    }
  });
}

syncAuthState();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.session || changes.apiKey) {
    syncAuthState();
  }
  if (changes.domainAllowlist) {
    domainAllowlist = normalizeAllowlist(changes.domainAllowlist.newValue);
    if (!isDomainAllowed()) {
      closeOverlay();
      hideActionButton();
    }
  }
  if (changes.snippets) {
    void loadSnippets();
  }
});

// ─── Overlay UI ──────────────────────────────────────────────────────────────

function createOverlay() {
  const el = document.createElement("div");
  el.id = "snipdm-overlay";
  el.style.cssText = `
    position: fixed;
    z-index: 2147483647;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0,0,0,.12);
    min-width: 280px;
    max-width: 380px;
    max-height: 320px;
    overflow-y: auto;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
  `;
  el.addEventListener("mousedown", (e) => {
    suppressBlurClose = true;
    const t = e.target as HTMLElement;
    const isInput = t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable;
    if (!isInput) e.preventDefault();
  });
  el.addEventListener("mouseup", () => {
    suppressBlurClose = false;
  });
  document.body.appendChild(el);
  return el;
}

const SNIPPET_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="16" y2="16"/><line x1="8" y1="8" x2="10" y2="8"/></svg>`;

function createActionButton() {
  const btn = document.createElement("button");
  btn.id = "snipdm-action";
  btn.type = "button";
  btn.setAttribute("aria-label", "Insert SnipDM snippet");
  btn.innerHTML = SNIPPET_ICON_SVG;
  btn.style.display = "flex";
  btn.style.alignItems = "center";
  btn.style.justifyContent = "center";
  btn.addEventListener("mousedown", (e) => {
    suppressBlurClose = true;
    // Prevent focus loss in inputs
    e.preventDefault();
  });
  btn.addEventListener("mouseup", () => {
    suppressBlurClose = false;
  });
  btn.addEventListener("click", () => {
    if (!activeField) return;
    renderOverlay("");
  });
  document.body.appendChild(btn);
  return btn;
}

function positionActionButton(btn: HTMLButtonElement) {
  if (!activeField) return;
  const rect = activeField.getBoundingClientRect();
  const top = rect.top + 6;
  const left = rect.right - 28;
  btn.style.top = `${Math.max(6, Math.min(top, window.innerHeight - 34))}px`;
  btn.style.left = `${Math.max(6, Math.min(left, window.innerWidth - 34))}px`;
}

function showActionButton() {
  if (!isSignedIn) return;
  if (!isDomainAllowed()) return;
  if (!actionButton) actionButton = createActionButton();
  positionActionButton(actionButton);
  actionButton.style.display = "flex";
}

function hideActionButton() {
  if (actionButton) actionButton.style.display = "none";
}

function positionOverlay(el: HTMLDivElement) {
  if (!activeField) return;
  if (actionButton) {
    const rect = actionButton.getBoundingClientRect();
    const top = rect.bottom + 6;
    const left = rect.left;
    el.style.top = `${Math.min(top, window.innerHeight - 340)}px`;
    el.style.left = `${Math.min(left, window.innerWidth - 390)}px`;
    return;
  }
  const rect = activeField.getBoundingClientRect();
  const top = rect.bottom + 6;
  const left = rect.left;
  el.style.top = `${Math.min(top, window.innerHeight - 340)}px`;
  el.style.left = `${Math.min(left, window.innerWidth - 390)}px`;
}

/** Filter snippets by overlaySearchFilter (shortcut or title, case-insensitive). */
function getFilteredSnippets(): any[] {
  const q = overlaySearchFilter.trim().toLowerCase();
  if (!q) {
    return snippets.slice(0, 20);
  }
  return snippets
    .filter(
      (s) =>
        s.shortcut?.toLowerCase().includes(q) ||
        s.title?.toLowerCase().includes(q)
    )
    .slice(0, 20);
}

/** Update only the list area so the search input is never destroyed (keeps focus). */
function updateOverlayList() {
  if (!overlay) return;
  const matched = getFilteredSnippets();
  const listContainer = overlay.querySelector<HTMLDivElement>(".snipdm-list");
  if (!listContainer) return;

  const listHtml =
    matched.length === 0
      ? `<div class="snipdm-empty" style="padding:16px 12px;color:#64748b;font-size:13px;text-align:center">No snippets match</div>`
      : matched
          .map(
            (s, i) => `
        <div
          data-index="${i}"
          data-id="${s.id}"
          class="snipdm-item"
          style="
            padding: 8px 12px;
            cursor: pointer;
            border-bottom: 1px solid #f1f5f9;
            display: flex;
            align-items: center;
            gap: 8px;
          "
        >
          ${
            s.shortcut
              ? `<code style="font-size:11px;background:#f1f5f9;padding:1px 5px;border-radius:4px;color:#64748b">${s.shortcut}</code>`
              : ""
          }
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#0f172a;font-weight:500">${
            s.title ?? ""
          }</span>
        </div>
      `
          )
          .join("");

  listContainer.innerHTML = listHtml;

  const items = overlay.querySelectorAll<HTMLDivElement>(".snipdm-item");
  items.forEach((item, i) => {
    item.addEventListener("mouseenter", () => setHighlight(i));
    item.addEventListener("click", () => selectSnippet(matched[i]));
  });
  if (items[0]) items[0].style.background = "#f8fafc";
}

function buildOverlayContent() {
  if (!overlay) return;
  const matched = getFilteredSnippets();

  const searchHtml = `
    <div class="snipdm-search-wrap" style="padding:8px 12px;border-bottom:1px solid #e2e8f0;position:sticky;top:0;background:#fff;border-radius:8px 8px 0 0">
      <input
        type="text"
        class="snipdm-search-input"
        placeholder="Search snippets..."
        value="${(overlaySearchFilter ?? "").replace(/"/g, "&quot;")}"
        autocomplete="off"
        style="width:100%;border:1px solid #e2e8f0;border-radius:6px;padding:6px 10px;font-size:13px;box-sizing:border-box;outline:none"
      />
    </div>
    <div class="snipdm-list"></div>
  `;

  overlay.innerHTML = searchHtml;

  const searchInput = overlay.querySelector<HTMLInputElement>(".snipdm-search-input");
  if (searchInput) {
    searchInput.focus();
    searchInput.addEventListener("input", () => {
      overlaySearchFilter = searchInput.value;
      updateOverlayList();
    });
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (overlaySearchFilter) {
          overlaySearchFilter = "";
          searchInput.value = "";
          updateOverlayList();
        } else {
          closeOverlay();
        }
        e.preventDefault();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        const items = overlay?.querySelectorAll<HTMLDivElement>(".snipdm-item") ?? [];
        if (items.length > 0) setHighlight(0);
      }
    });
  }

  updateOverlayList();
}

async function renderOverlay(query: string) {
  if (!isSignedIn) return;
  if (!isDomainAllowed()) return;
  await loadSnippets();
  if (!overlay) overlay = createOverlay();

  overlaySearchFilter = query;
  const matched = getFilteredSnippets();

  if (matched.length === 0 && overlaySearchFilter.trim() !== "") {
    closeOverlay();
    return;
  }

  buildOverlayContent();
  positionOverlay(overlay);
  overlay.style.display = "block";
  pickerOpen = true;
}

function setHighlight(index: number) {
  const items = overlay?.querySelectorAll<HTMLDivElement>(".snipdm-item") ?? [];
  items.forEach((item, i) => {
    item.style.background = i === index ? "#f8fafc" : "";
  });
}

function closeOverlay() {
  if (overlay) {
    overlay.style.display = "none";
  }
  pickerOpen = false;
  typedBuffer = "";
}

// ─── Variable detection & fill modal ─────────────────────────────────────────

function detectVariables(body: string) {
  const regex = /\{([^}]+)\}/g;
  const seen = new Set<string>();
  const results: Array<{ name: string; defaultValue?: string }> = [];
  let match: RegExpExecArray | null;
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

function resolveBody(body: string, values: Record<string, string>) {
  return body.replace(/\{([^}]+)\}/g, (_, raw) => {
    const [name, defaultVal] = raw.split("=");
    return values[name.trim()] ?? defaultVal?.trim() ?? `{${name.trim()}}`;
  });
}

function openFillModal(
  snippet: any,
  onInsert: (resolved: string, targetField: HTMLElement | null) => void
) {
  const vars = detectVariables(snippet.body);
  if (vars.length === 0) {
    onInsert(snippet.body, activeField);
    return;
  }

  // Remember the field to insert into (the one that had focus before opening this modal).
  insertTargetField = activeField && document.contains(activeField) ? activeField : null;
  const modal = document.createElement("div");
  fillModalElement = modal;
  modal.style.cssText = `
    position: fixed; inset: 0; z-index: 2147483648;
    background: rgba(0,0,0,.4);
    display: flex; align-items: center; justify-content: center;
  `;

  const values: Record<string, string> = {};
  const fieldsHtml = vars
    .map(
      (v) => `
      <div style="margin-bottom:12px">
        <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px;font-family:monospace">
          {${v.name}${v.defaultValue ? "=" + v.defaultValue : ""}}
        </label>
        <input
          data-var="${v.name}"
          placeholder="${v.defaultValue ?? v.name}"
          style="width:100%;border:1px solid #e2e8f0;border-radius:6px;padding:7px 10px;font-size:13px;box-sizing:border-box;outline:none"
        />
      </div>
    `
    )
    .join("");

  modal.innerHTML = `
    <div style="background:#fff;border-radius:12px;padding:24px;min-width:340px;max-width:480px;box-shadow:0 20px 60px rgba(0,0,0,.2);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
      <h3 style="margin:0 0 4px;font-size:15px;font-weight:600;color:#0f172a">Fill placeholders</h3>
      <p style="margin:0 0 16px;font-size:13px;color:#64748b">${snippet.title}</p>
      ${fieldsHtml}
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
        <button id="snipdm-cancel" style="padding:7px 14px;border:1px solid #e2e8f0;border-radius:6px;background:#fff;cursor:pointer;font-size:13px">Cancel</button>
        <button id="snipdm-insert" style="padding:7px 14px;border:none;border-radius:6px;background:#1e293b;color:#fff;cursor:pointer;font-size:13px;font-weight:500">Insert</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.querySelector("input")?.focus();

  const clearModalRefs = () => {
    fillModalElement = null;
    insertTargetField = null;
  };

  modal
    .querySelector("#snipdm-cancel")
    ?.addEventListener("click", () => {
      clearModalRefs();
      modal.remove();
    });
  modal.querySelector("#snipdm-insert")?.addEventListener("click", () => {
    const target = insertTargetField;
    modal
      .querySelectorAll<HTMLInputElement>("input[data-var]")
      .forEach((input) => {
        values[input.dataset.var ?? ""] = input.value;
      });
    onInsert(resolveBody(snippet.body, values), target);
    clearModalRefs();
    modal.remove();
  });
}

// ─── Text insertion ───────────────────────────────────────────────────────────

function getEditableElement(el: Element | null): HTMLElement | null {
  if (!el || !document.contains(el)) return null;
  const tag = (el as HTMLElement).tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return el as HTMLElement;
  if (tag === "DIV" && (el as HTMLDivElement).isContentEditable) return el as HTMLElement;
  return null;
}

/** Target for insert: prefer the element that currently has focus in the tab (what user selected), else our stored activeField. */
function getInsertTarget(): HTMLElement | null {
  const focused = getEditableElement(document.activeElement as Element);
  if (focused) return focused;
  if (activeField && document.contains(activeField)) return activeField;
  return null;
}

function insertText(text: string, targetField?: HTMLElement | null) {
  const fieldToUse =
    targetField && document.contains(targetField)
      ? targetField
      : activeField;
  if (!fieldToUse || !document.contains(fieldToUse)) return;

  const field = fieldToUse as
    | HTMLInputElement
    | HTMLTextAreaElement
    | HTMLDivElement;

  try {
    if (typeof (field as HTMLInputElement).focus === "function") {
      (field as HTMLInputElement).focus();
    }
  } catch {
    // Ignore "Illegal invocation" when focus is called from content script
  }

  if (typedBuffer && field.tagName !== "DIV") {
    const caret =
      (field as HTMLInputElement).selectionStart ??
      (field as HTMLInputElement).value.length;
    const start = caret - typedBuffer.length;
    const end = caret;
    const current = (field as HTMLInputElement).value;
    (field as HTMLInputElement).value =
      current.slice(0, start) + current.slice(end);
    (field as HTMLInputElement).selectionStart = (
      field as HTMLInputElement
    ).selectionEnd = start;
    typedBuffer = "";
  }

  if (field.tagName === "DIV" && (field as HTMLDivElement).isContentEditable) {
    document.execCommand("insertText", false, text);
  } else {
    const inputOrTextarea = field as HTMLInputElement | HTMLTextAreaElement;
    const start =
      inputOrTextarea.selectionStart ?? inputOrTextarea.value.length;
    const current = inputOrTextarea.value;
    const newValue = current.slice(0, start) + text + current.slice(start);
    try {
      inputOrTextarea.value = newValue;
      inputOrTextarea.selectionStart = inputOrTextarea.selectionEnd =
        start + text.length;
      field.dispatchEvent(new Event("input", { bubbles: true }));
    } catch {
      try {
        document.execCommand("insertText", false, text);
      } catch {
        // ignore
      }
    }
  }
}

function selectSnippet(snippet: any) {
  closeOverlay();
  openFillModal(snippet, (resolved, targetField) => {
    insertText(resolved, targetField);
    chrome.runtime.sendMessage({ type: "RECORD_USE", snippetId: snippet.id });
  });
}

// ─── Keyboard listener ────────────────────────────────────────────────────────

document.addEventListener(
  "keydown",
  (e) => {
    if (!pickerOpen) return;
    const target = e.target as HTMLElement;
    const inSearchInput =
      overlay?.contains(target) && target.classList?.contains("snipdm-search-input");
    if (inSearchInput && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      return;
    }
    if (inSearchInput && e.key === "Escape") return;

    const items =
      overlay?.querySelectorAll<HTMLDivElement>(".snipdm-item") ?? [];
    const highlighted = Array.from(items).findIndex(
      (el) => el.style.background === "rgb(248, 250, 252)"
    );

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = (highlighted + 1) % items.length;
      setHighlight(next);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = (highlighted - 1 + items.length) % items.length;
      setHighlight(prev);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const idx = Math.max(0, highlighted);
      items[idx]?.dispatchEvent(new MouseEvent("click"));
    } else if (e.key === "Escape") {
      closeOverlay();
    }
  },
  { capture: true }
);

// ─── Input listener (shortcut detection) ─────────────────────────────────────

document.addEventListener(
  "input",
  (e) => {
    const field = e.target as HTMLElement;
    if (overlay?.contains(field)) return;
    if (!isDomainAllowed()) {
      closeOverlay();
      hideActionButton();
      return;
    }
    const isEditable =
      field.tagName === "INPUT" ||
      field.tagName === "TEXTAREA" ||
      (field.tagName === "DIV" && (field as HTMLDivElement).isContentEditable);

    if (!isEditable) return;
    activeField = field;
    showActionButton();

    const value =
      field.tagName === "DIV"
        ? field.textContent ?? ""
        : (field as HTMLInputElement).value ?? "";

    const caret =
      field.tagName === "DIV"
        ? value.length
        : (field as HTMLInputElement).selectionStart ?? 0;

    const beforeCaret = value.slice(0, caret);
    const triggerIdx = beforeCaret.lastIndexOf(TRIGGER_CHAR);

    if (triggerIdx === -1) {
      closeOverlay();
      return;
    }

    const query = beforeCaret.slice(triggerIdx + 1);
    if (query.includes(" ")) {
      closeOverlay();
      return;
    }

    typedBuffer = TRIGGER_CHAR + query;
    renderOverlay(query);
  },
  true
);

document.addEventListener("focusin", (e) => {
  const field = e.target as HTMLElement;
  if (overlay?.contains(field)) return;
  if (fillModalElement?.contains(field)) return;
  if (!isDomainAllowed()) {
    closeOverlay();
    hideActionButton();
    return;
  }
  if (
    field.tagName === "INPUT" ||
    field.tagName === "TEXTAREA" ||
    (field.tagName === "DIV" && (field as HTMLDivElement).isContentEditable)
  ) {
    activeField = field;
    showActionButton();
    if (pendingInsertOnNextFocus) {
      const text = pendingInsertOnNextFocus;
      pendingInsertOnNextFocus = null;
      insertText(text);
    }
  }
});

window.addEventListener("scroll", () => {
  if (actionButton && actionButton.style.display !== "none") {
    positionActionButton(actionButton);
  }
});

window.addEventListener("resize", () => {
  if (actionButton && actionButton.style.display !== "none") {
    positionActionButton(actionButton);
  }
});

document.addEventListener("focusout", () => {
  setTimeout(() => {
    if (suppressBlurClose) return;
    if (overlay && document.activeElement && overlay.contains(document.activeElement)) return;
    closeOverlay();
    hideActionButton();
  }, 150);
});

// ─── Open picker: keyboard shortcut (Plasmo-friendly) ───────────────────────────
// Listen in content script so the shortcut works without relying on chrome.commands.

document.addEventListener("keydown", (e) => {
  if (!activeField) return;
  const isShortcut =
    (e.metaKey || e.ctrlKey) && e.shiftKey && e.code === "Space";
  if (isShortcut) {
    e.preventDefault();
    renderOverlay("");
  }
});

// ─── Message from background (e.g. from browser action or other triggers) ─────

chrome.runtime.onMessage.addListener(
  (message, _sender, sendResponse) => {
    if (message.type === "OPEN_PICKER") {
      if (activeField && isSignedIn) {
        showActionButton();
        renderOverlay("");
      }
      return;
    }
    if (message.type === "INSERT_TEXT") {
      const text = typeof message.text === "string" ? message.text : "";
      const target = getInsertTarget();
      if (!text) {
        sendResponse({ ok: false, reason: "empty" });
        return true;
      }
      if (target) {
        const fieldToUse = target;
        const toInsert = text;
        sendResponse({ ok: true });
        setTimeout(() => {
          if (!document.contains(fieldToUse)) return;
          pendingInsertOnWindowFocus = null;
          try {
            const prev = activeField;
            activeField = fieldToUse;
            insertText(toInsert);
            activeField = prev;
          } catch {
            activeField = prev;
          }
        }, 350);
      } else {
        pendingInsertOnNextFocus = text;
        sendResponse({ ok: true });
      }
      return true;
    }
  }
);
