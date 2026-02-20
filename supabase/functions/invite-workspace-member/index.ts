import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- Deno npm: specifier; resolved at runtime
// @ts-ignore
import { createClient } from "npm:@supabase/supabase-js@2";
import { getUserIdFromRequest } from "../_shared/jwt.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InviteBody {
  workspaceId: string;
  email: string;
  role: "editor" | "viewer";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const invitedBy = await getUserIdFromRequest(req);
    if (!invitedBy) {
      return Response.json(
        { error: "Missing or invalid authorization" },
        { status: 401, headers: corsHeaders }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const siteUrl = Deno.env.get("SITE_URL") ?? "http://localhost:5173";

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const body = (await req.json()) as InviteBody;
    const { workspaceId, email, role } = body;
    if (!workspaceId || !email?.trim()) {
      return Response.json(
        { error: "workspaceId and email are required" },
        { status: 400, headers: corsHeaders }
      );
    }
    const normalizedEmail = email.trim().toLowerCase();
    const inviteRole = role === "viewer" ? "viewer" : "editor";

    const { data: memberRole, error: roleError } = await supabaseAdmin.rpc(
      "get_workspace_role",
      {
        _user_id: invitedBy,
        _workspace_id: workspaceId,
      }
    );
    if (roleError || memberRole !== "owner") {
      return Response.json(
        { error: "Only workspace owners can invite members" },
        { status: 403, headers: corsHeaders }
      );
    }

    const { data: invitation, error: insertError } = await supabaseAdmin
      .from("workspace_invitations")
      .insert({
        workspace_id: workspaceId,
        email: normalizedEmail,
        role: inviteRole,
        invited_by: invitedBy,
      })
      .select("id, token")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        return Response.json(
          { error: "An invitation for this email already exists" },
          { status: 409, headers: corsHeaders }
        );
      }
      return Response.json(
        { error: insertError.message },
        { status: 400, headers: corsHeaders }
      );
    }

    const redirectTo = `${siteUrl.replace(/\/$/, "")}/accept-invite?token=${
      invitation.token
    }`;
    const { error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(normalizedEmail, {
        data: {
          workspace_invitation_id: invitation.id,
          workspace_id: workspaceId,
          role: inviteRole,
        },
        redirectTo,
      });

    if (inviteError) {
      await supabaseAdmin
        .from("workspace_invitations")
        .delete()
        .eq("id", invitation.id);
      return Response.json(
        { error: inviteError.message || "Failed to send invitation email" },
        { status: 400, headers: corsHeaders }
      );
    }

    return Response.json(
      { ok: true, invitationId: invitation.id },
      { headers: corsHeaders }
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
});
