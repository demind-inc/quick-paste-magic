-- Add domain_allowlist column to workspaces (allowlist for domains where extension can run).
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS domain_allowlist TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.workspaces.domain_allowlist IS 'Allowed domains for this workspace; empty means no restriction.';
