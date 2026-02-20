-- Allow any workspace member to create tags (in addition to editors/owners).
-- Uses a SECURITY DEFINER function so the policy unambiguously checks membership
-- for the new row's workspace_id. No DROP so this is safe to run in guarded SQL editors.
CREATE OR REPLACE FUNCTION public.can_insert_tag(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = auth.uid()
  );
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tags' AND policyname = 'Workspace members can create tags'
  ) THEN
    CREATE POLICY "Workspace members can create tags"
      ON public.tags FOR INSERT
      WITH CHECK (public.can_insert_tag(workspace_id));
  END IF;
END $$;
