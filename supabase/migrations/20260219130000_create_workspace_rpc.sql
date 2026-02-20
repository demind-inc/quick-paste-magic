-- Create workspace via RPC so inserts run with definer privileges (bypass RLS).
-- Fixes "new row violates row-level security policy" when INSERT policy doesn't apply.
CREATE OR REPLACE FUNCTION public.create_workspace(p_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  INSERT INTO public.workspaces (name, owner_id)
  VALUES (trim(p_name), v_user_id)
  RETURNING id INTO v_workspace_id;
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace_id, v_user_id, 'owner');
  RETURN v_workspace_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_workspace(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_workspace(TEXT) TO service_role;
