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

type StripeWithdrawalResult = {
  txId: string;
  provider: "stripe";
  providerStatus: string;
  status: "processing" | "paid";
  payoutId: string;
  transferId: string;
};

export type StripeAutomaticWithdrawalReadiness = {
  ready: boolean;
  exactReason: string | null;
  walletBalance: number;
  walletOk: boolean;
  stripeAccountOk: boolean;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
  transfersActive: boolean;
  bankReady: boolean;
  platformBalanceOk: boolean;
  platformAvailableBalanceBrl: number;
  stripeAccountId: string | null;
  stripeAccountCountry: string | null;
  needsSourceTransactionForBrazil: boolean;
  lastWithdrawalStatus: string | null;
  lastWithdrawalProviderStatus: string | null;
};

export class StripeWithdrawalError extends Error {
  txId: string | null;
  restorable: boolean;
  stage: "precheck" | "request" | "transfer" | "payout";
  userMessage: string | null;
  isStripeBalanceInsufficient: boolean;

  constructor(message: string, options?: {
    txId?: string | null;
    restorable?: boolean;
    stage?: "precheck" | "request" | "transfer" | "payout";
    userMessage?: string | null;
    isStripeBalanceInsufficient?: boolean;
  }) {
    super(message);
    this.name = "StripeWithdrawalError";
    this.txId = options?.txId ?? null;
    this.restorable = options?.restorable ?? false;
    this.stage = options?.stage ?? "request";
    this.userMessage = options?.userMessage ?? null;
    this.isStripeBalanceInsufficient = options?.isStripeBalanceInsufficient ?? false;
  }
}

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

function normalizeAutomaticWithdrawalReason(reason: string) {
  return `Saque automático indisponível: ${reason}`;
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

  if (!connectStatus?.stripe_account_id) {
    return {
      ready: false,
      exactReason: "conta Stripe nao conectada",
      walletBalance,
      walletOk,
      stripeAccountOk: false,
      chargesEnabled: false,
      detailsSubmitted: false,
      payoutsEnabled: false,
      transfersActive: false,
      bankReady: false,
      platformBalanceOk: false,
      platformAvailableBalanceBrl: 0,
      stripeAccountId: null,
      stripeAccountCountry: null,
      needsSourceTransactionForBrazil: false,
      lastWithdrawalStatus: lastStripeWithdrawal?.status ?? null,
      lastWithdrawalProviderStatus: lastStripeWithdrawal?.provider_status ?? null,
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
  const chargesEnabled = connectedAccount.charges_enabled ?? false;
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
  const needsSourceTransactionForBrazil = connectedAccount.country === "BR";

  console.log("[withdrawal stripe] platform balance", {
    userId,
    amount: normalizedAmount,
    availableBrl: amountFromCents(platformAvailableBalanceBrl),
    available: platformBalance.available,
    pending: platformBalance.pending,
  });

  let exactReason: string | null = null;

  if (!walletOk) {
    exactReason = "saldo em carteira insuficiente";
  } else if (!payoutsEnabled) {
    exactReason = "payouts Stripe ainda nao habilitados";
  } else if (!transfersActive) {
    exactReason = "transferencias Stripe ainda nao habilitadas";
  } else if (!bankReady) {
    exactReason = "conta Stripe sem banco configurado";
  } else if (needsSourceTransactionForBrazil) {
    exactReason = "transferencia Stripe Connect no Brasil exige source_transaction vinculado a uma cobranca";
  } else if (!platformBalanceOk) {
    exactReason = "saldo Stripe da plataforma insuficiente";
  }

  return {
    ready: !exactReason,
    exactReason,
    walletBalance,
    walletOk,
    stripeAccountOk: true,
    chargesEnabled,
    detailsSubmitted,
    payoutsEnabled,
    transfersActive,
    bankReady,
    platformBalanceOk,
    platformAvailableBalanceBrl: amountFromCents(platformAvailableBalanceBrl),
    stripeAccountId: connectStatus.stripe_account_id,
    stripeAccountCountry: connectedAccount.country ?? null,
    needsSourceTransactionForBrazil,
    lastWithdrawalStatus: lastStripeWithdrawal?.status ?? null,
    lastWithdrawalProviderStatus: lastStripeWithdrawal?.provider_status ?? null,
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
      provider_status: "checking_transfer",
      admin_note: null,
      failure_reason: null,
      needs_admin_review: false,
    })
    .eq("id", txId);

  let transferId: string | null = null;

  try {
    const transfer = await stripe.transfers.create(
      {
        amount: amountInCents,
        currency: "brl",
        destination: stripeAccountId,
        metadata: {
          wallet_transaction_id: txId,
          user_id: userId,
          kind: role,
        },
      },
      {
        idempotencyKey: `wallet_withdrawal_transfer:${txId}`,
      },
    );

    transferId = transfer.id;

    console.log("[withdrawal stripe] transfer created", {
      txId,
      userId,
      role,
      transferId,
      stripeAccountId,
      amount,
    });

    await supabase
      .from("wallet_transactions")
      .update({
        provider: "stripe",
        status: "processing",
        provider_transfer_id: transfer.id,
        provider_status: "transfer_created",
        reference_id: transfer.id,
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
          transfer_id: transfer.id,
          user_id: userId,
          kind: role,
        },
      },
      {
        stripeAccount: stripeAccountId,
        idempotencyKey: `wallet_withdrawal_payout:${txId}`,
      },
    );

    console.log("[withdrawal stripe] payout created", {
      txId,
      userId,
      role,
      transferId: transfer.id,
      payoutId: payout.id,
      payoutStatus: payout.status ?? "pending",
      amount,
    });

    const payoutStatus = payout.status ?? "pending";

    await supabase
      .from("wallet_transactions")
      .update({
        provider: "stripe",
        status: payoutStatus === "paid" ? "paid" : "processing",
        provider_transfer_id: transfer.id,
        provider_payout_id: payout.id,
        provider_status: payoutStatus,
        reference_id: transfer.id,
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
      transferId: transfer.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (!transferId) {
      const stripeBalanceInsufficient = isStripeInsufficientBalanceError(error);

      console.error("[withdrawal stripe] failed before deduction", {
        txId,
        userId,
        role,
        reason: message,
        isStripeBalanceInsufficient: stripeBalanceInsufficient,
      });

      const { data: failResult } = await supabase.rpc("fail_wallet_withdrawal", {
        p_transaction_id: txId,
        p_reason: `Stripe transfer failed: ${message}`,
        p_provider_status: "failed",
      });

      await supabase
        .from("wallet_transactions")
        .update({
          failure_reason: message,
          needs_admin_review: false,
        })
        .eq("id", txId);

      throw new StripeWithdrawalError(message, {
        txId,
        restorable: Boolean(failResult),
        stage: "transfer",
        userMessage: stripeBalanceInsufficient
          ? normalizeAutomaticWithdrawalReason("saldo Stripe da plataforma insuficiente")
          : normalizeAutomaticWithdrawalReason("falha ao criar transferencia Stripe"),
        isStripeBalanceInsufficient: stripeBalanceInsufficient,
      });
    }

    console.error("[withdrawal stripe] failed after transfer needs review", {
      txId,
      userId,
      role,
      transferId,
      reason: message,
    });

    try {
      await stripe.transfers.createReversal(
        transferId,
        {
          metadata: {
            wallet_transaction_id: txId,
            reason: "payout_failed",
          },
        },
        {
          idempotencyKey: `wallet_withdrawal_transfer_reversal:${txId}`,
        },
      );

      await supabase.rpc("fail_wallet_withdrawal", {
        p_transaction_id: txId,
        p_reason: `Stripe payout failed and transfer was reversed: ${message}`,
        p_provider_status: "failed",
      });

      await supabase
        .from("wallet_transactions")
        .update({
          provider: "stripe",
          provider_transfer_id: transferId,
          failure_reason: message,
          needs_admin_review: false,
        })
        .eq("id", txId);

      throw new StripeWithdrawalError(message, {
        txId,
        restorable: true,
        stage: "payout",
        userMessage: normalizeAutomaticWithdrawalReason("falha no payout Stripe; saldo restaurado"),
      });
    } catch (reversalError) {
      const reversalMessage = reversalError instanceof Error ? reversalError.message : String(reversalError);

      await supabase
        .from("wallet_transactions")
        .update({
          provider: "stripe",
          status: "failed",
          provider_status: "failed",
          provider_transfer_id: transferId,
          processed_at: new Date().toISOString(),
          failure_reason: `${message}. Reversal error: ${reversalMessage}`,
          admin_note: `Stripe payout falhou apos a transferencia. Reconciliacao manual necessaria. Reversal error: ${reversalMessage}`,
          needs_admin_review: true,
        })
        .eq("id", txId);

      throw new StripeWithdrawalError(message, {
        txId,
        restorable: false,
        stage: "payout",
        userMessage: normalizeAutomaticWithdrawalReason("falha apos transferencia Stripe; revisao manual necessaria"),
      });
    }
  }
}
