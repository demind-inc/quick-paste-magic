-- Use only snippet_tags: store tag name and color on the junction, drop tags table.
-- Safe to run when schema is old (tag_id) or already migrated. Idempotent.

-- 1. Add new columns to snippet_tags and backfill from tags (if tags exists)
ALTER TABLE public.snippet_tags
  ADD COLUMN IF NOT EXISTS tag_name TEXT,
  ADD COLUMN IF NOT EXISTS tag_color TEXT NOT NULL DEFAULT '#6366f1';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tags') THEN
    UPDATE public.snippet_tags st
    SET tag_name = t.name, tag_color = t.color
    FROM public.tags t
    WHERE t.id = st.tag_id AND st.tag_name IS NULL;
  END IF;
END $$;

DELETE FROM public.snippet_tags WHERE tag_name IS NULL;

-- 2. Drop old PK and FK, drop tag_id
ALTER TABLE public.snippet_tags DROP CONSTRAINT IF EXISTS snippet_tags_pkey;
ALTER TABLE public.snippet_tags DROP CONSTRAINT IF EXISTS snippet_tags_tag_id_fkey;
ALTER TABLE public.snippet_tags DROP COLUMN IF EXISTS tag_id;

-- 3. Enforce NOT NULL and new PK (allow one row per snippet+tag_name)
ALTER TABLE public.snippet_tags
  ALTER COLUMN tag_name SET NOT NULL;

-- Remove duplicates: keep one row per (snippet_id, tag_name), arbitrary color
DELETE FROM public.snippet_tags a
USING public.snippet_tags b
WHERE a.snippet_id = b.snippet_id AND a.tag_name = b.tag_name AND a.ctid < b.ctid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'snippet_tags_pkey' AND conrelid = 'public.snippet_tags'::regclass
  ) THEN
    ALTER TABLE public.snippet_tags ADD PRIMARY KEY (snippet_id, tag_name);
  END IF;
END $$;

-- 4. Drop tags table (policies and function are tied to it)
DROP POLICY IF EXISTS "Workspace members can view tags" ON public.tags;
DROP POLICY IF EXISTS "Editors and owners can manage tags" ON public.tags;
DROP POLICY IF EXISTS "Workspace members can create tags" ON public.tags;
DROP POLICY IF EXISTS "Editors and owners can update tags" ON public.tags;
DROP POLICY IF EXISTS "Editors and owners can delete tags" ON public.tags;
DROP TABLE IF EXISTS public.tags;
DROP FUNCTION IF EXISTS public.can_insert_tag(UUID);

-- 5. View for "all tags in workspace" (distinct tag_name, tag_color)
CREATE OR REPLACE VIEW public.workspace_tags AS
SELECT DISTINCT ON (s.workspace_id, st.tag_name)
  s.workspace_id,
  st.tag_name AS name,
  st.tag_color AS color
FROM public.snippet_tags st
JOIN public.snippets s ON s.id = st.snippet_id;

-- View runs as invoking user (Postgres 15+); RLS on snippets/snippet_tags then applies.
ALTER VIEW public.workspace_tags SET (security_invoker = on);
GRANT SELECT ON public.workspace_tags TO authenticated;
GRANT SELECT ON public.workspace_tags TO anon;
