import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/requireAdmin";
import { logAdminAction } from "@/lib/auditLog";
import { getAllPlatformSettings } from "@/lib/platformSettings.server";

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const settings = await getAllPlatformSettings();
  return NextResponse.json({ settings });
}

const BOOLEAN_KEYS = new Set([
  "new_agency_signup_enabled",
  "new_talent_signup_enabled",
  "referrals_enabled",
  "public_job_sharing_enabled",
  "premium_plan_enabled",
  "automatic_pix_withdrawals_enabled",
  "maintenance_mode_enabled",
  "require_terms_acceptance",
]);

const NUMBER_KEYS = new Set([
  "minimum_withdrawal_amount",
  "automatic_withdrawal_limit",
  "max_withdrawals_per_day",
  "withdrawal_fee_percent",
  "withdrawal_min_fee",
  "withdrawal_min_amount_agency",
  "payout_delay_days",
  "escrow_timeout_days",
  "upload_max_mb",
  "internal_payment_auto_confirm_days",
]);

const STRING_KEYS = new Set(["platform_name", "support_email"]);

const ALL_KEYS = new Set([...BOOLEAN_KEYS, ...NUMBER_KEYS, ...STRING_KEYS]);

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });
  const now = new Date().toISOString();

  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};

  for (const [key, rawValue] of Object.entries(body)) {
    if (!ALL_KEYS.has(key)) continue;

    let value: unknown;

    if (BOOLEAN_KEYS.has(key)) {
      if (typeof rawValue !== "boolean") {
        return NextResponse.json({ error: `${key} deve ser boolean.` }, { status: 400 });
      }
      value = rawValue;
    } else if (NUMBER_KEYS.has(key)) {
      const n = Number(rawValue);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: `${key} deve ser um número >= 0.` }, { status: 400 });
      }
      if (key === "minimum_withdrawal_amount" && n < 0) {
        return NextResponse.json({ error: "minimum_withdrawal_amount >= 0." }, { status: 400 });
      }
      value = n;
    } else if (STRING_KEYS.has(key)) {
      if (key === "platform_name") {
        if (typeof rawValue !== "string" || !rawValue.trim()) {
          return NextResponse.json({ error: "platform_name não pode ser vazio." }, { status: 400 });
        }
        value = rawValue.trim();
      } else {
        value = rawValue === "" || rawValue === null ? null : String(rawValue).trim();
      }
    } else {
      continue;
    }

    const { data: existing } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();

    before[key] = existing?.value ?? null;
    after[key] = value;

    const { error } = await supabase
      .from("platform_settings")
      .upsert(
        { key, value, updated_by: auth.userId, updated_at: now },
        { onConflict: "key" },
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  await logAdminAction({
    adminId: auth.userId,
    action: "platform_settings_updated",
    entityType: "platform_settings",
    before,
    after,
  });

  return NextResponse.json({ ok: true });
}
