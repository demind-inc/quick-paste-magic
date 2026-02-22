import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";

async function fetchProfile(
  userId: string,
  fallbackFullName?: string | null
): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  const fromDb = data?.full_name?.trim();
  if (fromDb !== undefined && fromDb !== "") return fromDb;
  return (fallbackFullName?.trim() ?? "") || "";
}

export function useProfileQuery(
  userId: string | undefined,
  fallbackFullName?: string | null
) {
  return useQuery({
    queryKey: queryKeys.profile(userId),
    queryFn: () => fetchProfile(userId!, fallbackFullName),
    enabled: !!userId,
  });
}

export function useUpdateProfileMutation(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (fullName: string) => {
      const name = fullName.trim();
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: name })
        .eq("id", userId!);
      if (error) throw error;
      return name;
    },
    onSuccess: (savedName) => {
      if (userId && savedName !== undefined) {
        queryClient.setQueryData(queryKeys.profile(userId), savedName);
      }
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
    }: {
      workspaceId: string;
      name: string;
    }) => {
      const { error } = await supabase
        .from("workspaces")
        .update({ name: name.trim() })
        .eq("id", workspaceId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces(userId) });
    },
  });
}
