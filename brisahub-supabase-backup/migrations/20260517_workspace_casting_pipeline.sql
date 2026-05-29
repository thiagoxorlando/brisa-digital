-- Casting pipeline status on submissions.
-- Stores the pre-contract stage only; post-contract stages
-- (contrato_enviado / confirmado / finalizado) are derived
-- from bookings.status at query time, never stored here.
ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS pipeline_status text;

-- Internal workspace notes per candidate submission.
-- Visible to all active workspace members (owner + agents).
CREATE TABLE IF NOT EXISTS submission_pipeline_notes (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   uuid         NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  workspace_id    uuid         NOT NULL,
  author_user_id  uuid         NOT NULL,
  author_name     text         NOT NULL DEFAULT '',
  body            text         NOT NULL,
  created_at      timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_notes_submission
  ON submission_pipeline_notes (submission_id);

CREATE INDEX IF NOT EXISTS idx_pipeline_notes_workspace
  ON submission_pipeline_notes (workspace_id);
