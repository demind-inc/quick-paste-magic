export const queryKeys = {
  workspace: (userId: string | undefined) => ["workspace", userId] as const,
  profile: (userId: string | undefined) => ["profile", userId] as const,
  snippets: (workspaceId: string | undefined, sortKey?: string) =>
    ["snippets", workspaceId, sortKey] as const,
  tags: (workspaceId: string | undefined) => ["tags", workspaceId] as const,
  folders: (workspaceId: string | undefined) => ["folders", workspaceId] as const,
  snippet: (snippetId: string | undefined) => ["snippet", snippetId] as const,
};
