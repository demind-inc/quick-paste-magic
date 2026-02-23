-- Allow fetching profiles of users who share a workspace with the current user.
-- Use a SECURITY DEFINER function so the check reads workspace_members without RLS
-- (avoids "returns only my profile" when querying by multiple user ids).
-- Only run when workspace_members exists (e.g. when migrations are applied in order).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'workspace_members'
  ) THEN
    CREATE OR REPLACE FUNCTION public.user_shares_workspace_with(_other_user_id UUID)
    RETURNS BOOLEAN
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = public
    AS $fn$
      SELECT EXISTS (
        SELECT 1
        FROM public.workspace_members w1
        JOIN public.workspace_members w2
          ON w1.workspace_id = w2.workspace_id AND w2.user_id = _other_user_id
        WHERE w1.user_id = auth.uid()
      );
    $fn$;

    DROP POLICY IF EXISTS "Workspace members can view same-workspace profiles" ON public.profiles;
    DROP POLICY IF EXISTS "Workspace members can view member profiles" ON public.profiles;

    CREATE POLICY "Profiles visible to self or same-workspace members"
      ON public.profiles FOR SELECT
      USING (
        auth.uid() = id
        OR public.user_shares_workspace_with(id)
      );
  END IF;
END $$;
