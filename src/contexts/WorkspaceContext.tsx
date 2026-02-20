import { createContext, useContext, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";
import { queryKeys } from "@/lib/queryKeys";

export interface Workspace {
  id: string;
  name: string;
  owner_id: string;
  api_key: string;
  domain_allowlist: string[];
  domain_denylist: string[];
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: "owner" | "editor" | "viewer";
  joined_at: string;
  profiles?: {
    full_name: string | null;
    email: string;
    avatar_url: string | null;
  };
}

interface WorkspaceContextType {
  workspace: Workspace | null;
  members: WorkspaceMember[];
  myRole: "owner" | "editor" | "viewer" | null;
  loading: boolean;
  refetch: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextType>({
  workspace: null,
  members: [],
  myRole: null,
  loading: true,
  refetch: () => {},
});

async function fetchWorkspace(userId: string) {
  await supabase.rpc("ensure_profile");
  const { data: memberData } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (!memberData) {
    return { workspace: null, members: [], myRole: null };
  }

  const myRole = memberData.role as "owner" | "editor" | "viewer";

  const { data: wsData } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", memberData.workspace_id)
    .maybeSingle();

  const workspace = wsData as Workspace | null;

  const { data: membersData } = await supabase
    .from("workspace_members")
    .select("id, workspace_id, user_id, role, joined_at")
    .eq("workspace_id", memberData.workspace_id);

  const memberList = membersData ?? [];
  const userIds = [...new Set(memberList.map((m) => m.user_id))];

  let profilesByUserId: Record<string, { full_name: string | null; email: string; avatar_url: string | null }> = {};
  if (userIds.length > 0) {
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, full_name, email, avatar_url")
      .in("id", userIds);
    if (profilesData) {
      profilesByUserId = Object.fromEntries(profilesData.map((p) => [p.id, p]));
    }
  }

  const members: WorkspaceMember[] = memberList.map((m) => ({
    ...m,
    role: m.role as "owner" | "editor" | "viewer",
    profiles: profilesByUserId[m.user_id] ?? undefined,
  }));

  return {
    workspace,
    members,
    myRole,
  };
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const {
    data,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: queryKeys.workspace(user?.id),
    queryFn: () => fetchWorkspace(user!.id),
    enabled: !!user?.id,
  });

  const value: WorkspaceContextType = {
    workspace: data?.workspace ?? null,
    members: data?.members ?? [],
    myRole: data?.myRole ?? null,
    loading: isLoading,
    refetch,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
