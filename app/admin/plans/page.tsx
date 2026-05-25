import type { Metadata } from "next";
import AdminPlans, {
  type AdminPlansAgency,
  type PlanSetting,
  type PlanSettingHistoryEntry,
} from "@/features/admin/AdminPlans";
import { getPlanLabel, parsePlan } from "@/lib/plans";
import { createServerClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Administracao - Planos - BrisaHub" };

type AgencyProfileRow = {
  id: string;
  plan: string | null;
  plan_status: string | null;
  plan_expires_at: string | null;
  asaas_customer_id: string | null;
  asaas_subscription_id: string | null;
  deleted_at: string | null;
  is_frozen: boolean | null;
};

type AgencyRow = {
  id: string;
  user_id: string | null;
  company_name: string | null;
  contact_name: string | null;
  deleted_at: string | null;
  payment_mode: string | null;
  commission_percent_override: number | null;
  escrow_enabled: boolean | null;
  receipt_uploads_enabled: boolean | null;
};

type AuthUserRow = { id: string; email?: string };

type PlanChargeRow = {
  id: string;
  user_id: string;
  amount: number | null;
  description: string | null;
  created_at: string | null;
  status: string | null;
  payment_id: string | null;
  processed_at: string | null;
  provider: string | null;
  invoice_url?: string | null;
};

type PlanSettingRow = {
  plan_key: string;
  name: string;
  price: number;
  commission_percent: number;
  is_available: boolean;
  job_limit: number | null;
  max_hires_per_job: number | null;
  included_agent_seats: number | null;
  extra_agent_seat_price: number | null;
};

type PlanHistoryRow = {
  id: string;
  plan_key: string;
  changed_by: string;
  changed_at: string;
  old_price: number;
  new_price: number;
  old_commission_percent: number;
  new_commission_percent: number;
  old_is_available: boolean;
  new_is_available: boolean;
  old_job_limit: number | null;
  new_job_limit: number | null;
  old_included_agent_seats: number | null;
  new_included_agent_seats: number | null;
  old_extra_agent_seat_price: number | null;
  new_extra_agent_seat_price: number | null;
};

async function fetchPlanChargeRows(supabase: ReturnType<typeof createServerClient>) {
  const baseSelect = "id, user_id, amount, description, created_at, status, payment_id, processed_at, provider";
  const withInvoice = await supabase
    .from("wallet_transactions")
    .select(`${baseSelect}, invoice_url`)
    .eq("type", "plan_charge")
    .order("created_at", { ascending: false });

  if (!withInvoice.error) return (withInvoice.data ?? []) as PlanChargeRow[];
  if (!withInvoice.error.message.includes("invoice_url")) throw withInvoice.error;

  const fallback = await supabase
    .from("wallet_transactions")
    .select(baseSelect)
    .eq("type", "plan_charge")
    .order("created_at", { ascending: false });

  if (fallback.error) throw fallback.error;
  return (fallback.data ?? []) as PlanChargeRow[];
}

function normalizeStatus(status: string | null | undefined) {
  return String(status ?? "").trim().toLowerCase();
}

function inferPlanName(description: string | null | undefined, currentPlan: string | null | undefined) {
  const text = String(description ?? "").toLowerCase();
  if (text.includes("premium")) return "Premium";
  if (text.includes("pro")) return "Pro";
  return getPlanLabel(currentPlan);
}

export default async function AdminPlansPage() {
  const supabase = createServerClient({ useServiceRole: true });

  const [
    { data: profiles },
    { data: agencies },
    chargeRows,
    planSettingsResult,
    planHistoryResult,
    authUsers,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, plan, plan_status, plan_expires_at, asaas_customer_id, asaas_subscription_id, deleted_at, is_frozen")
      .eq("role", "agency"),
    supabase
      .from("agencies")
      .select("id, user_id, company_name, contact_name, deleted_at, payment_mode, commission_percent_override, escrow_enabled, receipt_uploads_enabled")
      .is("deleted_at", null),
    fetchPlanChargeRows(supabase),
    Promise.resolve(
      supabase
        .from("plan_settings")
        .select("plan_key, name, price, commission_percent, is_available, job_limit, max_hires_per_job, included_agent_seats, extra_agent_seat_price")
        .order("plan_key"),
    )
      .then((r) => ({ data: (r.data ?? []) as PlanSettingRow[] }))
      .catch(() => ({ data: [] as PlanSettingRow[] })),
    Promise.resolve(
      supabase
        .from("plan_settings_history")
        .select("id, plan_key, changed_by, changed_at, old_price, new_price, old_commission_percent, new_commission_percent, old_is_available, new_is_available, old_job_limit, new_job_limit, old_included_agent_seats, new_included_agent_seats, old_extra_agent_seat_price, new_extra_agent_seat_price")
        .order("changed_at", { ascending: false })
        .limit(30),
    )
      .then((r) => ({ data: (r.data ?? []) as PlanHistoryRow[] }))
      .catch(() => ({ data: [] as PlanHistoryRow[] })),
    Promise.resolve(supabase.auth.admin.listUsers({ perPage: 1000 }))
      .then((r) => (r.data?.users ?? []) as { id: string; email?: string }[])
      .catch(() => [] as AuthUserRow[]),
  ]);

  const emailMap = new Map<string, string>(authUsers.map((u) => [u.id, u.email ?? ""]));
  const authUserIdSet = new Set(authUsers.map((u) => u.id));

  const agencyMap = new Map<string, AgencyRow>();
  for (const agency of (agencies ?? []) as AgencyRow[]) {
    const ownerId = agency.user_id ?? agency.id;
    if (ownerId) agencyMap.set(ownerId, agency);
  }

  // Count active jobs per agency (for Free plan limit display)
  const activeJobCountMap = new Map<string, number>();
  const allAgencyIds = ((profiles ?? []) as AgencyProfileRow[]).map((p) => p.id).filter(Boolean);
  if (allAgencyIds.length > 0) {
    const { data: activeJobRows } = await supabase
      .from("jobs")
      .select("agency_id")
      .in("agency_id", allAgencyIds)
      .in("status", ["open", "closed"])
      .is("deleted_at", null);
    for (const row of activeJobRows ?? []) {
      if (row.agency_id) {
        activeJobCountMap.set(row.agency_id, (activeJobCountMap.get(row.agency_id) ?? 0) + 1);
      }
    }
  }

  const chargesByUser = new Map<string, PlanChargeRow[]>();
  for (const charge of chargeRows) {
    const list = chargesByUser.get(charge.user_id) ?? [];
    list.push(charge);
    chargesByUser.set(charge.user_id, list);
  }

  const agenciesData: AdminPlansAgency[] = ((profiles ?? []) as AgencyProfileRow[])
    .map((profile) => {
      const agency = agencyMap.get(profile.id);
      const currentPlan = parsePlan(profile.plan);
      const agencyCharges = chargesByUser.get(profile.id) ?? [];
      const hasValidOwnerUser = authUserIdSet.has(profile.id);
      const hasValidProfile = !profile.deleted_at;
      const hasAgencyRow = !!agency;
      const isOrphan = !hasValidOwnerUser || !hasValidProfile || !hasAgencyRow;
      const orphanReason = !hasValidOwnerUser
        ? "Usuário deletado"
        : !hasValidProfile
          ? "Perfil deletado"
          : !hasAgencyRow
            ? "Agência deletada"
            : null;

      const paidCharges = agencyCharges.filter((c) => normalizeStatus(c.status) === "paid");
      const pendingCharges = agencyCharges.filter((c) => {
        const s = normalizeStatus(c.status);
        return s === "pending" || s === "processing" || s === "awaiting_payment" || s === "pending_payment";
      });
      const failedCharges = agencyCharges.filter(
        (c) => normalizeStatus(c.status) !== "paid" && !pendingCharges.includes(c),
      );

      const serializeCharge = (charge: PlanChargeRow) => ({
        id: charge.id,
        createdAt: charge.created_at ?? "",
        planName: inferPlanName(charge.description, currentPlan),
        amount: Math.abs(Number(charge.amount ?? 0)),
        status: normalizeStatus(charge.status),
        provider: charge.provider ? String(charge.provider).toUpperCase() : "ASAAS",
        paymentId: charge.payment_id ?? null,
        processedAt: charge.processed_at ?? null,
        invoiceUrl: charge.invoice_url ?? null,
        description: charge.description ?? null,
      });

      const accountActive =
        !profile.deleted_at &&
        !profile.is_frozen &&
        !!agency &&
        hasValidOwnerUser;

      return {
        id: profile.id,
        email: emailMap.get(profile.id) ?? null,
        agencyName: agency?.company_name?.trim() || (isOrphan ? "Agência órfã" : "Agencia sem nome"),
        contactName: agency?.contact_name?.trim() || null,
        currentPlan,
        currentPlanLabel: getPlanLabel(currentPlan),
        planStatus: normalizeStatus(profile.plan_status) || "active",
        accountActive,
        nextChargeDate: profile.plan_expires_at ?? null,
        lastPaidAt: paidCharges[0]?.created_at ?? null,
        asaasCustomerId: profile.asaas_customer_id ?? null,
        asaasSubscriptionId: profile.asaas_subscription_id ?? null,
        totalPaid: paidCharges.reduce((sum, c) => sum + Math.abs(Number(c.amount ?? 0)), 0),
        paidChargeCount: paidCharges.length,
        paidCharges: paidCharges.map(serializeCharge),
        pendingCharges: pendingCharges.map(serializeCharge),
        failedCharges: failedCharges.map(serializeCharge),
        activeJobCount: activeJobCountMap.get(profile.id) ?? 0,
        isOrphan,
        orphanReason,
        paymentMode: (agency?.payment_mode as "internal" | "escrow" | null) ?? null,
        commissionOverride: agency?.commission_percent_override ?? null,
        escrowEnabled: agency?.escrow_enabled ?? null,
        receiptUploadsEnabled: agency?.receipt_uploads_enabled ?? null,
      };
    })
    .sort((a, b) => a.agencyName.localeCompare(b.agencyName, "pt-BR"));

  const activeByPlan = {
    free: agenciesData.filter((a) => a.currentPlan === "free" && a.accountActive && !a.isOrphan).length,
    pro: agenciesData.filter((a) => a.currentPlan === "pro" && a.accountActive && !a.isOrphan).length,
    premium: agenciesData.filter((a) => a.currentPlan === "premium" && a.accountActive && !a.isOrphan).length,
  };

  const summary = {
    freeCount: agenciesData.filter((a) => a.currentPlan === "free" && !a.isOrphan).length,
    proCount: agenciesData.filter((a) => a.currentPlan === "pro" && !a.isOrphan).length,
    premiumCount: agenciesData.filter((a) => a.currentPlan === "premium" && !a.isOrphan).length,
    totalRevenuePaid: agenciesData.filter((a) => !a.isOrphan).reduce((sum, a) => sum + a.totalPaid, 0),
    pendingChargeCount: agenciesData.filter((a) => !a.isOrphan).reduce((sum, a) => sum + a.pendingCharges.length, 0),
    pendingChargeAmount: agenciesData.reduce(
      (sum, a) => sum + (!a.isOrphan ? a.pendingCharges.reduce((inner, c) => inner + c.amount, 0) : 0),
      0,
    ),
    failedChargeCount: agenciesData.filter((a) => !a.isOrphan).reduce((sum, a) => sum + a.failedCharges.length, 0),
  };

  const planSettings: PlanSetting[] = planSettingsResult.data.map((row) => ({
    plan_key: parsePlan(row.plan_key),
    name: row.name,
    price: Number(row.price),
    commission_percent: Number(row.commission_percent),
    is_available: row.is_available,
    job_limit: row.job_limit ?? null,
    max_hires_per_job: row.max_hires_per_job ?? null,
    included_agent_seats: row.included_agent_seats ?? null,
    extra_agent_seat_price: row.extra_agent_seat_price ?? null,
  }));

  const planHistory: PlanSettingHistoryEntry[] = planHistoryResult.data.map((row) => ({
    id: row.id,
    plan_key: row.plan_key,
    changed_by: row.changed_by,
    changed_by_email: emailMap.get(row.changed_by) ?? null,
    changed_at: row.changed_at,
    old_price: Number(row.old_price),
    new_price: Number(row.new_price),
    old_commission_percent: Number(row.old_commission_percent),
    new_commission_percent: Number(row.new_commission_percent),
    old_is_available: row.old_is_available,
    new_is_available: row.new_is_available,
    old_job_limit: row.old_job_limit ?? null,
    new_job_limit: row.new_job_limit ?? null,
    old_included_agent_seats: row.old_included_agent_seats ?? null,
    new_included_agent_seats: row.new_included_agent_seats ?? null,
    old_extra_agent_seat_price: row.old_extra_agent_seat_price ?? null,
    new_extra_agent_seat_price: row.new_extra_agent_seat_price ?? null,
  }));

  return (
    <AdminPlans
      agencies={agenciesData}
      summary={summary}
      planSettings={planSettings}
      planHistory={planHistory}
      activeByPlan={activeByPlan}
    />
  );
}
