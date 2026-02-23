-- Accept workspace invitation by token.
CREATE OR REPLACE FUNCTION public.accept_workspace_invite(p_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
  user_email TEXT;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RAISE EXCEPTION 'Token is required';
  END IF;

  SELECT * INTO inv
  FROM public.workspace_invitations
  WHERE token = p_token
    AND accepted_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found or already accepted';
  END IF;

  SELECT email INTO user_email FROM auth.users WHERE id = auth.uid();
  IF user_email IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to accept an invitation';
  END IF;

  IF lower(user_email) <> lower(inv.email) THEN
    RAISE EXCEPTION 'Invitation email does not match your account';
  END IF;

  INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_by)
  VALUES (inv.workspace_id, auth.uid(), inv.role, inv.invited_by)
  ON CONFLICT (workspace_id, user_id) DO NOTHING;

  UPDATE public.workspace_invitations
  SET accepted_at = now()
  WHERE id = inv.id;

  RETURN inv.workspace_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_workspace_invite(TEXT) TO authenticated;
