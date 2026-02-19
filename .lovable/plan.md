
## DM Snippet System — Webapp MVP Plan

A clean, minimal snippet management webapp for professional DM workflows, with Supabase backend for auth, data, and team sync with the Chrome extension.

---

### 1. Authentication
- **Email/password sign up & login** via Supabase Auth
- Protected routes — all app pages require auth
- Simple onboarding: after signup, prompt to create first workspace and first snippet

---

### 2. Workspaces & Teams
- On signup, a **workspace** is auto-created for the user
- Users can **invite team members** by email to their workspace
- **Role system** (stored in a separate `user_roles` table):
  - **Owner** — full control
  - **Editor** — create/edit own snippets, use shared snippets
  - **Viewer** — read-only access to shared library
- Snippets are scoped to either **private** (just you) or **workspace** (shared with team)

---

### 3. Snippet Management — Core Screens

#### Snippet Library (main view)
- Sidebar with **Folders** (collapsible tree) and **Tags** (filter chips)
- Main panel: **search bar** + sortable list/grid of snippets
- Each snippet card shows: title, shortcut, tags, use count, last used
- Quick-action buttons: Edit, Duplicate, Delete, Share toggle

#### Snippet Editor
- **Title** (required)
- **Shortcut** field (e.g. `/intro`) — validated for uniqueness within workspace
- **Body** — rich textarea with syntax highlighting for `{placeholders}`
- **Tags** — multi-select with option to create new tags inline
- **Folder** — dropdown to assign to a folder
- **Shared scope** toggle — Private vs. Workspace
- Live **variable detection**: automatically lists detected `{var}` tokens below the body
- "Test Expansion" button — shows a modal to fill placeholders and preview the final text
- Save / Cancel

#### Folders & Tags Management
- Create, rename, delete folders (nested up to 2 levels)
- Tags are workspace-level, color-coded

---

### 4. Search & Filter
- Real-time search across title, shortcut, body, and tags
- Ranking: shortcut exact match → title → tags → body
- Filter sidebar: by folder, by tag, by scope (private/shared), by date range
- Sort: Most recent, Most used, Alphabetical

---

### 5. Placeholder System
- Variables detected automatically from `{var}` syntax in snippet body
- Defaults supported: `{my_name=Hayato}`
- "Test Expansion" modal: fill each variable → preview rendered text → copy to clipboard

---

### 6. Analytics Dashboard (lightweight MVP)
- Per-snippet: **use count** and **last used date** (surfaced in the list)
- Simple summary card: total snippets, most-used snippet this week, top folder

---

### 7. Settings
- **Profile**: name, email
- **Workspace**: rename, invite/remove members, manage roles
- **Extension connection**: display API key / token that the Chrome extension uses to authenticate and sync snippets
- **Domain denylist**: comma-separated list of domains where extension should not activate

---

### 8. Chrome Extension — Scaffolded Code (Reference)
Since Lovable builds web apps, the extension itself needs a separate codebase. We'll scaffold the extension source files inside a dedicated `extension/` folder in the project as reference code, including:
- `manifest.json` (Manifest V3, minimal permissions)
- **Background service worker**: auth token storage, snippet sync from Supabase
- **Content script**: detects focused editable fields (`input`, `textarea`, `contenteditable`), listens for typed shortcut prefix, shows overlay picker near caret, inserts resolved text at cursor
- **Popup UI** (React): snippet search, click-to-insert or copy-to-clipboard, placeholder fill modal
- Clipboard fallback for protected DOM environments

---

### 9. Design System
- **Clean & minimal** — white/light grey base, subtle borders
- Linear/Notion-inspired sidebar layout
- Consistent typography with clear hierarchy
- Keyboard-first: keyboard shortcuts for create, search, navigate

---

### Pages / Routes
| Route | Purpose |
|---|---|
| `/` | Redirect to `/snippets` or login |
| `/login` | Sign in |
| `/signup` | Create account + workspace |
| `/snippets` | Main snippet library |
| `/snippets/new` | Create snippet |
| `/snippets/:id/edit` | Edit snippet |
| `/settings` | Profile + workspace settings |
| `/settings/team` | Members & roles |
| `/settings/extension` | API key + domain denylist |
