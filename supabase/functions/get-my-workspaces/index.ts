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

type WorkspaceRole = "owner" | "editor" | "viewer";

interface WorkspaceRow {
  id: string;
  name: string;
  owner_id: string;
  api_key: string;
  domain_allowlist: string[];
  domain_denylist: string[];
  created_at: string;
  updated_at: string;
  my_role: WorkspaceRole;
}

interface MemberRow {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  joined_at: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return Response.json(
        { error: "Missing or invalid authorization" },
        { status: 401, headers: corsHeaders }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return Response.json(
        { error: "Missing authorization header" },
        { status: 401, headers: corsHeaders }
      );
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    await supabase.rpc("ensure_profile");
    const [workspacesResult, membersResult] = await Promise.all([
      supabase.rpc("get_my_workspaces"),
      supabase.rpc("get_my_workspace_members"),
    ]);

    const { data: rows, error } = workspacesResult;
    if (error) {
      return Response.json(
        { error: error.message },
        { status: 400, headers: corsHeaders }
      );
    }

    const membersError = membersResult.error;
    if (membersError) {
      return Response.json(
        { error: membersError.message },
        { status: 400, headers: corsHeaders }
      );
    }

    const list = (rows ?? []) as WorkspaceRow[];
    const workspaces = list.map((row) => ({
      id: row.id,
      name: row.name,
      owner_id: row.owner_id,
      api_key: row.api_key,
      domain_allowlist: row.domain_allowlist,
      domain_denylist: row.domain_denylist,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
    const memberships = list.map((row) => ({
      workspace_id: row.id,
      role: row.my_role,
    }));

    const memberRows = (membersResult.data ?? []) as MemberRow[];
    const membersByWorkspaceId = new Map<string, typeof memberRows>();
    for (const row of memberRows) {
      const list = membersByWorkspaceId.get(row.workspace_id) ?? [];
      list.push(row);
      membersByWorkspaceId.set(row.workspace_id, list);
    }

    const workspacesWithMembers = workspaces.map((ws) => {
      const memberList = membersByWorkspaceId.get(ws.id) ?? [];
      return {
        ...ws,
        members: memberList.map((row) => ({
          id: row.id,
          workspace_id: row.workspace_id,
          user_id: row.user_id,
          role: row.role,
          joined_at: row.joined_at,
          full_name: row.full_name,
          email: row.email,
          avatar_url: row.avatar_url,
        })),
      };
    });

    return Response.json(
      { workspaces: workspacesWithMembers, memberships },
      { headers: corsHeaders }
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
});
