import type { Metadata } from "next";
import AdminFinances, {
  type FinancesBooking,
  type FinancesContract,
  type FinancesDeposit,
  type FinancesPlanPayment,
  type FinancesSubscription,
  type FinancesSummary,
  type FinancesWallet,
  type FinancesWithdrawal,
} from "@/features/admin/AdminFinances";
import { createServerClient } from "@/lib/supabase";
import {
  calculateCommission,
  calculateNetAmount,
  parsePlan,
  REFERRAL_RATE,
} from "@/lib/plans";
import { getLivePlanSettings } from "@/lib/planSettings.server";
import { formatPlanPricing } from "@/lib/planSettings.shared";

export const metadata: Metadata = { title: "Finances — Admin — BrisaHub" };

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
};

type AgencyPlanProfileRow = {
  id: string;
  plan: string | null;
  plan_status?: string | null;
  plan_expires_at?: string | null;
};

type WithdrawalProfileRow = {
  id: string;
  role: string | null;
};

async function fetchContracts(supabase: ReturnType<typeof createServerClient>) {
  const withAllColumns = await supabase
    .from("contracts")
    .select("id, job_id, talent_id, agency_id, payment_amount, commission_amount, net_amount, status, created_at, paid_at")
    .is("deleted_at", null)
    .in("status", ["confirmed", "paid"])
    .order("created_at", { ascending: false });

  if (!withAllColumns.error) {
    return (withAllColumns.data ?? []) as ContractRow[];
  }

  const legacyColumns = await supabase
    .from("contracts")
    .select("id, job_id, talent_id, agency_id, payment_amount, status, created_at, paid_at")
    .is("deleted_at", null)
    .in("status", ["confirmed", "paid"])
    .order("created_at", { ascending: false });

  return ((legacyColumns.data ?? []).map((contract) => ({
    ...contract,
    commission_amount: null,
    net_amount: null,
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
    { data: talentWalletsData },
    { data: depositsData },
    liveSettings,
    authUsersResult,
    validProfilesResult,
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select(`
        id, job_id, job_title, talent_user_id, price, status, created_at,
        contracts!contracts_booking_id_fkey (
          commission_amount
        )
      `)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("submissions")
      .select("job_id, talent_user_id")
      .not("referrer_id", "is", null),
    supabase
      .from("profiles")
      .select("id, wallet_balance")
      .eq("role", "agency"),
    supabase
      .from("profiles")
      .select("id, plan, plan_status, plan_expires_at")
      .eq("role", "agency"),
    supabase
      .from("wallet_transactions")
      .select("id, user_id, amount, created_at, status")
      .eq("type", "plan_charge")
      .order("created_at", { ascending: false }),
    supabase
      .from("agencies")
      .select("id, user_id, company_name, pix_key_type, pix_key_value, pix_holder_name")
      .is("deleted_at", null),
    fetchContracts(supabase),
    supabase
      .from("wallet_transactions")
      .select("id, user_id, amount, fee_amount, net_amount, status, processed_at, admin_note, provider, provider_transfer_id, provider_status, created_at")
      .eq("type", "withdrawal")
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, wallet_balance")
      .eq("role", "talent")
      .gt("wallet_balance", 0)
      .order("wallet_balance", { ascending: false }),
    supabase
      .from("wallet_transactions")
      .select("id, user_id, amount, status, provider, asaas_payment_id, description, created_at, processed_at")
      .eq("type", "deposit")
      .order("created_at", { ascending: false }),
    getLivePlanSettings(),
    // TODO: paginate auth users for platforms with >1000 users
    supabase.auth.admin.listUsers({ perPage: 1000 }),
    supabase.from("profiles").select("id").is("deleted_at", null),
  ]);

  const validUserIds = new Set((authUsersResult.data?.users ?? []).map((user) => user.id));
  const validProfileIds = new Set((validProfilesResult.data ?? []).map((profile) => profile.id));

  const depositUserIds = [...new Set((depositsData ?? []).map((d) => d.user_id).filter(Boolean))] as string[];
  const depositNameMap = new Map<string, { name: string; role: string }>();

  await Promise.all([
    depositUserIds.length
      ? supabase
          .from("profiles")
          .select("id, role")
          .in("id", depositUserIds)
          .then(({ data }) => {
            for (const p of data ?? []) {
              depositNameMap.set(p.id, { name: "", role: p.role ?? "unknown" });
            }
          })
      : Promise.resolve(),
    depositUserIds.length
      ? supabase
          .from("agencies")
          .select("id, user_id, company_name")
          .in("id", depositUserIds)
          .then(({ data }) => {
            for (const a of data ?? []) {
              const existing = depositNameMap.get(a.id);
              const ownerId = (a as { user_id?: string | null }).user_id ?? a.id;
              const isOrphan = !ownerId || !validUserIds.has(ownerId) || !validProfileIds.has(ownerId);
              depositNameMap.set(a.id, { name: a.company_name ?? "Agência", role: existing?.role ?? "agency" });
            }
          })
      : Promise.resolve(),
    depositUserIds.length
      ? supabase
          .from("talent_profiles")
          .select("id, full_name")
          .in("id", depositUserIds)
          .then(({ data }) => {
            for (const t of data ?? []) {
              const existing = depositNameMap.get(t.id);
              if (existing?.role === "talent" || !existing) {
                depositNameMap.set(t.id, { name: t.full_name ?? "Talento", role: "talent" });
              }
            }
          })
      : Promise.resolve(),
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
  const withdrawalUserIds = [...new Set((withdrawalTxs ?? []).map((withdrawal) => withdrawal.user_id).filter(Boolean))] as string[];

  const talentMap = new Map<string, string>();
  const talentWalletNameMap = new Map<string, string>();
  const withdrawalRoleMap = new Map<string, string>();
  const withdrawalTalentNameMap = new Map<string, string>();
  const withdrawalTalentPixMap = new Map<string, { pix_key_type: string | null; pix_key_value: string | null; pix_holder_name: string | null }>();
  const bookingJobMap = new Map<string, { title: string; agencyId: string | null; workspaceId: string | null }>();
  const bookingJobWorkspaceIdMap = new Map<string, string | null>();
  const contractTalentMap = new Map<string, string>();
  const contractAgencyMap = new Map<string, string>();
  const contractJobMap = new Map<string, string>();
  const contractJobWorkspaceIdMap = new Map<string, string | null>();
  const financesWorkspaceNameMap = new Map<string, string>();

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
          .select("id, title, agency_id, workspace_id")
          .in("id", jobIds)
          .then(({ data }) => {
            for (const job of data ?? []) {
              const wsId = (job as { workspace_id?: string | null }).workspace_id ?? null;
              bookingJobMap.set(job.id, {
                title: job.title ?? "-",
                agencyId: job.agency_id ?? null,
                workspaceId: wsId,
              });
              bookingJobWorkspaceIdMap.set(job.id, wsId);
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
          .select("id, user_id, company_name")
          .in("id", contractAgencyIds)
          .then(({ data }) => {
            for (const agency of data ?? []) {
              const ownerId = (agency as { user_id?: string | null }).user_id ?? agency.id;
              const isOrphan = !ownerId || !validUserIds.has(ownerId) || !validProfileIds.has(ownerId);
              contractAgencyMap.set(agency.id, isOrphan ? "Agência órfã / usuário deletado" : (agency.company_name ?? "Sem nome"));
            }
          })
      : Promise.resolve(),
    contractJobIds.length
      ? supabase
          .from("jobs")
          .select("id, title, workspace_id")
          .in("id", contractJobIds)
          .then(({ data }) => {
            for (const job of data ?? []) {
              contractJobMap.set(job.id, job.title ?? "Untitled Job");
              contractJobWorkspaceIdMap.set(job.id, (job as { workspace_id?: string | null }).workspace_id ?? null);
            }
          })
      : Promise.resolve(),
    (talentWalletsData ?? []).length > 0
      ? supabase
          .from("talent_profiles")
          .select("id, full_name")
          .in("id", (talentWalletsData ?? []).map((w) => w.id))
          .then(({ data }) => {
            for (const profile of data ?? []) {
              talentWalletNameMap.set(profile.id, profile.full_name ?? "Sem nome");
            }
          })
      : Promise.resolve(),
    withdrawalUserIds.length
      ? supabase
          .from("profiles")
          .select("id, role")
          .in("id", withdrawalUserIds)
          .then(({ data }) => {
            for (const profile of (data ?? []) as WithdrawalProfileRow[]) {
              withdrawalRoleMap.set(profile.id, profile.role ?? "unknown");
            }
          })
      : Promise.resolve(),
    withdrawalUserIds.length
      ? supabase
          .from("talent_profiles")
          .select("id, full_name, pix_key_type, pix_key_value, pix_holder_name")
          .in("id", withdrawalUserIds)
          .then(({ data }) => {
            for (const profile of data ?? []) {
              withdrawalTalentNameMap.set(profile.id, profile.full_name ?? "Talento sem nome");
              withdrawalTalentPixMap.set(profile.id, {
                pix_key_type: profile.pix_key_type ?? null,
                pix_key_value: profile.pix_key_value ?? null,
                pix_holder_name: (profile as Record<string, unknown>).pix_holder_name as string | null ?? null,
              });
            }
          })
      : Promise.resolve(),
  ]);

  // Resolve workspace names for premium bookings/contracts
  const allFinancesWsIds = [
    ...new Set([
      ...[...bookingJobWorkspaceIdMap.values()],
      ...[...contractJobWorkspaceIdMap.values()],
    ].filter((id): id is string => !!id)),
  ];
  if (allFinancesWsIds.length) {
    const { data: wsData } = await supabase
      .from("premium_workspaces")
      .select("id, name")
      .in("id", allFinancesWsIds)
      .is("deleted_at", null);
    for (const ws of wsData ?? []) financesWorkspaceNameMap.set(ws.id, ws.name ?? "Premium");
  }

  const referralKeys = new Set((referralSubs ?? []).map((submission) => `${submission.job_id}::${submission.talent_user_id}`));

  const bookings: FinancesBooking[] = rows.map((booking) => {
    const job = booking.job_id ? bookingJobMap.get(booking.job_id) : null;
    const agencyPlan = parsePlan(job?.agencyId ? agencyPlanMap.get(job.agencyId) : "free");
    const price = booking.price ?? 0;
    const isConfirmed = booking.status === "confirmed" || booking.status === "paid";
    const isReferred = referralKeys.has(`${booking.job_id}::${booking.talent_user_id}`);

    // Use stored commission_amount from the contract when available.
    // Fall back to calculateCommission for pending bookings or legacy rows without a contract.
    const contractArr = Array.isArray((booking as Record<string, unknown>).contracts)
      ? (booking as Record<string, unknown>).contracts as { commission_amount?: number | null }[]
      : [];
    const storedCommission = typeof contractArr[0]?.commission_amount === "number"
      ? contractArr[0].commission_amount
      : null;
    const commissionAmount = storedCommission !== null
      ? storedCommission
      : (isConfirmed ? calculateCommission(price, agencyPlan) : 0);

    const referralAmount = isConfirmed && isReferred ? Math.round(price * REFERRAL_RATE * 100) / 100 : 0;

    const bWsId = booking.job_id ? (bookingJobWorkspaceIdMap.get(booking.job_id) ?? null) : null;
    return {
      id: booking.id,
      jobTitle: booking.job_title ?? job?.title ?? "-",
      talentName: booking.talent_user_id ? (talentMap.get(booking.talent_user_id) ?? "Talento órfão / usuário deletado") : "Talento órfão / usuário deletado",
      price,
      status: booking.status ?? "pending",
      created_at: booking.created_at ?? "",
      isReferred,
      agencyPlan,
      commissionAmount,
      referralAmount,
      netPlatformAmount: commissionAmount - referralAmount,
      workspaceId:   bWsId,
      workspaceName: bWsId ? (financesWorkspaceNameMap.get(bWsId) ?? "Workspace órfão") : null,
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

    const cWsId = contract.job_id ? (contractJobWorkspaceIdMap.get(contract.job_id) ?? null) : null;
    return {
      id: contract.id,
      jobTitle: contract.job_id ? (contractJobMap.get(contract.job_id) ?? "Job órfão") : "Job órfão",
      talentName: contract.talent_id ? (contractTalentMap.get(contract.talent_id) ?? "Talento órfão / usuário deletado") : "Talento órfão / usuário deletado",
      agencyName: contract.agency_id ? (contractAgencyMap.get(contract.agency_id) ?? "Agência órfã / usuário deletado") : "-",
      agencyPlan,
      amount,
      commissionAmount,
      netAmount,
      status: contract.status ?? "confirmed",
      created_at: contract.created_at ?? "",
      paid_at: contract.paid_at ?? null,
      workspaceId:   cWsId,
      workspaceName: cWsId ? (financesWorkspaceNameMap.get(cWsId) ?? "Workspace órfão") : null,
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

  const contractsEscrowValue = escrowContracts.reduce((sum, contract) => sum + contract.amount, 0);
  const contractsGross = contracts.reduce((sum, contract) => sum + contract.amount, 0);
  const contractsCommission = contracts.reduce((sum, contract) => sum + contract.commissionAmount, 0);
  const contractsPaidValue = paidContracts.reduce((sum, contract) => sum + contract.netAmount, 0);

  const totalAgencyWalletBalance = (agencyWallets ?? []).reduce((sum, profile) => sum + (profile.wallet_balance ?? 0), 0);

  const planPaymentsMap = new Map<string, { total: number; lastPayment: string | null }>();
  for (const payment of planPaymentsData ?? []) {
    if (payment.status !== "paid") continue;
    const current = planPaymentsMap.get(payment.user_id) ?? { total: 0, lastPayment: null };
    planPaymentsMap.set(payment.user_id, {
      total: current.total + Math.abs(payment.amount ?? 0),
      lastPayment: current.lastPayment ?? payment.created_at,
    });
  }

  const allAgencyNameMap = new Map<string, string>();
  const agencyPixMap     = new Map<string, { pix_key_type: string | null; pix_key_value: string | null; pix_holder_name: string | null }>();
  for (const agency of allAgenciesData ?? []) {
    const ownerId = (agency as { user_id?: string | null }).user_id ?? agency.id;
    const isOrphan = !ownerId || !validUserIds.has(ownerId) || !validProfileIds.has(ownerId);
    allAgencyNameMap.set(agency.id, isOrphan ? "Agência órfã / usuário deletado" : (agency.company_name ?? ""));
    agencyPixMap.set(agency.id, {
      pix_key_type:   (agency as Record<string, unknown>).pix_key_type   as string | null ?? null,
      pix_key_value:  (agency as Record<string, unknown>).pix_key_value  as string | null ?? null,
      pix_holder_name:(agency as Record<string, unknown>).pix_holder_name as string | null ?? null,
    });
  }

  const agencyWalletList: FinancesWallet[] = (agencyWallets ?? [])
    .filter((w) => (w.wallet_balance ?? 0) > 0)
    .sort((a, b) => (b.wallet_balance ?? 0) - (a.wallet_balance ?? 0))
    .map((w) => ({
      userId: w.id,
      name:   allAgencyNameMap.get(w.id) ?? "Agência sem nome",
      role:   "agency" as const,
      balance: w.wallet_balance ?? 0,
      plan:   agencyPlanMap.get(w.id) ?? "free",
      hasPix: !!(agencyPixMap.get(w.id)?.pix_key_value),
    }));

  const talentWalletList: FinancesWallet[] = (talentWalletsData ?? []).map((w) => ({
    userId:  w.id,
    name:    talentWalletNameMap.get(w.id) ?? "Talento sem nome",
    role:    "talent" as const,
    balance: w.wallet_balance ?? 0,
  }));

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

  const planPayments: FinancesPlanPayment[] = (planPaymentsData ?? [])
    .filter((payment) => payment.status === "paid")
    .map((payment) => ({
    id: payment.id,
    userId: payment.user_id,
    agencyName: allAgencyNameMap.get(payment.user_id) ?? "Agencia sem nome",
    plan: parsePlan(agencyPlanMap.get(payment.user_id)),
    amount: Math.abs(payment.amount ?? 0),
    createdAt: payment.created_at ?? "",
  }));

  const totalSubscriptionRevenue = (planPaymentsData ?? [])
    .filter((payment) => payment.status === "paid")
    .reduce((sum, payment) => sum + Math.abs(payment.amount ?? 0), 0);
  const totalTalentWalletBalance = (talentWalletsData ?? []).reduce((sum, w) => sum + (w.wallet_balance ?? 0), 0);
  const minimumRequired = contractsEscrowValue + totalAgencyWalletBalance + totalTalentWalletBalance;

  const withdrawals: FinancesWithdrawal[] = (withdrawalTxs ?? []).map((w) => {
    const rawRole = withdrawalRoleMap.get(w.user_id) ?? "unknown";
    const userRole = rawRole === "agency" || rawRole === "talent" ? rawRole : "unknown";
    const isTalent = userRole === "talent";
    const agencyPix = isTalent ? null : agencyPixMap.get(w.user_id);
    const pix = isTalent ? withdrawalTalentPixMap.get(w.user_id) : agencyPix;
    const raw = w as Record<string, unknown>;
    return {
      id:           w.id,
      agencyName:   isTalent
        ? (withdrawalTalentNameMap.get(w.user_id) ?? "Talento sem nome")
        : (allAgencyNameMap.get(w.user_id) ?? "Agência sem nome"),
      userRole,
      amount:       Math.abs(w.amount ?? 0),
      feeAmount:    typeof raw.fee_amount === "number" ? raw.fee_amount : 0,
      netAmount:    typeof raw.net_amount === "number" ? raw.net_amount : Math.abs(w.amount ?? 0),
      status:       w.status ?? "paid",
      createdAt:    w.created_at ?? "",
      processedAt:  w.processed_at ?? null,
      provider:     typeof raw.provider === "string" ? raw.provider : null,
      providerTransferId: typeof raw.provider_transfer_id === "string" ? raw.provider_transfer_id : null,
      providerStatus:     typeof raw.provider_status === "string" ? raw.provider_status : null,
      pixKeyType:   pix?.pix_key_type   ?? null,
      pixKeyValue:  pix?.pix_key_value  ?? null,
      pixHolderName: isTalent ? (pix?.pix_holder_name ?? null) : (agencyPix?.pix_holder_name ?? null),
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
    contractsPaidValue,
    pendingValue: pendingVal,
    totalBookings: bookings.length,
    confirmedBookings: confirmedBookings.length,
    agencyWalletTotal: totalAgencyWalletBalance,
    talentWalletTotal: totalTalentWalletBalance,
    subscriptionRevenue: totalSubscriptionRevenue,
    minimumRequired,
    planBreakdown: {
      free: {
        commissionLabel: `${liveSettings.free.commission_percent.toFixed(0)}%`,
        priceLabel: liveSettings.free.price === 0 ? "Gratuito" : `R$ ${liveSettings.free.price.toLocaleString("pt-BR")}`,
      },
      pro: {
        commissionLabel: `${liveSettings.pro.commission_percent.toFixed(0)}%`,
        priceLabel: formatPlanPricing(liveSettings.pro).primaryPrice,
      },
      premium: {
        commissionLabel: `${liveSettings.premium.commission_percent.toFixed(0)}%`,
        priceLabel: formatPlanPricing(liveSettings.premium).primaryPrice,
      },
    },
  };

  const deposits: FinancesDeposit[] = (depositsData ?? []).map((d) => {
    const raw = d as Record<string, unknown>;
    const info = depositNameMap.get(d.user_id);
    return {
      id:            d.id,
      userName:      info?.name || (allAgencyNameMap.get(d.user_id) ?? "Usuário"),
      userRole:      info?.role ?? "unknown",
      amount:        Math.abs(d.amount ?? 0),
      status:        d.status ?? "pending",
      provider:      typeof raw.provider === "string" ? raw.provider : null,
      asaasPaymentId: typeof raw.asaas_payment_id === "string" ? raw.asaas_payment_id : null,
      description:   typeof raw.description === "string" ? raw.description : null,
      createdAt:     d.created_at ?? "",
      processedAt:   typeof raw.processed_at === "string" ? raw.processed_at : null,
    };
  });

  return (
    <AdminFinances
      summary={summary}
      bookings={bookings}
      contracts={contracts}
      planPayments={planPayments}
      subscriptions={subscriptions}
      withdrawals={withdrawals}
      agencyWallets={agencyWalletList}
      talentWallets={talentWalletList}
      deposits={deposits}
    />
  );
}
