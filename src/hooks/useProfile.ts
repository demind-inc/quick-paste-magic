import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";

async function fetchProfile(userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();
  return data?.full_name ?? "";
}

export function useProfileQuery(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.profile(userId),
    queryFn: () => fetchProfile(userId!),
    enabled: !!userId,
  });
}

export function useUpdateProfileMutation(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (fullName: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName.trim() })
        .eq("id", userId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) });
    },
  });
}

export function useUpdateWorkspaceMutation(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      workspaceId,
      name,
    }: { workspaceId: string; name: string }) => {
      const { error } = await supabase
        .from("workspaces")
        .update({ name: name.trim() })
        .eq("id", workspaceId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace(userId) });
    },
  });
}
