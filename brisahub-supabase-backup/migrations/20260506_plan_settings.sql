CREATE TABLE IF NOT EXISTS plan_settings (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_key            text        NOT NULL UNIQUE,
  name                text        NOT NULL,
  price               numeric     NOT NULL DEFAULT 0,
  commission_percent  numeric     NOT NULL,
  is_available        boolean     NOT NULL DEFAULT true,
  job_limit           integer     NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

INSERT INTO plan_settings (plan_key, name, price, commission_percent, is_available, job_limit)
VALUES
  ('free',    'Free',    0,   20, true,  1),
  ('pro',     'Pro',     287, 10, true,  null),
  ('premium', 'Premium', 0,   10, false, null)
ON CONFLICT (plan_key) DO NOTHING;
