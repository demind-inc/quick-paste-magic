-- Used by AcceptInvite page to skip the "set password" step when the user
-- already has a password (e.g. signed up with email/password).
CREATE OR REPLACE FUNCTION public.auth_user_has_password()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
      AND encrypted_password IS NOT NULL
      AND encrypted_password != ''
  );
$$;

GRANT EXECUTE ON FUNCTION public.auth_user_has_password() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_has_password() TO service_role;
