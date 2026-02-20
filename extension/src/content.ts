import "./content.css"
import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_idle"
}

/**
 * SnipDM Content Script (Plasmo)
 * Detects focused editable fields, listens for typed shortcuts (e.g. /intro),
 * shows an overlay picker near caret, and inserts resolved snippet text.
 */

const TRIGGER_CHAR = "/"
let activeField: HTMLElement | null = null
let overlay: HTMLDivElement | null = null
let actionButton: HTMLButtonElement | null = null
let snippets: any[] = []
let typedBuffer = ""
let pickerOpen = false

// ─── Fetch snippets from background ──────────────────────────────────────────

async function loadSnippets() {
  return new Promise<any[]>((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_SNIPPETS" }, (res) => {
      snippets = res?.snippets ?? []
      resolve(snippets)
    })
  })
}

void loadSnippets()

// ─── Overlay UI ──────────────────────────────────────────────────────────────

function createOverlay() {
  const el = document.createElement("div")
  el.id = "snipdm-overlay"
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
  `
  document.body.appendChild(el)
  return el
}

function createActionButton() {
  const btn = document.createElement("button")
  btn.id = "snipdm-action"
  btn.type = "button"
  btn.setAttribute("aria-label", "Insert SnipDM snippet")
  btn.innerHTML = "✦"
  btn.addEventListener("mousedown", (e) => {
    // Prevent focus loss in inputs
    e.preventDefault()
  })
  btn.addEventListener("click", () => {
    if (!activeField) return
    renderOverlay("")
  })
  document.body.appendChild(btn)
  return btn
}

function positionActionButton(btn: HTMLButtonElement) {
  if (!activeField) return
  const rect = activeField.getBoundingClientRect()
  const top = rect.top + 6
  const left = rect.right - 28
  btn.style.top = `${Math.max(6, Math.min(top, window.innerHeight - 34))}px`
  btn.style.left = `${Math.max(6, Math.min(left, window.innerWidth - 34))}px`
}

function showActionButton() {
  if (!actionButton) actionButton = createActionButton()
  positionActionButton(actionButton)
  actionButton.style.display = "flex"
}

function hideActionButton() {
  if (actionButton) actionButton.style.display = "none"
}

function positionOverlay(el: HTMLDivElement) {
  if (!activeField) return
  const rect = activeField.getBoundingClientRect()
  const top = rect.bottom + 6
  const left = rect.left
  el.style.top = `${Math.min(top, window.innerHeight - 340)}px`
  el.style.left = `${Math.min(left, window.innerWidth - 390)}px`
}

function renderOverlay(query: string) {
  if (!overlay) overlay = createOverlay()

  const matched = snippets
    .filter(
      (s) =>
        s.shortcut?.toLowerCase().startsWith("/" + query.toLowerCase()) ||
        s.title?.toLowerCase().includes(query.toLowerCase())
    )
    .slice(0, 8)

  if (matched.length === 0) {
    closeOverlay()
    return
  }

  overlay.innerHTML = matched
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
          ${s.shortcut ? `<code style="font-size:11px;background:#f1f5f9;padding:1px 5px;border-radius:4px;color:#64748b">${s.shortcut}</code>` : ""}
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#0f172a;font-weight:500">${s.title}</span>
        </div>
      `
    )
    .join("")

  const items = overlay.querySelectorAll<HTMLDivElement>(".snipdm-item")
  items.forEach((item, i) => {
    item.addEventListener("mouseenter", () => setHighlight(i))
    item.addEventListener("click", () => selectSnippet(matched[i]))
  })
  if (items[0]) items[0].style.background = "#f8fafc"

  positionOverlay(overlay)
  overlay.style.display = "block"
  pickerOpen = true
}

function setHighlight(index: number) {
  const items = overlay?.querySelectorAll<HTMLDivElement>(".snipdm-item") ?? []
  items.forEach((item, i) => {
    item.style.background = i === index ? "#f8fafc" : ""
  })
}

function closeOverlay() {
  if (overlay) {
    overlay.style.display = "none"
  }
  pickerOpen = false
  typedBuffer = ""
}

// ─── Variable detection & fill modal ─────────────────────────────────────────

function detectVariables(body: string) {
  const regex = /\{([^}]+)\}/g
  const seen = new Set<string>()
  const results: Array<{ name: string; defaultValue?: string }> = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(body)) !== null) {
    const [name, defaultVal] = match[1].split("=")
    const key = name.trim()
    if (!seen.has(key)) {
      seen.add(key)
      results.push({ name: key, defaultValue: defaultVal?.trim() })
    }
  }
  return results
}

function resolveBody(body: string, values: Record<string, string>) {
  return body.replace(/\{([^}]+)\}/g, (_, raw) => {
    const [name, defaultVal] = raw.split("=")
    return values[name.trim()] ?? defaultVal?.trim() ?? `{${name.trim()}}`
  })
}

function openFillModal(snippet: any, onInsert: (resolved: string) => void) {
  const vars = detectVariables(snippet.body)
  if (vars.length === 0) {
    onInsert(snippet.body)
    return
  }

  const modal = document.createElement("div")
  modal.style.cssText = `
    position: fixed; inset: 0; z-index: 2147483648;
    background: rgba(0,0,0,.4);
    display: flex; align-items: center; justify-content: center;
  `

  const values: Record<string, string> = {}
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
    .join("")

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
  `

  document.body.appendChild(modal)
  modal.querySelector("input")?.focus()

  modal.querySelector("#snipdm-cancel")?.addEventListener("click", () => modal.remove())
  modal.querySelector("#snipdm-insert")?.addEventListener("click", () => {
    modal.querySelectorAll<HTMLInputElement>("input[data-var]").forEach((input) => {
      values[input.dataset.var ?? ""] = input.value
    })
    onInsert(resolveBody(snippet.body, values))
    modal.remove()
  })
}

// ─── Text insertion ───────────────────────────────────────────────────────────

function insertText(text: string) {
  if (!activeField) return

  const field = activeField as HTMLInputElement | HTMLTextAreaElement | HTMLDivElement

  if (typedBuffer && field.tagName !== "DIV") {
    const start = (field as HTMLInputElement).selectionStart! - typedBuffer.length
    const end = (field as HTMLInputElement).selectionStart!
    const current = (field as HTMLInputElement).value
    ;(field as HTMLInputElement).value = current.slice(0, start) + current.slice(end)
    ;(field as HTMLInputElement).selectionStart = (field as HTMLInputElement).selectionEnd = start
  }

  if (field.tagName === "DIV" && (field as HTMLDivElement).isContentEditable) {
    document.execCommand("insertText", false, text)
  } else {
    const nativeSetter =
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set ??
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set

    if (nativeSetter) {
      const start = (field as HTMLInputElement).selectionStart!
      const current = (field as HTMLInputElement).value
      nativeSetter.call(field, current.slice(0, start) + text + current.slice(start))
      ;(field as HTMLInputElement).selectionStart = (field as HTMLInputElement).selectionEnd =
        start + text.length
      field.dispatchEvent(new Event("input", { bubbles: true }))
    }
  }
}

function selectSnippet(snippet: any) {
  closeOverlay()
  openFillModal(snippet, (resolved) => {
    insertText(resolved)
    chrome.runtime.sendMessage({ type: "RECORD_USE", snippetId: snippet.id })
  })
}

// ─── Keyboard listener ────────────────────────────────────────────────────────

document.addEventListener(
  "keydown",
  (e) => {
    if (!pickerOpen) return

    const items = overlay?.querySelectorAll<HTMLDivElement>(".snipdm-item") ?? []
    const highlighted = Array.from(items).findIndex(
      (el) => el.style.background === "rgb(248, 250, 252)"
    )

    if (e.key === "ArrowDown") {
      e.preventDefault()
      const next = (highlighted + 1) % items.length
      setHighlight(next)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      const prev = (highlighted - 1 + items.length) % items.length
      setHighlight(prev)
    } else if (e.key === "Enter") {
      e.preventDefault()
      const idx = Math.max(0, highlighted)
      items[idx]?.dispatchEvent(new MouseEvent("click"))
    } else if (e.key === "Escape") {
      closeOverlay()
    }
  },
  { capture: true }
)

// ─── Input listener (shortcut detection) ─────────────────────────────────────

document.addEventListener(
  "input",
  (e) => {
    const field = e.target as HTMLElement
    const isEditable =
      field.tagName === "INPUT" ||
      field.tagName === "TEXTAREA" ||
      (field.tagName === "DIV" && (field as HTMLDivElement).isContentEditable)

    if (!isEditable) return
    activeField = field
    showActionButton()

    const value =
      field.tagName === "DIV"
        ? (field.textContent ?? "")
        : (field as HTMLInputElement).value ?? ""

    const caret =
      field.tagName === "DIV" ? value.length : (field as HTMLInputElement).selectionStart ?? 0

    const beforeCaret = value.slice(0, caret)
    const triggerIdx = beforeCaret.lastIndexOf(TRIGGER_CHAR)

    if (triggerIdx === -1) {
      closeOverlay()
      return
    }

    const query = beforeCaret.slice(triggerIdx + 1)
    if (query.includes(" ")) {
      closeOverlay()
      return
    }

    typedBuffer = TRIGGER_CHAR + query
    renderOverlay(query)
  },
  true
)

document.addEventListener("focusin", (e) => {
  const field = e.target as HTMLElement
  if (
    field.tagName === "INPUT" ||
    field.tagName === "TEXTAREA" ||
    (field.tagName === "DIV" && (field as HTMLDivElement).isContentEditable)
  ) {
    activeField = field
    showActionButton()
  }
})

window.addEventListener("scroll", () => {
  if (actionButton && actionButton.style.display !== "none") {
    positionActionButton(actionButton)
  }
})

window.addEventListener("resize", () => {
  if (actionButton && actionButton.style.display !== "none") {
    positionActionButton(actionButton)
  }
})

document.addEventListener("focusout", () => {
  setTimeout(() => {
    closeOverlay()
    hideActionButton()
  }, 150)
})

// ─── Open picker: keyboard shortcut (Plasmo-friendly) ───────────────────────────
// Listen in content script so the shortcut works without relying on chrome.commands.

document.addEventListener("keydown", (e) => {
  if (!activeField) return
  const isShortcut =
    (e.metaKey || e.ctrlKey) && e.shiftKey && e.code === "Space"
  if (isShortcut) {
    e.preventDefault()
    renderOverlay("")
  }
})

// ─── Message from background (e.g. from browser action or other triggers) ─────

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "OPEN_PICKER") {
    if (activeField) {
      showActionButton()
      renderOverlay("")
    }
  }
})
