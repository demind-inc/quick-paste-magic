-- Allow workspace members to view profiles of users in the same workspace.
-- Only run when workspace_members exists (e.g. when migrations are applied in order).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'workspace_members'
  ) THEN
    DROP POLICY IF EXISTS "Workspace members can view member profiles" ON public.profiles;
    CREATE POLICY "Workspace members can view member profiles"
      ON public.profiles FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.workspace_members wm_me
          JOIN public.workspace_members wm_other
            ON wm_me.workspace_id = wm_other.workspace_id
          WHERE wm_me.user_id = auth.uid()
            AND wm_other.user_id = public.profiles.id
        )
      );
  END IF;
END $$;
