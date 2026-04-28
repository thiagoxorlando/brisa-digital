"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useRealtimeRefresh } from "@/lib/hooks/useRealtimeRefresh";

// Read at build time from NEXT_PUBLIC_MIN_WITHDRAW; falls back to 100.
const MIN_WITHDRAW = Number(process.env.NEXT_PUBLIC_MIN_WITHDRAW || 100);

const SavedCardsWidget   = dynamic(() => import("@/components/ui/SavedCards"),         { ssr: false });
const WalletDepositModal = dynamic(() => import("@/components/ui/WalletDepositModal"), { ssr: false });

function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n);
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
};

export type AgencyFinanceSummary = {
  totalSpent: number;
  pendingPayments: number;
  completedPayments: number;
  walletBalance?: number;
};

const WITHDRAWAL_STATUS_CLS: Record<string, string> = {
  pending:  "bg-amber-50   text-amber-700   ring-1 ring-amber-100",
  paid:     "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  rejected: "bg-rose-50    text-rose-700    ring-1 ring-rose-100",
};

const WITHDRAWAL_STATUS_LABEL: Record<string, string> = {
  pending:  "Pendente",
  paid:     "Pago",
  rejected: "Cancelado",
};

const STATUS_CLS: Record<string, string> = {
  paid:            "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  confirmed:       "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  pending_payment: "bg-amber-50   text-amber-700   ring-1 ring-amber-100",
  pending:         "bg-amber-50   text-amber-700   ring-1 ring-amber-100",
  cancelled:       "bg-zinc-100   text-zinc-500    ring-1 ring-zinc-200",
  deposit:         "bg-teal-50    text-teal-700    ring-1 ring-teal-100",
  payment:         "bg-violet-50  text-violet-700  ring-1 ring-violet-100",
  withdrawal:      "bg-blue-50    text-blue-700    ring-1 ring-blue-100",
  escrow:          "bg-amber-50   text-amber-700   ring-1 ring-amber-100",
  escrow_lock:     "bg-amber-50   text-amber-700   ring-1 ring-amber-100",
  escrow_released: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  escrow_refunded: "bg-rose-50    text-rose-700    ring-1 ring-rose-100",
  release:         "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  refund:          "bg-rose-50    text-rose-700    ring-1 ring-rose-100",
  credit:          "bg-teal-50    text-teal-700    ring-1 ring-teal-100",
};

const STATUS_LABEL: Record<string, string> = {
  paid:            "Pago",
  confirmed:       "Reservado",
  pending_payment: "Aguardando Pagamento",
  pending:         "Pendente",
  cancelled:       "Cancelado",
  deposit:         "Depósito",
  payment:         "Pagamento",
  withdrawal:      "Saque",
  escrow:          "Escrow",
  escrow_lock:     "Custódia",
  escrow_released: "Pago",
  escrow_refunded: "Estornado",
  release:         "Liberado",
  refund:          "Reembolso",
  credit:          "Crédito",
};

const PIX_TYPE_LABELS: Record<string, string> = {
  cpf:    "CPF",
  cnpj:   "CNPJ",
  email:  "E-mail",
  phone:  "Telefone",
  random: "Chave aleatória",
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
  savedCards,
  mpPublicKey,
  agencyPix,
  withdrawalFeeRate,
  withdrawalMinFee,
  withdrawalMinAmount,
}: {
  summary: AgencyFinanceSummary;
  transactions: AgencyTransaction[];
  savedCards: import("@/components/ui/SavedCards").SavedCard[];
  mpPublicKey: string;
  agencyPix?: { pix_key_type: string | null; pix_key_value: string | null; pix_holder_name: string | null } | null;
  withdrawalFeeRate: number;
  withdrawalMinFee: number;
  withdrawalMinAmount: number;
}) {
  const router = useRouter();

  // Withdraw
  const [withdrawing,        setWithdrawing]        = useState(false);
  const [withdrawDone,       setWithdrawDone]        = useState(false);
  const [withdrawConfirming, setWithdrawConfirming]  = useState(false);
  const [withdrawAmount,     setWithdrawAmount]      = useState("");
  const [withdrawError,      setWithdrawError]       = useState("");

  // Agency PIX key
  const [savedPix,      setSavedPix]      = useState(agencyPix ?? null);
  const [pixEditing,    setPixEditing]    = useState(false);
  const [pixKeyType,    setPixKeyType]    = useState(agencyPix?.pix_key_type ?? "cpf");
  const [pixKeyValue,   setPixKeyValue]   = useState(agencyPix?.pix_key_value ?? "");
  const [pixHolderName, setPixHolderName] = useState(agencyPix?.pix_holder_name ?? "");
  const [pixSaving,     setPixSaving]     = useState(false);
  const [pixError,      setPixError]      = useState("");
  const [pixSaved,      setPixSaved]      = useState(false);

  // Wallet balance (live) — uses server props unless a local optimistic update is active.
  const serverWalletBalance = summary.walletBalance ?? 0;
  const [walletBalanceOverride, setWalletBalanceOverride] = useState<{ base: number; value: number } | null>(null);
  const walletBalance = walletBalanceOverride?.base === serverWalletBalance
    ? walletBalanceOverride.value
    : serverWalletBalance;

  function setLocalWalletBalance(next: number | ((previous: number) => number)) {
    setWalletBalanceOverride((current) => {
      const currentValue = current?.base === serverWalletBalance ? current.value : serverWalletBalance;
      return {
        base:  serverWalletBalance,
        value: typeof next === "function" ? next(currentValue) : next,
      };
    });
  }

  const { refreshing: walletRefreshing } = useRealtimeRefresh(
    [{ table: "wallet_transactions" }, { table: "wallets" }],
    () => router.refresh(),
  );

  // Deposit method toggle
  const [depositMethod, setDepositMethod] = useState<"pix" | "card">("pix");

  // PIX deposit
  const [depositAmount,  setDepositAmount]  = useState("");
  const [depositLoading, setDepositLoading] = useState(false);
  const [depositError,   setDepositError]   = useState("");
  const [depositModal,   setDepositModal]   = useState<{
    txId: string; amount: number; creditAmount: number; fee: number; qrCode: string; qrCodeBase64: string | null;
  } | null>(null);

  // Live cards state — shared between the deposit selector and the SavedCards widget
  const [liveCards,          setLiveCards]          = useState(savedCards);
  const [selectedCard,       setSelectedCard]       = useState(savedCards[0]?.id ?? "");

  function handleCardsChange(nextCards: typeof savedCards) {
    setLiveCards(nextCards);
    setSelectedCard((current) =>
      nextCards.some((card) => card.id === current) ? current : nextCards[0]?.id ?? ""
    );
  }

  // Card deposit
  const [cardDepositAmount,  setCardDepositAmount]  = useState("");
  const [cardDepositLoading, setCardDepositLoading] = useState(false);
  const [cardDepositError,   setCardDepositError]   = useState("");
  const [cardDepositDone,    setCardDepositDone]    = useState(false);
  const [cardCvv,            setCardCvv]            = useState("");

  async function handleWithdraw() {
    const amt = Number(withdrawAmount);
    setWithdrawConfirming(false);
    setWithdrawing(true);
    setWithdrawError("");
    const res = await fetch("/api/agencies/withdraw", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ amount: amt }),
    });
    const data = await res.json().catch(() => ({})) as { error?: string; remaining_balance?: number };
    setWithdrawing(false);
    if (!res.ok) {
      console.error("[handleWithdraw] status:", res.status, "body:", data);
      setWithdrawError(data.error ?? "Erro ao solicitar saque. Tente novamente.");
      return;
    }
    setLocalWalletBalance((prev) => Math.round((prev - amt) * 100) / 100);
    setWithdrawAmount("");
    setWithdrawDone(true);
    setTimeout(() => setWithdrawDone(false), 4000);
  }

  async function handlePixSave(e: React.FormEvent) {
    e.preventDefault();
    if (!pixKeyType || !pixKeyValue.trim() || !pixHolderName.trim()) {
      setPixError("Todos os campos são obrigatórios.");
      return;
    }
    setPixSaving(true);
    setPixError("");
    const res = await fetch("/api/agencies/pix", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ pix_key_type: pixKeyType, pix_key_value: pixKeyValue.trim(), pix_holder_name: pixHolderName.trim() }),
    });
    const data = await res.json().catch(() => ({})) as { error?: string };
    setPixSaving(false);
    if (!res.ok) { setPixError(data.error ?? "Erro ao salvar chave PIX."); return; }
    setSavedPix({ pix_key_type: pixKeyType, pix_key_value: pixKeyValue.trim(), pix_holder_name: pixHolderName.trim() });
    setPixEditing(false);
    setPixSaved(true);
    setTimeout(() => setPixSaved(false), 3000);
  }

  const hasPix            = !!(savedPix?.pix_key_type && savedPix?.pix_key_value?.trim());
  const withdrawAmountNum = Math.round(Number(withdrawAmount) * 100) / 100;
  const withdrawFeeNum    = Math.max(Math.round(withdrawAmountNum * withdrawalFeeRate * 100) / 100, withdrawAmountNum > 0 ? withdrawalMinFee : 0);
  const withdrawNetNum    = Math.round((withdrawAmountNum - withdrawFeeNum) * 100) / 100;
  const isMinFeeApplied   = withdrawAmountNum > 0 && withdrawFeeNum === withdrawalMinFee;
  const canWithdraw       = Boolean(hasPix && withdrawAmountNum >= MIN_WITHDRAW && withdrawAmountNum <= walletBalance);

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(depositAmount);
    if (!amount || amount <= 0) return;
    setDepositLoading(true);
    setDepositError("");
    const res = await fetch("/api/payments/wallet-deposit", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ amount }),
    });
    const data = await res.json();
    if (!res.ok) {
      setDepositError(data.error ?? "Erro ao gerar PIX. Tente novamente.");
    } else {
      setDepositModal({
        txId:         data.tx_id,
        amount:       data.totalCharged  ?? amount,
        creditAmount: data.creditAmount  ?? amount,
        fee:          data.fee           ?? 0,
        qrCode:       data.qr_code       ?? "",
        qrCodeBase64: data.qr_code_base64 ?? null,
      });
      setDepositAmount("");
    }
    setDepositLoading(false);
  }

  async function handleCardDeposit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(cardDepositAmount);
    if (!amount || amount <= 0 || !selectedCard || cardCvv.length < 3) return;
    setCardDepositLoading(true);
    setCardDepositError("");
    setCardDepositDone(false);
    const res  = await fetch("/api/payments/wallet-deposit-card", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ card_id: selectedCard, amount, security_code: cardCvv }),
    });
    const data = await res.json();
    if (!res.ok) {
      setCardDepositError(data.error ?? "Erro ao processar pagamento. Tente novamente.");
    } else {
      setLocalWalletBalance((prev) => prev + (data.amount ?? amount));
      setCardDepositAmount("");
      setCardCvv("");
      setCardDepositDone(true);
      setTimeout(() => setCardDepositDone(false), 4000);
      router.refresh();
    }
    setCardDepositLoading(false);
  }

  return (
    <div className="max-w-6xl space-y-8">

      {/* Header */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Visão Geral</p>
        <h1 className="text-[2rem] font-black tracking-[-0.04em] text-zinc-950 leading-tight">Financeiro</h1>
        <p className="text-[13px] text-zinc-400 mt-1">{transactions.length} transações no total</p>
      </div>

      {/* PIX modal */}
      {depositModal && (
        <WalletDepositModal
          txId={depositModal.txId}
          amount={depositModal.amount}
          creditAmount={depositModal.creditAmount}
          fee={depositModal.fee}
          qrCode={depositModal.qrCode}
          qrCodeBase64={depositModal.qrCodeBase64}
          onConfirmed={() => {
            setDepositModal(null);
            setLocalWalletBalance((prev) => prev + depositModal.creditAmount);
            router.refresh();
          }}
          onClose={() => setDepositModal(null)}
        />
      )}

      {/* Wallet card */}
      <div className="bg-white rounded-[1.75rem] border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_18px_46px_rgba(7,17,13,0.08)] overflow-hidden">

        {/* Balance row / withdrawal confirmation */}
        {withdrawConfirming ? (
          <div className="px-6 py-6 bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] text-white space-y-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/80">Confirmar Saque</p>
            <div className="space-y-2 text-[13px]">
              <div className="flex justify-between">
                <span className="text-white/70">Valor solicitado</span>
                <span className="font-bold">{brl(withdrawAmountNum)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/70">
                  Taxa de processamento{isMinFeeApplied ? ` (mín. ${brl(withdrawalMinFee)})` : ` (${(withdrawalFeeRate * 100).toFixed(0)}%)`}
                </span>
                <span className="font-bold text-rose-200">−{brl(withdrawFeeNum)}</span>
              </div>
              <div className="flex justify-between border-t border-white/20 pt-2">
                <span className="text-white font-semibold">Valor líquido a receber</span>
                <span className="font-black text-white">{brl(withdrawNetNum)}</span>
              </div>
              {savedPix && (
                <div className="flex justify-between pt-1">
                  <span className="text-white/70">Chave PIX</span>
                  <span className="text-white/80 font-medium text-right">
                    {PIX_TYPE_LABELS[savedPix.pix_key_type ?? ""] ?? savedPix.pix_key_type} · {savedPix.pix_key_value}
                  </span>
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={handleWithdraw} disabled={withdrawing}
                className="flex-1 bg-white hover:bg-white/90 disabled:opacity-50 text-[#0E7C86] text-[13px] font-black py-2.5 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed">
                {withdrawing ? "Processando…" : "Confirmar Saque"}
              </button>
              <button onClick={() => setWithdrawConfirming(false)}
                className="px-5 bg-white/20 hover:bg-white/30 text-white text-[13px] font-semibold py-2.5 rounded-xl transition-colors cursor-pointer">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="px-6 py-6 bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] text-white space-y-4">
            {/* Balance display */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/80">Saldo na Plataforma</p>
                  {walletRefreshing && (
                    <span className="flex items-center gap-1 text-[10px] text-white/70">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      Atualizando…
                    </span>
                  )}
                </div>
                <p className="text-[3rem] font-black tracking-[-0.07em] text-white leading-none">{brl(walletBalance)}</p>
                <p className="text-[12px] text-white/70 mt-1">Disponível para confirmar reservas ou sacar</p>
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

            {/* Amount input + quick buttons */}
            {hasPix && walletBalance > 0 && !withdrawDone && (
              <div className="space-y-2">
                <div className="flex gap-1.5">
                  {([0.25, 0.5, 1] as const).map((pct) => (
                    <button key={pct} type="button"
                      onClick={() => setWithdrawAmount(String(Math.floor(walletBalance * pct * 100) / 100))}
                      className="text-[11px] font-bold px-2.5 py-1 bg-white/10 hover:bg-white/20 text-[#647B7B] rounded-lg transition-colors cursor-pointer">
                      {pct === 1 ? "100%" : pct === 0.5 ? "50%" : "25%"}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-zinc-400 pointer-events-none">R$</span>
                    <input
                      type="number" min={MIN_WITHDRAW} step={0.01} value={withdrawAmount}
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
                    {withdrawing ? (
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-zinc-400 border-t-zinc-800 animate-spin" />
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                      </svg>
                    )}
                    Solicitar Saque
                  </button>
                </div>
                {withdrawAmountNum > walletBalance && (
                  <p className="text-[11px] text-rose-400">Valor superior ao saldo disponível.</p>
                )}
                {withdrawAmountNum > 0 && withdrawAmountNum < MIN_WITHDRAW && (
                  <p className="text-[11px] text-amber-400">Valor mínimo para saque: {brl(MIN_WITHDRAW)}.</p>
                )}
                {isMinFeeApplied && withdrawAmountNum >= MIN_WITHDRAW && withdrawAmountNum <= walletBalance && (
                  <p className="text-[11px] text-zinc-400">Taxa mínima de {brl(withdrawalMinFee)} aplicada.</p>
                )}
                {withdrawError && (
                  <p className="text-[11px] text-rose-400">{withdrawError}</p>
                )}
              </div>
            )}

            {!hasPix && walletBalance > 0 && (
              <p className="text-[11px] text-amber-400">Configure sua chave PIX para habilitar saques.</p>
            )}
          </div>
        )}

        {/* Deposit section */}
        <div className="px-6 pt-5 pb-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Depositar Fundos</p>
            <div className="flex bg-zinc-100 rounded-xl p-0.5 gap-0.5">
              {(["pix", "card"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDepositMethod(m)}
                  className={[
                    "px-3.5 py-1.5 rounded-[10px] text-[12px] font-semibold transition-all",
                    depositMethod === m
                      ? "bg-white text-zinc-900 shadow-sm cursor-pointer"
                      : "text-zinc-500 hover:text-zinc-700 cursor-pointer",
                  ].join(" ")}
                >
                  {m === "pix" ? "PIX" : "Cartão"}
                </button>
              ))}
            </div>
          </div>

          {depositMethod === "pix" && (
            <form onSubmit={handleDeposit} className="space-y-3">
              <p className="text-[12px] text-zinc-400">Crédito imediato após confirmação do pagamento. Depósitos não têm taxa. Taxas podem ser aplicadas apenas em saques.</p>
              {depositError && (
                <p className="text-[12px] text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{depositError}</p>
              )}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-zinc-400 pointer-events-none">R$</span>
                  <input type="number" min={1} step={1} placeholder="0" value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2.5 text-[13px] font-semibold bg-zinc-50 border border-zinc-200 rounded-xl placeholder:text-[#647B7B] hover:border-zinc-300 focus:border-zinc-900 focus:bg-white focus:outline-none transition-colors" />
                </div>
                <button type="submit" disabled={Boolean(depositLoading || !depositAmount || Number(depositAmount) <= 0)}
                  className="flex items-center gap-2 bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2] disabled:bg-[#E6F0F0] disabled:text-[#B8D4D4] disabled:bg-none text-white text-[13px] font-bold px-5 py-2.5 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed flex-shrink-0">
                  {depositLoading ? <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : "Gerar QR Code"}
                </button>
              </div>
              <div className="flex gap-2 flex-wrap">
                {[500, 1000, 2000, 5000].map((v) => (
                  <button key={v} type="button" onClick={() => setDepositAmount(String(v))}
                    className="text-[11px] font-semibold px-3 py-1.5 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 rounded-lg text-zinc-600 transition-colors cursor-pointer">
                    {brl(v)}
                  </button>
                ))}
              </div>
            </form>
          )}

          {depositMethod === "card" && (
            <div className="space-y-4">
              {liveCards.length === 0 ? (
                <div className="bg-zinc-50 border border-zinc-100 rounded-2xl px-5 py-8 text-center space-y-2">
                  <svg className="w-8 h-8 text-[#647B7B] mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                  <p className="text-[13px] font-medium text-zinc-500">Nenhum cartão cadastrado</p>
                  <p className="text-[12px] text-zinc-400">Adicione um cartão em <span className="font-semibold text-zinc-600">Métodos de Pagamento</span> abaixo.</p>
                </div>
              ) : (
                <form onSubmit={handleCardDeposit} className="space-y-3">
                  <div className="space-y-2">
                    {liveCards.map((card) => {
                      const expiry = card.expiry_month && card.expiry_year
                        ? `${String(card.expiry_month).padStart(2, "0")}/${String(card.expiry_year).slice(-2)}`
                        : null;
                      const isSelected = selectedCard === card.id;
                      return (
                        <button key={card.id} type="button" onClick={() => { setSelectedCard(card.id); setCardCvv(""); }}
                          className={["w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all cursor-pointer",
                            isSelected ? "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900" : "border-zinc-200 bg-white hover:border-zinc-300"].join(" ")}>
                          <div className={["w-3 h-3 rounded-full border-2 flex-shrink-0 transition-colors",
                            isSelected ? "border-[#1ABC9C] bg-[#1ABC9C]" : "border-[#DDE6E6]"].join(" ")} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold uppercase bg-[#2D4142] text-white px-1.5 py-0.5 rounded">{card.brand ?? "card"}</span>
                              <span className="text-[13px] font-semibold text-zinc-900 tabular-nums">•••• {card.last_four ?? "----"}</span>
                            </div>
                            {expiry && <p className="text-[11px] text-zinc-400 mt-0.5">Válido até {expiry}</p>}
                          </div>
                          {isSelected && (
                            <svg className="w-4 h-4 text-zinc-900 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-medium text-zinc-500">CVV do cartão</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="000"
                      value={cardCvv}
                      onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      autoComplete="cc-csc"
                      className="w-28 h-10 border border-zinc-200 rounded-xl px-3 bg-white text-[14px] text-zinc-900 text-center tabular-nums placeholder:text-[#647B7B] focus:outline-none focus:border-zinc-400 transition-colors"
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-zinc-400 pointer-events-none">R$</span>
                      <input type="number" min={1} step={1} placeholder="0" value={cardDepositAmount}
                        onChange={(e) => setCardDepositAmount(e.target.value)}
                        className="w-full pl-9 pr-3.5 py-2.5 text-[13px] font-semibold bg-zinc-50 border border-zinc-200 rounded-xl placeholder:text-[#647B7B] hover:border-zinc-300 focus:border-zinc-900 focus:bg-white focus:outline-none transition-colors" />
                    </div>
                    <button type="submit" disabled={Boolean(cardDepositLoading || !cardDepositAmount || Number(cardDepositAmount) <= 0 || !selectedCard || cardCvv.length < 3)}
                      className="flex items-center gap-2 bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2] disabled:bg-[#E6F0F0] disabled:text-[#B8D4D4] disabled:bg-none text-white text-[13px] font-bold px-5 py-2.5 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed flex-shrink-0">
                      {cardDepositLoading ? <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : "Depositar"}
                    </button>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {[500, 1000, 2000, 5000].map((v) => (
                      <button key={v} type="button" onClick={() => setCardDepositAmount(String(v))}
                        className="text-[11px] font-semibold px-3 py-1.5 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 rounded-lg text-zinc-600 transition-colors cursor-pointer">
                        {brl(v)}
                      </button>
                    ))}
                  </div>
                  {cardDepositError && (
                    <p className="text-[12px] text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{cardDepositError}</p>
                  )}
                  {cardDepositDone && (
                    <div className="flex items-center gap-2 text-[12px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      Depósito confirmado! Saldo atualizado.
                    </div>
                  )}
                </form>
              )}
            </div>
          )}
        </div>
      </div>

      {/* PIX key for withdrawals */}
      <div className="bg-white rounded-[1.75rem] border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_18px_46px_rgba(7,17,13,0.08)] overflow-hidden">
        <div className="px-6 py-5 border-b border-zinc-50 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Dados para Saque</p>
            <p className="text-[12px] text-zinc-500 mt-0.5">Chave PIX para receber transferências manuais da equipe.</p>
          </div>
          {hasPix && !pixEditing && (
            <button type="button" onClick={() => { setPixEditing(true); setPixError(""); }}
              className="text-[12px] font-semibold text-zinc-500 hover:text-zinc-900 border border-zinc-200 rounded-xl px-3 py-1.5 transition-colors cursor-pointer">
              Editar
            </button>
          )}
        </div>
        <div className="px-6 py-5">
          {!pixEditing && hasPix ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-[13px]">
                <span className="text-[11px] font-bold uppercase bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded">{PIX_TYPE_LABELS[savedPix?.pix_key_type ?? ""] ?? savedPix?.pix_key_type}</span>
                <span className="font-semibold text-zinc-900">{savedPix?.pix_key_value}</span>
              </div>
              {savedPix?.pix_holder_name && (
                <p className="text-[12px] text-zinc-400">Titular: {savedPix.pix_holder_name}</p>
              )}
              {pixSaved && (
                <p className="text-[12px] text-emerald-600 mt-1">Chave PIX salva com sucesso.</p>
              )}
              <p className="text-[11px] text-zinc-400 pt-1">Depósitos não têm taxa. Saques possuem taxa de processamento de {(withdrawalFeeRate * 100).toFixed(0)}%.</p>
            </div>
          ) : (
            <form onSubmit={handlePixSave} className="space-y-3">
              {!hasPix && (
                <p className="text-[12px] text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                  Configure sua chave PIX para habilitar saques.
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-zinc-500">Tipo de chave</label>
                  <select value={pixKeyType} onChange={(e) => setPixKeyType(e.target.value)}
                    className="w-full h-10 border border-zinc-200 rounded-xl px-3 text-[13px] text-zinc-900 bg-white focus:outline-none focus:border-zinc-400 transition-colors">
                    {Object.entries(PIX_TYPE_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="block text-[11px] font-medium text-zinc-500">Chave PIX</label>
                  <input type="text" value={pixKeyValue} onChange={(e) => setPixKeyValue(e.target.value)}
                    placeholder="Sua chave PIX"
                    className="w-full h-10 border border-zinc-200 rounded-xl px-3 text-[13px] text-zinc-900 bg-zinc-50 placeholder:text-[#647B7B] focus:outline-none focus:border-zinc-400 focus:bg-white transition-colors" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-zinc-500">Nome do titular</label>
                <input type="text" value={pixHolderName} onChange={(e) => setPixHolderName(e.target.value)}
                  placeholder="Nome completo ou razão social"
                  className="w-full h-10 border border-zinc-200 rounded-xl px-3 text-[13px] text-zinc-900 bg-zinc-50 placeholder:text-[#647B7B] focus:outline-none focus:border-zinc-400 focus:bg-white transition-colors" />
              </div>
              {pixError && (
                <p className="text-[12px] text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{pixError}</p>
              )}
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={pixSaving}
                  className="flex items-center gap-2 bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2] disabled:opacity-50 text-white text-[13px] font-bold px-5 py-2.5 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed">
                  {pixSaving ? "Salvando…" : "Salvar Chave PIX"}
                </button>
                {hasPix && (
                  <button type="button" onClick={() => { setPixEditing(false); setPixError(""); }}
                    className="text-[13px] font-semibold text-zinc-500 hover:text-zinc-900 border border-zinc-200 rounded-xl px-4 py-2.5 transition-colors cursor-pointer">
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Saved cards */}
      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Métodos de Pagamento</p>
        <SavedCardsWidget initialCards={savedCards} publicKey={mpPublicKey} onCardsChange={handleCardsChange} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Gasto (Confirmado)" value={brl(summary.totalSpent)}        sub="Apenas depósitos confirmados" stripe="from-indigo-500 to-violet-500" />
        <StatCard label="Pagamentos Pendentes"     value={brl(summary.pendingPayments)}   sub="Aguardando confirmação"      stripe="from-amber-400 to-orange-500"  />
        <StatCard label="Pagamentos Realizados"    value={brl(summary.completedPayments)} sub="Reservas confirmadas"        stripe="from-emerald-400 to-teal-500"  />
      </div>

      {/* Transactions table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-400">Transações</p>
            <p className="text-[12px] text-zinc-400 mt-1">Depósitos, custódia, pagamentos e movimentações da carteira.</p>
          </div>
          <span className="text-[12px] font-semibold text-zinc-400">{transactions.length} itens</span>
        </div>

        {transactions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-100 py-16 text-center">
            <p className="text-[14px] font-medium text-zinc-500">Nenhuma transação ainda</p>
            <p className="text-[13px] text-zinc-400 mt-1">Reservas e movimentações da carteira aparecerão aqui.</p>
          </div>
        ) : (
          <div className="bg-white rounded-[1.5rem] border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_14px_34px_rgba(7,17,13,0.06)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-100">
                    <th className="text-left px-6 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">Descrição</th>
                    <th className="text-left px-4 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest hidden md:table-cell">Vaga</th>
                    <th className="text-right px-4 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">Valor</th>
                    <th className="text-left px-4 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">Tipo</th>
                    <th className="text-right px-6 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest hidden sm:table-cell">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {transactions.map((t) => {
                    const isWallet     = t.kind === "wallet";
                    const isWithdrawal = t.status === "withdrawal";
                    const label        = isWallet ? (t.description ?? STATUS_LABEL[t.status] ?? t.status) : t.talent;
                    return (
                      <tr
                        key={t.id}
                        role={t.href ? "link" : undefined}
                        tabIndex={t.href ? 0 : undefined}
                        onClick={() => { if (t.href) router.push(t.href); }}
                        onKeyDown={(e) => {
                          if (t.href && (e.key === "Enter" || e.key === " ")) {
                            e.preventDefault();
                            router.push(t.href);
                          }
                        }}
                        className={[
                          "hover:bg-zinc-50/60 transition-colors",
                          t.href ? "cursor-pointer" : "",
                        ].join(" ")}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {isWallet && (
                              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-teal-50 flex items-center justify-center">
                                <svg className="w-3 h-3 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                </svg>
                              </span>
                            )}
                            <div className="min-w-0">
                              <p className="text-[13px] font-bold text-zinc-950 truncate max-w-[220px]">{label}</p>
                              {isWithdrawal && (
                                <div className="mt-0.5 space-y-0.5">
                                  <div className="flex flex-wrap gap-x-3">
                                    <span className="text-[11px] text-zinc-400">
                                      Solicitado {new Date(t.date).toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}
                                    </span>
                                    {t.processedAt && (
                                      <span className="text-[11px] text-zinc-400">
                                        Processado {new Date(t.processedAt).toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}
                                      </span>
                                    )}
                                  </div>
                                  {t.withdrawalStatus === "rejected" && t.adminNote && (
                                    <p className="text-[11px] text-rose-500">Motivo do cancelamento: {t.adminNote}</p>
                                  )}
                                  {t.withdrawalStatus === "pending" && (
                                    <p className="text-[11px] text-zinc-400">Processamento manual pela equipe.</p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 hidden md:table-cell">
                          <p className="text-[12px] text-zinc-500 truncate max-w-[200px]">{isWallet ? "—" : (t.job || "—")}</p>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <p className="text-[14px] font-black tabular-nums text-zinc-950">
                            {brl(Math.abs(t.amount))}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          {isWithdrawal && t.withdrawalStatus ? (
                            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${WITHDRAWAL_STATUS_CLS[t.withdrawalStatus] ?? "bg-zinc-100 text-zinc-500"}`}>
                              {WITHDRAWAL_STATUS_LABEL[t.withdrawalStatus] ?? t.withdrawalStatus}
                            </span>
                          ) : (
                            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${STATUS_CLS[t.status] ?? "bg-zinc-100 text-zinc-500"}`}>
                              {STATUS_LABEL[t.status] ?? t.status}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right hidden sm:table-cell">
                          <p className="text-[12px] text-zinc-400">
                            {new Date(t.date).toLocaleDateString("pt-BR", { month: "short", day: "numeric" })}
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



