-- Ensure wallet_transactions has every column used by the backend.
-- All statements are idempotent (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS).

-- Core columns (created by 021_wallet.sql — safe to re-add if table was created without them)
ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS user_id      uuid          NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  ADD COLUMN IF NOT EXISTS type         text          NOT NULL DEFAULT 'deposit',
  ADD COLUMN IF NOT EXISTS amount       numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description  text,
  ADD COLUMN IF NOT EXISTS payment_id   text,
  ADD COLUMN IF NOT EXISTS created_at   timestamptz   NOT NULL DEFAULT now();

-- reference_id added by 023_subscription_plan.sql (billing page + subscription checkout)
ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS reference_id text;

-- FK constraint: user_id → profiles(id)  (may be missing if table was created by the audit migration)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   information_schema.table_constraints tc
    JOIN   information_schema.key_column_usage kcu
           ON kcu.constraint_name = tc.constraint_name
    WHERE  tc.table_name   = 'wallet_transactions'
      AND  tc.constraint_type = 'FOREIGN KEY'
      AND  kcu.column_name = 'user_id'
  ) THEN
    ALTER TABLE wallet_transactions
      ADD CONSTRAINT wallet_transactions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS wallet_transactions_user_id_created_idx
  ON wallet_transactions(user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_payment_id_uniq
  ON wallet_transactions(payment_id)
  WHERE payment_id IS NOT NULL;

-- RLS (idempotent)
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'wallet_transactions'
      AND policyname = 'Users read own wallet transactions'
  ) THEN
    CREATE POLICY "Users read own wallet transactions"
      ON wallet_transactions FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;
