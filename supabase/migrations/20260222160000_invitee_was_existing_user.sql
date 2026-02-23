-- Store whether the invitee had an existing auth account at invite time,
-- so AcceptInvite can require password for new users.
ALTER TABLE public.workspace_invitations
  ADD COLUMN IF NOT EXISTS invitee_was_existing_user boolean;

-- accept_workspace_invite now returns JSONB { workspace_id, is_new_user }
-- so the client can require password for new users.
DROP FUNCTION IF EXISTS public.accept_workspace_invite(text);

CREATE FUNCTION public.accept_workspace_invite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv record;
  user_email text;
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

  RETURN jsonb_build_object(
    'workspace_id', inv.workspace_id,
    'is_new_user', NOT COALESCE(inv.invitee_was_existing_user, false)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_workspace_invite(text) TO authenticated;
