CREATE TABLE IF NOT EXISTS plan_settings_history (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_key                text        NOT NULL,
  changed_by              uuid        NOT NULL,
  changed_at              timestamptz NOT NULL DEFAULT now(),
  old_price               numeric     NOT NULL,
  new_price               numeric     NOT NULL,
  old_commission_percent  numeric     NOT NULL,
  new_commission_percent  numeric     NOT NULL,
  old_is_available        boolean     NOT NULL,
  new_is_available        boolean     NOT NULL,
  old_job_limit           integer,
  new_job_limit           integer
);

CREATE INDEX IF NOT EXISTS idx_plan_settings_history_plan_key
  ON plan_settings_history (plan_key);

CREATE INDEX IF NOT EXISTS idx_plan_settings_history_changed_at
  ON plan_settings_history (changed_at DESC);

ALTER TABLE plan_settings_history ENABLE ROW LEVEL SECURITY;

-- Only service role can access (all API calls use service role)
CREATE POLICY "service_role_only" ON plan_settings_history
  USING (false)
  WITH CHECK (false);
