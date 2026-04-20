-- MP customer ID on profiles (one customer per user)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mp_customer_id text;

-- Saved cards (no raw card data — only metadata + MP references)
CREATE TABLE IF NOT EXISTS saved_cards (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid    NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mp_customer_id  text    NOT NULL,
  mp_card_id      text    NOT NULL UNIQUE,
  brand           text,          -- "visa", "master", "amex", etc.
  last_four       text,
  holder_name     text,
  expiry_month    int,
  expiry_year     int,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saved_cards_user_id_idx ON saved_cards(user_id);

ALTER TABLE saved_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own saved cards"
  ON saved_cards FOR SELECT
  USING (auth.uid() = user_id);
