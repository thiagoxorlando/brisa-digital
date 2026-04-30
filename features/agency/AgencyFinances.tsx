"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useRealtimeRefresh } from "@/lib/hooks/useRealtimeRefresh";
import { StripeConnectPayoutPanel } from "@/features/finance/StripeConnectPayoutPanel";

function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export type AgencyTransaction = {
  id: string;
  kind?: "booking" | "wallet";
  bookingId?: string | null;
  href?: string;
  talent: string;
  job: string;
  amount: number;
  status: string;
  date: string;
  description?: string;
  withdrawalStatus?: string | null;
  adminNote?: string | null;
  processedAt?: string | null;
  provider?: string | null;
  providerStatus?: string | null;
};

export type AgencyFinanceSummary = {
  totalSpent: number;
  pendingPayments: number;
  completedPayments: number;
  walletBalance?: number;
};

function getStripeWalletBannerFromLocation(): "pending" | "cancel" | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("stripe_wallet") === "success") return "pending";
  if (params.get("stripe_wallet") === "cancel") return "cancel";
  return null;
}

const PIX_TYPE_LABELS: Record<string, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  email: "E-mail",
  phone: "Telefone",
  random: "Chave aleatoria",
};

const STATUS_CLS: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  completed: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  confirmed: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  pending_payment: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
  pending: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
  cancelled: "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200",
  deposit: "bg-teal-50 text-teal-700 ring-1 ring-teal-100",
  payment: "bg-violet-50 text-violet-700 ring-1 ring-violet-100",
  withdrawal: "bg-blue-50 text-blue-700 ring-1 ring-blue-100",
  escrow_lock: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
  escrow_released: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  escrow_refunded: "bg-rose-50 text-rose-700 ring-1 ring-rose-100",
  refund: "bg-rose-50 text-rose-700 ring-1 ring-rose-100",
};

const STATUS_LABEL: Record<string, string> = {
  paid: "Pago",
  completed: "Pago",
  confirmed: "Reservado",
  pending_payment: "Aguardando pagamento",
  pending: "Pendente",
  cancelled: "Cancelado",
  deposit: "Deposito",
  payment: "Pagamento",
  withdrawal: "Saque",
  escrow_lock: "Custodia",
  escrow_released: "Liberado",
  escrow_refunded: "Estornado",
  refund: "Reembolso",
};

const WITHDRAWAL_STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  paid: "Pago",
  processing: "Processando",
  cancelled: "Cancelado",
  rejected: "Cancelado",
  failed: "Falhou",
};

function StatCard({ label, value, sub, stripe }: { label: string; value: string; sub?: string; stripe: string }) {
  return (
    <div className="bg-white rounded-[1.5rem] border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_14px_34px_rgba(7,17,13,0.06)] overflow-hidden">
      <div className={`h-[3px] bg-gradient-to-r ${stripe}`} />
      <div className="p-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">{label}</p>
        <p className="text-[2.05rem] font-black tracking-[-0.05em] text-zinc-950 leading-none">{value}</p>
        {sub && <p className="text-[12px] text-zinc-400 mt-1.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function AgencyFinances({
  summary,
  transactions,
  agencyPix,
  stripeConnected = false,
  withdrawalMinAmount,
}: {
  summary: AgencyFinanceSummary;
  transactions: AgencyTransaction[];
  agencyPix?: { pix_key_type: string | null; pix_key_value: string | null; pix_holder_name: string | null } | null;
  stripeConnected?: boolean;
  withdrawalMinAmount: number;
}) {
  const router = useRouter();

  const walletBalance = summary.walletBalance ?? 0;

  const { refreshing: walletRefreshing } = useRealtimeRefresh(
    [{ table: "wallet_transactions" }, { table: "profiles" }],
    () => router.refresh(),
  );

  const [stripeWalletBanner, setStripeWalletBanner] = useState<"pending" | "cancel" | null>(getStripeWalletBannerFromLocation);

  const [depositAmount, setDepositAmount] = useState("");
  const [depositLoading, setDepositLoading] = useState(false);
  const [depositError, setDepositError] = useState("");

  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawDone, setWithdrawDone] = useState(false);
  const [withdrawConfirming, setWithdrawConfirming] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawError, setWithdrawError] = useState("");
  const [withdrawInfo, setWithdrawInfo] = useState("");
  const [stripeReady, setStripeReady] = useState(stripeConnected);
  const [stripeReason, setStripeReason] = useState<string | null>(null);
  const [stripeState, setStripeState] = useState<"unconnected" | "connected" | "review" | "blocked" | "ready">(
    stripeConnected ? "ready" : "unconnected",
  );

  const [savedPix, setSavedPix] = useState(agencyPix ?? null);
  const [pixEditing, setPixEditing] = useState(false);
  const [pixKeyType, setPixKeyType] = useState(agencyPix?.pix_key_type ?? "cpf");
  const [pixKeyValue, setPixKeyValue] = useState(agencyPix?.pix_key_value ?? "");
  const [pixHolderName, setPixHolderName] = useState(agencyPix?.pix_holder_name ?? "");
  const [pixSaving, setPixSaving] = useState(false);
  const [pixError, setPixError] = useState("");
  const [pixSaved, setPixSaved] = useState(false);

  const hasPix = Boolean(savedPix?.pix_key_type && savedPix?.pix_key_value?.trim());
  const withdrawAmountNum = Math.round(Number(withdrawAmount) * 100) / 100;
  const canWithdraw = Boolean(
    stripeReady &&
    withdrawAmountNum >= withdrawalMinAmount &&
    withdrawAmountNum <= walletBalance,
  );
  const pendingWithdrawals = transactions.filter(
    (transaction) => transaction.withdrawalStatus === "pending" || transaction.withdrawalStatus === "processing",
  );
  const withdrawalHistory = transactions.filter(
    (transaction) => transaction.withdrawalStatus === "paid" || transaction.withdrawalStatus === "cancelled" || transaction.withdrawalStatus === "rejected",
  );

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(depositAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;

    setDepositLoading(true);
    setDepositError("");

    const res = await fetch("/api/payments/wallet-deposit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
    });
    const data = await res.json().catch(() => ({})) as {
      error?: string;
      url?: string;
      session_id?: string;
      amount?: number;
      amount_in_cents?: number;
      currency?: string;
    };

    if (!res.ok || !data.url) {
      setDepositLoading(false);
      setDepositError(data.error ?? "Erro ao criar sessao do Stripe Checkout.");
      return;
    }

    let checkoutUrl: URL;
    try {
      checkoutUrl = new URL(data.url);
    } catch {
      setDepositLoading(false);
      setDepositError("O Stripe retornou uma URL de checkout invalida.");
      return;
    }

    if (checkoutUrl.protocol !== "https:" || !["checkout.stripe.com", "pay.stripe.com"].includes(checkoutUrl.hostname)) {
      setDepositLoading(false);
      setDepositError("O Stripe retornou uma URL de checkout nao confiavel.");
      return;
    }

    console.info("[agency finances] redirecting to Stripe Checkout", {
      sessionId: data.session_id,
      url: data.url,
      amount: data.amount ?? amount,
      amountInCents: data.amount_in_cents,
      currency: data.currency,
    });

    window.location.assign(data.url);
  }

  async function handleWithdraw() {
    const amount = Number(withdrawAmount);
    setWithdrawConfirming(false);
    setWithdrawing(true);
    setWithdrawError("");
    setWithdrawInfo("");

    const res = await fetch("/api/agencies/withdraw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
    });
    const data = await res.json().catch(() => ({})) as { error?: string; provider?: string; message?: string };

    setWithdrawing(false);
    if (!res.ok) {
      setWithdrawError(data.error ?? "Erro ao solicitar saque.");
      return;
    }

    setWithdrawAmount("");
    setWithdrawDone(true);
    setWithdrawInfo(data.message ?? (data.provider === "stripe" ? "Saque enviado pelo Stripe. Acompanhe o status abaixo." : ""));
    router.refresh();
    setTimeout(() => setWithdrawDone(false), 4000);
  }

  async function handlePixSave(e: React.FormEvent) {
    e.preventDefault();
    if (!pixKeyType || !pixKeyValue.trim() || !pixHolderName.trim()) {
      setPixError("Todos os campos sao obrigatorios.");
      return;
    }

    setPixSaving(true);
    setPixError("");
    const res = await fetch("/api/agencies/pix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pix_key_type: pixKeyType,
        pix_key_value: pixKeyValue.trim(),
        pix_holder_name: pixHolderName.trim(),
      }),
    });
    const data = await res.json().catch(() => ({})) as { error?: string };
    setPixSaving(false);

    if (!res.ok) {
      setPixError(data.error ?? "Erro ao salvar chave PIX.");
      return;
    }

    setSavedPix({
      pix_key_type: pixKeyType,
      pix_key_value: pixKeyValue.trim(),
      pix_holder_name: pixHolderName.trim(),
    });
    setPixEditing(false);
    setPixSaved(true);
    setTimeout(() => setPixSaved(false), 3000);
  }

  return (
    <div className="max-w-6xl space-y-8">
      {stripeWalletBanner === "pending" && (
        <div className="flex items-start gap-3 bg-teal-50 border border-teal-200 rounded-2xl px-4 py-3.5">
          <svg className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-teal-800">Pagamento recebido — aguardando confirmacao do Stripe</p>
            <p className="text-[12px] text-teal-700 mt-0.5">O saldo sera atualizado automaticamente apos o Stripe confirmar o pagamento (geralmente em segundos).</p>
          </div>
          <button
            type="button"
            onClick={() => setStripeWalletBanner(null)}
            className="text-teal-500 hover:text-teal-700 flex-shrink-0 cursor-pointer"
            aria-label="Fechar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      {stripeWalletBanner === "cancel" && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3.5">
          <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-amber-800">Deposito cancelado</p>
            <p className="text-[12px] text-amber-700 mt-0.5">O pagamento foi cancelado. Nenhum valor foi cobrado.</p>
          </div>
          <button
            type="button"
            onClick={() => setStripeWalletBanner(null)}
            className="text-amber-500 hover:text-amber-700 flex-shrink-0 cursor-pointer"
            aria-label="Fechar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Visao Geral</p>
        <h1 className="text-[2rem] font-black tracking-[-0.04em] text-zinc-950 leading-tight">Financeiro</h1>
        <p className="text-[13px] text-zinc-400 mt-1">{transactions.length} transacoes no total</p>
      </div>

      <div className="bg-white rounded-[1.75rem] border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_18px_46px_rgba(7,17,13,0.08)] overflow-hidden">
        {withdrawConfirming ? (
          <div className="px-6 py-6 bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] text-white space-y-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white">Confirmar Saque</p>
            <div className="space-y-2 text-[13px]">
              <div className="flex justify-between">
                <span className="text-white">Valor solicitado</span>
                <span className="font-bold text-white">{brl(withdrawAmountNum)}</span>
              </div>
              <div className="flex justify-between border-t border-white/30 pt-2">
                <span className="text-white font-semibold">Valor a receber</span>
                <span className="font-black text-white">{brl(withdrawAmountNum)}</span>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleWithdraw}
                disabled={withdrawing}
                className="flex-1 bg-white hover:bg-white/90 disabled:opacity-50 text-[#0E7C86] text-[13px] font-black py-2.5 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {withdrawing ? "Processando..." : "Confirmar Saque"}
              </button>
              <button
                onClick={() => setWithdrawConfirming(false)}
                className="px-5 bg-white/20 hover:bg-white/30 text-white text-[13px] font-semibold py-2.5 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="px-6 py-6 bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] text-white space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/80">Saldo na Plataforma</p>
                  {walletRefreshing && (
                    <span className="flex items-center gap-1 text-[10px] text-white/70">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      Atualizando...
                    </span>
                  )}
                </div>
                <p className="text-[3rem] font-black tracking-[-0.07em] text-white leading-none">{brl(walletBalance)}</p>
                <p className="text-[12px] text-white/70 mt-1">Disponivel para confirmar reservas ou sacar</p>
              </div>
              {withdrawDone && (
                <div className="flex items-center gap-1.5 text-[12px] text-white font-semibold mt-1">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  Solicitado
                </div>
              )}
            </div>

            {walletBalance > 0 && !withdrawDone && (
              <div className="space-y-2">
                <div className="flex gap-1.5">
                  {([0.25, 0.5, 1] as const).map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setWithdrawAmount(String(Math.floor(walletBalance * pct * 100) / 100))}
                      className="text-[11px] font-bold px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors cursor-pointer"
                    >
                      {pct === 1 ? "100%" : pct === 0.5 ? "50%" : "25%"}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-zinc-400 pointer-events-none">R$</span>
                    <input
                      type="number"
                      min={withdrawalMinAmount}
                      step={0.01}
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      placeholder="0,00"
                      className="w-full pl-8 pr-3 py-2.5 text-[13px] font-semibold bg-white/10 border border-white/10 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30 transition-colors"
                    />
                  </div>
                  <button
                    onClick={() => { if (canWithdraw) setWithdrawConfirming(true); }}
                    disabled={Boolean(!canWithdraw || withdrawing)}
                    className="flex items-center gap-2 bg-white/10 hover:bg-white/15 disabled:opacity-40 text-white border border-white/10 text-[13px] font-bold px-5 py-2.5 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    Solicitar Saque
                  </button>
                </div>
                {withdrawAmountNum > walletBalance && (
                  <p className="text-[11px] text-rose-100">Valor superior ao saldo disponivel.</p>
                )}
                {withdrawAmountNum > 0 && withdrawAmountNum < withdrawalMinAmount && (
                  <p className="text-[11px] text-white/80">Valor minimo para agencias: {brl(withdrawalMinAmount)}.</p>
                )}
                {withdrawInfo && <p className="text-[11px] text-white/80">{withdrawInfo}</p>}
                {withdrawError && <p className="text-[11px] text-rose-100">{withdrawError}</p>}
              </div>
            )}

            {!stripeReady && walletBalance > 0 && (
              <p className="text-[11px] text-white/80 font-semibold">
                {stripeReason
                  ? `Saque automático indisponível: ${stripeReason}`
                  : "Conclua a verificacao da sua conta Stripe para liberar saques automaticos."}
              </p>
            )}
          </div>
        )}

        <div className="px-6 pt-5 pb-6 space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Depositar Fundos</p>
            <p className="text-[12px] text-zinc-400 mt-1">O pagamento abre no Stripe Checkout. O saldo aparece depois da confirmacao do Stripe.</p>
          </div>
          <form onSubmit={handleDeposit} className="space-y-3">
            {depositError && (
              <p className="text-[12px] text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{depositError}</p>
            )}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-zinc-400 pointer-events-none">R$</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  placeholder="0"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2.5 text-[13px] font-semibold bg-zinc-50 border border-zinc-200 rounded-xl placeholder:text-[#647B7B] hover:border-zinc-300 focus:border-zinc-900 focus:bg-white focus:outline-none transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={Boolean(depositLoading || !depositAmount || Number(depositAmount) <= 0)}
                className="flex items-center gap-2 bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2] disabled:bg-[#E6F0F0] disabled:text-[#B8D4D4] disabled:bg-none text-white text-[13px] font-bold px-5 py-2.5 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed flex-shrink-0"
              >
                {depositLoading ? "Abrindo..." : "Abrir Stripe"}
              </button>
            </div>
            <div className="flex gap-2 flex-wrap">
              {[500, 1000, 2000, 5000].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDepositAmount(String(value))}
                  className="text-[11px] font-semibold px-3 py-1.5 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 rounded-lg text-zinc-600 transition-colors cursor-pointer"
                >
                  {brl(value)}
                </button>
              ))}
            </div>
          </form>
        </div>
      </div>

      <StripeConnectPayoutPanel
        amount={withdrawAmountNum > 0 ? withdrawAmountNum : withdrawalMinAmount}
        onStatusChange={({ ready, state, exactReason }) => {
          setStripeReady(ready);
          setStripeState(state);
          setStripeReason(exactReason);
        }}
      />

      <div className="bg-white rounded-[1.75rem] border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_18px_46px_rgba(7,17,13,0.08)] overflow-hidden">
        {/* Card header */}
        <div className="px-6 py-5 border-b border-zinc-50">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Metodo de Saque</p>
          <p className="text-[12px] text-zinc-500 mt-0.5">Stripe e o metodo principal. PIX e o fallback processado manualmente.</p>
        </div>

        {/* Stripe section — primary */}
        <div className="px-6 py-5 border-b border-zinc-50">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#635BFF]/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-[#635BFF]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/>
                </svg>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-zinc-900">Stripe Connect</p>
                <p className="text-[12px] text-zinc-400">Saques automaticos e diretos</p>
              </div>
            </div>
            {stripeState === "ready" ? (
              <span className="text-[11px] font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 px-2.5 py-1 rounded-full flex-shrink-0">
                Pronto para saque
              </span>
            ) : stripeState === "blocked" ? (
              <span className="text-[11px] font-semibold bg-rose-50 text-rose-700 ring-1 ring-rose-100 px-2.5 py-1 rounded-full flex-shrink-0">
                Saques bloqueados
              </span>
            ) : stripeState === "review" ? (
              <span className="text-[11px] font-semibold bg-amber-50 text-amber-700 ring-1 ring-amber-100 px-2.5 py-1 rounded-full flex-shrink-0">
                Em analise
              </span>
            ) : stripeState === "connected" ? (
              <span className="text-[11px] font-semibold bg-amber-50 text-amber-700 ring-1 ring-amber-100 px-2.5 py-1 rounded-full flex-shrink-0">
                Conectado
              </span>
            ) : (
              <span className="text-[11px] font-semibold bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200 px-2.5 py-1 rounded-full flex-shrink-0">
                Nao configurado
              </span>
            )}
          </div>
          <p className="text-[12px] text-zinc-400 mt-3">
            {stripeState === "ready"
              ? "Saques sao processados automaticamente via Stripe Connect. Prazo de 2 a 5 dias uteis."
              : stripeState === "blocked"
                ? "Stripe conectado, mas o saque automatico esta indisponivel ate corrigir a conta ou o saldo da plataforma."
                : stripeState === "connected" || stripeState === "review"
                  ? "A conta Stripe ja foi conectada, mas ainda nao esta pronta para payout automatico."
              : "Sem conta Stripe Connect pronta, o saque automatico fica indisponivel ate concluir a conexao."}
          </p>
        </div>

        {/* PIX section — fallback */}
        <div className="px-6 py-4 border-b border-zinc-50 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">PIX <span className="normal-case font-medium text-zinc-400">(fallback manual)</span></p>
            <p className="text-[12px] text-zinc-400 mt-0.5">Usado quando o Stripe automatico nao estiver disponivel.</p>
          </div>
          {hasPix && !pixEditing && (
            <button
              type="button"
              onClick={() => { setPixEditing(true); setPixError(""); }}
              className="text-[12px] font-semibold text-zinc-500 hover:text-zinc-900 border border-zinc-200 rounded-xl px-3 py-1.5 transition-colors cursor-pointer flex-shrink-0"
            >
              Editar
            </button>
          )}
        </div>
        <div className="px-6 py-5">
          {!pixEditing && hasPix ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-[13px]">
                <span className="text-[11px] font-bold uppercase bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded">
                  {PIX_TYPE_LABELS[savedPix?.pix_key_type ?? ""] ?? savedPix?.pix_key_type}
                </span>
                <span className="font-semibold text-zinc-900">{savedPix?.pix_key_value}</span>
              </div>
              {savedPix?.pix_holder_name && (
                <p className="text-[12px] text-zinc-400">Titular: {savedPix.pix_holder_name}</p>
              )}
              {pixSaved && <p className="text-[12px] text-emerald-600 mt-1">Chave PIX salva com sucesso.</p>}
              <p className="text-[11px] text-zinc-400 pt-1">
                Saques manuais via PIX exigem minimo de {brl(withdrawalMinAmount)}.
              </p>
            </div>
          ) : (
            <form onSubmit={handlePixSave} className="space-y-3">
              {!hasPix && (
                <p className="text-[12px] text-zinc-500 bg-zinc-50 border border-zinc-100 rounded-xl px-3 py-2">
                  Configure uma chave PIX como fallback para saques manuais.
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-zinc-500">Tipo de chave</label>
                  <select
                    value={pixKeyType}
                    onChange={(e) => setPixKeyType(e.target.value)}
                    className="w-full h-10 border border-zinc-200 rounded-xl px-3 text-[13px] text-zinc-900 bg-white focus:outline-none focus:border-zinc-400 transition-colors"
                  >
                    {Object.entries(PIX_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="block text-[11px] font-medium text-zinc-500">Chave PIX</label>
                  <input
                    type="text"
                    value={pixKeyValue}
                    onChange={(e) => setPixKeyValue(e.target.value)}
                    placeholder="Sua chave PIX"
                    className="w-full h-10 border border-zinc-200 rounded-xl px-3 text-[13px] text-zinc-900 bg-zinc-50 placeholder:text-[#647B7B] focus:outline-none focus:border-zinc-400 focus:bg-white transition-colors"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-zinc-500">Nome do titular</label>
                <input
                  type="text"
                  value={pixHolderName}
                  onChange={(e) => setPixHolderName(e.target.value)}
                  placeholder="Nome completo ou razao social"
                  className="w-full h-10 border border-zinc-200 rounded-xl px-3 text-[13px] text-zinc-900 bg-zinc-50 placeholder:text-[#647B7B] focus:outline-none focus:border-zinc-400 focus:bg-white transition-colors"
                />
              </div>
              {pixError && (
                <p className="text-[12px] text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{pixError}</p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={pixSaving}
                  className="flex items-center gap-2 bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2] disabled:opacity-50 text-white text-[13px] font-bold px-5 py-2.5 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  {pixSaving ? "Salvando..." : "Salvar Chave PIX"}
                </button>
                {hasPix && (
                  <button
                    type="button"
                    onClick={() => { setPixEditing(false); setPixError(""); }}
                    className="text-[13px] font-semibold text-zinc-500 hover:text-zinc-900 border border-zinc-200 rounded-xl px-4 py-2.5 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-[1.5rem] border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_14px_34px_rgba(7,17,13,0.06)] overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-50">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Saques pendentes</p>
            <p className="text-[12px] text-zinc-400 mt-1">Valores ja debitados da carteira e aguardando processamento manual.</p>
          </div>
          {pendingWithdrawals.length === 0 ? (
            <div className="px-5 py-8 text-[13px] text-zinc-400">Nenhum saque pendente no momento.</div>
          ) : (
            <div className="divide-y divide-zinc-50">
              {pendingWithdrawals.map((transaction) => (
                <div key={transaction.id} className="px-5 py-4 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-zinc-900">{transaction.description ?? "Saque solicitado"}</p>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      {transaction.withdrawalStatus ? WITHDRAWAL_STATUS_LABEL[transaction.withdrawalStatus] ?? transaction.withdrawalStatus : "Pendente"} · {fmtDate(transaction.date)}
                    </p>
                    {transaction.adminNote && (
                      <p className="text-[11px] text-zinc-500 mt-1">{transaction.adminNote}</p>
                    )}
                  </div>
                  <p className="text-[14px] font-bold text-zinc-900 tabular-nums">{brl(Math.abs(transaction.amount))}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-[1.5rem] border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_14px_34px_rgba(7,17,13,0.06)] overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-50">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Historico de saques</p>
            <p className="text-[12px] text-zinc-400 mt-1">Ultimos saques pagos ou cancelados.</p>
          </div>
          {withdrawalHistory.length === 0 ? (
            <div className="px-5 py-8 text-[13px] text-zinc-400">Nenhum saque processado ainda.</div>
          ) : (
            <div className="divide-y divide-zinc-50">
              {withdrawalHistory.slice(0, 5).map((transaction) => (
                <div key={transaction.id} className="px-5 py-4 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-zinc-900">{transaction.description ?? "Saque"}</p>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      {transaction.withdrawalStatus ? WITHDRAWAL_STATUS_LABEL[transaction.withdrawalStatus] ?? transaction.withdrawalStatus : "Pago"} · {fmtDate(transaction.processedAt ?? transaction.date)}
                    </p>
                    {transaction.adminNote && (
                      <p className="text-[11px] text-zinc-500 mt-1">{transaction.adminNote}</p>
                    )}
                  </div>
                  <p className="text-[14px] font-bold text-zinc-900 tabular-nums">{brl(Math.abs(transaction.amount))}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Gasto (Confirmado)" value={brl(summary.totalSpent)} sub="Depositos e jobs confirmados" stripe="from-indigo-500 to-violet-500" />
        <StatCard label="Pagamentos Pendentes" value={brl(summary.pendingPayments)} sub="Aguardando confirmacao" stripe="from-amber-400 to-orange-500" />
        <StatCard label="Pagamentos Realizados" value={brl(summary.completedPayments)} sub="Reservas confirmadas" stripe="from-emerald-400 to-teal-500" />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-400">Transacoes</p>
            <p className="text-[12px] text-zinc-400 mt-1">Depositos, custodia, pagamentos e movimentacoes da carteira.</p>
          </div>
          <span className="text-[12px] font-semibold text-zinc-400">{transactions.length} itens</span>
        </div>

        {transactions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-100 py-16 text-center">
            <p className="text-[14px] font-medium text-zinc-500">Nenhuma transacao ainda</p>
            <p className="text-[13px] text-zinc-400 mt-1">Reservas e movimentacoes da carteira aparecerao aqui.</p>
          </div>
        ) : (
          <div className="bg-white rounded-[1.5rem] border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_14px_34px_rgba(7,17,13,0.06)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-100">
                    <th className="text-left px-6 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">Descricao</th>
                    <th className="text-right px-4 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">Valor</th>
                    <th className="text-left px-4 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">Tipo</th>
                    <th className="text-right px-6 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest hidden sm:table-cell">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {transactions.map((transaction) => {
                    const isWithdrawal = transaction.status === "withdrawal";
                    const label = transaction.kind === "wallet"
                      ? transaction.description ?? STATUS_LABEL[transaction.status] ?? transaction.status
                      : transaction.talent || transaction.description || "Reserva";

                    return (
                      <tr
                        key={transaction.id}
                        role={transaction.href ? "link" : undefined}
                        tabIndex={transaction.href ? 0 : undefined}
                        onClick={() => { if (transaction.href) router.push(transaction.href); }}
                        onKeyDown={(event) => {
                          if (transaction.href && (event.key === "Enter" || event.key === " ")) {
                            event.preventDefault();
                            router.push(transaction.href);
                          }
                        }}
                        className={[
                          "hover:bg-zinc-50/60 transition-colors",
                          transaction.href ? "cursor-pointer" : "",
                        ].join(" ")}
                      >
                        <td className="px-6 py-4">
                          <p className="text-[13px] font-bold text-zinc-950 truncate max-w-[260px]">{label}</p>
                          {isWithdrawal && (
                            <div className="mt-0.5 space-y-0.5">
                              <p className="text-[11px] text-zinc-400">
                                {transaction.withdrawalStatus ? WITHDRAWAL_STATUS_LABEL[transaction.withdrawalStatus] ?? transaction.withdrawalStatus : "Pendente"}
                              </p>
                              {transaction.adminNote && (
                                <p className="text-[11px] text-rose-500">{transaction.adminNote}</p>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <p className="text-[14px] font-black tabular-nums text-zinc-950">{brl(Math.abs(transaction.amount))}</p>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${STATUS_CLS[transaction.status] ?? "bg-zinc-100 text-zinc-500"}`}>
                            {STATUS_LABEL[transaction.status] ?? transaction.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right hidden sm:table-cell">
                          <p className="text-[12px] text-zinc-400">
                            {new Date(transaction.date).toLocaleDateString("pt-BR", { month: "short", day: "numeric" })}
                          </p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
