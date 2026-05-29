-- =============================================================================
-- Premium Workspace Foundation
-- Creates tables for Premium private agency workspaces, workspace members,
-- agent invites, and tokenised job invite links.
-- Adds workspace/visibility columns to jobs.
-- Adds agent seat columns to plan_settings.
-- =============================================================================

-- 1. premium_workspaces -------------------------------------------------------

CREATE TABLE IF NOT EXISTS premium_workspaces (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agency_id            uuid        NULL,
  name                 text        NOT NULL,
  slug                 text        UNIQUE NULL,
  logo_url             text        NULL,
  brand_primary_color  text        NULL,
  brand_accent_color   text        NULL,
  welcome_message      text        NULL,
  status               text        NOT NULL DEFAULT 'active',
  included_agent_seats integer     NOT NULL DEFAULT 2,
  extra_agent_seats    integer     NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz NULL,
  CONSTRAINT premium_workspaces_status_check
    CHECK (status IN ('active', 'suspended', 'cancelled', 'deleted'))
);

-- One active workspace per owner (prevents duplicate creation on concurrent calls)
CREATE UNIQUE INDEX IF NOT EXISTS premium_workspaces_owner_active_unique
  ON premium_workspaces (owner_user_id)
  WHERE deleted_at IS NULL AND status NOT IN ('cancelled', 'deleted');

CREATE INDEX IF NOT EXISTS premium_workspaces_owner_idx
  ON premium_workspaces (owner_user_id);

CREATE INDEX IF NOT EXISTS premium_workspaces_agency_idx
  ON premium_workspaces (agency_id)
  WHERE agency_id IS NOT NULL;

-- 2. premium_workspace_members ------------------------------------------------

CREATE TABLE IF NOT EXISTS premium_workspace_members (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid        NOT NULL REFERENCES premium_workspaces(id) ON DELETE CASCADE,
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role           text        NOT NULL DEFAULT 'agent',
  status         text        NOT NULL DEFAULT 'active',
  spending_limit numeric     NULL,
  created_by     uuid        NULL REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  removed_at     timestamptz NULL,
  CONSTRAINT premium_workspace_members_role_check
    CHECK (role IN ('owner', 'agent')),
  CONSTRAINT premium_workspace_members_status_check
    CHECK (status IN ('active', 'invited', 'removed', 'suspended'))
);

-- One non-removed membership per workspace/user; re-invite inserts a fresh row
CREATE UNIQUE INDEX IF NOT EXISTS premium_workspace_members_active_unique
  ON premium_workspace_members (workspace_id, user_id)
  WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS premium_workspace_members_workspace_idx
  ON premium_workspace_members (workspace_id);

CREATE INDEX IF NOT EXISTS premium_workspace_members_user_idx
  ON premium_workspace_members (user_id);

-- 3. premium_agent_invites ----------------------------------------------------

CREATE TABLE IF NOT EXISTS premium_agent_invites (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid        NOT NULL REFERENCES premium_workspaces(id) ON DELETE CASCADE,
  invited_email text        NOT NULL,
  role          text        NOT NULL DEFAULT 'agent',
  token         text        NOT NULL UNIQUE,
  status        text        NOT NULL DEFAULT 'pending',
  expires_at    timestamptz NOT NULL,
  accepted_by   uuid        NULL REFERENCES auth.users(id),
  accepted_at   timestamptz NULL,
  created_by    uuid        NOT NULL REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT premium_agent_invites_role_check
    CHECK (role IN ('owner', 'agent')),
  CONSTRAINT premium_agent_invites_status_check
    CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS premium_agent_invites_workspace_idx
  ON premium_agent_invites (workspace_id);

CREATE INDEX IF NOT EXISTS premium_agent_invites_token_idx
  ON premium_agent_invites (token);

CREATE INDEX IF NOT EXISTS premium_agent_invites_email_idx
  ON premium_agent_invites (invited_email);

-- 4. job_invite_links ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS job_invite_links (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       uuid        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  workspace_id uuid        NULL REFERENCES premium_workspaces(id) ON DELETE CASCADE,
  created_by   uuid        NOT NULL REFERENCES auth.users(id),
  token        text        NOT NULL UNIQUE,
  status       text        NOT NULL DEFAULT 'active',
  expires_at   timestamptz NULL,
  max_uses     integer     NULL,
  use_count    integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz NULL,
  CONSTRAINT job_invite_links_status_check
    CHECK (status IN ('active', 'revoked', 'expired'))
);

CREATE INDEX IF NOT EXISTS job_invite_links_job_idx
  ON job_invite_links (job_id);

CREATE INDEX IF NOT EXISTS job_invite_links_token_idx
  ON job_invite_links (token);

CREATE INDEX IF NOT EXISTS job_invite_links_workspace_idx
  ON job_invite_links (workspace_id)
  WHERE workspace_id IS NOT NULL;

-- 5. jobs columns -------------------------------------------------------------

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS workspace_id        uuid    NULL REFERENCES premium_workspaces(id),
  ADD COLUMN IF NOT EXISTS created_by_user_id  uuid    NULL REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS invite_only         boolean NOT NULL DEFAULT false;

-- Extend visibility check to include Premium values.
-- Old constraint only allowed ('public', 'private'). Keep 'private' valid
-- so existing rows are not invalidated.
ALTER TABLE jobs
  DROP CONSTRAINT IF EXISTS jobs_visibility_check;

ALTER TABLE jobs
  ADD CONSTRAINT jobs_visibility_check
  CHECK (visibility IN ('public', 'private', 'private_invite', 'workspace_only'));

CREATE INDEX IF NOT EXISTS jobs_workspace_id_idx
  ON jobs (workspace_id)
  WHERE workspace_id IS NOT NULL;

-- 6. plan_settings columns ----------------------------------------------------

ALTER TABLE plan_settings
  ADD COLUMN IF NOT EXISTS included_agent_seats   integer NULL,
  ADD COLUMN IF NOT EXISTS extra_agent_seat_price numeric  NULL;

-- Premium gets 2 included seats; Free/Pro remain NULL (seats not applicable).
UPDATE plan_settings
SET
  included_agent_seats   = 2,
  extra_agent_seat_price = 0
WHERE plan_key = 'premium'
  AND included_agent_seats IS NULL;

-- 7. updated_at triggers ------------------------------------------------------

CREATE OR REPLACE FUNCTION _set_updated_at_premium()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_premium_workspaces_updated_at ON premium_workspaces;
CREATE TRIGGER trg_premium_workspaces_updated_at
  BEFORE UPDATE ON premium_workspaces
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at_premium();

DROP TRIGGER IF EXISTS trg_premium_workspace_members_updated_at ON premium_workspace_members;
CREATE TRIGGER trg_premium_workspace_members_updated_at
  BEFORE UPDATE ON premium_workspace_members
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at_premium();

-- 8. RLS ----------------------------------------------------------------------

ALTER TABLE premium_workspaces        ENABLE ROW LEVEL SECURITY;
ALTER TABLE premium_workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE premium_agent_invites     ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_invite_links          ENABLE ROW LEVEL SECURITY;

-- Active members can read their workspace
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'premium_workspaces'
      AND policyname = 'pw_member_select'
  ) THEN
    CREATE POLICY pw_member_select ON premium_workspaces
      FOR SELECT
      USING (
        id IN (
          SELECT workspace_id
          FROM premium_workspace_members
          WHERE user_id = auth.uid() AND status = 'active'
        )
      );
  END IF;
END $$;

-- Members can read their own membership row
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'premium_workspace_members'
      AND policyname = 'pwm_self_select'
  ) THEN
    CREATE POLICY pwm_self_select ON premium_workspace_members
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;

-- Agent invites: owner of workspace can read (service role used for all mutations)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'premium_agent_invites'
      AND policyname = 'pai_workspace_owner_select'
  ) THEN
    CREATE POLICY pai_workspace_owner_select ON premium_agent_invites
      FOR SELECT
      USING (
        workspace_id IN (
          SELECT workspace_id
          FROM premium_workspace_members
          WHERE user_id = auth.uid() AND role = 'owner' AND status = 'active'
        )
      );
  END IF;
END $$;

-- job_invite_links: workspace members can read links for jobs in their workspace
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'job_invite_links'
      AND policyname = 'jil_workspace_member_select'
  ) THEN
    CREATE POLICY jil_workspace_member_select ON job_invite_links
      FOR SELECT
      USING (
        workspace_id IS NOT NULL
        AND workspace_id IN (
          SELECT workspace_id
          FROM premium_workspace_members
          WHERE user_id = auth.uid() AND status = 'active'
        )
      );
  END IF;
END $$;
