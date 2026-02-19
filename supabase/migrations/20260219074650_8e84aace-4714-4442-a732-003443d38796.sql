
-- ============================================================
-- DM Snippet System — Full Schema
-- ============================================================

-- 1. Role enum (workspace roles, not admin)
CREATE TYPE public.workspace_role AS ENUM ('owner', 'editor', 'viewer');

-- 2. Profiles table
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  full_name   TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- 3. Workspaces table
CREATE TABLE public.workspaces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key     TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  domain_denylist TEXT[] NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- 4. Workspace members table
CREATE TABLE public.workspace_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         public.workspace_role NOT NULL DEFAULT 'editor',
  invited_by   UUID REFERENCES auth.users(id),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- Helper function: check if user is member of workspace
CREATE OR REPLACE FUNCTION public.is_workspace_member(_user_id UUID, _workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = _user_id AND workspace_id = _workspace_id
  );
$$;

-- Helper function: get user's role in workspace
CREATE OR REPLACE FUNCTION public.get_workspace_role(_user_id UUID, _workspace_id UUID)
RETURNS public.workspace_role
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.workspace_members
  WHERE user_id = _user_id AND workspace_id = _workspace_id
  LIMIT 1;
$$;

-- Workspace RLS
CREATE POLICY "Members can view workspace"
  ON public.workspaces FOR SELECT
  USING (public.is_workspace_member(auth.uid(), id));

CREATE POLICY "Owners can update workspace"
  ON public.workspaces FOR UPDATE
  USING (owner_id = auth.uid());

-- Workspace members RLS
CREATE POLICY "Members can view members"
  ON public.workspace_members FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Owners can insert members"
  ON public.workspace_members FOR INSERT
  WITH CHECK (
    public.get_workspace_role(auth.uid(), workspace_id) = 'owner'
  );

CREATE POLICY "Owners can update member roles"
  ON public.workspace_members FOR UPDATE
  USING (public.get_workspace_role(auth.uid(), workspace_id) = 'owner');

CREATE POLICY "Owners can remove members"
  ON public.workspace_members FOR DELETE
  USING (
    public.get_workspace_role(auth.uid(), workspace_id) = 'owner'
    OR user_id = auth.uid()
  );

-- 5. Folders table
CREATE TABLE public.folders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  parent_id    UUID REFERENCES public.folders(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  created_by   UUID NOT NULL REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view folders"
  ON public.folders FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Editors and owners can manage folders"
  ON public.folders FOR INSERT
  WITH CHECK (
    public.get_workspace_role(auth.uid(), workspace_id) IN ('owner', 'editor')
  );

CREATE POLICY "Editors and owners can update folders"
  ON public.folders FOR UPDATE
  USING (public.get_workspace_role(auth.uid(), workspace_id) IN ('owner', 'editor'));

CREATE POLICY "Editors and owners can delete folders"
  ON public.folders FOR DELETE
  USING (public.get_workspace_role(auth.uid(), workspace_id) IN ('owner', 'editor'));

-- 6. Tags table
CREATE TABLE public.tags (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  color        TEXT NOT NULL DEFAULT '#6366f1',
  created_by   UUID NOT NULL REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, name)
);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view tags"
  ON public.tags FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Editors and owners can manage tags"
  ON public.tags FOR INSERT
  WITH CHECK (public.get_workspace_role(auth.uid(), workspace_id) IN ('owner', 'editor'));

CREATE POLICY "Editors and owners can update tags"
  ON public.tags FOR UPDATE
  USING (public.get_workspace_role(auth.uid(), workspace_id) IN ('owner', 'editor'));

CREATE POLICY "Editors and owners can delete tags"
  ON public.tags FOR DELETE
  USING (public.get_workspace_role(auth.uid(), workspace_id) IN ('owner', 'editor'));

-- 7. Snippets table
CREATE TABLE public.snippets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  folder_id     UUID REFERENCES public.folders(id) ON DELETE SET NULL,
  owner_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  shortcut      TEXT,
  body          TEXT NOT NULL DEFAULT '',
  shared_scope  TEXT NOT NULL DEFAULT 'private' CHECK (shared_scope IN ('private', 'workspace')),
  use_count     INTEGER NOT NULL DEFAULT 0,
  last_used_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.snippets ENABLE ROW LEVEL SECURITY;

-- Viewers and up can see workspace snippets; owners see private too
CREATE POLICY "Members see workspace snippets"
  ON public.snippets FOR SELECT
  USING (
    public.is_workspace_member(auth.uid(), workspace_id)
    AND (
      shared_scope = 'workspace'
      OR owner_id = auth.uid()
    )
  );

CREATE POLICY "Editors and owners can create snippets"
  ON public.snippets FOR INSERT
  WITH CHECK (
    public.get_workspace_role(auth.uid(), workspace_id) IN ('owner', 'editor')
    AND owner_id = auth.uid()
  );

CREATE POLICY "Snippet owners and workspace owners can update"
  ON public.snippets FOR UPDATE
  USING (
    owner_id = auth.uid()
    OR public.get_workspace_role(auth.uid(), workspace_id) = 'owner'
  );

CREATE POLICY "Snippet owners and workspace owners can delete"
  ON public.snippets FOR DELETE
  USING (
    owner_id = auth.uid()
    OR public.get_workspace_role(auth.uid(), workspace_id) = 'owner'
  );

-- 8. Snippet tags junction
CREATE TABLE public.snippet_tags (
  snippet_id UUID NOT NULL REFERENCES public.snippets(id) ON DELETE CASCADE,
  tag_id     UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (snippet_id, tag_id)
);

ALTER TABLE public.snippet_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view snippet tags"
  ON public.snippet_tags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.snippets s
      WHERE s.id = snippet_id
        AND public.is_workspace_member(auth.uid(), s.workspace_id)
    )
  );

CREATE POLICY "Editors can manage snippet tags"
  ON public.snippet_tags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.snippets s
      WHERE s.id = snippet_id
        AND (s.owner_id = auth.uid() OR public.get_workspace_role(auth.uid(), s.workspace_id) = 'owner')
    )
  );

CREATE POLICY "Editors can delete snippet tags"
  ON public.snippet_tags FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.snippets s
      WHERE s.id = snippet_id
        AND (s.owner_id = auth.uid() OR public.get_workspace_role(auth.uid(), s.workspace_id) = 'owner')
    )
  );

-- 9. Workspace invitations table
CREATE TABLE public.workspace_invitations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  role         public.workspace_role NOT NULL DEFAULT 'editor',
  invited_by   UUID NOT NULL REFERENCES auth.users(id),
  token        TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  accepted_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, email)
);

ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace owners can manage invitations"
  ON public.workspace_invitations FOR ALL
  USING (public.get_workspace_role(auth.uid(), workspace_id) = 'owner');

-- 10. Updated_at triggers
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_workspaces_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_folders_updated_at
  BEFORE UPDATE ON public.folders
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_snippets_updated_at
  BEFORE UPDATE ON public.snippets
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 11. Auto-create profile + workspace on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _workspace_id UUID;
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );

  -- Create default workspace
  INSERT INTO public.workspaces (name, owner_id)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)) || '''s Workspace',
    NEW.id
  )
  RETURNING id INTO _workspace_id;

  -- Add user as owner
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (_workspace_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
