-- Talent membership in a Premium workspace portal.
-- Created when a talent joins via the agency's branded portal URL.
-- Internal only — no external money movement.
CREATE TABLE IF NOT EXISTS premium_workspace_talents (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid         NOT NULL REFERENCES premium_workspaces(id) ON DELETE CASCADE,
  talent_user_id  uuid         NOT NULL REFERENCES auth.users(id),
  status          text         NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'removed')),
  source          text         NOT NULL DEFAULT 'portal',
  invited_by      uuid         REFERENCES auth.users(id),
  joined_at       timestamptz  NOT NULL DEFAULT now(),
  created_at      timestamptz  NOT NULL DEFAULT now(),
  removed_at      timestamptz
);

-- One active membership per workspace + talent
CREATE UNIQUE INDEX premium_workspace_talents_active_uidx
  ON premium_workspace_talents (workspace_id, talent_user_id)
  WHERE removed_at IS NULL;

CREATE INDEX ON premium_workspace_talents (workspace_id);
CREATE INDEX ON premium_workspace_talents (talent_user_id);

ALTER TABLE premium_workspace_talents ENABLE ROW LEVEL SECURITY;
-- All access via service role only — no public policies needed.
