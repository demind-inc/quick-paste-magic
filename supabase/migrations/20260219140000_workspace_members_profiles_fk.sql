-- Link workspace_members.user_id to profiles so PostgREST can embed profiles(...).
-- profiles.id = auth.users.id, so this is equivalent for data but gives a direct relationship.
ALTER TABLE public.workspace_members
  DROP CONSTRAINT IF EXISTS workspace_members_user_id_fkey;

ALTER TABLE public.workspace_members
  ADD CONSTRAINT workspace_members_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
