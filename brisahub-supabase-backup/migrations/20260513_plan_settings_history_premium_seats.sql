ALTER TABLE plan_settings_history
  ADD COLUMN IF NOT EXISTS old_included_agent_seats integer NULL,
  ADD COLUMN IF NOT EXISTS new_included_agent_seats integer NULL,
  ADD COLUMN IF NOT EXISTS old_extra_agent_seat_price numeric NULL,
  ADD COLUMN IF NOT EXISTS new_extra_agent_seat_price numeric NULL;
