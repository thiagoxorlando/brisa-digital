import type { Metadata } from "next";
import AdminFinances, {
  type FinancesSummary,
  type FinancesBooking,
  type FinancesContract,
  type AgencyEntry,
} from "@/features/admin/AdminFinances";
import { createServerClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Admin — Finances — Brisa Digital" };

const COMMISSION_RATE    = 0.15;
const REFERRAL_RATE      = 0.02;
const AGENCY_MONTHLY_FEE = 2500;

export default async function AdminFinancesPage() {
  const supabase = createServerClient({ useServiceRole: true });

  const [{ data: bookingsData }, { data: agenciesData }, { data: referralSubs }] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, job_id, job_title, talent_user_id, price, status, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("agencies")
      .select("id, company_name, subscription_status, created_at")
      .order("created_at", { ascending: false }),
    // Only submissions that came via a referral (referrer_id set)
    supabase
      .from("submissions")
      .select("job_id, talent_user_id")
      .not("referrer_id", "is", null),
  ]);

  // Fetch contracts — try with withdrawn_at first, fall back if column doesn't exist yet
  let contractsData: any[] | null = null;
  {
    const { data, error } = await supabase
      .from("contracts")
      .select("id, job_id, talent_id, agency_id, payment_amount, status, created_at, paid_at, withdrawn_at")
      .in("status", ["confirmed", "paid"])
      .order("created_at", { ascending: false });

    if (!error) {
      contractsData = data;
    } else {
      // withdrawn_at column may not exist yet — retry without it
      const { data: fallback } = await supabase
        .from("contracts")
        .select("id, job_id, talent_id, agency_id, payment_amount, status, created_at, paid_at")
        .in("status", ["confirmed", "paid"])
        .order("created_at", { ascending: false });
      contractsData = (fallback ?? []).map((c) => ({ ...c, withdrawn_at: null }));
    }
  }

  const rows         = bookingsData   ?? [];
  const contractRows = contractsData  ?? [];

  // ── Resolve talent names for bookings ────────────────────────────────
  const talentIds = [...new Set(rows.map((b) => b.talent_user_id).filter(Boolean))] as string[];
  const talentMap = new Map<string, string>();
  if (talentIds.length) {
    const { data: profiles } = await supabase
      .from("talent_profiles")
      .select("id, full_name")
      .in("id", talentIds);
    for (const p of profiles ?? []) talentMap.set(p.id, p.full_name ?? "Unknown");
  }

  // ── Resolve job titles for bookings where job_title is missing ────────
  const jobIds = [...new Set(rows.filter((b) => !b.job_title && b.job_id).map((b) => b.job_id))] as string[];
  const jobTitleMap = new Map<string, string>();
  if (jobIds.length) {
    const { data: jobs } = await supabase.from("jobs").select("id, title").in("id", jobIds);
    for (const j of jobs ?? []) jobTitleMap.set(j.id, j.title ?? "—");
  }

  // ── Resolve names for contracts ───────────────────────────────────────
  const contractTalentIds = [...new Set(contractRows.map((c) => c.talent_id).filter(Boolean))] as string[];
  const contractAgencyIds = [...new Set(contractRows.map((c) => c.agency_id).filter(Boolean))] as string[];
  const contractJobIds    = [...new Set(contractRows.map((c) => c.job_id).filter(Boolean))]    as string[];

  const contractTalentMap = new Map<string, string>();
  const contractAgencyMap = new Map<string, string>();
  const contractJobMap    = new Map<string, string>();

  await Promise.all([
    contractTalentIds.length
      ? supabase.from("talent_profiles").select("id, full_name").in("id", contractTalentIds)
          .then(({ data }) => { for (const p of data ?? []) contractTalentMap.set(p.id, p.full_name ?? "Unknown"); })
      : Promise.resolve(),
    contractAgencyIds.length
      ? supabase.from("agencies").select("id, company_name").in("id", contractAgencyIds)
          .then(({ data }) => { for (const a of data ?? []) contractAgencyMap.set(a.id, a.company_name ?? "Unknown"); })
      : Promise.resolve(),
    contractJobIds.length
      ? supabase.from("jobs").select("id, title").in("id", contractJobIds)
          .then(({ data }) => { for (const j of data ?? []) contractJobMap.set(j.id, j.title ?? "Untitled Job"); })
      : Promise.resolve(),
  ]);

  // ── Referral lookup set (must be defined before bookings map) ────────
  const referralKeys = new Set(
    (referralSubs ?? []).map((s) => `${s.job_id}::${s.talent_user_id}`),
  );

  // ── Build bookings list ───────────────────────────────────────────────
  const bookings: FinancesBooking[] = rows.map((b) => ({
    id:         b.id,
    jobTitle:   b.job_title ?? (b.job_id ? (jobTitleMap.get(b.job_id) ?? "—") : "—"),
    talentName: b.talent_user_id ? (talentMap.get(b.talent_user_id) ?? "Unknown") : "Unknown",
    price:      b.price          ?? 0,
    status:     b.status         ?? "pending",
    created_at: b.created_at     ?? "",
    isReferred: referralKeys.has(`${b.job_id}::${b.talent_user_id}`),
  }));

  // ── Build contracts list ──────────────────────────────────────────────
  const contracts: FinancesContract[] = contractRows.map((c: any) => ({
    id:           c.id,
    jobTitle:     c.job_id ? (contractJobMap.get(c.job_id) ?? "Untitled Job") : "Untitled Job",
    talentName:   c.talent_id ? (contractTalentMap.get(c.talent_id) ?? "Unknown") : "Unknown",
    agencyName:   c.agency_id ? (contractAgencyMap.get(c.agency_id) ?? "Unknown") : "—",
    amount:       c.payment_amount ?? 0,
    status:       c.status         ?? "confirmed",
    created_at:   c.created_at     ?? "",
    paid_at:      c.paid_at        ?? null,
    withdrawn_at: c.withdrawn_at   ?? null,
  }));

  // ── Compute subscription revenue (accumulated all-time per agency) ────
  const now = new Date();
  let totalSubscriptionRevenue = 0;
  for (const a of agenciesData ?? []) {
    if (!a.created_at) continue;
    const joined = new Date(a.created_at);
    // Count current month as the first charge (month joined = 1st charge)
    const months = Math.max(
      1,
      (now.getFullYear() - joined.getFullYear()) * 12 + (now.getMonth() - joined.getMonth()) + 1,
    );
    totalSubscriptionRevenue += months * AGENCY_MONTHLY_FEE;
  }

  // ── Booking-based metrics ─────────────────────────────────────────────
  const confirmedBookings = bookings.filter((b) => b.status === "confirmed" || b.status === "paid");
  const pendingBookings   = bookings.filter((b) => b.status === "pending"   || b.status === "pending_payment");
  const totalGross        = bookings.reduce((s, b) => s + b.price, 0);
  const confirmedVal      = confirmedBookings.reduce((s, b) => s + b.price, 0);
  const pendingVal        = pendingBookings.reduce((s, b) => s + b.price, 0);
  const bookingCommission = Math.round(confirmedVal * COMMISSION_RATE);

  // Referral payouts: only 2% of confirmed bookings that came via an actual referral
  const referredConfirmedVal = rows
    .filter((b) => (b.status === "confirmed" || b.status === "paid") && referralKeys.has(`${b.job_id}::${b.talent_user_id}`))
    .reduce((s, b) => s + (b.price ?? 0), 0);
  const referralPayouts = Math.round(referredConfirmedVal * REFERRAL_RATE);

  // ── Contract-based metrics ────────────────────────────────────────────
  const escrowContracts         = contracts.filter((c) => c.status === "confirmed");
  const paidContracts           = contracts.filter((c) => c.status === "paid");
  const awaitingWithdrawal      = paidContracts.filter((c) => !c.withdrawn_at);
  const withdrawn               = paidContracts.filter((c) => !!c.withdrawn_at);

  const contractsEscrowValue    = escrowContracts.reduce((s, c) => s + c.amount, 0);
  const contractsAwaitingValue  = awaitingWithdrawal.reduce((s, c) => s + c.amount, 0);
  const contractsWithdrawnValue = withdrawn.reduce((s, c) => s + c.amount, 0);
  const contractsGross          = contracts.reduce((s, c) => s + c.amount, 0);
  const contractsCommission     = Math.round(contractsGross * COMMISSION_RATE);
  const contractsPaid           = paidContracts.reduce((s, c) => s + c.amount, 0);

  // ── Agencies for subscriptions table ─────────────────────────────────
  const activeAgencies = (agenciesData ?? []).filter((a) => a.subscription_status === "active");
  const monthlySubTotal = activeAgencies.length * AGENCY_MONTHLY_FEE;

  const summary: FinancesSummary = {
    totalGrossValue:          totalGross,
    confirmedGrossValue:      confirmedVal,
    platformCommission:       bookingCommission,
    referralPayouts,
    contractsGross,
    contractsCommission,
    contractsEscrowValue:     contractsEscrowValue,
    contractsAwaitingValue:   contractsAwaitingValue,
    contractsWithdrawnValue:  contractsWithdrawnValue,
    contractsPaidValue:       contractsPaid,
    subscriptionRevenue:      totalSubscriptionRevenue,
    monthlySubscriptionTotal: monthlySubTotal,
    netRevenue:               bookingCommission + contractsCommission + totalSubscriptionRevenue - referralPayouts,
    pendingValue:             pendingVal,
    totalBookings:            bookings.length,
    confirmedBookings:        confirmedBookings.length,
  };

  const agencies: AgencyEntry[] = (agenciesData ?? []).map((a) => ({
    id:                 a.id,
    name:               a.company_name ?? `Agency ${a.id.slice(0, 8)}`,
    joinedAt:           a.created_at   ?? "",
    monthlyFee:         AGENCY_MONTHLY_FEE,
    subscriptionStatus: a.subscription_status ?? "active",
  }));

  return <AdminFinances summary={summary} bookings={bookings} contracts={contracts} agencies={agencies} />;
}
