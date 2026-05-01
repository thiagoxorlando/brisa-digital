import type Stripe from "stripe";
import { createServerClient } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { getStripeConnectStatusForUser, syncStripeConnectAccountStatus } from "@/lib/stripeConnect";

type Supabase = ReturnType<typeof createServerClient>;

type StripeWithdrawalParams = {
  supabase: Supabase;
  userId: string;
  role: "agency" | "talent";
  amount: number;
  stripeAccountId: string;
};

type FundingAllocation = {
  allocation_id: string;
  funding_source_id: string;
  source_wallet_transaction_id: string;
  stripe_charge_id: string;
  allocated_amount: number;
  transfer_id: string | null;
};

type StripeTransferRecord = {
  allocationId: string;
  fundingSourceId: string;
  sourceWalletTransactionId: string;
  stripeChargeId: string;
  amount: number;
  transferId: string;
};

type StripeWithdrawalResult = {
  txId: string;
  provider: "stripe";
  providerStatus: string;
  status: "processing" | "paid";
  payoutId: string;
  transferIds: string[];
};

export type StripeAutomaticWithdrawalReadiness = {
  ready: boolean;
  publicState: "unconnected" | "review" | "processing" | "available" | "blocked";
  publicMessage: string | null;
  exactReason: string | null;
  walletBalance: number;
  walletOk: boolean;
  stripeAccountOk: boolean;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
  transfersActive: boolean;
  bankReady: boolean;
  sourceFundsAvailable: number;
  sourceFundsOk: boolean;
  platformBalanceOk: boolean;
  stripeAccountId: string | null;
  lastWithdrawalStatus: string | null;
  lastWithdrawalProviderStatus: string | null;
};

export class StripeWithdrawalError extends Error {
  txId: string | null;
  restorable: boolean;
  stage: "precheck" | "request" | "transfer" | "payout";
  userMessage: string | null;

  constructor(message: string, options?: {
    txId?: string | null;
    restorable?: boolean;
    stage?: "precheck" | "request" | "transfer" | "payout";
    userMessage?: string | null;
  }) {
    super(message);
    this.name = "StripeWithdrawalError";
    this.txId = options?.txId ?? null;
    this.restorable = options?.restorable ?? false;
    this.stage = options?.stage ?? "request";
    this.userMessage = options?.userMessage ?? null;
  }
}

const SUPPORT_MESSAGE = "Saque automático indisponível para este saldo. Entre em contato com o suporte.";

function amountToCents(amount: number) {
  return Math.round(amount * 100);
}

function amountFromCents(amount: number) {
  return Math.round(amount) / 100;
}

function getAvailableStripeBalanceAmount(balance: Stripe.Balance, currency: string) {
  return (balance.available ?? [])
    .filter((entry) => entry.currency?.toLowerCase() === currency.toLowerCase())
    .reduce((sum, entry) => sum + (entry.amount ?? 0), 0);
}

function getExternalAccountCount(account: Stripe.Account) {
  const externalAccounts = (account as Stripe.Account & {
    external_accounts?: { data?: Array<{ id: string }>; total_count?: number };
  }).external_accounts;

  if (Array.isArray(externalAccounts?.data)) return externalAccounts.data.length;
  if (typeof externalAccounts?.total_count === "number") return externalAccounts.total_count;
  return 0;
}

function isStripeInsufficientBalanceError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const stripeError = error as Stripe.StripeRawError & { raw?: { code?: string; decline_code?: string } };
  const candidates = [
    stripeError.code,
    stripeError.decline_code,
    stripeError.raw?.code,
    stripeError.raw?.decline_code,
    stripeError.message,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    candidates.includes("balance_insufficient")
    || candidates.includes("insufficient_funds")
    || candidates.includes("insufficient balance")
    || candidates.includes("not enough funds")
  );
}

function normalizeAllocations(value: unknown): FundingAllocation[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const allocatedAmount = Number(row.allocated_amount ?? 0);
      const allocationId = typeof row.allocation_id === "string" ? row.allocation_id : null;
      const fundingSourceId = typeof row.funding_source_id === "string" ? row.funding_source_id : null;
      const sourceWalletTransactionId = typeof row.source_wallet_transaction_id === "string" ? row.source_wallet_transaction_id : null;
      const stripeChargeId = typeof row.stripe_charge_id === "string" ? row.stripe_charge_id : null;

      if (!allocationId || !fundingSourceId || !sourceWalletTransactionId || !stripeChargeId || allocatedAmount <= 0) {
        return null;
      }

      return {
        allocation_id: allocationId,
        funding_source_id: fundingSourceId,
        source_wallet_transaction_id: sourceWalletTransactionId,
        stripe_charge_id: stripeChargeId,
        allocated_amount: allocatedAmount,
        transfer_id: typeof row.transfer_id === "string" ? row.transfer_id : null,
      } satisfies FundingAllocation;
    })
    .filter((item): item is FundingAllocation => Boolean(item));
}

async function getStripeFundedWithdrawableBalance(supabase: Supabase, userId: string) {
  const { data, error } = await supabase.rpc("get_auto_withdrawable_balance", {
    p_user_id: userId,
  });

  if (error) {
    console.error("[withdrawal stripe] funding source lookup failed", {
      userId,
      error: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new StripeWithdrawalError("funding_source_lookup_failed", {
      stage: "precheck",
      userMessage: SUPPORT_MESSAGE,
    });
  }

  return Number(data ?? 0);
}

async function getOpenWithdrawalAllocations(supabase: Supabase, withdrawalTransactionId: string) {
  const { data, error } = await supabase
    .from("wallet_withdrawal_source_allocations")
    .select("id, funding_source_id, source_wallet_transaction_id, stripe_charge_id, allocated_amount, transfer_id")
    .eq("withdrawal_transaction_id", withdrawalTransactionId)
    .is("restored_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[withdrawal stripe] allocation lookup failed", {
      withdrawalTransactionId,
      error: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new StripeWithdrawalError("allocation_lookup_failed", {
      txId: withdrawalTransactionId,
      stage: "transfer",
      userMessage: SUPPORT_MESSAGE,
    });
  }

  return normalizeAllocations((data ?? []).map((row) => ({
    allocation_id: row.id,
    funding_source_id: row.funding_source_id,
    source_wallet_transaction_id: row.source_wallet_transaction_id,
    stripe_charge_id: row.stripe_charge_id,
    allocated_amount: row.allocated_amount,
    transfer_id: row.transfer_id,
  })));
}

async function reverseTransfersIfPossible({
  stripe,
  txId,
  createdTransfers,
}: {
  stripe: Stripe;
  txId: string;
  createdTransfers: StripeTransferRecord[];
}) {
  const reversedTransferIds: string[] = [];
  const reversalFailures: Array<{ transferId: string; reason: string }> = [];

  for (const transfer of [...createdTransfers].reverse()) {
    try {
      await stripe.transfers.createReversal(
        transfer.transferId,
        {
          metadata: {
            wallet_transaction_id: txId,
            reason: "withdrawal_recovery",
          },
        },
        {
          idempotencyKey: `wallet_withdrawal_transfer_reversal:${txId}:${transfer.transferId}`,
        },
      );
      reversedTransferIds.push(transfer.transferId);
    } catch (error) {
      reversalFailures.push({
        transferId: transfer.transferId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    fullyReversed: reversalFailures.length === 0,
    reversedTransferIds,
    reversalFailures,
  };
}

async function failWithdrawalWithRestoredSources({
  supabase,
  txId,
  reason,
  providerStatus,
}: {
  supabase: Supabase;
  txId: string;
  reason: string;
  providerStatus?: string;
}) {
  await supabase.rpc("restore_wallet_withdrawal_sources", {
    p_withdrawal_transaction_id: txId,
  });

  await supabase.rpc("fail_wallet_withdrawal", {
    p_transaction_id: txId,
    p_reason: reason,
    p_provider_status: providerStatus ?? "failed",
  });

  await supabase
    .from("wallet_transactions")
    .update({
      failure_reason: reason,
      needs_admin_review: false,
    })
    .eq("id", txId);
}

async function markWithdrawalNeedsReview({
  supabase,
  txId,
  reason,
  payoutId,
  createdTransfers,
}: {
  supabase: Supabase;
  txId: string;
  reason: string;
  payoutId?: string | null;
  createdTransfers: StripeTransferRecord[];
}) {
  const firstTransferId = createdTransfers[0]?.transferId ?? null;

  await supabase
    .from("wallet_transactions")
    .update({
      status: "failed",
      provider: "stripe",
      provider_status: "failed",
      provider_transfer_id: firstTransferId,
      provider_payout_id: payoutId ?? null,
      processed_at: new Date().toISOString(),
      failure_reason: reason,
      admin_note: "Falha apos movimentacao Stripe. Conciliacao manual necessaria.",
      needs_admin_review: true,
    })
    .eq("id", txId);
}

export async function checkStripeAutomaticWithdrawalReadiness({
  supabase,
  userId,
  amount,
}: {
  supabase: Supabase;
  userId: string;
  amount: number;
}): Promise<StripeAutomaticWithdrawalReadiness> {
  const normalizedAmount = Math.max(0, Number.isFinite(amount) ? amount : 0);
  const stripe = getStripe();

  const [{ data: profile }, connectStatus, { data: lastStripeWithdrawal }] = await Promise.all([
    supabase
      .from("profiles")
      .select("wallet_balance")
      .eq("id", userId)
      .maybeSingle(),
    getStripeConnectStatusForUser(supabase, userId),
    supabase
      .from("wallet_transactions")
      .select("status, provider_status")
      .eq("user_id", userId)
      .eq("type", "withdrawal")
      .eq("provider", "stripe")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const walletBalance = Number(profile?.wallet_balance ?? 0);
  const walletOk = normalizedAmount <= 0 ? walletBalance >= 0 : walletBalance >= normalizedAmount;
  const lastWithdrawalStatus = lastStripeWithdrawal?.status ?? null;
  const lastWithdrawalProviderStatus = lastStripeWithdrawal?.provider_status ?? null;
  const isProcessing = lastWithdrawalStatus === "processing" || lastWithdrawalProviderStatus === "pending" || lastWithdrawalProviderStatus === "in_transit";

  if (!connectStatus?.stripe_account_id) {
    return {
      ready: false,
      publicState: "unconnected",
      publicMessage: "Saque automático indisponível — fale com o suporte",
      exactReason: "conta Stripe nao conectada",
      walletBalance,
      walletOk,
      stripeAccountOk: false,
      detailsSubmitted: false,
      payoutsEnabled: false,
      transfersActive: false,
      bankReady: false,
      sourceFundsAvailable: 0,
      sourceFundsOk: false,
      platformBalanceOk: false,
      stripeAccountId: null,
      lastWithdrawalStatus,
      lastWithdrawalProviderStatus,
    };
  }

  console.log("[withdrawal stripe] checking connected account", {
    userId,
    stripeAccountId: connectStatus.stripe_account_id,
    amount: normalizedAmount,
  });

  const connectedAccount = await stripe.accounts.retrieve(connectStatus.stripe_account_id);
  await syncStripeConnectAccountStatus(supabase, connectedAccount);

  const payoutsEnabled = connectedAccount.payouts_enabled ?? false;
  const detailsSubmitted = connectedAccount.details_submitted ?? false;
  const transfersActive = connectedAccount.capabilities?.transfers === "active";
  const currentlyDue = connectedAccount.requirements?.currently_due ?? [];
  const externalAccountCount = getExternalAccountCount(connectedAccount);
  const bankReady = externalAccountCount > 0 && !currentlyDue.includes("external_account");

  console.log("[withdrawal stripe] checking platform balance", {
    userId,
    amount: normalizedAmount,
    stripeAccountId: connectStatus.stripe_account_id,
  });

  const platformBalance = await stripe.balance.retrieve();
  const platformAvailableBalanceBrl = getAvailableStripeBalanceAmount(platformBalance, "brl");
  const platformBalanceOk = platformAvailableBalanceBrl >= amountToCents(normalizedAmount);
  const sourceFundsAvailable = await getStripeFundedWithdrawableBalance(supabase, userId);
  const sourceFundsOk = normalizedAmount <= 0 ? sourceFundsAvailable > 0 : sourceFundsAvailable >= normalizedAmount;

  console.log("[withdrawal stripe] platform balance", {
    userId,
    amount: normalizedAmount,
    availableBrl: amountFromCents(platformAvailableBalanceBrl),
    sourceFundsAvailable,
  });

  let exactReason: string | null = null;
  let publicState: StripeAutomaticWithdrawalReadiness["publicState"] = "available";
  let publicMessage: string | null = "Saque automático disponível";

  if (!detailsSubmitted) {
    exactReason = "dados da conta Stripe ainda em analise";
    publicState = "review";
    publicMessage = "Conectado";
  } else if (!payoutsEnabled) {
    exactReason = "payouts Stripe ainda nao habilitados";
    publicState = "review";
    publicMessage = "Em análise";
  } else if (!transfersActive) {
    exactReason = "transferencias Stripe ainda nao habilitadas";
    publicState = "review";
    publicMessage = "Em análise";
  } else if (!bankReady) {
    exactReason = "conta Stripe sem banco configurado";
    publicState = "review";
    publicMessage = "Conectado";
  } else if (!walletOk) {
    exactReason = "saldo em carteira insuficiente";
    publicState = "blocked";
    publicMessage = "Saque automático indisponível — fale com o suporte";
  } else if (!sourceFundsOk) {
    exactReason = "insufficient Stripe-funded withdrawable balance";
    publicState = "blocked";
    publicMessage = "Saque automático indisponível — fale com o suporte";
  } else if (!platformBalanceOk) {
    exactReason = "saldo Stripe da plataforma insuficiente";
    publicState = "blocked";
    publicMessage = "Saque automático indisponível — fale com o suporte";
  } else if (isProcessing) {
    publicState = "processing";
    publicMessage = "Saque automático em processamento";
  }

  return {
    ready: !exactReason,
    publicState,
    publicMessage,
    exactReason,
    walletBalance,
    walletOk,
    stripeAccountOk: true,
    detailsSubmitted,
    payoutsEnabled,
    transfersActive,
    bankReady,
    sourceFundsAvailable,
    sourceFundsOk,
    platformBalanceOk,
    stripeAccountId: connectStatus.stripe_account_id,
    lastWithdrawalStatus,
    lastWithdrawalProviderStatus,
  };
}

export async function createAutomaticStripeWithdrawal({
  supabase,
  userId,
  role,
  amount,
  stripeAccountId,
}: StripeWithdrawalParams): Promise<StripeWithdrawalResult> {
  const stripe = getStripe();
  const amountInCents = amountToCents(amount);

  const { data: txId, error: rpcError } = await supabase.rpc("request_wallet_withdrawal", {
    p_user_id: userId,
    p_amount: amount,
    p_kind: role,
  });

  if (rpcError || !txId) {
    throw new StripeWithdrawalError(rpcError?.message ?? "request_wallet_withdrawal_failed", { stage: "request" });
  }

  await supabase
    .from("wallet_transactions")
    .update({
      provider: "stripe",
      status: "processing",
      provider_status: "allocating_sources",
      admin_note: null,
      failure_reason: null,
      needs_admin_review: false,
    })
    .eq("id", txId);

  const { data: allocationResultRaw, error: allocationError } = await supabase.rpc("allocate_wallet_withdrawal_sources", {
    p_user_id: userId,
    p_withdrawal_transaction_id: txId,
    p_amount: amount,
  });

  if (allocationError) {
    await supabase.rpc("fail_wallet_withdrawal", {
      p_transaction_id: txId,
      p_reason: `allocation failed: ${allocationError.message}`,
      p_provider_status: "failed",
    });

    throw new StripeWithdrawalError(allocationError.message, {
      txId,
      restorable: true,
      stage: "transfer",
      userMessage: SUPPORT_MESSAGE,
    });
  }

  const allocationResult = allocationResultRaw as {
    ok?: boolean;
    error?: string;
    allocations?: unknown;
  } | null;

  const allocations = normalizeAllocations(allocationResult?.allocations);
  if (!allocationResult?.ok || allocations.length === 0) {
    const internalReason = allocationResult?.error ?? "missing funding source allocation";
    console.error("[withdrawal stripe] failed before deduction", {
      txId,
      userId,
      role,
      amount,
      reason: internalReason,
    });

    await supabase.rpc("fail_wallet_withdrawal", {
      p_transaction_id: txId,
      p_reason: internalReason,
      p_provider_status: "failed",
    });

    throw new StripeWithdrawalError(internalReason, {
      txId,
      restorable: true,
      stage: "transfer",
      userMessage: SUPPORT_MESSAGE,
    });
  }

  const createdTransfers: StripeTransferRecord[] = [];
  let payoutId: string | null = null;

  try {
    await supabase
      .from("wallet_transactions")
      .update({
        provider_status: "creating_transfers",
      })
      .eq("id", txId);

    for (const allocation of allocations) {
      const transfer = await stripe.transfers.create(
        {
          amount: amountToCents(allocation.allocated_amount),
          currency: "brl",
          destination: stripeAccountId,
          source_transaction: allocation.stripe_charge_id,
          metadata: {
            wallet_transaction_id: txId,
            withdrawal_transaction_id: txId,
            source_wallet_transaction_id: allocation.source_wallet_transaction_id,
            user_id: userId,
            kind: role,
          },
        },
        {
          idempotencyKey: `wallet_withdrawal_transfer:${txId}:${allocation.allocation_id}`,
        },
      );

      console.log("[withdrawal stripe] transfer created", {
        txId,
        userId,
        role,
        transferId: transfer.id,
        sourceWalletTransactionId: allocation.source_wallet_transaction_id,
        stripeChargeId: allocation.stripe_charge_id,
        amount: allocation.allocated_amount,
      });

      createdTransfers.push({
        allocationId: allocation.allocation_id,
        fundingSourceId: allocation.funding_source_id,
        sourceWalletTransactionId: allocation.source_wallet_transaction_id,
        stripeChargeId: allocation.stripe_charge_id,
        amount: allocation.allocated_amount,
        transferId: transfer.id,
      });

      await supabase
        .from("wallet_withdrawal_source_allocations")
        .update({ transfer_id: transfer.id })
        .eq("id", allocation.allocation_id);
    }

    await supabase
      .from("wallet_transactions")
      .update({
        provider: "stripe",
        status: "processing",
        provider_transfer_id: createdTransfers[0]?.transferId ?? null,
        provider_status: "creating_payout",
        reference_id: createdTransfers[0]?.transferId ?? null,
        failure_reason: null,
        needs_admin_review: false,
      })
      .eq("id", txId);

    const payout = await stripe.payouts.create(
      {
        amount: amountInCents,
        currency: "brl",
        metadata: {
          wallet_transaction_id: txId,
          withdrawal_transaction_id: txId,
          user_id: userId,
          kind: role,
          user_role: role,
        },
      },
      {
        stripeAccount: stripeAccountId,
        idempotencyKey: `wallet_withdrawal_payout:${txId}`,
      },
    );

    payoutId = payout.id;

    console.log("[withdrawal stripe] payout created", {
      txId,
      userId,
      role,
      payoutId,
      payoutStatus: payout.status ?? "pending",
      transferIds: createdTransfers.map((item) => item.transferId),
      amount,
    });

    const payoutStatus = payout.status ?? "pending";
    if (payoutStatus === "failed") {
      throw new StripeWithdrawalError("payout_failed_immediately", {
        txId,
        stage: "payout",
        userMessage: SUPPORT_MESSAGE,
      });
    }

    await supabase
      .from("wallet_transactions")
      .update({
        provider: "stripe",
        status: payoutStatus === "paid" ? "paid" : "processing",
        provider_transfer_id: createdTransfers[0]?.transferId ?? null,
        provider_payout_id: payout.id,
        provider_status: payoutStatus,
        reference_id: createdTransfers[0]?.transferId ?? null,
        processed_at: payoutStatus === "paid" ? new Date().toISOString() : null,
        failure_reason: null,
        needs_admin_review: false,
      })
      .eq("id", txId);

    if (payoutStatus === "paid") {
      await supabase.rpc("mark_wallet_withdrawal_paid", {
        p_transaction_id: txId,
        p_provider: "stripe",
        p_admin_note: "Stripe payout confirmado imediatamente.",
      });
    }

    return {
      txId,
      provider: "stripe",
      providerStatus: payoutStatus,
      status: payoutStatus === "paid" ? "paid" : "processing",
      payoutId: payout.id,
      transferIds: createdTransfers.map((item) => item.transferId),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stripeBalanceInsufficient = isStripeInsufficientBalanceError(error);

    if (createdTransfers.length === 0) {
      console.error("[withdrawal stripe] failed before deduction", {
        txId,
        userId,
        role,
        reason: message,
        isStripeBalanceInsufficient: stripeBalanceInsufficient,
      });

      await failWithdrawalWithRestoredSources({
        supabase,
        txId,
        reason: message,
        providerStatus: "failed",
      });

      throw new StripeWithdrawalError(message, {
        txId,
        restorable: true,
        stage: "transfer",
        userMessage: stripeBalanceInsufficient ? SUPPORT_MESSAGE : SUPPORT_MESSAGE,
      });
    }

    console.error("[withdrawal stripe] failed after transfer needs review", {
      txId,
      userId,
      role,
      payoutId,
      transferIds: createdTransfers.map((item) => item.transferId),
      reason: message,
    });

    const reversal = await reverseTransfersIfPossible({
      stripe,
      txId,
      createdTransfers,
    });

    if (reversal.fullyReversed) {
      await failWithdrawalWithRestoredSources({
        supabase,
        txId,
        reason: payoutId
          ? `Stripe payout failed and transfers were reversed: ${message}`
          : `Stripe transfer failed and transfers were reversed: ${message}`,
        providerStatus: "failed",
      });

      throw new StripeWithdrawalError(message, {
        txId,
        restorable: true,
        stage: payoutId ? "payout" : "transfer",
        userMessage: SUPPORT_MESSAGE,
      });
    }

    const reviewReason = `${message}. reversal_failures=${reversal.reversalFailures.map((item) => `${item.transferId}:${item.reason}`).join(" | ")}`;

    await markWithdrawalNeedsReview({
      supabase,
      txId,
      reason: reviewReason,
      payoutId,
      createdTransfers,
    });

    throw new StripeWithdrawalError(message, {
      txId,
      restorable: false,
      stage: payoutId ? "payout" : "transfer",
      userMessage: SUPPORT_MESSAGE,
    });
  }
}

export async function restoreStripeWithdrawalAfterPayoutFailure({
  supabase,
  withdrawalTransactionId,
  payoutId,
  failureReason,
}: {
  supabase: Supabase;
  withdrawalTransactionId: string;
  payoutId: string;
  failureReason: string;
}) {
  const stripe = getStripe();
  const allocations = await getOpenWithdrawalAllocations(supabase, withdrawalTransactionId);
  const createdTransfers = allocations
    .filter((allocation) => allocation.transfer_id)
    .map((allocation) => ({
      allocationId: allocation.allocation_id,
      fundingSourceId: allocation.funding_source_id,
      sourceWalletTransactionId: allocation.source_wallet_transaction_id,
      stripeChargeId: allocation.stripe_charge_id,
      amount: allocation.allocated_amount,
      transferId: allocation.transfer_id as string,
    }));

  const reversal = await reverseTransfersIfPossible({
    stripe,
    txId: withdrawalTransactionId,
    createdTransfers,
  });

  if (reversal.fullyReversed) {
    await failWithdrawalWithRestoredSources({
      supabase,
      txId: withdrawalTransactionId,
      reason: `Stripe payout failed and transfers were reversed: ${failureReason}`,
      providerStatus: "failed",
    });

    return { restored: true, needsAdminReview: false };
  }

  const reviewReason = `${failureReason}. reversal_failures=${reversal.reversalFailures.map((item) => `${item.transferId}:${item.reason}`).join(" | ")}`;

  await markWithdrawalNeedsReview({
    supabase,
    txId: withdrawalTransactionId,
    reason: reviewReason,
    payoutId,
    createdTransfers,
  });

  return { restored: false, needsAdminReview: true };
}
