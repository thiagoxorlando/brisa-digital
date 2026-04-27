"use client";

import { useState } from "react";

export type AdminReferral = {
  id: string;
  jobTitle: string;
  agencyName: string;
  talentName: string | null;
  referrerName: string | null;
  submittedAt: string;
  submissionStatus: string;
  booked: boolean;
  bookingValue: number;
  referralPayout: number;
  hasAccount: boolean;
  submissionId: string;
  inviteId: string | null;
  inviteEmail: string | null;
};

function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n);
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString("pt-BR", { month: "short", day: "numeric", year: "numeric" });
}

function getStatus(r: AdminReferral): { label: string; cls: string } {
  if (r.booked)                       return { label: "Reservado",         cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" };
  if (!r.hasAccount)                  return { label: "Aguardando Talento", cls: "bg-sky-50 text-sky-700 ring-1 ring-sky-100" };
  if (r.submissionStatus === "pending" || r.submissionStatus === "reviewing")
                                      return { label: "Candidato",         cls: "bg-violet-50 text-violet-700 ring-1 ring-violet-100" };
  if (r.submissionStatus === "rejected")
                                      return { label: "Rejeitado",         cls: "bg-rose-50 text-rose-600 ring-1 ring-rose-100" };
  return                                     { label: "Pendente",          cls: "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200" };
}

export default function AdminReferrals({ referrals: initial }: { referrals: AdminReferral[] }) {
  const [referrals, setReferrals] = useState<AdminReferral[]>(initial);
  const [resending, setResending] = useState<string | null>(null);
  const [toast, setToast]         = useState<{ msg: string; ok: boolean } | null>(null);

  async function handleResend(r: AdminReferral) {
    setResending(r.id);
    try {
      const res = await fetch("/api/admin/referrals/resend-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_id: r.inviteId, submission_id: r.submissionId }),
      });
      const d = await res.json().catch(() => ({}));
      const emailFailed = d?.emailSent === false;
      setToast({
        msg: res.ok
          ? "Convite reenviado com sucesso."
          : emailFailed
            ? "O convite nao foi reenviado por email. Verifique o provedor e tente novamente."
            : (d.error ?? "Erro ao reenviar."),
        ok: res.ok,
      });
    } catch (error) {
      console.error("[AdminReferrals] resend failed:", error);
      setToast({ msg: "Nao foi possivel reenviar o convite agora.", ok: false });
    } finally {
      setResending(null);
      setTimeout(() => setToast(null), 4000);
    }
  }

  const bookedCount     = referrals.filter((r) => r.booked).length;
  const totalPayout     = referrals.reduce((s, r) => s + r.referralPayout, 0);
  const totalBookingVal = referrals.filter((r) => r.booked).reduce((s, r) => s + r.bookingValue, 0);

  return (
    <div className="max-w-7xl space-y-6">
      {toast && (
        <div className={[
          "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-lg text-[13px] font-medium text-white",
          toast.ok ? "bg-emerald-600" : "bg-rose-600",
        ].join(" ")}>
          {toast.msg}
        </div>
      )}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Admin da Plataforma</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">Indicações</h1>
        <p className="text-[13px] text-zinc-400 mt-1">{referrals.length} total · {bookedCount} reservados</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Total de Indicações</p>
          <p className="text-[2rem] font-semibold tracking-tighter text-zinc-900">{referrals.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Valor Reservado</p>
          <p className="text-[2rem] font-semibold tracking-tighter text-zinc-900">{brl(totalBookingVal)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Total de Pagamentos de Indicação</p>
          <p className="text-[2rem] font-semibold tracking-tighter text-violet-700">{brl(totalPayout)}</p>
          <p className="text-[11px] text-zinc-400 mt-1">2% do valor reservado</p>
        </div>
      </div>

      {referrals.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-100 py-16 text-center shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <p className="text-[14px] font-medium text-zinc-500">Nenhuma indicação ainda</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="text-left px-6 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Talento</th>
                  <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden sm:table-cell">Vaga</th>
                  <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden md:table-cell">Indicado por</th>
                  <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden lg:table-cell">Agência</th>
                  <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Status</th>
                  <th className="text-right px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden md:table-cell">Reserva</th>
                  <th className="text-right px-6 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden md:table-cell">Taxa de Indicação</th>
                  <th className="px-4 py-3.5 w-36" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {referrals.map((r) => {
                  const st = getStatus(r);
                  return (
                    <tr key={r.id} className="hover:bg-zinc-50/60 transition-colors">
                      <td className="px-6 py-4">
                        <p className="text-[13px] font-semibold text-zinc-900">{r.talentName ?? "Sem nome"}</p>
                        <p className="text-[11px] text-zinc-400 mt-0.5">{formatDate(r.submittedAt)}</p>
                      </td>
                      <td className="px-4 py-4 hidden sm:table-cell">
                        <p className="text-[13px] text-zinc-500 truncate max-w-[180px]">{r.jobTitle}</p>
                      </td>
                      <td className="px-4 py-4 hidden md:table-cell">
                        <p className="text-[13px] text-zinc-500">{r.referrerName ?? "—"}</p>
                      </td>
                      <td className="px-4 py-4 hidden lg:table-cell">
                        <p className="text-[13px] text-zinc-500 truncate max-w-[140px]">{r.agencyName}</p>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex text-[11px] font-semibold px-2.5 py-1 rounded-full ${st.cls}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right hidden md:table-cell">
                        {r.bookingValue > 0
                          ? <p className="text-[13px] font-semibold text-zinc-900 tabular-nums">{brl(r.bookingValue)}</p>
                          : <p className="text-[13px] text-[#647B7B]">—</p>
                        }
                      </td>
                      <td className="px-6 py-4 text-right hidden md:table-cell">
                        {r.referralPayout > 0
                          ? <p className="text-[13px] font-semibold text-violet-700 tabular-nums">{brl(r.referralPayout)}</p>
                          : <p className="text-[13px] text-[#647B7B]">—</p>
                        }
                      </td>
                      <td className="px-4 py-4 text-right">
                        {!r.hasAccount && (
                          <button
                            onClick={() => handleResend(r)}
                            disabled={resending === r.id}
                            className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-100 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
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
  );
}

