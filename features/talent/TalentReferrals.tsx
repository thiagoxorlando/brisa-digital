"use client";

import { useState } from "react";

export type TalentReferral = {
  id: string;
  jobTitle: string;
  agencyName: string;
  talentName: string | null;
  submittedAt: string;
  submissionStatus: string;
  booked: boolean;
  commissionAmount: number | null;
  fraudReported: boolean;
  referralInviteId: string | null;
  hasAccount: boolean;
};

function formatDate(s: string) {
  return new Date(s).toLocaleDateString("pt-BR", { month: "short", day: "numeric", year: "numeric" });
}

function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n);
}

function getStatus(r: TalentReferral): { label: string; cls: string } {
  if (r.fraudReported)                return { label: "Fraude Reportada",   cls: "bg-rose-50 text-rose-600 ring-1 ring-rose-100" };
  if (r.commissionAmount !== null)    return { label: "Comissão Paga",      cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" };
  if (r.booked)                       return { label: "Contratado",         cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" };
  if (!r.hasAccount)                  return { label: "Aguardando Talento", cls: "bg-sky-50 text-sky-700 ring-1 ring-sky-100" };
  if (r.submissionStatus === "pending" || r.submissionStatus === "reviewing")
                                      return { label: "Candidatado",        cls: "bg-violet-50 text-violet-700 ring-1 ring-violet-100" };
  if (r.submissionStatus === "rejected")
                                      return { label: "Rejeitado",          cls: "bg-rose-50 text-rose-600 ring-1 ring-rose-100" };
  return                                     { label: "Aguardando",         cls: "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200" };
}

export default function TalentReferrals({ referrals: initial }: { referrals: TalentReferral[] }) {
  const [referrals, setReferrals] = useState<TalentReferral[]>(initial);
  const [reporting, setReporting] = useState<string | null>(null);
  const [resending, setResending] = useState<string | null>(null);
  const [toast, setToast]         = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const bookedCount = referrals.filter((r) => r.booked).length;

  async function handleReport(r: TalentReferral) {
    if (!r.referralInviteId) return;
    setReporting(r.id);
    const res = await fetch("/api/referrals/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite_id: r.referralInviteId }),
    });
    if (res.ok) {
      setReferrals((prev) => prev.map((x) => x.id === r.id ? { ...x, fraudReported: true } : x));
      setToast({ msg: "Denúncia registrada com sucesso.", type: "success" });
    } else {
      const d = await res.json().catch(() => ({}));
      setToast({ msg: d.error ?? "Erro ao registrar denúncia.", type: "error" });
    }
    setReporting(null);
    setTimeout(() => setToast(null), 4000);
  }

  async function handleResend(r: TalentReferral) {
    if (!r.referralInviteId) return;
    setResending(r.id);
    const res = await fetch("/api/referrals/resend-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite_id: r.referralInviteId }),
    });
    const d = await res.json().catch(() => ({}));
    setToast({
      msg: res.ok ? "Convite reenviado com sucesso." : (d.error ?? "Erro ao reenviar convite."),
      type: res.ok ? "success" : "error",
    });
    setResending(null);
    setTimeout(() => setToast(null), 4000);
  }

  return (
    <div className="max-w-3xl space-y-6">
      {toast && (
        <div className={[
          "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-lg text-[13px] font-medium text-white",
          toast.type === "success" ? "bg-emerald-600" : "bg-rose-600",
        ].join(" ")}>
          {toast.msg}
        </div>
      )}

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Atividade</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">Minhas Indicações</h1>
        <p className="text-[13px] text-zinc-400 mt-1">{referrals.length} total · {bookedCount} contratados</p>
      </div>

      <div className="flex items-center gap-2 text-[12px] text-zinc-400 bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2.5">
        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Você recebe <strong className="text-violet-600 mx-1">2% de taxa de indicação</strong> em cada contratação dos talentos que indicar.
      </div>

      {referrals.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-100 py-16 text-center shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <p className="text-[14px] font-medium text-zinc-500">Nenhuma indicação ainda</p>
          <p className="text-[13px] text-zinc-400 mt-1">Compartilhe seu link de indicação para ganhar 2% em cada contratação.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="text-left px-6 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Talento</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden sm:table-cell">Vaga</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden md:table-cell">Data</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Status</th>
                <th className="px-6 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {referrals.map((r) => {
                const st = getStatus(r);
                return (
                  <tr key={r.id} className="hover:bg-zinc-50/60 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-[13px] font-semibold text-zinc-900">{r.talentName ?? "Desconhecido"}</p>
                      {r.commissionAmount !== null && (
                        <p className="text-[11px] text-emerald-600 font-medium mt-0.5">
                          +{brl(r.commissionAmount)} comissão
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4 hidden sm:table-cell">
                      <p className="text-[13px] text-zinc-500 truncate max-w-[200px]">{r.jobTitle}</p>
                      <p className="text-[11px] text-zinc-400">{r.agencyName}</p>
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell">
                      <p className="text-[12px] text-zinc-400">{formatDate(r.submittedAt)}</p>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex text-[11px] font-semibold px-2.5 py-1 rounded-full ${st.cls}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {r.referralInviteId && !r.hasAccount && !r.fraudReported && (
                        <button
                          onClick={() => handleResend(r)}
                          disabled={resending === r.id}
                          className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-100 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {resending === r.id ? (
                            <div className="w-3 h-3 rounded-full border-2 border-sky-400 border-t-sky-700 animate-spin" />
                          ) : (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                          )}
                          {resending === r.id ? "Enviando…" : "Reenviar convite"}
                        </button>
                      )}
                      {r.referralInviteId && r.hasAccount && !r.fraudReported && !r.commissionAmount && (
                        <button
                          onClick={() => handleReport(r)}
                          disabled={reporting === r.id}
                          className="text-[11px] font-medium text-rose-500 hover:text-rose-700 disabled:opacity-50 transition-colors cursor-pointer"
                          title="Reportar fraude — indicado criou conta sem usar seu link"
                        >
                          {reporting === r.id ? "Enviando…" : "Denunciar"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
