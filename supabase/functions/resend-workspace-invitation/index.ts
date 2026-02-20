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

interface ResendBody {
  invitationId: string;
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

    const body = (await req.json()) as ResendBody;
    const { invitationId } = body;
    if (!invitationId) {
      return Response.json(
        { error: "invitationId is required" },
        { status: 400, headers: corsHeaders }
      );
    }

    const { data: invitation, error: fetchError } = await supabaseAdmin
      .from("workspace_invitations")
      .select("id, workspace_id, email, role, token")
      .eq("id", invitationId)
      .is("accepted_at", null)
      .maybeSingle();

    if (fetchError || !invitation) {
      return Response.json(
        { error: "Invitation not found or already accepted" },
        { status: 404, headers: corsHeaders }
      );
    }

    const { data: memberRole, error: roleError } = await supabaseAdmin.rpc(
      "get_workspace_role",
      {
        _user_id: invitedBy,
        _workspace_id: invitation.workspace_id,
      }
    );
    if (roleError || memberRole !== "owner") {
      return Response.json(
        { error: "Only workspace owners can resend invitations" },
        { status: 403, headers: corsHeaders }
      );
    }

    const redirectTo = `${siteUrl.replace(/\/$/, "")}/accept-invite?token=${
      invitation.token
    }`;
    const inviteData = {
      workspace_invitation_id: invitation.id,
      workspace_id: invitation.workspace_id,
      role: invitation.role,
    };

    const { error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(invitation.email, {
        data: inviteData,
        redirectTo,
      });

    if (inviteError) {
      const isAlreadyRegistered =
        /already been registered|already exists|already registered/i.test(
          inviteError.message ?? ""
        );
      if (isAlreadyRegistered) {
        const { data: linkData, error: linkError } =
          await supabaseAdmin.auth.admin.generateLink({
            type: "invite",
            email: invitation.email,
            options: {
              redirectTo,
              data: inviteData,
            },
          });
        if (linkError) {
          return Response.json(
            {
              error:
                linkError.message ||
                "Failed to generate new invitation link",
            },
            { status: 400, headers: corsHeaders }
          );
        }
        const actionLink =
          (linkData as { properties?: { action_link?: string } })?.properties
            ?.action_link ??
          (linkData as { action_link?: string })?.action_link;
        return Response.json(
          {
            ok: true,
            resend: true,
            actionLink: actionLink ?? undefined,
          },
          { headers: corsHeaders }
        );
      }
      return Response.json(
        { error: inviteError.message || "Failed to resend invitation email" },
        { status: 400, headers: corsHeaders }
      );
    }

    return Response.json({ ok: true }, { headers: corsHeaders });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
});
