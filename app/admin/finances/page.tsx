import type { Metadata } from "next";
import AdminFinances, {
  type FinancesBooking,
  type FinancesContract,
  type FinancesPlanPayment,
  type FinancesSubscription,
  type FinancesSummary,
  type FinancesWithdrawal,
} from "@/features/admin/AdminFinances";
import { createServerClient } from "@/lib/supabase";
import {
  calculateCommission,
  calculateNetAmount,
  getPlanDefinition,
  parsePlan,
  REFERRAL_RATE,
} from "@/lib/plans";

export const metadata: Metadata = { title: "Administração — Financeiro — BrisaHub" };

type ContractRow = {
  id: string;
  job_id: string | null;
  talent_id: string | null;
  agency_id: string | null;
  payment_amount: number | null;
  commission_amount?: number | null;
  net_amount?: number | null;
  status: string | null;
  created_at: string | null;
  paid_at: string | null;
  withdrawn_at?: string | null;
};

type AgencyPlanProfileRow = {
  id: string;
  plan: string | null;
  plan_status?: string | null;
  plan_expires_at?: string | null;
};

async function fetchContracts(supabase: ReturnType<typeof createServerClient>) {
  const withAllColumns = await supabase
    .from("contracts")
    .select("id, job_id, talent_id, agency_id, payment_amount, commission_amount, net_amount, status, created_at, paid_at, withdrawn_at")
    .in("status", ["confirmed", "paid"])
    .order("created_at", { ascending: false });

  if (!withAllColumns.error) {
    return (withAllColumns.data ?? []) as ContractRow[];
  }

  const withoutWithdrawnAt = await supabase
    .from("contracts")
    .select("id, job_id, talent_id, agency_id, payment_amount, commission_amount, net_amount, status, created_at, paid_at")
    .in("status", ["confirmed", "paid"])
    .order("created_at", { ascending: false });

  if (!withoutWithdrawnAt.error) {
    return (withoutWithdrawnAt.data ?? []).map((contract) => ({
      ...contract,
      withdrawn_at: null,
    })) as ContractRow[];
  }

  const legacyColumns = await supabase
    .from("contracts")
    .select("id, job_id, talent_id, agency_id, payment_amount, status, created_at, paid_at")
    .in("status", ["confirmed", "paid"])
    .order("created_at", { ascending: false });

  return ((legacyColumns.data ?? []).map((contract) => ({
    ...contract,
    commission_amount: null,
    net_amount: null,
    withdrawn_at: null,
  })) as ContractRow[]);
}

export default async function AdminFinancesPage() {
  const supabase = createServerClient({ useServiceRole: true });

  const [
    { data: bookingsData },
    { data: referralSubs },
    { data: agencyWallets },
    { data: agencyPlanProfiles },
    { data: planPaymentsData },
    { data: allAgenciesData },
    contractsData,
    { data: withdrawalTxs },
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, job_id, job_title, talent_user_id, price, status, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("submissions")
      .select("job_id, talent_user_id")
      .not("referrer_id", "is", null),
    supabase
      .from("profiles")
      .select("wallet_balance")
      .eq("role", "agency"),
    supabase
      .from("profiles")
      .select("id, plan, plan_status, plan_expires_at")
      .eq("role", "agency"),
    supabase
      .from("wallet_transactions")
      .select("id, user_id, amount, created_at")
      .eq("type", "payment")
      .ilike("description", "%Plano%")
      .order("created_at", { ascending: false }),
    supabase
      .from("agencies")
      .select("id, company_name, pix_key_type, pix_key_value, pix_holder_name")
      .is("deleted_at", null),
    fetchContracts(supabase),
    supabase
      .from("wallet_transactions")
      .select("id, user_id, amount, fee_amount, net_amount, status, processed_at, admin_note, created_at")
      .eq("type", "withdrawal")
      .order("created_at", { ascending: false }),
  ]);

  const rows = bookingsData ?? [];
  const contractRows = contractsData ?? [];

  const typedAgencyPlanProfiles = (agencyPlanProfiles ?? []) as AgencyPlanProfileRow[];

  const agencyPlanMap = new Map<string, ReturnType<typeof parsePlan>>();
  for (const profile of typedAgencyPlanProfiles) {
    agencyPlanMap.set(profile.id, parsePlan(profile.plan));
  }

  const talentIds = [...new Set(rows.map((booking) => booking.talent_user_id).filter(Boolean))] as string[];
  const jobIds = [...new Set(rows.map((booking) => booking.job_id).filter(Boolean))] as string[];
  const contractTalentIds = [...new Set(contractRows.map((contract) => contract.talent_id).filter(Boolean))] as string[];
  const contractAgencyIds = [...new Set(contractRows.map((contract) => contract.agency_id).filter(Boolean))] as string[];
  const contractJobIds = [...new Set(contractRows.map((contract) => contract.job_id).filter(Boolean))] as string[];

  const talentMap = new Map<string, string>();
  const bookingJobMap = new Map<string, { title: string; agencyId: string | null }>();
  const contractTalentMap = new Map<string, string>();
  const contractAgencyMap = new Map<string, string>();
  const contractJobMap = new Map<string, string>();

  await Promise.all([
    talentIds.length
      ? supabase
          .from("talent_profiles")
          .select("id, full_name")
          .in("id", talentIds)
          .then(({ data }) => {
            for (const profile of data ?? []) {
              talentMap.set(profile.id, profile.full_name ?? "Sem nome");
            }
          })
      : Promise.resolve(),
    jobIds.length
      ? supabase
          .from("jobs")
          .select("id, title, agency_id")
          .in("id", jobIds)
          .then(({ data }) => {
            for (const job of data ?? []) {
              bookingJobMap.set(job.id, {
                title: job.title ?? "-",
                agencyId: job.agency_id ?? null,
              });
            }
          })
      : Promise.resolve(),
    contractTalentIds.length
      ? supabase
          .from("talent_profiles")
          .select("id, full_name")
          .in("id", contractTalentIds)
          .then(({ data }) => {
            for (const profile of data ?? []) {
              contractTalentMap.set(profile.id, profile.full_name ?? "Sem nome");
            }
          })
      : Promise.resolve(),
    contractAgencyIds.length
      ? supabase
          .from("agencies")
          .select("id, company_name")
          .in("id", contractAgencyIds)
          .then(({ data }) => {
            for (const agency of data ?? []) {
              contractAgencyMap.set(agency.id, agency.company_name ?? "Sem nome");
            }
          })
      : Promise.resolve(),
    contractJobIds.length
      ? supabase
          .from("jobs")
          .select("id, title")
          .in("id", contractJobIds)
          .then(({ data }) => {
            for (const job of data ?? []) {
              contractJobMap.set(job.id, job.title ?? "Untitled Job");
            }
          })
      : Promise.resolve(),
  ]);

  const referralKeys = new Set((referralSubs ?? []).map((submission) => `${submission.job_id}::${submission.talent_user_id}`));

  const bookings: FinancesBooking[] = rows.map((booking) => {
    const job = booking.job_id ? bookingJobMap.get(booking.job_id) : null;
    const agencyPlan = parsePlan(job?.agencyId ? agencyPlanMap.get(job.agencyId) : "free");
    const price = booking.price ?? 0;
    const isConfirmed = booking.status === "confirmed" || booking.status === "paid";
    const isReferred = referralKeys.has(`${booking.job_id}::${booking.talent_user_id}`);
    const commissionAmount = isConfirmed ? calculateCommission(price, agencyPlan) : 0;
    const referralAmount = isConfirmed && isReferred ? Math.round(price * REFERRAL_RATE * 100) / 100 : 0;

    return {
      id: booking.id,
      jobTitle: booking.job_title ?? job?.title ?? "-",
      talentName: booking.talent_user_id ? (talentMap.get(booking.talent_user_id) ?? "Sem nome") : "Sem nome",
      price,
      status: booking.status ?? "pending",
      created_at: booking.created_at ?? "",
      isReferred,
      agencyPlan,
      commissionAmount,
      referralAmount,
      netPlatformAmount: commissionAmount - referralAmount,
    };
  });

  const contracts: FinancesContract[] = contractRows.map((contract) => {
    const agencyPlan = parsePlan(contract.agency_id ? agencyPlanMap.get(contract.agency_id) : "free");
    const amount = contract.payment_amount ?? 0;
    const commissionAmount =
      typeof contract.commission_amount === "number"
        ? contract.commission_amount
        : calculateCommission(amount, agencyPlan);
    const netAmount =
      typeof contract.net_amount === "number"
        ? contract.net_amount
        : calculateNetAmount(amount, agencyPlan);

    return {
      id: contract.id,
      jobTitle: contract.job_id ? (contractJobMap.get(contract.job_id) ?? "Untitled Job") : "Untitled Job",
      talentName: contract.talent_id ? (contractTalentMap.get(contract.talent_id) ?? "Sem nome") : "Sem nome",
      agencyName: contract.agency_id ? (contractAgencyMap.get(contract.agency_id) ?? "Sem nome") : "-",
      agencyPlan,
      amount,
      commissionAmount,
      netAmount,
      status: contract.status ?? "confirmed",
      created_at: contract.created_at ?? "",
      paid_at: contract.paid_at ?? null,
      withdrawn_at: contract.withdrawn_at ?? null,
    };
  });

  const confirmedBookings = bookings.filter((booking) => booking.status === "confirmed" || booking.status === "paid");
  const pendingBookings = bookings.filter((booking) => booking.status === "pending" || booking.status === "pending_payment");
  const totalGross = bookings.reduce((sum, booking) => sum + booking.price, 0);
  const confirmedVal = confirmedBookings.reduce((sum, booking) => sum + booking.price, 0);
  const pendingVal = pendingBookings.reduce((sum, booking) => sum + booking.price, 0);
  const bookingCommission = confirmedBookings.reduce((sum, booking) => sum + booking.commissionAmount, 0);
  const referralPayouts = confirmedBookings.reduce((sum, booking) => sum + booking.referralAmount, 0);

  const escrowContracts = contracts.filter((contract) => contract.status === "confirmed");
  const paidContracts = contracts.filter((contract) => contract.status === "paid");
  const awaitingWithdrawal = paidContracts.filter((contract) => !contract.withdrawn_at);
  const withdrawnContracts = paidContracts.filter((contract) => !!contract.withdrawn_at);

  // Escrow holds the FULL payment_amount — commission hasn't been split yet.
  // Only after the agency pays does the net_amount (talent's share) matter.
  const contractsEscrowValue = escrowContracts.reduce((sum, contract) => sum + contract.amount, 0);
  const contractsAwaitingValue = awaitingWithdrawal.reduce((sum, contract) => sum + contract.netAmount, 0);
  const contractsWithdrawnValue = withdrawnContracts.reduce((sum, contract) => sum + contract.netAmount, 0);
  const contractsGross = contracts.reduce((sum, contract) => sum + contract.amount, 0);
  const contractsCommission = contracts.reduce((sum, contract) => sum + contract.commissionAmount, 0);
  const contractsPaidValue = paidContracts.reduce((sum, contract) => sum + contract.netAmount, 0);

  const totalAgencyWalletBalance = (agencyWallets ?? []).reduce((sum, profile) => sum + (profile.wallet_balance ?? 0), 0);

  const planPaymentsMap = new Map<string, { total: number; lastPayment: string | null }>();
  for (const payment of planPaymentsData ?? []) {
    const current = planPaymentsMap.get(payment.user_id) ?? { total: 0, lastPayment: null };
    planPaymentsMap.set(payment.user_id, {
      total: current.total + Math.abs(payment.amount ?? 0),
      lastPayment: current.lastPayment ?? payment.created_at,
    });
  }

  const allAgencyNameMap = new Map<string, string>();
  const agencyPixMap     = new Map<string, { pix_key_type: string | null; pix_key_value: string | null; pix_holder_name: string | null }>();
  for (const agency of allAgenciesData ?? []) {
    allAgencyNameMap.set(agency.id, agency.company_name ?? "");
    agencyPixMap.set(agency.id, {
      pix_key_type:   (agency as Record<string, unknown>).pix_key_type   as string | null ?? null,
      pix_key_value:  (agency as Record<string, unknown>).pix_key_value  as string | null ?? null,
      pix_holder_name:(agency as Record<string, unknown>).pix_holder_name as string | null ?? null,
    });
  }

  const planOrder: Record<string, number> = { premium: 0, pro: 1, free: 2 };
  const subscriptions: FinancesSubscription[] = typedAgencyPlanProfiles
    .map((profile) => {
      const plan = parsePlan(profile.plan);

      return {
        userId: profile.id,
        agencyName: allAgencyNameMap.get(profile.id) ?? "Agencia sem nome",
        plan,
        planStatus: profile.plan_status ?? (plan === "free" ? "inactive" : "active"),
        planExpiresAt: profile.plan_expires_at ?? null,
        totalPaid: planPaymentsMap.get(profile.id)?.total ?? 0,
        lastPayment: planPaymentsMap.get(profile.id)?.lastPayment ?? null,
      };
    })
    .sort((left, right) => (planOrder[left.plan] ?? 2) - (planOrder[right.plan] ?? 2));

  const planPayments: FinancesPlanPayment[] = (planPaymentsData ?? []).map((payment) => ({
    id: payment.id,
    userId: payment.user_id,
    agencyName: allAgencyNameMap.get(payment.user_id) ?? "Agencia sem nome",
    plan: parsePlan(agencyPlanMap.get(payment.user_id)),
    amount: Math.abs(payment.amount ?? 0),
    createdAt: payment.created_at ?? "",
  }));

  const totalSubscriptionRevenue = (planPaymentsData ?? []).reduce((sum, payment) => sum + Math.abs(payment.amount ?? 0), 0);
  const minimumRequired = contractsEscrowValue + contractsAwaitingValue + totalAgencyWalletBalance;

  const withdrawals: FinancesWithdrawal[] = (withdrawalTxs ?? []).map((w) => {
    const pix = agencyPixMap.get(w.user_id);
    const raw = w as Record<string, unknown>;
    return {
      id:           w.id,
      agencyName:   allAgencyNameMap.get(w.user_id) ?? "Agência sem nome",
      amount:       Math.abs(w.amount ?? 0),
      feeAmount:    typeof raw.fee_amount === "number" ? raw.fee_amount : 0,
      netAmount:    typeof raw.net_amount === "number" ? raw.net_amount : Math.abs(w.amount ?? 0),
      status:       w.status ?? "paid",
      createdAt:    w.created_at ?? "",
      processedAt:  w.processed_at ?? null,
      pixKeyType:   pix?.pix_key_type   ?? null,
      pixKeyValue:  pix?.pix_key_value  ?? null,
      pixHolderName:pix?.pix_holder_name ?? null,
      adminNote:    typeof raw.admin_note === "string" ? raw.admin_note : null,
    };
  });

  const summary: FinancesSummary = {
    totalGrossValue: totalGross,
    confirmedGrossValue: confirmedVal,
    platformCommission: bookingCommission,
    referralPayouts,
    contractsGross,
    contractsCommission,
    contractsEscrowValue,
    contractsAwaitingValue,
    contractsWithdrawnValue,
    contractsPaidValue,
    pendingValue: pendingVal,
    totalBookings: bookings.length,
    confirmedBookings: confirmedBookings.length,
    agencyWalletTotal: totalAgencyWalletBalance,
    subscriptionRevenue: totalSubscriptionRevenue,
    minimumRequired,
    planBreakdown: {
      free: {
        commissionLabel: getPlanDefinition("free").commissionLabel,
        priceLabel: getPlanDefinition("free").priceLabel,
      },
      pro: {
        commissionLabel: getPlanDefinition("pro").commissionLabel,
        priceLabel: `${getPlanDefinition("pro").priceLabel}/mes`,
      },
      premium: {
        commissionLabel: getPlanDefinition("premium").commissionLabel,
        priceLabel: `${getPlanDefinition("premium").priceLabel}/mes`,
      },
    },
  };

  return (
    <AdminFinances
      summary={summary}
      bookings={bookings}
      contracts={contracts}
      planPayments={planPayments}
      subscriptions={subscriptions}
      withdrawals={withdrawals}
    />
  );
}
