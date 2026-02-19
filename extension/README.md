# SnipDM Chrome Extension

This folder contains the scaffolded source code for the **SnipDM Chrome Extension** (Manifest V3).

> **Note:** This is reference/scaffold code. The extension must be built and loaded separately from the webapp. The webapp at `src/` is the management UI; this `extension/` folder is the browser extension.

---

## Files

| File | Purpose |
|---|---|
| `manifest.json` | Manifest V3 configuration — permissions, content scripts, popup, commands |
| `background.js` | Service worker — auth token storage, snippet sync from Supabase, command routing |
| `content.js` | Content script — detects focused editable fields, shortcut detection (`/intro`), overlay picker, text insertion |
| `content.css` | Minimal styles for the content script overlay |
| `popup.html` | Extension popup shell |
| `popup.js` | Popup logic — login, snippet search, insert/copy, placeholder fill modal |
| `popup.css` | Popup styles |

---

## Setup

1. **Configure Supabase credentials** — In `background.js` and `popup.js`, replace:
   ```
   const SUPABASE_URL = "https://YOUR_SUPABASE_URL.supabase.co";
   const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
   ```
   with your actual project values from the Extension settings page in the webapp.

2. **Add icons** — Create an `icons/` folder with `icon16.png`, `icon32.png`, `icon48.png`, `icon128.png`.

3. **Load in Chrome**:
   - Open `chrome://extensions`
   - Enable **Developer mode**
   - Click **Load unpacked**
   - Select this `extension/` folder

4. **Authenticate** — Open the popup, paste your **Workspace API key** (from Settings → Extension in the webapp), enter your email/password, and click Connect. Snippets will sync automatically.

---

## How shortcut insertion works

1. User focuses any `<input>`, `<textarea>`, or `contenteditable` element.
2. User types `/` followed by shortcut characters (e.g. `/intro`).
3. The overlay picker appears with matching snippets.
4. Arrow keys navigate, **Enter** selects, **Esc** dismisses.
5. If the snippet has `{placeholder}` variables, a fill modal appears.
6. After filling, the resolved text is inserted at the caret position.
7. Fallback: if DOM insertion is blocked (e.g., iframes), text is copied to clipboard.

---

## Production considerations

- **React popup**: Replace `popup.js`/`popup.css` with a React + Vite build for a richer UI.
- **Secure token storage**: Use `chrome.storage.session` for in-memory token storage (cleared when browser closes).
- **Realtime sync**: Subscribe to Supabase Realtime in the background worker for instant updates when snippets change.
- **Per-domain formatting**: Implement per-site adapters for complex editors (Notion, Slack, HubSpot).
