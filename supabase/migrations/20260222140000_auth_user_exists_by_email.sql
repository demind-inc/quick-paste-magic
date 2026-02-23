-- Used by invite-workspace-member Edge Function to decide whether to call
-- inviteUserByEmail (new user) or generateLink + Resend (existing user).
CREATE OR REPLACE FUNCTION public.auth_user_exists_by_email(p_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE lower(email) = lower(trim(p_email))
  );
$$;

GRANT EXECUTE ON FUNCTION public.auth_user_exists_by_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_exists_by_email(text) TO service_role;
