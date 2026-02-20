# SnipDM Chrome Extension

This folder contains the **SnipDM Chrome Extension** built with **Plasmo + React (TSX)** (Manifest V3).

> **Note:** The extension is built and loaded separately from the webapp. The webapp at `src/` is the management UI; this `extension/` folder is the browser extension.

---

## Files

| File | Purpose |
|---|---|
| `plasmo.config.ts` | Plasmo config & manifest overrides |
| `src/background.ts` | Service worker — auth token storage, snippet sync from Supabase, command routing |
| `src/content.ts` | Content script — detects focused editable fields, shortcut detection (`/intro`), overlay picker, text insertion |
| `src/content.css` | Minimal styles for the content script overlay |
| `src/popup.tsx` | React popup (TSX) — login, snippet search, insert/copy, placeholder fill modal |
| `src/popup.css` | Popup styles |
| `legacy/` | Previous static extension scaffold (kept for reference) |

---

## Setup

1. **Configure Supabase credentials** — Create `extension/.env` (see `.env.example`) with:
   ```
   PLASMO_PUBLIC_SUPABASE_URL="https://YOUR_SUPABASE_URL.supabase.co"
   PLASMO_PUBLIC_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"
   ```
   Use your actual project values from the Extension settings page in the webapp.

2. **Add icons** — Create an `assets/` folder with `icon16.png`, `icon32.png`, `icon48.png`, `icon128.png`.

3. **Install dependencies & build**:
   - `cd extension`
   - `npm install`
   - `npm run build` (or `npm run dev` for live reload)

4. **Load in Chrome**:
   - Open `chrome://extensions`
   - Enable **Developer mode**
   - Click **Load unpacked**
   - Select `extension/build/chrome-mv3-prod/` (or `extension/build/chrome-mv3-dev/` if using dev)

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

- **Supabase security**: Use secure token storage and rotate keys as needed.
- **Realtime sync**: Subscribe to Supabase Realtime in the background worker for instant updates when snippets change.
- **Per-domain formatting**: Implement per-site adapters for complex editors (Notion, Slack, HubSpot).
- **Secure token storage**: Use `chrome.storage.session` for in-memory token storage (cleared when browser closes).
- **Realtime sync**: Subscribe to Supabase Realtime in the background worker for instant updates when snippets change.
- **Per-domain formatting**: Implement per-site adapters for complex editors (Notion, Slack, HubSpot).
