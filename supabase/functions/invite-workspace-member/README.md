# invite-workspace-member

Sends a workspace invitation email via Supabase Auth. Only workspace owners can invite. The invited user receives Supabase’s built-in invite email and is redirected to your app after signing up.

## Secrets (optional)

- **SITE_URL** – Base URL of your app (e.g. `https://yourapp.com`). Used for the invite link redirect. Defaults to `http://localhost:5173` if unset.

Set in dashboard: Project → Edge Functions → invite-workspace-member → Secrets, or:

```bash
supabase secrets set SITE_URL=https://yourapp.com
```

## Deploy

```bash
supabase functions deploy invite-workspace-member
```

## Redirect

After accepting the invite, users are sent to: `{SITE_URL}/accept-invite?token={invitation_token}`. Add a route (e.g. `/accept-invite`) that reads `token` from the query and completes the workspace join (e.g. call an RPC to accept the invitation and add the user to `workspace_members`).
