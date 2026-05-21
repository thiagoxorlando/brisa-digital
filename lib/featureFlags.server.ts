/**
 * Server-side feature flag helper.
 *
 * Reads boolean flags from the platform_settings table with typed defaults.
 * Import only in server components and route handlers (never in client code).
 *
 * Strategy:
 *   - Flags are stored in platform_settings alongside other settings.
 *   - Each flag has a coded default that preserves current behavior if
 *     the DB row is missing — so adding a new flag never breaks production.
 *   - Results are NOT cached across requests. Each server render / route
 *     invocation does one DB read. This is intentional: we want flag changes
 *     to take effect on the next request without a deployment.
 *
 * To add a new flag:
 *   1. Add its key + default to FEATURE_FLAG_DEFAULTS below.
 *   2. Upsert a row in platform_settings via the admin settings UI.
 *   3. Read it via getFeatureFlags() or getFeatureFlag().
 */

import { getPlatformSettings } from "@/lib/platformSettings.server";

/** All known feature flags and their coded defaults. */
export const FEATURE_FLAG_DEFAULTS = {
  /** Agency signup form is open. */
  new_agency_signup_enabled: true,
  /** Talent signup form is open. */
  new_talent_signup_enabled: true,
  /** Referral / invite program is active. */
  referrals_enabled: true,
  /** Public job sharing via share link is allowed. */
  public_job_sharing_enabled: true,
  /** Premium plan is surfaced in the UI. */
  premium_plan_enabled: false,
  /** Automatic PIX withdrawal processing is enabled. */
  automatic_pix_withdrawals_enabled: false,
  /** Maintenance mode banner is shown to all users. */
  maintenance_mode_enabled: false,
  /** New users must accept terms before completing signup. */
  require_terms_acceptance: true,
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAG_DEFAULTS;
export type FeatureFlags = { [K in FeatureFlagKey]: boolean };

/**
 * Fetch all feature flags in one DB round-trip.
 * Missing rows fall back to FEATURE_FLAG_DEFAULTS.
 */
export async function getFeatureFlags(): Promise<FeatureFlags> {
  const keys = Object.keys(FEATURE_FLAG_DEFAULTS) as FeatureFlagKey[];
  const raw = await getPlatformSettings(keys);

  const result = {} as FeatureFlags;
  for (const key of keys) {
    const stored = raw[key];
    result[key] =
      typeof stored === "boolean"
        ? stored
        : FEATURE_FLAG_DEFAULTS[key];
  }
  return result;
}

/**
 * Fetch a single feature flag.
 * Falls back to FEATURE_FLAG_DEFAULTS[key] if the row is missing.
 */
export async function getFeatureFlag(key: FeatureFlagKey): Promise<boolean> {
  const flags = await getFeatureFlags();
  return flags[key];
}
