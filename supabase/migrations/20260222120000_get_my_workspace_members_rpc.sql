-- Return all members of all workspaces the current user belongs to, with profile info.
-- Used by get-my-workspaces Edge Function so the client doesn't need fetchWorkspaceMembers.
CREATE OR REPLACE FUNCTION public.get_my_workspace_members()
RETURNS TABLE (
  id UUID,
  workspace_id UUID,
  user_id UUID,
  role public.workspace_role,
  joined_at TIMESTAMPTZ,
  full_name TEXT,
  email TEXT,
  avatar_url TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    wm.id,
    wm.workspace_id,
    wm.user_id,
    wm.role,
    wm.joined_at,
    p.full_name,
    p.email,
    p.avatar_url
  FROM public.workspace_members wm
  INNER JOIN public.workspace_members my
    ON my.workspace_id = wm.workspace_id AND my.user_id = auth.uid()
  LEFT JOIN public.profiles p ON p.id = wm.user_id
  WHERE auth.uid() IS NOT NULL
  ORDER BY wm.workspace_id, wm.joined_at;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_workspace_members() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_workspace_members() TO service_role;
