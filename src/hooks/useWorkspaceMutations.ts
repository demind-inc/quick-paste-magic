import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";

export interface WorkspaceInvitation {
  id: string;
  workspace_id: string;
  email: string;
  role: "editor" | "viewer";
  invited_by: string;
  created_at: string;
  accepted_at: string | null;
}

export function useWorkspaceInvitations(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.workspaceInvitations(workspaceId),
    queryFn: async () => {
      if (!workspaceId) return [];
      const { data, error } = await supabase
        .from("workspace_invitations")
        .select("id, workspace_id, email, role, invited_by, created_at, accepted_at")
        .eq("workspace_id", workspaceId)
        .is("accepted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WorkspaceInvitation[];
    },
    enabled: !!workspaceId,
  });
}

export function useInviteMemberMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      workspaceId,
      email,
      role,
    }: {
      workspaceId: string;
      email: string;
      role: "editor" | "viewer";
      invitedBy: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("invite-workspace-member", {
        body: { workspaceId, email: email.trim(), role },
      });
      if (error) throw error;
      const err = (data as { error?: string })?.error;
      if (err) throw new Error(err);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.workspaceInvitations(variables.workspaceId),
      });
    },
  });
}

export function useResendInvitationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      invitationId,
      workspaceId,
    }: {
      invitationId: string;
      workspaceId: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("resend-workspace-invitation", {
        body: { invitationId },
      });
      if (error) throw error;
      const err = (data as { error?: string })?.error;
      if (err) throw new Error(err);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.workspaceInvitations(variables.workspaceId),
      });
    },
  });
}

export function useRemoveMemberMutation(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from("workspace_members")
        .delete()
        .eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace(userId) });
    },
  });
}

export function useUpdateMemberRoleMutation(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: "editor" | "viewer" | "owner" }) => {
      const { error } = await supabase
        .from("workspace_members")
        .update({ role })
        .eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace(userId) });
    },
  });
}

export function useRegenerateApiKeyMutation(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (workspaceId: string) => {
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      const newKey = Array.from(array).map((b) => b.toString(16).padStart(2, "0")).join("");
      const { error } = await supabase
        .from("workspaces")
        .update({ api_key: newKey })
        .eq("id", workspaceId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace(userId) });
    },
  });
}

export function useUpdateDomainAllowlistMutation(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      workspaceId,
      domainAllowlist,
    }: { workspaceId: string; domainAllowlist: string[] }) => {
      const { error } = await supabase
        .from("workspaces")
        .update({ domain_allowlist: domainAllowlist })
        .eq("id", workspaceId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace(userId) });
    },
  });
}
