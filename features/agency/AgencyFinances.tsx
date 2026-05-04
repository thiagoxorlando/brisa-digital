"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useRealtimeRefresh } from "@/lib/hooks/useRealtimeRefresh";
import { formatCpfCnpj, isValidCpfCnpj } from "@/lib/cpf";

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
  withdrawalMinAmount,
  profileCpfCnpj,
}: {
  summary: AgencyFinanceSummary;
  transactions: AgencyTransaction[];
  agencyPix?: { pix_key_type: string | null; pix_key_value: string | null; pix_holder_name: string | null } | null;
  withdrawalMinAmount: number;
  profileCpfCnpj: string;
}) {
  const router = useRouter();

  const walletBalance = summary.walletBalance ?? 0;

  const { refreshing: walletRefreshing } = useRealtimeRefresh(
    [{ table: "wallet_transactions" }, { table: "profiles" }],
    () => router.refresh(),
  );

  const [syncing, setSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);

  const [depositAmount, setDepositAmount] = useState("");
  const [depositCpfCnpj, setDepositCpfCnpj] = useState(formatCpfCnpj(profileCpfCnpj));
  const [depositLoading, setDepositLoading] = useState(false);
  const [depositError, setDepositError] = useState("");
  const [depositResult, setDepositResult] = useState<{
    paymentId: string;
    invoiceUrl: string | null;
    pixQrCode: string | null;
    pixCopyPaste: string | null;
  } | null>(null);
  const [pixCopied, setPixCopied] = useState(false);

  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawDone, setWithdrawDone] = useState(false);
  const [withdrawConfirming, setWithdrawConfirming] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawError, setWithdrawError] = useState("");
  const [withdrawInfo, setWithdrawInfo] = useState("");

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
    if (!Number.isFinite(amount) || amount < 10) return;
    if (!isValidCpfCnpj(depositCpfCnpj)) {
      setDepositError("CPF/CNPJ inválido");
      return;
    }

    setDepositLoading(true);
    setDepositError("");
    setDepositResult(null);

    const customerRes = await fetch("/api/asaas/customer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cpf_cnpj: depositCpfCnpj }),
    });
    const customerData = await customerRes.json().catch(() => ({})) as {
      error?: string;
      customerId?: string;
    };

    if (!customerRes.ok || !customerData.customerId) {
      setDepositLoading(false);
      setDepositError(customerData.error ?? "CPF/CNPJ inválido");
      return;
    }

    const res = await fetch("/api/asaas/deposit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
    });
    const data = await res.json().catch(() => ({})) as {
      error?: string;
      paymentId?: string;
      invoiceUrl?: string;
      pixQrCode?: string;
      pixCopyPaste?: string;
    };

    setDepositLoading(false);

    if (!res.ok || !data.paymentId) {
      setDepositError(
        data.error === "Crie seu cadastro Asaas antes de depositar."
          ? "CPF/CNPJ inválido"
          : (data.error ?? "Erro ao gerar cobrança PIX."),
      );
      return;
    }

    setDepositResult({
      paymentId:    data.paymentId,
      invoiceUrl:   data.invoiceUrl   ?? null,
      pixQrCode:    data.pixQrCode    ?? null,
      pixCopyPaste: data.pixCopyPaste ?? null,
    });
    setDepositAmount("");
  }

  async function handleSyncDeposit() {
    setSyncing(true);
    setSyncDone(false);
    try {
      await fetch("/api/asaas/deposit/sync", { method: "POST" });
      setSyncDone(true);
      router.refresh();
    } finally {
      setSyncing(false);
    }
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
                <p className="text-[12px] text-white/70 mt-1">Saldo total na carteira: {brl(walletBalance)}</p>
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
                  <p className="text-[11px] text-rose-100">Valor superior ao saldo disponível.</p>
                )}
                {withdrawAmountNum > 0 && withdrawAmountNum < withdrawalMinAmount && (
                  <p className="text-[11px] text-white/80">Valor minimo para agencias: {brl(withdrawalMinAmount)}.</p>
                )}
                {withdrawInfo && <p className="text-[11px] text-white/80">{withdrawInfo}</p>}
                {withdrawError && <p className="text-[11px] text-rose-100">{withdrawError}</p>}
              </div>
            )}

          </div>
        )}

        <div className="px-6 pt-5 pb-6 space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Depositar fundos</p>
            <p className="text-[12px] text-zinc-400 mt-1">O pagamento será feito via PIX pelo Asaas. O saldo aparece após confirmação do pagamento.</p>
          </div>

          {!depositResult ? (
            <form onSubmit={handleDeposit} className="space-y-3">
              {depositError && (
                <p className="text-[12px] text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{depositError}</p>
              )}
              <div>
                <label className="block text-[12px] font-medium text-zinc-600 mb-1.5">CPF ou CNPJ</label>
                <input
                  type="text"
                  value={depositCpfCnpj}
                  onChange={(e) => {
                    setDepositCpfCnpj(formatCpfCnpj(e.target.value));
                    if (depositError) setDepositError("");
                  }}
                  placeholder="000.000.000-00 ou 00.000.000/0000-00"
                  className="w-full px-4 py-3 text-[14px] rounded-xl border border-zinc-200 hover:border-zinc-300 focus:border-zinc-900 focus:bg-white focus:outline-none transition-colors"
                />
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-zinc-400 pointer-events-none">R$</span>
                  <input
                    type="number"
                    min={10}
                    step={1}
                    placeholder="0"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2.5 text-[13px] font-semibold bg-zinc-50 border border-zinc-200 rounded-xl placeholder:text-[#647B7B] hover:border-zinc-300 focus:border-zinc-900 focus:bg-white focus:outline-none transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  disabled={Boolean(depositLoading || !depositAmount || Number(depositAmount) < 10)}
                  className="flex items-center gap-2 bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2] disabled:bg-[#E6F0F0] disabled:text-[#B8D4D4] disabled:bg-none text-white text-[13px] font-bold px-5 py-2.5 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed flex-shrink-0"
                >
                  {depositLoading ? "Gerando..." : "Gerar PIX"}
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
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 bg-teal-50 border border-teal-100 rounded-xl px-4 py-3">
                <svg className="w-4 h-4 text-teal-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-[13px] font-semibold text-teal-800">Cobrança PIX gerada. Pague para creditar seu saldo.</p>
              </div>

              {depositResult.invoiceUrl && (
                <a
                  href={depositResult.invoiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2] text-white text-[13px] font-bold px-5 py-2.5 rounded-xl transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Abrir cobrança
                </a>
              )}

              {depositResult.pixCopyPaste && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">PIX Copia e Cola</p>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={depositResult.pixCopyPaste}
                      className="flex-1 text-[12px] font-mono bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-zinc-700 focus:outline-none truncate"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(depositResult.pixCopyPaste!);
                        setPixCopied(true);
                        setTimeout(() => setPixCopied(false), 2000);
                      }}
                      className="flex-shrink-0 text-[12px] font-semibold px-3 py-2 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 rounded-xl text-zinc-700 transition-colors cursor-pointer"
                    >
                      {pixCopied ? "Copiado!" : "Copiar"}
                    </button>
                  </div>
                </div>
              )}

              {depositResult.pixQrCode && (
                <div className="flex justify-center pt-1">
                  <img
                    src={`data:image/png;base64,${depositResult.pixQrCode}`}
                    alt="QR Code PIX"
                    className="w-40 h-40 rounded-xl border border-zinc-100"
                  />
                </div>
              )}

              <button
                type="button"
                onClick={() => { setDepositResult(null); setDepositError(""); }}
                className="text-[12px] font-semibold text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer"
              >
                Gerar novo PIX
              </button>
            </div>
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

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard label="Saldo Total" value={brl(walletBalance)} sub="Saldo atual em carteira" stripe="from-indigo-500 to-violet-500" />
        <StatCard label="Disponível para Saque" value={brl(walletBalance)} sub="Saldo disponível em carteira" stripe="from-emerald-400 to-teal-500" />
        <StatCard label="Pagamentos Pendentes" value={brl(summary.pendingPayments)} sub="Aguardando confirmacao" stripe="from-amber-400 to-orange-500" />
        <StatCard label="Pagamentos Realizados" value={brl(summary.completedPayments)} sub="Reservas confirmadas" stripe="from-cyan-400 to-sky-500" />
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
                          {transaction.kind === "wallet" && transaction.status === "pending" ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); void handleSyncDeposit(); }}
                              disabled={syncing}
                              className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 ring-1 ring-teal-100 hover:bg-teal-100 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {syncing ? "Verificando..." : syncDone ? "Verificado" : "Verificar pagamento"}
                            </button>
                          ) : (
                            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${STATUS_CLS[transaction.status] ?? "bg-zinc-100 text-zinc-500"}`}>
                              {STATUS_LABEL[transaction.status] ?? transaction.status}
                            </span>
                          )}
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
