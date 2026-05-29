CREATE TABLE IF NOT EXISTS job_invites (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id     uuid        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  talent_id  uuid        NOT NULL,
  agency_id  uuid        NOT NULL,
  status     text        NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, talent_id)
);

CREATE INDEX IF NOT EXISTS job_invites_job_id_idx    ON job_invites (job_id);
CREATE INDEX IF NOT EXISTS job_invites_talent_id_idx ON job_invites (talent_id);
CREATE INDEX IF NOT EXISTS job_invites_agency_id_idx ON job_invites (agency_id);

ALTER TABLE job_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency_manage_invites" ON job_invites
  FOR ALL USING (agency_id = auth.uid());

CREATE POLICY "talent_read_invites" ON job_invites
  FOR SELECT USING (talent_id = auth.uid());
