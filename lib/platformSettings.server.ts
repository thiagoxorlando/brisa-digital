import { createServerClient } from "@/lib/supabase";
import type { GlobalPaymentDefaults } from "./agencyConfig";

export type PlatformSettingValue = string | number | boolean | null;

export async function getPlatformSetting<T extends PlatformSettingValue>(
  key: string,
  fallback: T,
): Promise<T> {
  try {
    const supabase = createServerClient({ useServiceRole: true });
    const { data } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", key)
      .single();
    if (data == null) return fallback;
    return data.value as T;
  } catch {
    return fallback;
  }
}

export async function getPlatformSettings(keys: string[]): Promise<Record<string, PlatformSettingValue>> {
  try {
    const supabase = createServerClient({ useServiceRole: true });
    const { data } = await supabase
      .from("platform_settings")
      .select("key, value")
      .in("key", keys);
    const result: Record<string, PlatformSettingValue> = {};
    for (const row of data ?? []) {
      result[row.key as string] = row.value as PlatformSettingValue;
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Returns the configured escrow timeout in days.
 * Fallback: 0 (no automatic timeout enforced).
 *
 * TODO(automation): wire into a scheduled worker that cancels or escalates
 * contracts whose status has been "confirmed" (escrowed) for longer than
 * this many days without a "paid" transition. The worker should:
 *   1. Query contracts WHERE status = 'confirmed' AND updated_at < NOW() - interval.
 *   2. Decide escalation policy (notify admin / auto-release / auto-cancel).
 *   3. Be idempotent and log every action to admin_audit_logs.
 * Do NOT implement the cron logic here — this helper is read-only.
 */
export async function getEscrowTimeoutDays(): Promise<number> {
  return getPlatformSetting<number>("escrow_timeout_days", 0);
}

/**
 * Days after agency_payment_sent_at before system auto-confirms talent receipt (internal mode).
 * 0 means auto-confirm is disabled.
 */
export async function getInternalAutoConfirmDays(): Promise<number> {
  return getPlatformSetting<number>("internal_payment_auto_confirm_days", 5);
}

/**
 * Number of days for the PRO plan free trial.
 * Fallback: 7 days.
 */
export async function getTrialDurationDays(): Promise<number> {
  return getPlatformSetting<number>("trial_duration_days", 7);
}

/**
 * Global payment mode defaults from platform_settings.
 * These are the fallback when an agency has no per-agency override.
 */
export async function getGlobalPaymentDefaults(): Promise<GlobalPaymentDefaults> {
  const vals = await getPlatformSettings([
    "default_payment_mode",
    "default_commission_percent",
    "default_escrow_enabled",
    "default_receipt_upload_required",
  ]);
  const mode = String(vals["default_payment_mode"] ?? "internal");
  return {
    default_payment_mode: mode === "escrow" ? "escrow" : "internal",
    default_commission_percent: Number(vals["default_commission_percent"] ?? 0),
    default_escrow_enabled: Boolean(vals["default_escrow_enabled"] ?? false),
    default_receipt_upload_required: Boolean(vals["default_receipt_upload_required"] ?? false),
  };
}

export async function getAllPlatformSettings(): Promise<Record<string, PlatformSettingValue>> {
  try {
    const supabase = createServerClient({ useServiceRole: true });
    const { data } = await supabase
      .from("platform_settings")
      .select("key, value")
      .order("key");
    const result: Record<string, PlatformSettingValue> = {};
    for (const row of data ?? []) {
      result[row.key as string] = row.value as PlatformSettingValue;
    }
    return result;
  } catch {
    return {};
  }
}
