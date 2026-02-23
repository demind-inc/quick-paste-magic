-- Return workspaces the current user is a member of, with their role.
-- Used by get-my-workspaces Edge Function (no params; uses auth.uid()).
CREATE OR REPLACE FUNCTION public.get_my_workspaces()
RETURNS TABLE (
  id UUID,
  name TEXT,
  owner_id UUID,
  api_key TEXT,
  domain_allowlist TEXT[],
  domain_denylist TEXT[],
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  my_role public.workspace_role
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    w.id,
    w.name,
    w.owner_id,
    w.api_key,
    w.domain_allowlist,
    w.domain_denylist,
    w.created_at,
    w.updated_at,
    wm.role AS my_role
  FROM public.workspaces w
  INNER JOIN public.workspace_members wm
    ON wm.workspace_id = w.id AND wm.user_id = auth.uid()
  WHERE auth.uid() IS NOT NULL
  ORDER BY w.name;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_workspaces() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_workspaces() TO service_role;
