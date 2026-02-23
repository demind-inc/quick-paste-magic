-- Return invite email for a valid token (for unauthenticated signup pre-fill).
-- Callable by anon so accept-invite page can show "Create account with {email}".
CREATE OR REPLACE FUNCTION public.get_workspace_invite_email(p_token TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv_email TEXT;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT email INTO inv_email
  FROM public.workspace_invitations
  WHERE token = p_token
    AND accepted_at IS NULL
  LIMIT 1;

  RETURN inv_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_workspace_invite_email(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_invite_email(TEXT) TO authenticated;
