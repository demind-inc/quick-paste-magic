import { createContext, useContext, ReactNode, useEffect, useState } from "react";
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
  workspaces: Workspace[];
  members: WorkspaceMember[];
  myRole: "owner" | "editor" | "viewer" | null;
  loading: boolean;
  setActiveWorkspaceId: (workspaceId: string) => void;
  refetch: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextType>({
  workspace: null,
  workspaces: [],
  members: [],
  myRole: null,
  loading: true,
  setActiveWorkspaceId: () => {},
  refetch: () => {},
});

function resolveActiveWorkspaceId(
  userId: string,
  workspaceIds: string[],
  current: string | null
) {
  if (current && workspaceIds.includes(current)) return current;
  const saved = localStorage.getItem(`activeWorkspace:${userId}`);
  if (saved && workspaceIds.includes(saved)) return saved;
  return workspaceIds[0] ?? null;
}

interface GetMyWorkspacesMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
}

interface WorkspaceWithMembers extends Workspace {
  members: GetMyWorkspacesMember[];
}

async function fetchWorkspaces(_userId: string) {
  const { data, error } = await supabase.functions.invoke("get-my-workspaces");
  if (error) throw error;
  const payload = data as
    | {
        workspaces: WorkspaceWithMembers[];
        memberships: { workspace_id: string; role: string }[];
      }
    | undefined;
  const workspacesWithMembers = payload?.workspaces ?? [];
  const memberships = payload?.memberships ?? [];
  return { workspacesWithMembers, memberships };
}

function mapToWorkspaceMembers(raw: GetMyWorkspacesMember[]): WorkspaceMember[] {
  return raw.map((m) => ({
    id: m.id,
    workspace_id: m.workspace_id,
    user_id: m.user_id,
    role: m.role as "owner" | "editor" | "viewer",
    joined_at: m.joined_at,
    profiles: {
      full_name: m.full_name,
      email: m.email,
      avatar_url: m.avatar_url,
    },
  }));
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setActiveWorkspaceId(null);
    }
  }, [user?.id]);

  const {
    data: workspacesData,
    isLoading: workspacesLoading,
    refetch: refetchWorkspaces,
  } = useQuery({
    queryKey: queryKeys.workspaces(user?.id),
    queryFn: () => fetchWorkspaces(user!.id),
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (!user?.id || !workspacesData) return;
    const resolved = resolveActiveWorkspaceId(
      user.id,
      workspacesData.workspacesWithMembers.map((w) => w.id),
      activeWorkspaceId
    );
    if (resolved !== activeWorkspaceId) {
      setActiveWorkspaceId(resolved);
    }
  }, [user?.id, workspacesData, activeWorkspaceId]);

  useEffect(() => {
    if (!user?.id || !activeWorkspaceId) return;
    localStorage.setItem(`activeWorkspace:${user.id}`, activeWorkspaceId);
  }, [user?.id, activeWorkspaceId]);

  const workspacesWithMembers = workspacesData?.workspacesWithMembers ?? [];
  const workspaces = workspacesWithMembers.map(({ members: _m, ...ws }) => ws);
  const memberships = workspacesData?.memberships ?? [];
  const activeWorkspaceWithMembers = workspacesWithMembers.find(
    (w) => w.id === activeWorkspaceId
  ) ?? null;
  const workspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null;
  const myRole = memberships.find((m) => m.workspace_id === activeWorkspaceId)?.role ?? null;
  const members =
    activeWorkspaceWithMembers != null
      ? mapToWorkspaceMembers(activeWorkspaceWithMembers.members)
      : [];

  const resolvingActiveWorkspace =
    !!workspacesData && workspaces.length > 0 && !activeWorkspaceId;

  const value: WorkspaceContextType = {
    workspace,
    workspaces,
    members,
    myRole: myRole as "owner" | "editor" | "viewer" | null,
    loading: workspacesLoading || resolvingActiveWorkspace,
    setActiveWorkspaceId,
    refetch: () => refetchWorkspaces(),
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
