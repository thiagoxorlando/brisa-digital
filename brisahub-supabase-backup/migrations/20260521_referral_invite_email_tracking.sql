-- Track the actual email used when someone signs up via a referral invite.
-- signup_email: the email the user registered with (may differ from referred_email)
-- skip_reason:  'email_mismatch' when referral was soft-skipped due to email mismatch
ALTER TABLE referral_invites
  ADD COLUMN IF NOT EXISTS signup_email TEXT,
  ADD COLUMN IF NOT EXISTS skip_reason  TEXT;
