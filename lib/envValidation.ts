/**
 * Environment variable validation.
 *
 * Call validateRequiredEnv() at boot-sensitive entry points
 * (middleware, instrumentation, or a one-shot health route) to fail fast
 * when critical secrets are missing.
 *
 * This module does NOT throw — callers decide whether a missing env var
 * is fatal or a soft warning.
 */

const REQUIRED_ENV_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export type RequiredEnvVar = (typeof REQUIRED_ENV_VARS)[number];

export function validateRequiredEnv(): { valid: boolean; missing: RequiredEnvVar[] } {
  const missing = REQUIRED_ENV_VARS.filter((key) => {
    const value = process.env[key];
    return !value || value.length === 0;
  }) as RequiredEnvVar[];
  return { valid: missing.length === 0, missing };
}

/**
 * Optional env vars that the platform can run without but log a warning for.
 */
const OPTIONAL_ENV_VARS = [
  "ASAAS_API_KEY",
  "ASAAS_WEBHOOK_SECRET",
  "STRIPE_SECRET_KEY",
] as const;

export function reportOptionalEnv(): { configured: string[]; missing: string[] } {
  const configured: string[] = [];
  const missing: string[] = [];
  for (const key of OPTIONAL_ENV_VARS) {
    if (process.env[key]) configured.push(key);
    else missing.push(key);
  }
  return { configured, missing };
}
