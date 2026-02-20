import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";

export interface Tag {
  name: string;
  color: string;
}

export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
}

export interface SnippetWithTags {
  id: string;
  title: string;
  shortcut: string | null;
  body: string;
  shared_scope: "private" | "workspace";
  folder_id: string | null;
  snippet_tags: Array<{ tag_name: string; tag_color: string }>;
}

async function fetchTags(workspaceId: string) {
  // workspace_tags is a view; cast needed until client types include Views in from()
  const { data } = await (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("workspace_tags").select("name, color").eq("workspace_id", workspaceId)
  );
  return (data ?? []) as Tag[];
}

async function fetchFolders(workspaceId: string) {
  const { data } = await supabase
    .from("folders")
    .select("id, name, parent_id")
    .eq("workspace_id", workspaceId);
  return (data ?? []) as Folder[];
}

async function fetchSnippet(snippetId: string) {
  const { data } = await supabase
    .from("snippets")
    .select(`*, snippet_tags(tag_name, tag_color)`)
    .eq("id", snippetId)
    .maybeSingle();
  return data as unknown as SnippetWithTags | null;
}

export function useTagsQuery(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.tags(workspaceId),
    queryFn: () => fetchTags(workspaceId!),
    enabled: !!workspaceId,
  });
}

export function useFoldersQuery(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.folders(workspaceId),
    queryFn: () => fetchFolders(workspaceId!),
    enabled: !!workspaceId,
  });
}

export function useSnippetQuery(snippetId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.snippet(snippetId),
    queryFn: () => fetchSnippet(snippetId!),
    enabled: !!snippetId && enabled,
  });
}

export interface TagSelection {
  name: string;
  color: string;
}

interface SaveSnippetVariables {
  id: string | undefined;
  isNew: boolean;
  workspaceId: string;
  ownerId: string;
  title: string;
  shortcut: string | null;
  body: string;
  sharedScope: "private" | "workspace";
  folderId: string | null;
  selectedTags: TagSelection[];
}

export function useSaveSnippetMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: SaveSnippetVariables) => {
      const {
        id,
        isNew,
        workspaceId,
        ownerId,
        title,
        shortcut,
        body,
        sharedScope,
        folderId,
        selectedTags,
      } = vars;

      if (isNew) {
        const { data, error } = await supabase
          .from("snippets")
          .insert({
            workspace_id: workspaceId,
            owner_id: ownerId,
            title: title.trim(),
            shortcut: shortcut || null,
            body,
            shared_scope: sharedScope,
            folder_id: folderId,
          })
          .select("id")
          .single();
        if (error) throw error;
        const snippetId = data.id;
        await supabase.from("snippet_tags").delete().eq("snippet_id", snippetId);
        if (selectedTags.length > 0) {
          await supabase
            .from("snippet_tags")
            .insert(selectedTags.map((t) => ({ snippet_id: snippetId, tag_name: t.name, tag_color: t.color })));
        }
        return snippetId;
      } else {
        const { error } = await supabase
          .from("snippets")
          .update({
            title: title.trim(),
            shortcut: shortcut || null,
            body,
            shared_scope: sharedScope,
            folder_id: folderId,
          })
          .eq("id", id!);
        if (error) throw error;
        await supabase.from("snippet_tags").delete().eq("snippet_id", id!);
        if (selectedTags.length > 0) {
          await supabase
            .from("snippet_tags")
            .insert(selectedTags.map((t) => ({ snippet_id: id!, tag_name: t.name, tag_color: t.color })));
        }
        return id!;
      }
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.snippets(vars.workspaceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.snippet(vars.id) });
    },
  });
}

/** Default palette for new tags (used in UI only; tags live in snippet_tags). */
export const TAG_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444",
  "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6",
];
