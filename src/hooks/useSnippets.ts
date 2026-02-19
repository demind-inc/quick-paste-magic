import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";

export interface SnippetTag {
  id: string;
  name: string;
  color: string;
}

export interface SnippetRow {
  id: string;
  title: string;
  shortcut: string | null;
  body: string;
  shared_scope: "private" | "workspace";
  use_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
  owner_id: string;
  folder_id: string | null;
  snippet_tags?: Array<{ tag_id: string; tags: SnippetTag | SnippetTag[] }>;
}

function normalizeSnippet(s: any) {
  return {
    ...s,
    tags: (s.snippet_tags ?? []).map((st: any) => st.tags).filter(Boolean),
  };
}

type SortKey = "updated_at" | "use_count" | "title";

async function fetchSnippets(workspaceId: string, sortKey: SortKey) {
  const { data } = await supabase
    .from("snippets")
    .select(`
      id, title, shortcut, body, shared_scope, use_count,
      last_used_at, created_at, updated_at, owner_id, folder_id,
      snippet_tags(tag_id, tags(id, name, color))
    `)
    .eq("workspace_id", workspaceId)
    .order(sortKey, { ascending: sortKey === "title" });
  return (data ?? []).map(normalizeSnippet);
}

async function fetchTags(workspaceId: string) {
  const { data } = await supabase
    .from("tags")
    .select("id, name, color")
    .eq("workspace_id", workspaceId);
  return data ?? [];
}

export function useSnippetsQuery(workspaceId: string | undefined, sortKey: SortKey) {
  return useQuery({
    queryKey: queryKeys.snippets(workspaceId, sortKey),
    queryFn: () => fetchSnippets(workspaceId!, sortKey),
    enabled: !!workspaceId,
  });
}

export function useTagsQuery(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.tags(workspaceId),
    queryFn: () => fetchTags(workspaceId!),
    enabled: !!workspaceId,
  });
}

export function useSnippetDeleteMutation(workspaceId: string | undefined, sortKey: SortKey) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (snippetId: string) => {
      const { error } = await supabase.from("snippets").delete().eq("id", snippetId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.snippets(workspaceId, sortKey) });
    },
  });
}

export function useSnippetDuplicateMutation(
  workspaceId: string | undefined,
  sortKey: SortKey,
  ownerId: string | undefined
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (snippet: {
      title: string;
      body: string;
      folder_id: string | null;
    }) => {
      const { data, error } = await supabase
        .from("snippets")
        .insert({
          workspace_id: workspaceId!,
          owner_id: ownerId!,
          title: snippet.title + " (copy)",
          shortcut: null,
          body: snippet.body,
          shared_scope: "private",
          folder_id: snippet.folder_id,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.snippets(workspaceId, sortKey) });
    },
  });
}
