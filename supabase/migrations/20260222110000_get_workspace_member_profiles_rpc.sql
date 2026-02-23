-- Return profiles for users who are members of the given workspace.
-- Caller must be a member of that workspace; only then are profiles for
-- p_user_ids (that are also members of p_workspace_id) returned.
CREATE OR REPLACE FUNCTION public.get_workspace_member_profiles(
  p_workspace_id UUID,
  p_user_ids UUID[]
)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  email TEXT,
  avatar_url TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.email, p.avatar_url
  FROM public.profiles p
  INNER JOIN public.workspace_members wm
    ON wm.user_id = p.id
    AND wm.workspace_id = p_workspace_id
    AND wm.user_id = ANY (p_user_ids)
  WHERE EXISTS (
    SELECT 1 FROM public.workspace_members caller
    WHERE caller.workspace_id = p_workspace_id
      AND caller.user_id = auth.uid()
  )
  AND auth.uid() IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_workspace_member_profiles(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_workspace_member_profiles(UUID, UUID[]) TO service_role;
