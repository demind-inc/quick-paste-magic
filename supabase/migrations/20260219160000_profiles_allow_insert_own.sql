-- Allow users to insert their own profile (for upsert when profile row is missing).
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);
