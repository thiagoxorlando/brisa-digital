"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { brl } from "@/lib/brl";
import { withdrawalStatusLabel } from "@/lib/withdrawalStatus";
import PixSetup, { type PixProfileRow, maskPixKey, PIX_LABELS } from "@/features/talent/PixSetup";

type WithdrawState = "idle" | "loading" | "success" | "error";

type Withdrawal = {
  id: string;
  amount: number;
  net_amount: number | null;
  fee_amount: number | null;
  status: string | null;
  created_at: string;
  processed_at: string | null;
  admin_note: string | null;
};

export default function WorkspaceFinancesClient({ paymentMode = "escrow" }: { paymentMode?: "escrow" | "internal" }) {
  const isInternal = paymentMode === "internal";
  const [walletBalance,   setWalletBalance]   = useState(0);
  const [withdrawals,     setWithdrawals]     = useState<Withdrawal[]>([]);
  const [pixReady,        setPixReady]        = useState(false);
  const [pixProfile,      setPixProfile]      = useState<PixProfileRow | null>(null);
  const [withdrawAmount,  setWithdrawAmount]  = useState("");
  const [withdrawState,   setWithdrawState]   = useState<WithdrawState>("idle");
  const [withdrawMsg,     setWithdrawMsg]     = useState("");
  const [loading,         setLoading]         = useState(true);

  async function load(initial = false) {
    if (initial) setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { if (initial) setLoading(false); return; }

    const [balanceRes, withdrawalRes, pixRes] = await Promise.all([
      supabase.from("profiles").select("wallet_balance").eq("id", user.id).single(),
      supabase
        .from("wallet_transactions")
        .select("id, amount, net_amount, fee_amount, status, created_at, processed_at, admin_note")
        .eq("user_id", user.id)
        .eq("type", "withdrawal")
        .order("created_at", { ascending: false }),
      supabase
        .from("talent_profiles")
        .select("pix_key_type, pix_key_value, pix_holder_name")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    setWalletBalance(Math.max(0, Number(balanceRes.data?.wallet_balance ?? 0)));

    if (pixRes.data) {
      const p = pixRes.data as PixProfileRow;
      setPixProfile(p);
      if (p.pix_key_value && p.pix_holder_name) setPixReady(true);
    }

    setWithdrawals((withdrawalRes.data ?? []).map((r) => ({
      id: r.id,
      amount: Number(r.amount ?? 0),
      net_amount: r.net_amount != null ? Number(r.net_amount) : null,
      fee_amount: r.fee_amount != null ? Number(r.fee_amount) : null,
      status: r.status ?? null,
      created_at: r.created_at,
      processed_at: (r as Record<string, unknown>).processed_at as string | null ?? null,
      admin_note: (r as Record<string, unknown>).admin_note as string | null ?? null,
    })));

    if (initial) setLoading(false);
  }

  useEffect(() => {
    void load(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const withdrawAmountNum = Math.round(Number(withdrawAmount) * 100) / 100;
  const canWithdraw = withdrawAmountNum > 0 && withdrawAmountNum <= walletBalance && pixReady && withdrawState !== "loading";

  const pendingWithdrawals = withdrawals.filter((w) =>
    w.status === "pending" || w.status === "processing" || w.status === "blocked"
  );
  const historyWithdrawals = withdrawals.filter((w) =>
    w.status === "paid" || w.status === "cancelled" || w.status === "rejected" || w.status === "failed"
  );
  const alreadyWithdrawn = withdrawals.filter((w) => w.status === "paid").reduce((s, w) => s + w.amount, 0);

  async function handleWithdraw() {
    if (!canWithdraw) return;
    setWithdrawState("loading");
    try {
      const res = await fetch("/api/asaas/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: withdrawAmountNum }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string; message?: string };
      if (!res.ok) {
        setWithdrawState("error");
        setWithdrawMsg(data.error ?? "Erro ao solicitar saque.");
        return;
      }
      setWithdrawState("success");
      setWithdrawAmount("");
      setWithdrawMsg(data.message ?? `Saque via PIX de ${brl(withdrawAmountNum)} solicitado. Acompanhe o status abaixo.`);
      await load(false);
    } catch {
      setWithdrawState("error");
      setWithdrawMsg("Erro de rede. Tente novamente.");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-700" />
      </div>
    );
  }

  if (isInternal) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-teal-100 bg-teal-50 px-5 py-4">
        <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-[13px] leading-relaxed text-teal-800">
          Pagamentos são feitos diretamente pela agência. O BrisaHub registra confirmações, mas não guarda saldo nem processa saques neste portal.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── PIX setup ──────────────────────────────────────────────────────── */}
      <PixSetup onSaved={(_, value, holderName) => {
        setPixReady(Boolean(value.trim() && holderName.trim()));
        void load(false);
      }} />

      {/* ── Withdrawal panel ───────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)]">
        <div className="border-b border-zinc-50 px-6 py-5">
          <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Saque via PIX</p>
          <p className="text-[1.55rem] font-semibold tracking-tight text-zinc-900">{brl(walletBalance)}</p>
          {alreadyWithdrawn > 0 && (
            <p className="mt-0.5 text-[12px] text-zinc-400">{brl(alreadyWithdrawn)} já sacado</p>
          )}
          <p className="mt-1 text-[12px] text-zinc-400">
            Saques dos seus pagamentos recebidos neste portal.
          </p>
        </div>

        <div className="px-6 pb-5 pt-4">
          {walletBalance === 0 ? (
            <p className="text-[13px] text-zinc-500">Nenhum saldo disponível para saque no momento.</p>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-zinc-400">R$</span>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="0,00"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2.5 pl-8 pr-3 text-[13px] font-semibold text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
                />
              </div>
              <button
                onClick={handleWithdraw}
                disabled={!canWithdraw}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400 sm:w-auto"
              >
                {withdrawState === "loading" ? (
                  <><div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />Processando…</>
                ) : withdrawState === "success" ? (
                  <><svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>Solicitado</>
                ) : "Solicitar saque"}
              </button>
            </div>
          )}

          {withdrawAmountNum > walletBalance && withdrawAmountNum > 0 && (
            <p className="mt-2 text-[11px] text-rose-600">Valor superior ao saldo disponível.</p>
          )}
          {!pixReady && walletBalance > 0 && (
            <p className="mt-2 text-[11px] text-amber-700">Cadastre sua chave PIX acima para sacar.</p>
          )}
        </div>

        {withdrawState === "success" && (
          <div className="mx-6 mb-5 flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
            <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-[13px] font-medium leading-relaxed text-emerald-800">{withdrawMsg}</p>
          </div>
        )}

        {withdrawState === "error" && (
          <div className="mx-6 mb-5 flex items-start gap-3 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3">
            <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-[13px] font-medium leading-relaxed text-rose-700">{withdrawMsg}</p>
          </div>
        )}

        {pendingWithdrawals.length > 0 && (
          <div className="mx-6 mb-5 overflow-hidden rounded-xl border border-zinc-100 bg-zinc-50">
            <p className="border-b border-zinc-100 px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Saques pendentes</p>
            <div className="divide-y divide-zinc-100">
              {pendingWithdrawals.map((w) => (
                <div key={w.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-zinc-900">{brl(w.amount)}</p>
                    <p className="text-[11px] text-zinc-400">
                      {withdrawalStatusLabel(w.status ?? "pending")} · {new Date(w.created_at).toLocaleDateString("pt-BR", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                    {w.admin_note && <p className="mt-0.5 text-[11px] text-zinc-500">{w.admin_note}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Withdrawal history ─────────────────────────────────────────────── */}
      {historyWithdrawals.length > 0 ? (
        <section className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
            Histórico de saques da sua carteira BrisaHub
          </p>
          <div className="divide-y divide-zinc-50 overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
            {historyWithdrawals.map((w) => {
              const isPaid = w.status === "paid";
              const refDate = new Date(w.processed_at ?? w.created_at);
              const netDisplay = w.net_amount != null ? brl(w.net_amount) : brl(w.amount);
              const pixTypeLabel = pixProfile?.pix_key_type ? (PIX_LABELS[pixProfile.pix_key_type] ?? pixProfile.pix_key_type) : null;

              return (
                <div key={w.id} className="flex items-center gap-4 px-5 py-4">
                  <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${isPaid ? "bg-emerald-100" : "bg-zinc-100"}`}>
                    <svg className={`h-4 w-4 ${isPaid ? "text-emerald-600" : "text-zinc-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-zinc-900">{withdrawalStatusLabel(w.status ?? "paid")}</p>
                    <p className="mt-0.5 text-[11px] text-zinc-400">
                      {refDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                      {pixTypeLabel && ` · PIX ${pixTypeLabel}`}
                      {pixProfile?.pix_key_value && ` · ${maskPixKey(pixProfile.pix_key_type, pixProfile.pix_key_value)}`}
                    </p>
                    {w.admin_note && <p className="mt-0.5 text-[11px] text-zinc-500">{w.admin_note}</p>}
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className={`text-[16px] font-semibold tabular-nums ${isPaid ? "text-emerald-700" : "text-zinc-500"}`}>{netDisplay}</p>
                    {w.net_amount != null && w.fee_amount != null && w.fee_amount > 0 && (
                      <p className="text-[10px] text-zinc-400">bruto {brl(w.amount)}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="rounded-[22px] border border-zinc-200 bg-white px-6 py-10 text-center">
          <p className="text-[14px] font-semibold text-zinc-600">Nenhum saque solicitado ainda.</p>
          <p className="mt-1 text-[13px] text-zinc-400">Quando você solicitar um saque, ele aparecerá aqui.</p>
        </div>
      )}
    </div>
  );
}
