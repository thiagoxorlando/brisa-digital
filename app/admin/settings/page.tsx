import type { Metadata } from "next";
import { requireAdmin } from "@/lib/requireAdmin";
import { redirect } from "next/navigation";
import { getAllPlatformSettings } from "@/lib/platformSettings.server";
import AdminSettings, { type PlatformSettings } from "@/features/admin/AdminSettings";

export const metadata: Metadata = { title: "Configurações — Administração — BrisaHub" };

const DEFAULTS: PlatformSettings = {
  platform_name:                      "BrisaHub",
  support_email:                       null,
  new_agency_signup_enabled:           true,
  new_talent_signup_enabled:           true,
  referrals_enabled:                   true,
  public_job_sharing_enabled:          true,
  premium_plan_enabled:                false,
  automatic_pix_withdrawals_enabled:   false,
  minimum_withdrawal_amount:           1,
  automatic_withdrawal_limit:          0,
  max_withdrawals_per_day:             3,
  maintenance_mode_enabled:            false,
  require_terms_acceptance:            true,
  withdrawal_fee_percent:              0,
  withdrawal_min_fee:                  0,
  withdrawal_min_amount_agency:        100,
  payout_delay_days:                   0,
  escrow_timeout_days:                 0,
  upload_max_mb:                       20,
};

export default async function AdminSettingsPage() {
  const auth = await requireAdmin();
  if (!("userId" in auth)) redirect("/");

  const raw = await getAllPlatformSettings();

  const settings: PlatformSettings = {
    platform_name:                    String(raw["platform_name"] ?? DEFAULTS.platform_name),
    support_email:                    (raw["support_email"] as string | null) ?? DEFAULTS.support_email,
    new_agency_signup_enabled:        Boolean(raw["new_agency_signup_enabled"] ?? DEFAULTS.new_agency_signup_enabled),
    new_talent_signup_enabled:        Boolean(raw["new_talent_signup_enabled"] ?? DEFAULTS.new_talent_signup_enabled),
    referrals_enabled:                Boolean(raw["referrals_enabled"] ?? DEFAULTS.referrals_enabled),
    public_job_sharing_enabled:       Boolean(raw["public_job_sharing_enabled"] ?? DEFAULTS.public_job_sharing_enabled),
    premium_plan_enabled:             Boolean(raw["premium_plan_enabled"] ?? DEFAULTS.premium_plan_enabled),
    automatic_pix_withdrawals_enabled:Boolean(raw["automatic_pix_withdrawals_enabled"] ?? DEFAULTS.automatic_pix_withdrawals_enabled),
    minimum_withdrawal_amount:        Number(raw["minimum_withdrawal_amount"] ?? DEFAULTS.minimum_withdrawal_amount),
    automatic_withdrawal_limit:       Number(raw["automatic_withdrawal_limit"] ?? DEFAULTS.automatic_withdrawal_limit),
    max_withdrawals_per_day:          Number(raw["max_withdrawals_per_day"] ?? DEFAULTS.max_withdrawals_per_day),
    maintenance_mode_enabled:         Boolean(raw["maintenance_mode_enabled"] ?? DEFAULTS.maintenance_mode_enabled),
    require_terms_acceptance:         Boolean(raw["require_terms_acceptance"] ?? DEFAULTS.require_terms_acceptance),
    withdrawal_fee_percent:           Number(raw["withdrawal_fee_percent"] ?? DEFAULTS.withdrawal_fee_percent),
    withdrawal_min_fee:               Number(raw["withdrawal_min_fee"] ?? DEFAULTS.withdrawal_min_fee),
    withdrawal_min_amount_agency:     Number(raw["withdrawal_min_amount_agency"] ?? DEFAULTS.withdrawal_min_amount_agency),
    payout_delay_days:                Number(raw["payout_delay_days"] ?? DEFAULTS.payout_delay_days),
    escrow_timeout_days:              Number(raw["escrow_timeout_days"] ?? DEFAULTS.escrow_timeout_days),
    upload_max_mb:                    Number(raw["upload_max_mb"] ?? DEFAULTS.upload_max_mb),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold text-[#1F2D2E]">Configurações</h1>
        <p className="text-[14px] text-[#647B7B] mt-1">Controles globais da plataforma BrisaHub.</p>
      </div>
      <AdminSettings initialSettings={settings} />
    </div>
  );
}
