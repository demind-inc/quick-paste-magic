import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";

export function useInviteMemberMutation() {
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

export function useUpdateDomainDenylistMutation(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      workspaceId,
      domainDenylist,
    }: { workspaceId: string; domainDenylist: string[] }) => {
      const { error } = await supabase
        .from("workspaces")
        .update({ domain_denylist: domainDenylist })
        .eq("id", workspaceId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace(userId) });
    },
  });
}
