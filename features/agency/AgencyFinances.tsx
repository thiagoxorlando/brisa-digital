"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { useRealtimeRefresh } from "@/lib/hooks/useRealtimeRefresh";
import { formatCpfCnpj, isValidCpfCnpj } from "@/lib/cpf";
import { generateReceiptPdf } from "@/lib/generateReceiptPdf";
import { useT } from "@/lib/LanguageContext";
import { brl } from "@/lib/brl";
import { withdrawalStatusLabel } from "@/lib/withdrawalStatus";
import { ledgerEntryLabel, ledgerEntryTone, type AgencyLedgerRow } from "@/lib/readModels/agencyLedger";
import { getWithdrawalFeePreview } from "@/lib/withdrawalPolicy";

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** AgencyTransaction is the canonical AgencyLedgerRow from the read model. */
export type AgencyTransaction = AgencyLedgerRow;

export type AgencyFinanceSummary = {
  pendingPayments: number;
  completedPayments: number;
  walletBalance?: number;
  allocatedToAgents?: number;
};


const PIX_TYPE_LABELS: Record<string, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  email: "E-mail",
  phone: "Telefone",
  random: "Chave aleatoria",
};


async function downloadReceipt(transaction: AgencyTransaction) {
  const effectiveStatus = transaction.withdrawalStatus ?? transaction.status;
  await generateReceiptPdf({
    receiptType: transaction.kind === "wallet" ? "saque" : "pagamento",
    id: transaction.id,
    amount: Math.abs(transaction.amount),
    status: effectiveStatus,
    createdAt: transaction.date,
    processedAt: transaction.processedAt ?? null,
    provider: transaction.provider ?? null,
    providerStatus: transaction.providerStatus ?? null,
    talentName: transaction.talent || null,
    jobTitle: transaction.job || null,
    bookingId: transaction.bookingId ?? null,
    description: transaction.description ?? null,
    adminNote: transaction.adminNote ?? null,
  });
}

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
  agencyConfig,
  agencyPix,
  withdrawalMinAmount,
  withdrawalFeePercent = 0,
  withdrawalMinFee = 0,
  profileCpfCnpj,
}: {
  summary: AgencyFinanceSummary;
  transactions: AgencyTransaction[];
  agencyConfig?: import("@/lib/agencyConfig").AgencyConfig;
  agencyPix?: { pix_key_type: string | null; pix_key_value: string | null; pix_holder_name: string | null } | null;
  withdrawalMinAmount: number;
  withdrawalFeePercent?: number;
  withdrawalMinFee?: number;
  profileCpfCnpj: string;
}) {
  const { t } = useT();
  const router = useRouter();

  const showWalletFunding = !agencyConfig || agencyConfig.showWalletFunding;
  const showCommission    = !agencyConfig || agencyConfig.showCommission;

  const walletBalance = summary.walletBalance ?? 0;
  const allocatedToAgents = summary.allocatedToAgents ?? 0;
  // Real usable balance: gross wallet minus money locked in agent virtual wallets
  const availableBalance = Math.max(0, walletBalance - allocatedToAgents);

  const { refreshing: walletRefreshing } = useRealtimeRefresh(
    [{ table: "wallet_transactions" }, { table: "profiles" }],
    () => router.refresh(),
  );

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
  const [expandedTransactionId, setExpandedTransactionId] = useState<string | null>(null);

  const hasPix = Boolean(savedPix?.pix_key_type && savedPix?.pix_key_value?.trim());
  const withdrawAmountNum = Math.round(Number(withdrawAmount) * 100) / 100;
  const canWithdraw = Boolean(
    withdrawAmountNum >= withdrawalMinAmount &&
    withdrawAmountNum <= availableBalance,
  );
  // Policy 1 — fee preview for agency withdrawals. Pure helper; server is the
  // authoritative calculator (lib/withdrawal-fee.ts) but UI must show the
  // breakdown before the user confirms.
  const withdrawalPreview = getWithdrawalFeePreview(
    withdrawAmountNum,
    withdrawalFeePercent,
    withdrawalMinFee,
  );

  const pendingWithdrawals = transactions.filter(
    (transaction) =>
      transaction.withdrawalStatus === "pending" ||
      transaction.withdrawalStatus === "processing" ||
      transaction.withdrawalStatus === "blocked",
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

  async function handleWithdraw() {
    const amount = Number(withdrawAmount);
    setWithdrawConfirming(false);
    setWithdrawing(true);
    setWithdrawError("");
    setWithdrawInfo("");

    const res = await fetch("/api/asaas/withdraw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
    });
    const data = await res.json().catch(() => ({})) as { error?: string };

    setWithdrawing(false);
    if (!res.ok) {
      setWithdrawError(data.error ?? "Erro ao solicitar saque.");
      return;
    }

    setWithdrawAmount("");
    setWithdrawDone(true);
    setWithdrawInfo("Saque via PIX solicitado. Acompanhe o status abaixo.");
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

      {showWalletFunding && <div className="bg-white rounded-[1.75rem] border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_18px_46px_rgba(7,17,13,0.08)] overflow-hidden">
        {withdrawConfirming ? (
          <div className="px-6 py-6 bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] text-white space-y-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white">{t("agency_finances_confirm_withdraw_title")}</p>
            <div className="space-y-2 text-[13px]">
              <div className="flex justify-between">
                <span className="text-white">{t("agency_finances_withdraw_requested_amount")}</span>
                <span className="font-bold text-white">{brl(withdrawalPreview.gross)}</span>
              </div>
              {withdrawalPreview.fee > 0 && (
                <div className="flex justify-between">
                  <span className="text-white/80">{t("agency_finances_withdraw_fee_label")}</span>
                  <span className="font-bold text-white">- {brl(withdrawalPreview.fee)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-white/30 pt-2">
                <span className="text-white font-semibold">{t("agency_finances_withdraw_net_amount")}</span>
                <span className="font-black text-white">{brl(withdrawalPreview.net)}</span>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleWithdraw}
                disabled={withdrawing}
                className="flex-1 bg-white hover:bg-white/90 disabled:opacity-50 text-[#0E7C86] text-[13px] font-black py-2.5 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {withdrawing ? t("action_loading") : t("agency_finances_confirm_withdraw_title")}
              </button>
              <button
                onClick={() => setWithdrawConfirming(false)}
                className="px-5 bg-white/20 hover:bg-white/30 text-white text-[13px] font-semibold py-2.5 rounded-xl transition-colors cursor-pointer"
              >
                {t("action_cancel")}
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
                <p className="text-[3rem] font-black tracking-[-0.07em] text-white leading-none">{brl(availableBalance)}</p>
                <p className="text-[12px] text-white/70 mt-1">
                  {allocatedToAgents > 0
                    ? `Disponível · ${brl(allocatedToAgents)} alocado a agentes`
                    : "Saldo disponível para saque"}
                </p>
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

            {availableBalance > 0 && !withdrawDone && (
              <div className="space-y-2">
                <div className="flex gap-1.5">
                  {([0.25, 0.5, 1] as const).map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setWithdrawAmount(String(Math.floor(availableBalance * pct * 100) / 100))}
                      className="text-[11px] font-bold px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors cursor-pointer"
                    >
                      {pct === 1 ? "100%" : pct === 0.5 ? "50%" : "25%"}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-white/60 pointer-events-none">R$</span>
                    <input
                      type="number"
                      min={withdrawalMinAmount}
                      step={0.01}
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      placeholder="0,00"
                      className="w-full pl-8 pr-3 py-2.5 text-[13px] font-semibold bg-white/10 border border-white/10 rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:border-white/30 transition-colors"
                    />
                  </div>
                  <button
                    onClick={() => { if (canWithdraw) setWithdrawConfirming(true); }}
                    disabled={Boolean(!canWithdraw || withdrawing)}
                    className="flex items-center gap-2 bg-white/10 hover:bg-white/15 disabled:opacity-40 text-white border border-white/10 text-[13px] font-bold px-5 py-2.5 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {t("agency_finances_request_withdraw")}
                  </button>
                </div>
                {withdrawAmountNum > availableBalance && (
                  <p className="text-[11px] text-rose-100">Valor superior ao saldo disponível.</p>
                )}
                {withdrawAmountNum > 0 && withdrawAmountNum < withdrawalMinAmount && (
                  <p className="text-[11px] text-white/80">
                    {t("agency_finances_withdraw_min_agency").replace("{amount}", brl(withdrawalMinAmount))}
                  </p>
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
            <p className="text-[12px] text-zinc-400 mt-1">{t("agency_finances_deposit_pix_info")}</p>
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
      </div>}

      {showWalletFunding && <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                      {withdrawalStatusLabel(transaction.withdrawalStatus ?? "pending")} · {fmtDate(transaction.date)}
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
                      {withdrawalStatusLabel(transaction.withdrawalStatus ?? "paid")} · {fmtDate(transaction.processedAt ?? transaction.date)}
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
      </div>}

      {showWalletFunding && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <StatCard label="Saldo Total" value={brl(walletBalance)} sub="Saldo bruto em carteira" stripe="from-indigo-500 to-violet-500" />
          <StatCard label="Disponível para Saque" value={brl(availableBalance)} sub={allocatedToAgents > 0 ? `${brl(allocatedToAgents)} alocado a agentes` : "Saldo disponível em carteira"} stripe="from-emerald-400 to-teal-500" />
          <StatCard label="Pagamentos Pendentes" value={brl(summary.pendingPayments)} sub="Em custódia" stripe="from-amber-400 to-orange-500" />
          <StatCard label="Pagamentos Realizados" value={brl(summary.completedPayments)} sub="Pagos ao talento" stripe="from-cyan-400 to-sky-500" />
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-400">Transações</p>
            <p className="text-[12px] text-zinc-400 mt-1">{(!agencyConfig || agencyConfig.showEscrow) ? "Depósitos, custódia, pagamentos e movimentações da carteira." : "Comprovantes, confirmações e histórico operacional de pagamentos."}</p>
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
                    <th className="text-right px-4 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">Valor</th>
                    <th className="text-left px-4 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">Tipo</th>
                    <th className="text-right px-6 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest hidden sm:table-cell">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((transaction) => {
                    const isWithdrawal = transaction.status === "withdrawal";
                    const label = transaction.kind === "wallet"
                      ? transaction.description ?? ledgerEntryLabel(transaction.status)
                      : transaction.talent || transaction.description || "Reserva";
                    const isExpanded = expandedTransactionId === transaction.id;
                    const receiptAvailable = Boolean(transaction.id && transaction.date && transaction.amount !== undefined);

                    return (
                      <Fragment key={transaction.id}>
                        <tr
                          className={[
                            "border-b border-zinc-50 transition-colors",
                            isExpanded ? "bg-zinc-50/70" : "hover:bg-zinc-50/60",
                          ].join(" ")}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-start gap-3">
                              <button
                                type="button"
                                onClick={() => setExpandedTransactionId((current) => current === transaction.id ? null : transaction.id)}
                                className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 transition-colors hover:border-zinc-300 hover:text-zinc-700 cursor-pointer"
                                aria-label={isExpanded ? "Recolher transação" : "Expandir transação"}
                              >
                                <svg className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                              <div className="min-w-0">
                                <p className="text-[13px] font-bold text-zinc-950 truncate max-w-[260px]">{label}</p>
                                {isWithdrawal && (
                                  <div className="mt-0.5 space-y-0.5">
                                    <p className="text-[11px] text-zinc-400">
                                      {withdrawalStatusLabel(transaction.withdrawalStatus ?? "pending")}
                                    </p>
                                    {transaction.adminNote && (
                                      <p className="text-[11px] text-rose-500">{transaction.adminNote}</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-right">
                            <p className="text-[14px] font-black tabular-nums text-zinc-950">{brl(Math.abs(transaction.amount))}</p>
                          </td>
                          <td className="px-4 py-4">
                            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${ledgerEntryTone(transaction.status)}`}>
                              {ledgerEntryLabel(transaction.status)}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right hidden sm:table-cell">
                            <p className="text-[12px] text-zinc-400">
                              {new Date(transaction.date).toLocaleDateString("pt-BR", { month: "short", day: "numeric" })}
                            </p>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="border-b border-zinc-50 bg-zinc-50/40">
                            <td colSpan={4} className="px-6 py-4">
                              <div className="grid gap-3 sm:grid-cols-2">
                                <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                                  <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Detalhes</p>
                                  <div className="mt-3 space-y-2 text-[13px] text-zinc-700">
                                    <p><strong>ID:</strong> {transaction.id}</p>
                                    <p><strong>Data e hora:</strong> {fmtDateTime(transaction.processedAt ?? transaction.date)}</p>
                                    <p><strong>Valor:</strong> {brl(Math.abs(transaction.amount))}</p>
                                    <p><strong>Status:</strong> {transaction.withdrawalStatus ? withdrawalStatusLabel(transaction.withdrawalStatus) : ledgerEntryLabel(transaction.status)}</p>
                                    <p><strong>Provedor:</strong> {transaction.provider ?? "BrisaHub"}</p>
                                    {transaction.providerStatus && <p><strong>Status do provedor:</strong> {transaction.providerStatus}</p>}
                                  </div>
                                </div>
                                <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                                  <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Referências</p>
                                  <div className="mt-3 space-y-2 text-[13px] text-zinc-700">
                                    <p><strong>Descrição:</strong> {transaction.description ?? "—"}</p>
                                    <p><strong>Vaga relacionada:</strong> {transaction.job || "—"}</p>
                                    <p><strong>Reserva relacionada:</strong> {transaction.bookingId ?? "—"}</p>
                                    <p><strong>Referência de pagamento:</strong> {transaction.href ?? "—"}</p>
                                    {transaction.href && (
                                      <button
                                        type="button"
                                        onClick={() => router.push(transaction.href!)}
                                        className="inline-flex items-center rounded-xl border border-zinc-200 px-3 py-2 text-[12px] font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 cursor-pointer"
                                      >
                                        Abrir referência
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="mt-4 flex flex-wrap gap-3">
                                {receiptAvailable ? (
                                  <button
                                    type="button"
                                    onClick={() => { void downloadReceipt(transaction); }}
                                    className="inline-flex items-center rounded-xl bg-[#1F2D2E] px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#2A3D3E] cursor-pointer"
                                  >
                                    Baixar comprovante
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled
                                    className="inline-flex items-center rounded-xl bg-zinc-100 px-4 py-2.5 text-[13px] font-semibold text-zinc-400 cursor-not-allowed"
                                  >
                                    Comprovante indisponível
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
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
