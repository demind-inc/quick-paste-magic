# invite-workspace-member

Sends a workspace invitation email via Supabase Auth. Only workspace owners can invite. The invited user receives Supabase’s built-in invite email and is redirected to your app after signing up.

## Local vs production JWT

**Use a JWT that matches the environment you’re calling.** The token’s `iss` (issuer) must match the Auth server that the Edge Function talks to:

- **Production** (`https://<project>.supabase.co/functions/v1/...`): Use a token from the **hosted** project (sign in via your deployed app or the same project’s Auth).
- **Local** (`supabase functions serve` → `http://localhost:54321/functions/v1/...`): Use a token from your **local** Supabase Auth (sign in via an app pointed at `http://localhost:54321`). A production JWT will give “Invalid JWT” when calling the local function. See [Supabase discussion #6758](https://github.com/orgs/supabase/discussions/6758).

## Auth

JWT verification uses Supabase’s recommended pattern: `supabase.auth.getClaims(token)` with the project’s publishable (or anon) key. See [Securing Edge Functions](https://supabase.com/docs/guides/functions/auth).

## Secrets

- **SB_PUBLISHABLE_KEY** or **SUPABASE_ANON_KEY** – **Required** for JWT verification. Use your project’s publishable key (`sb_publishable_...`) or legacy anon key. Set as a function secret (e.g. `SB_PUBLISHABLE_KEY`).
- **SITE_URL** – Optional. Base URL of your app (e.g. `https://yourapp.com`) for the invite redirect. Defaults to `http://localhost:5173` if unset.

Set in dashboard: Project → Edge Functions → invite-workspace-member → Secrets, or:

```bash
npx supabase secrets set SB_PUBLISHABLE_KEY=sb_publishable_xxx
npx supabase secrets set SITE_URL=https://yourapp.com
```

## Deploy

```bash
npx supabase functions deploy invite-workspace-member
```

## Redirect

After accepting the invite, users are sent to: `{SITE_URL}/accept-invite?token={invitation_token}`. Add a route (e.g. `/accept-invite`) that reads `token` from the query and completes the workspace join (e.g. call an RPC to accept the invitation and add the user to `workspace_members`).
