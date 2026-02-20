-- Ensure profile exists for the current user (call after signup or on login).
-- Upserts into profiles so profile is created even if trigger didn't run.
CREATE OR REPLACE FUNCTION public.ensure_profile()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID := auth.uid();
  _email TEXT;
  _full_name TEXT;
BEGIN
  IF _id IS NULL THEN
    RETURN;
  END IF;

  SELECT email, raw_user_meta_data->>'full_name'
  INTO _email, _full_name
  FROM auth.users
  WHERE id = _id;

  _email := COALESCE(_email, '');
  _full_name := COALESCE(trim(_full_name), split_part(_email, '@', 1));

  INSERT INTO public.profiles (id, email, full_name)
  VALUES (_id, _email, _full_name)
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(NULLIF(trim(EXCLUDED.email), ''), profiles.email),
    full_name = COALESCE(NULLIF(trim(EXCLUDED.full_name), ''), profiles.full_name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_profile() TO service_role;
