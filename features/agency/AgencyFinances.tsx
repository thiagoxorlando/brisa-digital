"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useRealtimeRefresh } from "@/lib/hooks/useRealtimeRefresh";

const SavedCardsWidget   = dynamic(() => import("@/components/ui/SavedCards"),         { ssr: false });
const WalletDepositModal = dynamic(() => import("@/components/ui/WalletDepositModal"), { ssr: false });

function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL", maximumFractionDigits: 0,
  }).format(n);
}

export type AgencyTransaction = {
  id: string;
  kind?: "booking" | "wallet";
  talent: string;
  job: string;
  amount: number;
  status: string;
  date: string;
  description?: string;
};

export type AgencyFinanceSummary = {
  totalSpent: number;
  pendingPayments: number;
  completedPayments: number;
  walletBalance?: number;
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
  release:         "Liberado",
  refund:          "Reembolso",
  credit:          "Crédito",
};

function StatCard({ label, value, sub, stripe }: { label: string; value: string; sub?: string; stripe: string }) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
      <div className={`h-[3px] bg-gradient-to-r ${stripe}`} />
      <div className="p-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">{label}</p>
        <p className="text-[2rem] font-semibold tracking-tighter text-zinc-900 leading-none">{value}</p>
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
}: {
  summary: AgencyFinanceSummary;
  transactions: AgencyTransaction[];
  savedCards: import("@/components/ui/SavedCards").SavedCard[];
  mpPublicKey: string;
}) {
  const router = useRouter();

  // Withdraw
  const [withdrawing,  setWithdrawing]  = useState(false);
  const [withdrawDone, setWithdrawDone] = useState(false);

  // Wallet balance (live) — syncs from server props on router.refresh()
  const [walletBalance, setWalletBalance] = useState(summary.walletBalance ?? 0);
  useEffect(() => { setWalletBalance(summary.walletBalance ?? 0); }, [summary.walletBalance]);

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
    txId: string; amount: number; qrCode: string; qrCodeBase64: string | null;
  } | null>(null);

  // Card deposit
  const [selectedCard,       setSelectedCard]       = useState(savedCards[0]?.id ?? "");
  const [cardDepositAmount,  setCardDepositAmount]  = useState("");
  const [cardDepositLoading, setCardDepositLoading] = useState(false);
  const [cardDepositError,   setCardDepositError]   = useState("");
  const [cardDepositDone,    setCardDepositDone]    = useState(false);

  async function handleWithdraw() {
    setWithdrawing(true);
    const res = await fetch("/api/agencies/withdraw", { method: "POST" });
    setWithdrawing(false);
    if (res.ok) {
      setWalletBalance(0);
      setWithdrawDone(true);
      setTimeout(() => setWithdrawDone(false), 4000);
    }
  }

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
        amount,
        qrCode:       data.qr_code ?? "",
        qrCodeBase64: data.qr_code_base64 ?? null,
      });
      setDepositAmount("");
    }
    setDepositLoading(false);
  }

  async function handleCardDeposit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(cardDepositAmount);
    if (!amount || amount <= 0 || !selectedCard) return;
    setCardDepositLoading(true);
    setCardDepositError("");
    setCardDepositDone(false);
    const res  = await fetch("/api/payments/wallet-deposit-card", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ card_id: selectedCard, amount }),
    });
    const data = await res.json();
    if (!res.ok) {
      setCardDepositError(data.error ?? "Erro ao processar pagamento. Tente novamente.");
    } else {
      setWalletBalance((prev) => prev + amount);
      setCardDepositAmount("");
      setCardDepositDone(true);
      setTimeout(() => setCardDepositDone(false), 4000);
      router.refresh();
    }
    setCardDepositLoading(false);
  }

  return (
    <div className="max-w-5xl space-y-8">

      {/* Header */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Visão Geral</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">Financeiro</h1>
        <p className="text-[13px] text-zinc-400 mt-1">{transactions.length} transações no total</p>
      </div>

      {/* PIX modal */}
      {depositModal && (
        <WalletDepositModal
          txId={depositModal.txId}
          amount={depositModal.amount}
          qrCode={depositModal.qrCode}
          qrCodeBase64={depositModal.qrCodeBase64}
          onConfirmed={() => {
            setDepositModal(null);
            setWalletBalance((prev) => prev + depositModal.amount);
            router.refresh();
          }}
          onClose={() => setDepositModal(null)}
        />
      )}

      {/* Wallet card */}
      <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="h-[3px] bg-gradient-to-r from-emerald-400 to-teal-500" />

        {/* Balance row */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-100">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Saldo na Plataforma</p>
              {walletRefreshing && (
                <span className="flex items-center gap-1 text-[10px] text-zinc-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Atualizando…
                </span>
              )}
            </div>
            <p className="text-[2rem] font-semibold tracking-tighter text-zinc-900 leading-none">{brl(walletBalance)}</p>
            <p className="text-[12px] text-zinc-400 mt-1.5">Disponível para confirmar reservas</p>
          </div>
          <button
            onClick={handleWithdraw}
            disabled={withdrawing || withdrawDone || walletBalance <= 0}
            className="flex items-center gap-2 bg-zinc-100 hover:bg-zinc-200 disabled:opacity-40 text-zinc-700 text-[13px] font-semibold px-5 py-2.5 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {withdrawing ? (
              <>
                <div className="w-3.5 h-3.5 rounded-full border-2 border-zinc-400 border-t-zinc-800 animate-spin" />
                Processando…
              </>
            ) : withdrawDone ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Solicitado
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                Solicitar Saque
              </>
            )}
          </button>
        </div>

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
                    "px-3.5 py-1.5 rounded-[10px] text-[12px] font-semibold transition-all cursor-pointer",
                    depositMethod === m
                      ? "bg-white text-zinc-900 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-700",
                  ].join(" ")}
                >
                  {m === "pix" ? "PIX" : "Cartão"}
                </button>
              ))}
            </div>
          </div>

          {depositMethod === "pix" && (
            <form onSubmit={handleDeposit} className="space-y-3">
              <p className="text-[12px] text-zinc-400">Crédito imediato após confirmação do pagamento.</p>
              {depositError && (
                <p className="text-[12px] text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{depositError}</p>
              )}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-zinc-400 pointer-events-none">R$</span>
                  <input type="number" min={1} step={1} placeholder="0" value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2.5 text-[13px] font-semibold bg-zinc-50 border border-zinc-200 rounded-xl placeholder:text-zinc-300 hover:border-zinc-300 focus:border-zinc-900 focus:bg-white focus:outline-none transition-colors" />
                </div>
                <button type="submit" disabled={depositLoading || !depositAmount || Number(depositAmount) <= 0}
                  className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-zinc-100 disabled:text-zinc-400 text-white text-[13px] font-semibold px-5 py-2.5 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed flex-shrink-0">
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
              {savedCards.length === 0 ? (
                <div className="bg-zinc-50 border border-zinc-100 rounded-2xl px-5 py-8 text-center space-y-2">
                  <svg className="w-8 h-8 text-zinc-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                  <p className="text-[13px] font-medium text-zinc-500">Nenhum cartão cadastrado</p>
                  <p className="text-[12px] text-zinc-400">Adicione um cartão em <span className="font-semibold text-zinc-600">Métodos de Pagamento</span> abaixo.</p>
                </div>
              ) : (
                <form onSubmit={handleCardDeposit} className="space-y-3">
                  <div className="space-y-2">
                    {savedCards.map((card) => {
                      const expiry = card.expiry_month && card.expiry_year
                        ? `${String(card.expiry_month).padStart(2, "0")}/${String(card.expiry_year).slice(-2)}`
                        : null;
                      const isSelected = selectedCard === card.id;
                      return (
                        <button key={card.id} type="button" onClick={() => setSelectedCard(card.id)}
                          className={["w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all cursor-pointer",
                            isSelected ? "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900" : "border-zinc-200 bg-white hover:border-zinc-300"].join(" ")}>
                          <div className={["w-3 h-3 rounded-full border-2 flex-shrink-0 transition-colors",
                            isSelected ? "border-zinc-900 bg-zinc-900" : "border-zinc-300"].join(" ")} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold uppercase bg-zinc-800 text-white px-1.5 py-0.5 rounded">{card.brand ?? "card"}</span>
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
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-zinc-400 pointer-events-none">R$</span>
                      <input type="number" min={1} step={1} placeholder="0" value={cardDepositAmount}
                        onChange={(e) => setCardDepositAmount(e.target.value)}
                        className="w-full pl-9 pr-3.5 py-2.5 text-[13px] font-semibold bg-zinc-50 border border-zinc-200 rounded-xl placeholder:text-zinc-300 hover:border-zinc-300 focus:border-zinc-900 focus:bg-white focus:outline-none transition-colors" />
                    </div>
                    <button type="submit" disabled={cardDepositLoading || !cardDepositAmount || Number(cardDepositAmount) <= 0 || !selectedCard}
                      className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-100 disabled:text-zinc-400 text-white text-[13px] font-semibold px-5 py-2.5 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed flex-shrink-0">
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

      {/* Saved cards */}
      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Métodos de Pagamento</p>
        <SavedCardsWidget initialCards={savedCards} publicKey={mpPublicKey} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Gasto (Confirmado)" value={brl(summary.totalSpent)}        sub="Apenas depósitos confirmados" stripe="from-indigo-500 to-violet-500" />
        <StatCard label="Pagamentos Pendentes"     value={brl(summary.pendingPayments)}   sub="Aguardando confirmação"      stripe="from-amber-400 to-orange-500"  />
        <StatCard label="Pagamentos Realizados"    value={brl(summary.completedPayments)} sub="Reservas confirmadas"        stripe="from-emerald-400 to-teal-500"  />
      </div>

      {/* Transactions table */}
      <div className="space-y-4">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Transações</p>

        {transactions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-100 py-16 text-center">
            <p className="text-[14px] font-medium text-zinc-500">Nenhuma transação ainda</p>
            <p className="text-[13px] text-zinc-400 mt-1">Reservas e movimentações da carteira aparecerão aqui.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
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
                    const isWallet = t.kind === "wallet";
                    const label    = isWallet ? (t.description ?? STATUS_LABEL[t.status] ?? t.status) : t.talent;
                    return (
                      <tr key={t.id} className="hover:bg-zinc-50/60 transition-colors">
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
                            <p className="text-[13px] font-semibold text-zinc-900 truncate max-w-[200px]">{label}</p>
                          </div>
                        </td>
                        <td className="px-4 py-4 hidden md:table-cell">
                          <p className="text-[12px] text-zinc-500 truncate max-w-[200px]">{isWallet ? "—" : (t.job || "—")}</p>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <p className="text-[14px] font-semibold tabular-nums text-zinc-900">
                            {brl(Math.abs(t.amount))}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${STATUS_CLS[t.status] ?? "bg-zinc-100 text-zinc-500"}`}>
                            {STATUS_LABEL[t.status] ?? t.status}
                          </span>
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
