import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";

export interface Tag {
  id: string;
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
  snippet_tags: Array<{ tag_id: string }>;
}

async function fetchTags(workspaceId: string) {
  const { data } = await supabase
    .from("tags")
    .select("id, name, color")
    .eq("workspace_id", workspaceId);
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
    .select(`*, snippet_tags(tag_id)`)
    .eq("id", snippetId)
    .maybeSingle();
  return data as SnippetWithTags | null;
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
  selectedTagIds: string[];
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
        selectedTagIds,
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
        if (selectedTagIds.length > 0) {
          await supabase
            .from("snippet_tags")
            .insert(selectedTagIds.map((tag_id) => ({ snippet_id: snippetId, tag_id })));
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
        if (selectedTagIds.length > 0) {
          await supabase
            .from("snippet_tags")
            .insert(selectedTagIds.map((tag_id) => ({ snippet_id: id!, tag_id })));
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

export function useCreateTagMutation(workspaceId: string | undefined, createdBy: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const colors = [
        "#6366f1", "#f59e0b", "#10b981", "#ef4444",
        "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6",
      ];
      const color = colors[Math.floor(Math.random() * colors.length)];
      const { data, error } = await supabase
        .from("tags")
        .insert({
          workspace_id: workspaceId!,
          name: name.trim(),
          color,
          created_by: createdBy!,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Tag;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tags(workspaceId) });
    },
  });
}
