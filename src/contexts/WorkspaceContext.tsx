import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";

export interface Workspace {
  id: string;
  name: string;
  owner_id: string;
  api_key: string;
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

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [myRole, setMyRole] = useState<"owner" | "editor" | "viewer" | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchWorkspace = async () => {
    if (!user) {
      setWorkspace(null);
      setMembers([]);
      setMyRole(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Get first workspace where user is a member
      const { data: memberData } = await supabase
        .from("workspace_members")
        .select("workspace_id, role")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (!memberData) {
        setLoading(false);
        return;
      }

      setMyRole(memberData.role as "owner" | "editor" | "viewer");

      const { data: wsData } = await supabase
        .from("workspaces")
        .select("*")
        .eq("id", memberData.workspace_id)
        .single();

      if (wsData) setWorkspace(wsData as Workspace);

      // Fetch members with profiles
      const { data: membersData } = await supabase
        .from("workspace_members")
        .select(`
          id, workspace_id, user_id, role, joined_at,
          profiles:profiles(full_name, email, avatar_url)
        `)
        .eq("workspace_id", memberData.workspace_id);

      if (membersData) {
        setMembers(
          membersData.map((m: any) => ({
            ...m,
            profiles: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles,
          })) as WorkspaceMember[]
        );
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkspace();
  }, [user]);

  return (
    <WorkspaceContext.Provider
      value={{ workspace, members, myRole, loading, refetch: fetchWorkspace }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
