# invite-workspace-member

Sends a workspace invitation email via Supabase Auth. Only workspace owners can invite.

- **New users:** Receive Supabase’s built-in invite email and are redirected to your app after signing up.
- **Existing users:** If `RESEND_API_KEY` is set, the function generates a magic link and sends an invite-themed email via Resend ("You're invited to join a workspace"). If Resend is not configured, it returns `existingUser: true` and the invitation `token` so the client can fall back to `signInWithOtp` (that sends Supabase’s default sign-in email).

## Local vs production JWT

**Use a JWT that matches the environment you’re calling.** The token’s `iss` (issuer) must match the Auth server that the Edge Function talks to:

- **Production** (`https://<project>.supabase.co/functions/v1/...`): Use a token from the **hosted** project (sign in via your deployed app or the same project’s Auth).
- **Local** (`supabase functions serve` → `http://localhost:54321/functions/v1/...`): Use a token from your **local** Supabase Auth (sign in via an app pointed at `http://localhost:54321`). A production JWT will give “Invalid JWT” when calling the local function. See [Supabase discussion #6758](https://github.com/orgs/supabase/discussions/6758).

## Auth

JWT is verified **inside** the function using the [Securing Edge Functions](https://supabase.com/docs/guides/functions/auth) pattern so it works with Supabase’s new JWT Signing Keys:

- **Platform check disabled**: `verify_jwt = false` in `config.toml` so the request reaches the function (avoids legacy “Invalid JWT” from the edge runtime).
- **In-function verification**: `_shared/jwt.ts` uses `jose` and the project’s JWKS (`SUPABASE_URL/auth/v1/.well-known/jwks.json`) to verify the Bearer token and read `sub`. No publishable or anon key is required for verification.

## Secrets

- **SITE_URL** – Optional. Base URL of your app (e.g. `https://yourapp.com`) for the invite redirect. Defaults to `http://localhost:8080` if unset.
- **RESEND_API_KEY** – Optional. When set, existing users receive an invite-themed email via [Resend](https://resend.com) instead of the client sending Supabase’s sign-in email.
- **RESEND_FROM** – Optional. From address for Resend (e.g. `Invites <invites@yourdomain.com>`). Defaults to `Invites <onboarding@resend.dev>`.

Set in dashboard: Project → Edge Functions → invite-workspace-member → Secrets, or:

```bash
npx supabase secrets set SITE_URL=https://yourapp.com
```

## Deploy

```bash
npx supabase functions deploy invite-workspace-member
```

## Redirect

After accepting the invite, users are sent to: `{SITE_URL}/accept-invite?token={invitation_token}`. Add a route (e.g. `/accept-invite`) that reads `token` from the query and completes the workspace join (e.g. call an RPC to accept the invitation and add the user to `workspace_members`).
