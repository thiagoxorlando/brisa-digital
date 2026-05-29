-- Add max_hires_per_job to plan_settings so it can be managed via admin UI.
-- null = unlimited; free default = 3.
ALTER TABLE public.plan_settings
  ADD COLUMN IF NOT EXISTS max_hires_per_job integer null;

UPDATE public.plan_settings
  SET max_hires_per_job = 3
  WHERE plan_key = 'free' AND max_hires_per_job IS NULL;

UPDATE public.plan_settings
  SET max_hires_per_job = null
  WHERE plan_key IN ('pro', 'premium');
