import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import AdminDisputeDetail, {
  type AdminDisputeDetailData,
  type DisputeTimelineItem,
  type DisputeWalletTransaction,
} from "@/features/admin/AdminDisputeDetail";
import { buildContractFileAccessUrl } from "@/lib/contractFiles";
import {
  contractStatusLabel,
  contractStatusTone,
  getContractPaymentStatus,
  resolveContractAmounts,
} from "@/lib/contractStatus";
import { canAdminResolveDispute, type DisputeStatus } from "@/lib/disputePolicy";
import { batchValidateDisputes } from "@/lib/disputeValidation.server";
import {
  checkDisputeBlockingPayout,
  checkPaymentReleaseEligibility,
} from "@/lib/paymentReleasePolicy";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/requireAdmin";

export const metadata: Metadata = { title: "Administracao - Detalhe da disputa - BrisaHub" };

type PageProps = {
  params: Promise<{ id: string }>;
};

type ContractRow = {
  id: string;
  booking_id: string | null;
  job_id: string | null;
  workspace_id?: string | null;
  talent_id: string | null;
  talent_user_id?: string | null;
  agency_id: string | null;
  status: string;
  payment_status?: string | null;
  payment_amount: number | null;
  commission_amount: number | null;
  net_amount: number | null;
  job_date: string | null;
  job_time: string | null;
  job_description: string | null;
  signed_at: string | null;
  agency_signed_at?: string | null;
  deposit_paid_at: string | null;
  confirmed_at?: string | null;
  paid_at: string | null;
  contract_file_url: string | null;
  signed_contract_url: string | null;
  created_at: string | null;
};

function asNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function displayName(map: Map<string, string>, id: string | null | undefined, fallback: string) {
  if (!id) return fallback;
  return map.get(id) ?? `${fallback} ${id.slice(0, 8)}`;
}

function uniqueIds(ids: Array<string | null | undefined>) {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

function timelineToneForWallet(type: string): DisputeTimelineItem["tone"] {
  if (type === "payout") return "emerald";
  if (type === "refund") return "red";
  if (type === "escrow_lock") return "amber";
  if (type === "referral_commission") return "cyan";
  return "zinc";
}

function buildTimeline(params: {
  dispute: {
    id: string;
    status: DisputeStatus;
    created_at: string | null;
    resolved_at: string | null;
    resolution_note?: string | null;
  };
  contract: ContractRow | null;
  walletTransactions: DisputeWalletTransaction[];
  auditLogs: Array<{ id: string; action: string; created_at: string | null }>;
  payoutBlocked: boolean;
}): DisputeTimelineItem[] {
  const items: DisputeTimelineItem[] = [
    {
      id: `dispute-opened-${params.dispute.id}`,
      label: "Disputa aberta",
      description: "Contrato entrou no centro operacional de conflitos.",
      date: params.dispute.created_at,
      tone: "red",
    },
  ];

  if (params.contract?.signed_at) {
    items.push({
      id: `contract-signed-${params.contract.id}`,
      label: "Contrato assinado",
      description: "Assinatura do talento registrada no contrato.",
      date: params.contract.signed_at,
      tone: "zinc",
    });
  }

  const depositDate = params.contract?.deposit_paid_at ?? params.contract?.confirmed_at ?? null;
  if (depositDate) {
    items.push({
      id: `deposit-paid-${params.contract?.id}`,
      label: "Deposito pago",
      description: "Fundos foram colocados em custodia.",
      date: depositDate,
      tone: "amber",
    });
  }

  if (params.payoutBlocked) {
    items.push({
      id: `payout-blocked-${params.dispute.id}`,
      label: "Payout bloqueado",
      description: "Disputa aberta impede liberacao normal do pagamento.",
      date: params.dispute.created_at,
      tone: "red",
    });
  }

  for (const tx of params.walletTransactions) {
    items.push({
      id: `wallet-${tx.id}`,
      label: tx.type === "payout" ? "Payout registrado" : tx.type === "refund" ? "Reembolso registrado" : tx.type === "escrow_lock" ? "Custodia bloqueada" : "Ledger atualizado",
      description: tx.description ?? tx.type,
      date: tx.createdAt,
      tone: timelineToneForWallet(tx.type),
    });
  }

  for (const audit of params.auditLogs) {
    items.push({
      id: `audit-${audit.id}`,
      label: "Acao admin",
      description: audit.action,
      date: audit.created_at,
      tone: "cyan",
    });
  }

  if (params.dispute.resolved_at) {
    items.push({
      id: `dispute-resolved-${params.dispute.id}`,
      label: "Disputa encerrada",
      description: params.dispute.resolution_note ?? params.dispute.status,
      date: params.dispute.resolved_at,
      tone: "emerald",
    });
  }

  return items.sort((left, right) => {
    const a = left.date ? new Date(left.date).getTime() : 0;
    const b = right.date ? new Date(right.date).getTime() : 0;
    return a - b;
  });
}

export default async function AdminDisputeDetailPage({ params }: PageProps) {
  const auth = await requireAdmin();
  if (!("userId" in auth)) redirect("/");

  const { id } = await params;
  const supabase = createServerClient({ useServiceRole: true });

  const { data: dispute, error: disputeError } = await supabase
    .from("contract_disputes")
    .select(
      "id, contract_id, workspace_id, opened_by_user_id, reason, status, created_at, resolved_at, resolved_by_user_id, resolution_note, resolution_action, talent_amount, agency_refund_amount",
    )
    .eq("id", id)
    .maybeSingle();

  if (disputeError) {
    console.error("[admin/disputes/detail] dispute query error", disputeError.message);
    notFound();
  }

  if (!dispute) notFound();

  const { data: contractData } = await supabase
    .from("contracts")
    .select(
      "id, booking_id, job_id, workspace_id, talent_id, talent_user_id, agency_id, status, payment_status, payment_amount, commission_amount, net_amount, job_date, job_time, job_description, signed_at, agency_signed_at, deposit_paid_at, confirmed_at, paid_at, contract_file_url, signed_contract_url, created_at",
    )
    .eq("id", dispute.contract_id)
    .is("deleted_at", null)
    .maybeSingle();

  const contract = contractData as ContractRow | null;
  const contractWorkspaceId = contract?.workspace_id ?? dispute.workspace_id ?? null;

  const [
    jobRes,
    workspaceRes,
    walletRes,
    notesRes,
    auditRes,
  ] = await Promise.all([
    contract?.job_id
      ? supabase
          .from("jobs")
          .select("id, title, description, job_date, workspace_id, created_by_user_id, agency_id")
          .eq("id", contract.job_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    contractWorkspaceId
      ? supabase
          .from("premium_workspaces")
          .select("id, name, slug, owner_user_id")
          .eq("id", contractWorkspaceId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    contract?.id
      ? supabase
          .from("wallet_transactions")
          .select("id, user_id, type, amount, description, reference_id, idempotency_key, status, created_at")
          .or(`reference_id.eq.${contract.id},idempotency_key.eq.escrow_${contract.id}`)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
    supabase
      .from("contract_dispute_notes")
      .select("id, admin_user_id, visibility, body, created_at")
      .eq("dispute_id", id)
      .order("created_at", { ascending: false }),
    contract?.id
      ? supabase
          .from("admin_audit_logs")
          .select("id, action, entity_type, entity_id, created_at")
          .or(`entity_id.eq.${id},entity_id.eq.${contract.id}`)
          .order("created_at", { ascending: true })
          .limit(50)
      : supabase
          .from("admin_audit_logs")
          .select("id, action, entity_type, entity_id, created_at")
          .eq("entity_id", id)
          .order("created_at", { ascending: true })
          .limit(50),
  ]);

  const noteRows = notesRes.data ?? [];
  const walletTransactions: DisputeWalletTransaction[] = (walletRes.data ?? []).map((tx) => ({
    id: String(tx.id),
    userId: tx.user_id ?? null,
    type: String(tx.type ?? "payment"),
    amount: asNumber(tx.amount),
    description: tx.description ?? null,
    referenceId: tx.reference_id ?? null,
    idempotencyKey: tx.idempotency_key ?? null,
    status: tx.status ?? null,
    createdAt: String(tx.created_at),
  }));

  const userIds = uniqueIds([
    dispute.opened_by_user_id,
    dispute.resolved_by_user_id,
    contract?.agency_id,
    contract?.talent_id,
    contract?.talent_user_id,
    workspaceRes.data?.owner_user_id ?? null,
    ...noteRows.map((note) => note.admin_user_id as string | null),
  ]);

  const [profilesRes, agenciesRes, talentByUserRes, talentByIdRes, referralInviteRes] = await Promise.all([
    userIds.length
      ? supabase.from("profiles").select("id, full_name, role").in("id", userIds)
      : Promise.resolve({ data: [] }),
    contract?.agency_id
      ? supabase.from("agencies").select("id, user_id, company_name").eq("id", contract.agency_id).maybeSingle()
      : Promise.resolve({ data: null }),
    contract?.talent_user_id
      ? supabase.from("talent_profiles").select("id, user_id, full_name").eq("user_id", contract.talent_user_id).maybeSingle()
      : Promise.resolve({ data: null }),
    contract?.talent_id
      ? supabase.from("talent_profiles").select("id, user_id, full_name").eq("id", contract.talent_id).maybeSingle()
      : Promise.resolve({ data: null }),
    contract?.talent_user_id && contract?.job_id
      ? supabase
          .from("referral_invites")
          .select("id, status, commission_rate, commission_amount, commission_paid")
          .eq("referred_user_id", contract.talent_user_id)
          .eq("job_id", contract.job_id)
          .neq("status", "fraud_reported")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const profileNameMap = new Map<string, string>();
  for (const profile of profilesRes.data ?? []) {
    profileNameMap.set(profile.id, profile.full_name ?? profile.role ?? profile.id.slice(0, 8));
  }

  const agencyName =
    agenciesRes.data?.company_name
    ?? displayName(profileNameMap, contract?.agency_id, "Agencia");

  const talentRow = talentByUserRes.data ?? talentByIdRes.data ?? null;
  const talentName =
    talentRow?.full_name
    ?? displayName(profileNameMap, contract?.talent_user_id ?? contract?.talent_id, "Talento");

  const paymentStatusKey = contract ? getContractPaymentStatus(contract) : "pending";
  const amounts = contract ? resolveContractAmounts(contract) : { gross: 0, commission: 0, net: 0, commissionPct: 0 };
  const referralPaid = walletTransactions
    .filter((tx) => tx.type === "referral_commission")
    .reduce((sum, tx) => sum + tx.amount, 0);
  const pendingReferral =
    referralPaid === 0 && referralInviteRes.data && referralInviteRes.data.status !== "commission_paid"
      ? Math.round(amounts.gross * asNumber(referralInviteRes.data.commission_rate ?? 0.02) * 100) / 100
      : null;

  // Integrity validation using already-loaded contract + job data — at most 2 extra queries.
  type IntegrityContractRow = { id: string; workspace_id: string | null; agency_id: string | null; talent_id: string | null; talent_user_id: string | null; job_id: string | null; status: string | null };
  const integrityContractMap = new Map<string, IntegrityContractRow>();
  if (contract) {
    integrityContractMap.set(contract.id, {
      id: contract.id,
      workspace_id: contract.workspace_id ?? null,
      agency_id: contract.agency_id ?? null,
      talent_id: contract.talent_id ?? null,
      talent_user_id: (contract as { talent_user_id?: string | null }).talent_user_id ?? null,
      job_id: contract.job_id ?? null,
      status: contract.status ?? null,
    });
  }
  const jobEntry = jobRes.data
    ? { id: jobRes.data.id, workspace_id: (jobRes.data as { workspace_id?: string | null }).workspace_id ?? null }
    : null;
  const integrityJobMap = jobEntry ? new Map([[jobEntry.id, jobEntry]]) : new Map<string, { id: string; workspace_id: string | null }>();
  const validationMap = await batchValidateDisputes(
    supabase,
    [{ id, contract_id: dispute.contract_id, workspace_id: (dispute as { workspace_id?: string | null }).workspace_id ?? null }],
    integrityContractMap,
    integrityJobMap,
  );
  const integrityResult = validationMap.get(id) ?? { isValid: true, scope: "unknown" as const, invalidReasons: [], disputeId: id };
  const resolveCheck = canAdminResolveDispute(dispute.status as DisputeStatus, integrityResult);
  const canResolve = resolveCheck.allowed;

  const hasEscrowLock = walletTransactions.some((tx) => tx.type === "escrow_lock");
  const escrowAmount = contract?.status === "confirmed" && (hasEscrowLock || canResolve) ? amounts.gross : 0;

  const releaseCheck = contract
    ? checkPaymentReleaseEligibility({
        status: contract.status,
        job_date: contract.job_date,
        confirmed_at: contract.confirmed_at ?? null,
      })
    : { eligible: false, reason: "Contrato nao encontrado." };
  const disputeBlock = checkDisputeBlockingPayout(canResolve ? { status: dispute.status as DisputeStatus } : null);

  const auditRows = (auditRes.data ?? []).map((row) => ({
    id: String(row.id),
    action: String(row.action),
    created_at: row.created_at ?? null,
  }));

  const data: AdminDisputeDetailData = {
    dispute: {
      id: dispute.id,
      status: dispute.status as DisputeStatus,
      reason: dispute.reason ?? "",
      openedAt: dispute.created_at ?? "",
      openedByName: displayName(profileNameMap, dispute.opened_by_user_id, "Admin"),
      resolvedAt: dispute.resolved_at ?? null,
      resolutionNote: dispute.resolution_note ?? null,
      resolutionAction: dispute.resolution_action ?? null,
      talentAmount: dispute.talent_amount == null ? null : asNumber(dispute.talent_amount),
      agencyRefundAmount: dispute.agency_refund_amount == null ? null : asNumber(dispute.agency_refund_amount),
    },
    context: {
      jobTitle: jobRes.data?.title ?? contract?.job_description ?? "Vaga sem titulo",
      jobDescription: jobRes.data?.description ?? contract?.job_description ?? null,
      agencyName,
      talentName,
      workspaceName: workspaceRes.data?.name ?? null,
      isPremium: Boolean(contractWorkspaceId),
    },
    contract: contract
      ? {
          id: contract.id,
          status: contract.status,
          paymentStatus: contract.payment_status ?? null,
          statusLabel: contractStatusLabel(paymentStatusKey),
          statusTone: contractStatusTone(paymentStatusKey),
          paymentStatusKey,
          gross: amounts.gross,
          platformFee: amounts.commission,
          referralDeduction: referralPaid,
          pendingReferralDeduction: pendingReferral,
          netTalentAmount: amounts.net,
          escrowAmount,
          signedContractUrl: contract.signed_contract_url ? buildContractFileAccessUrl(contract.id, "signed") : null,
          originalContractUrl: contract.contract_file_url ? buildContractFileAccessUrl(contract.id, "original") : null,
          jobDate: contract.job_date ?? jobRes.data?.job_date ?? null,
          jobTime: contract.job_time ?? null,
          createdAt: contract.created_at ?? null,
          signedAt: contract.signed_at ?? null,
          depositPaidAt: contract.deposit_paid_at ?? contract.confirmed_at ?? null,
          paidAt: contract.paid_at ?? null,
        }
      : null,
    payoutEligibility: {
      eligible: releaseCheck.eligible,
      reason: releaseCheck.reason ?? null,
      blocked: disputeBlock.blocked,
      blockReason: disputeBlock.reason ?? null,
    },
    walletTransactions,
    timeline: buildTimeline({
      dispute: {
        id: dispute.id,
        status: dispute.status as DisputeStatus,
        created_at: dispute.created_at ?? null,
        resolved_at: dispute.resolved_at ?? null,
        resolution_note: dispute.resolution_note ?? null,
      },
      contract,
      walletTransactions,
      auditLogs: auditRows,
      payoutBlocked: disputeBlock.blocked,
    }),
    notes: noteRows.map((note) => ({
      id: String(note.id),
      adminName: displayName(profileNameMap, note.admin_user_id as string | null, "Admin"),
      visibility: note.visibility === "public" ? "public" : "internal",
      body: String(note.body ?? ""),
      createdAt: String(note.created_at),
    })),
    canResolve,
    isValid: integrityResult.isValid,
    invalidReasons: integrityResult.invalidReasons,
  };

  return <AdminDisputeDetail data={data} />;
}
