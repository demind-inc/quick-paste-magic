# Supabase

The Supabase CLI is installed as a **project dev dependency**, not globally. Use one of these:

- **`npx supabase <command>`** — e.g. `npx supabase functions deploy`, `npx supabase --version`
- **`npm run supabase -- <command>`** — e.g. `npm run supabase -- functions deploy`

## Run Edge Functions locally and use them in the frontend

1. **Start local Supabase** (Auth, DB, API, etc.):
   ```bash
   npx supabase start
   ```
   Apply migrations so the local DB matches your schema: `npx supabase db reset` (or run migrations manually).

2. **Get local credentials:**
   ```bash
   npx supabase status
   ```
   Copy the **API URL** (e.g. `http://127.0.0.1:54321`) and **anon key**.

3. **Point the frontend at local Supabase**  
   Create `.env.local` in the project root (it overrides `.env` in dev and is gitignored):
   ```bash
   VITE_SUPABASE_URL=http://127.0.0.1:54321
   VITE_SUPABASE_PUBLISHABLE_KEY=<paste anon key from supabase status>
   ```
   You can use `.env.development.example` as a template.

4. **Serve Edge Functions** (in a separate terminal):
   ```bash
   npx supabase functions serve
   ```
   Functions are available at `http://127.0.0.1:54321/functions/v1/<function-name>`.

5. **Run the frontend:**
   ```bash
   npm run dev
   ```
   The app will use local Supabase and local functions. Sign in (or sign up) in the app so you get a **local JWT**; then actions like “Invite member” will call the local function and succeed.

To switch back to the hosted project, remove or rename `.env.local` and restart the dev server.

---

## Deploy Edge Functions (production)

From the project root, deploy the invite Edge Function:

```bash
npx supabase functions deploy invite-workspace-member
```

Or use the npm script:

```bash
npm run supabase:deploy:functions
```

(You may need to run `npx supabase link --project-ref YOUR_PROJECT_REF` first.)
