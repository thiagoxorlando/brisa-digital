-- Shareable client-facing shortlist presentations.
-- Agencies pick candidates from the pipeline and create a branded link
-- they can share with clients. Clients can leave per-candidate feedback.

CREATE TABLE IF NOT EXISTS workspace_presentations (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid        NOT NULL,
  job_id              uuid        REFERENCES jobs(id) ON DELETE SET NULL,
  title               text        NOT NULL,
  intro               text,
  token               text        UNIQUE NOT NULL,
  password_hash       text,                    -- null = no password; "salt:hash" = PBKDF2
  expires_at          timestamptz,
  view_count          int         NOT NULL DEFAULT 0,
  created_by_user_id  uuid        NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_presentations_workspace
  ON workspace_presentations (workspace_id);
CREATE INDEX IF NOT EXISTS idx_presentations_job
  ON workspace_presentations (job_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_presentations_token
  ON workspace_presentations (token);

-- Ordered list of candidates in a presentation (subset of pipeline).
-- Only non-rejected candidates may be added.
CREATE TABLE IF NOT EXISTS workspace_presentation_candidates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presentation_id uuid NOT NULL REFERENCES workspace_presentations(id) ON DELETE CASCADE,
  submission_id   uuid NOT NULL REFERENCES submissions(id)              ON DELETE CASCADE,
  position        int  NOT NULL DEFAULT 0,
  UNIQUE(presentation_id, submission_id)
);

CREATE INDEX IF NOT EXISTS idx_pres_cands_presentation
  ON workspace_presentation_candidates (presentation_id);

-- Anonymous client feedback per candidate in a presentation.
-- client_token is a UUID generated in the browser and stored in localStorage;
-- it is not tied to any auth identity.
CREATE TABLE IF NOT EXISTS presentation_feedback (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  presentation_id uuid        NOT NULL REFERENCES workspace_presentations(id) ON DELETE CASCADE,
  submission_id   uuid        NOT NULL REFERENCES submissions(id)              ON DELETE CASCADE,
  client_token    text        NOT NULL,
  vote            text        NOT NULL CHECK (vote IN ('approved', 'rejected', 'favorite')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(presentation_id, submission_id, client_token)
);

CREATE INDEX IF NOT EXISTS idx_feedback_presentation
  ON presentation_feedback (presentation_id);
