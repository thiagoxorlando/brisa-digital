CREATE TABLE IF NOT EXISTS talent_availability (
  id           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  talent_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date         date        NOT NULL,
  start_time   time,
  end_time     time,
  is_available boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (talent_id, date)
);

CREATE INDEX IF NOT EXISTS idx_ta_talent ON talent_availability (talent_id);
CREATE INDEX IF NOT EXISTS idx_ta_date   ON talent_availability (date);

ALTER TABLE talent_availability ENABLE ROW LEVEL SECURITY;

-- Talents manage their own entries directly
CREATE POLICY "ta_own" ON talent_availability
  FOR ALL USING (talent_id = auth.uid()) WITH CHECK (talent_id = auth.uid());

-- Service role (used by all API routes) bypasses RLS automatically
