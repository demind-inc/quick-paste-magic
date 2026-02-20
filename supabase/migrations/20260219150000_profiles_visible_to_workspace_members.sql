-- Allow workspace members to view profiles of other users in the same workspace
-- (so team/settings can show names and emails without relying on workspace_members->profiles FK).
CREATE POLICY "Workspace members can view same-workspace profiles"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.workspace_members w1
      JOIN public.workspace_members w2 ON w1.workspace_id = w2.workspace_id AND w2.user_id = profiles.id
      WHERE w1.user_id = auth.uid()
    )
  );
