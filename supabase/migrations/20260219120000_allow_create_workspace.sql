-- Allow authenticated users to create a workspace and add themselves as owner
-- (for signup -> email confirm -> create workspace flow).

-- Any authenticated user can create a workspace they own
CREATE POLICY "Users can create workspace they own"
  ON public.workspaces FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- User can add themselves as owner when the workspace is owned by them
-- (used right after creating the workspace, before any other members exist)
CREATE POLICY "Users can add themselves as owner of own workspace"
  ON public.workspace_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'owner'
    AND EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_id AND w.owner_id = auth.uid()
    )
  );
