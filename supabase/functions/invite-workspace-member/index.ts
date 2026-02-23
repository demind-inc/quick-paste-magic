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
    const siteUrl = Deno.env.get("SITE_URL") ?? "http://localhost:8080";

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

    let invitation: { id: string; token: string };
    let existingInvitation = false;

    const { data: insertedInvitation, error: insertError } = await supabaseAdmin
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
        const { data: existing, error: fetchErr } = await supabaseAdmin
          .from("workspace_invitations")
          .select("id, token")
          .eq("workspace_id", workspaceId)
          .eq("email", normalizedEmail)
          .is("accepted_at", null)
          .maybeSingle();
        if (fetchErr || !existing) {
          return Response.json(
            { error: "An invitation for this email already exists" },
            { status: 409, headers: corsHeaders }
          );
        }
        invitation = existing;
        existingInvitation = true;
      } else {
        return Response.json(
          { error: insertError.message },
          { status: 400, headers: corsHeaders }
        );
      }
    } else {
      invitation = insertedInvitation!;
    }

    const redirectTo = `${siteUrl.replace(/\/$/, "")}/accept-invite?token=${
      invitation.token
    }`;
    const inviteData = {
      workspace_invitation_id: invitation.id,
      workspace_id: workspaceId,
      role: inviteRole,
    };

    const { data: emailExists, error: existsError } = await supabaseAdmin.rpc(
      "auth_user_exists_by_email",
      { p_email: normalizedEmail }
    );
    if (existsError) {
      if (!existingInvitation) {
        await supabaseAdmin
          .from("workspace_invitations")
          .delete()
          .eq("id", invitation.id);
      }
      return Response.json(
        { error: existsError.message || "Failed to check user" },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!existingInvitation) {
      await supabaseAdmin
        .from("workspace_invitations")
        .update({ invitee_was_existing_user: emailExists })
        .eq("id", invitation.id);
    }

    if (emailExists) {
      const { data: linkData, error: linkError } =
        await supabaseAdmin.auth.admin.generateLink({
          type: "magiclink",
          email: normalizedEmail,
          options: { redirectTo },
        });
      if (linkError || !linkData?.properties?.action_link) {
        if (!existingInvitation) {
          await supabaseAdmin
            .from("workspace_invitations")
            .delete()
            .eq("id", invitation.id);
        }
        return Response.json(
          {
            error: linkError?.message || "Failed to generate invitation link",
          },
          { status: 400, headers: corsHeaders }
        );
      }
      const resendKey = Deno.env.get("RESEND_API_KEY");
      const resendFrom =
        Deno.env.get("RESEND_FROM") ?? "SnipDM <snipdm@demind-inc.com>";
      if (resendKey) {
        const actionLink = linkData.properties.action_link as string;
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendKey}`,
          },
          body: JSON.stringify({
            from: resendFrom,
            to: [normalizedEmail],
            subject: "You're invited to join a workspace",
            html: `You've been invited to join a workspace. <a href="${actionLink}">Accept the invitation</a>.`,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          if (!existingInvitation) {
            await supabaseAdmin
              .from("workspace_invitations")
              .delete()
              .eq("id", invitation.id);
          }
          return Response.json(
            {
              error:
                (err as { message?: string })?.message ||
                "Failed to send invitation email",
            },
            { status: 400, headers: corsHeaders }
          );
        }
      } else {
        return Response.json(
          {
            ok: true,
            invitationId: invitation.id,
            existingUser: true,
            isNewUser: false,
            token: invitation.token,
          },
          { headers: corsHeaders }
        );
      }
      return Response.json(
        {
          ok: true,
          invitationId: invitation.id,
          existingUser: true,
          isNewUser: false,
        },
        { headers: corsHeaders }
      );
    }

    const { error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(normalizedEmail, {
        data: inviteData,
        redirectTo,
      });
    if (inviteError) {
      if (!existingInvitation) {
        await supabaseAdmin
          .from("workspace_invitations")
          .delete()
          .eq("id", invitation.id);
      }
      return Response.json(
        { error: inviteError.message || "Failed to send invitation email" },
        { status: 400, headers: corsHeaders }
      );
    }

    return Response.json(
      {
        ok: true,
        invitationId: invitation.id,
        isNewUser: true,
      },
      { headers: corsHeaders }
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
});
