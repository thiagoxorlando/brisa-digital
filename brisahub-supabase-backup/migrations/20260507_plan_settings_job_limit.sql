-- Ensure Free plan has job_limit = 1 in plan_settings.
-- requireJobLimit() treats NULL as unlimited, so this must be set explicitly.
UPDATE public.plan_settings
SET job_limit = 1
WHERE plan_key = 'free'
  AND (job_limit IS NULL OR job_limit != 1);
