"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  DISPUTE_STATUS_LABEL,
  DISPUTE_STATUS_TONE,
  type DisputeStatus,
} from "@/lib/disputePolicy";
import { brl, parseBRL } from "@/lib/brl";
import { ledgerEntryLabel, ledgerEntryTone } from "@/lib/readModels/agencyLedger";

type ResolutionAction = "release" | "refund" | "split" | "close";

type AdminUiError = {
  message: string;
  detail: string | null;
};

export type DisputeTimelineItem = {
  id: string;
  label: string;
  description: string;
  date: string | null;
  tone: "red" | "amber" | "emerald" | "cyan" | "zinc";
};

export type DisputeWalletTransaction = {
  id: string;
  userId: string | null;
  type: string;
  amount: number;
  description: string | null;
  referenceId: string | null;
  idempotencyKey: string | null;
  status: string | null;
  createdAt: string;
};

export type DisputeNote = {
  id: string;
  adminName: string;
  visibility: "internal" | "public";
  body: string;
  createdAt: string;
};

export type AdminDisputeDetailData = {
  dispute: {
    id: string;
    status: DisputeStatus;
    reason: string;
    openedAt: string;
    openedByName: string;
    resolvedAt: string | null;
    resolutionNote: string | null;
    resolutionAction: string | null;
    talentAmount: number | null;
    agencyRefundAmount: number | null;
  };
  context: {
    jobTitle: string;
    jobDescription: string | null;
    agencyName: string;
    talentName: string;
    workspaceName: string | null;
    isPremium: boolean;
  };
  contract: {
    id: string;
    status: string;
    paymentStatus: string | null;
    statusLabel: string;
    statusTone: string;
    paymentStatusKey: string;
    gross: number;
    platformFee: number;
    referralDeduction: number;
    pendingReferralDeduction: number | null;
    netTalentAmount: number;
    escrowAmount: number;
    signedContractUrl: string | null;
    originalContractUrl: string | null;
    jobDate: string | null;
    jobTime: string | null;
    createdAt: string | null;
    signedAt: string | null;
    depositPaidAt: string | null;
    paidAt: string | null;
  } | null;
  payoutEligibility: {
    eligible: boolean;
    reason: string | null;
    blocked: boolean;
    blockReason: string | null;
  };
  walletTransactions: DisputeWalletTransaction[];
  timeline: DisputeTimelineItem[];
  notes: DisputeNote[];
  canResolve: boolean;
  isValid: boolean;
  invalidReasons: string[];
};

const ACTION_LABEL: Record<ResolutionAction, string> = {
  release: "Liberar custodia ao talento",
  refund: "Reembolsar agencia",
  split: "Decisao parcial",
  close: "Encerrar sem acao financeira",
};

const ACTION_DESCRIPTION: Record<ResolutionAction, string> = {
  release: "Credita o valor do talento na carteira, marca o contrato como pago e encerra a disputa.",
  refund: "Devolve a custodia para a agencia, cancela o contrato e encerra a disputa.",
  split: "Credita uma parte ao talento, reembolsa outra parte para a agencia e zera a custodia.",
  close: "Fecha a disputa sem mover dinheiro. O contrato fica no estado atual.",
};

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function timelineTone(tone: DisputeTimelineItem["tone"]) {
  const tones: Record<DisputeTimelineItem["tone"], string> = {
    red: "bg-red-50 text-red-700 ring-red-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    cyan: "bg-cyan-50 text-cyan-700 ring-cyan-100",
    zinc: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  };
  return tones[tone];
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.035)]">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{label}</p>
      <p className="mt-2 text-[20px] font-semibold tracking-tight text-zinc-900">{value}</p>
      {hint ? <p className="mt-1 text-[12px] text-zinc-500">{hint}</p> : null}
    </div>
  );
}

export default function AdminDisputeDetail({ data }: { data: AdminDisputeDetailData }) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<ResolutionAction | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [noteVisibility, setNoteVisibility] = useState<"internal" | "public">("internal");
  const [talentAmount, setTalentAmount] = useState("");
  const [agencyRefundAmount, setAgencyRefundAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<AdminUiError | null>(null);
  const [newNote, setNewNote] = useState("");
  const [newNoteVisibility, setNewNoteVisibility] = useState<"internal" | "public">("internal");

  const contract = data.contract;
  const splitTotal = parseBRL(talentAmount) + parseBRL(agencyRefundAmount);
  const splitExceeds = contract ? splitTotal > contract.escrowAmount : false;

  function errorDetailFromPayload(payload: Record<string, unknown>) {
    if (typeof payload.adminMessage === "string" && payload.adminMessage.trim()) return payload.adminMessage.trim();
    if (typeof payload.rawError === "string" && payload.rawError.trim()) return payload.rawError.trim();
    if (Array.isArray(payload.invalidReasons) && payload.invalidReasons.length > 0) {
      return payload.invalidReasons.map((reason) => String(reason)).join(" | ");
    }
    if (payload.details && typeof payload.details === "object") {
      const details = payload.details as Record<string, unknown>;
      const code = typeof payload.errorCode === "string" ? `Codigo: ${payload.errorCode}` : null;
      const status = typeof details.status === "string" ? `Status atual: ${details.status}` : null;
      const escrow = Number.isFinite(Number(details.escrow_amount))
        ? `Custodia esperada: ${brl(Number(details.escrow_amount))}`
        : null;
      return [code, status, escrow].filter(Boolean).join(" | ") || null;
    }
    return null;
  }

  async function submitResolution() {
    if (!pendingAction) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/disputes/${data.dispute.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: pendingAction,
          note: actionNote,
          noteVisibility,
          talentAmount: pendingAction === "split" ? parseBRL(talentAmount) : undefined,
          agencyRefundAmount: pendingAction === "split" ? parseBRL(agencyRefundAmount) : undefined,
        }),
      });

      const payload = await res.json().catch(() => ({})) as Record<string, unknown>;
      if (!res.ok) {
        setError({
          message: String(payload.error ?? "Nao foi possivel resolver a disputa."),
          detail: errorDetailFromPayload(payload),
        });
        return;
      }

      setPendingAction(null);
      setActionNote("");
      setTalentAmount("");
      setAgencyRefundAmount("");
      router.refresh();
    } catch {
      setError({ message: "Erro de rede. Verifique a conexao e tente novamente.", detail: null });
    } finally {
      setSubmitting(false);
    }
  }

  async function markUnderReview() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/disputes/${data.dispute.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "under_review", note: "Disputa assumida para analise admin." }),
      });
      const payload = await res.json().catch(() => ({})) as Record<string, unknown>;
      if (!res.ok) {
        setError({
          message: String(payload.error ?? "Nao foi possivel atualizar o status."),
          detail: errorDetailFromPayload(payload),
        });
      }
      router.refresh();
    } catch {
      setError({ message: "Erro de rede. Verifique a conexao e tente novamente.", detail: null });
    } finally {
      setSubmitting(false);
    }
  }

  async function addNote() {
    if (!newNote.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/disputes/${data.dispute.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: newNote, visibility: newNoteVisibility }),
      });
      const payload = await res.json().catch(() => ({})) as Record<string, unknown>;
      if (!res.ok) {
        setError({
          message: String(payload.error ?? "Nao foi possivel adicionar a nota."),
          detail: errorDetailFromPayload(payload),
        });
      } else {
        setNewNote("");
        router.refresh();
      }
    } catch {
      setError({ message: "Erro de rede. Verifique a conexao e tente novamente.", detail: null });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-7xl space-y-6 px-4 pb-10 sm:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link href="/admin/disputes" className="text-[12px] font-semibold text-teal-700 hover:text-teal-800">
            Voltar para disputas
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${DISPUTE_STATUS_TONE[data.dispute.status]}`}>
              {DISPUTE_STATUS_LABEL[data.dispute.status]}
            </span>
            {data.context.isPremium ? (
              <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 ring-1 ring-violet-100">
                Premium {data.context.workspaceName ? `- ${data.context.workspaceName}` : ""}
              </span>
            ) : null}
          </div>
          <h1 className="mt-3 max-w-3xl text-[2rem] font-semibold leading-tight tracking-tight text-zinc-950">
            {data.context.jobTitle}
          </h1>
          <p className="mt-2 max-w-3xl text-[14px] leading-6 text-zinc-500">{data.dispute.reason}</p>
        </div>

        <div className="rounded-2xl border border-zinc-100 bg-white p-4 text-right shadow-[0_1px_4px_rgba(0,0,0,0.035)]">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Disputa</p>
          <p className="mt-2 font-mono text-[13px] text-zinc-700">{data.dispute.id.slice(0, 8)}</p>
          <p className="mt-1 text-[12px] text-zinc-500">Aberta por {data.dispute.openedByName}</p>
          <p className="text-[12px] text-zinc-400">{fmtDateTime(data.dispute.openedAt)}</p>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          <p className="font-medium">{error.message}</p>
          {error.detail ? <p className="mt-1 text-[12px] text-red-600">{error.detail}</p> : null}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Valor bruto" value={brl(contract?.gross ?? 0)} hint="Valor contratado armazenado" />
        <StatCard label="Taxa plataforma" value={brl(contract?.platformFee ?? 0)} hint="commission_amount armazenado" />
        <StatCard
          label="Indicacao"
          value={brl(contract?.referralDeduction ?? 0)}
          hint={contract?.pendingReferralDeduction ? `Pendente estimado: ${brl(contract.pendingReferralDeduction)}` : "Movimento real vinculado"}
        />
        <StatCard label="Liquido talento" value={brl(contract?.netTalentAmount ?? 0)} hint="net_amount armazenado" />
        <StatCard label="Custodia em risco" value={brl(contract?.escrowAmount ?? 0)} hint={data.payoutEligibility.blocked ? "Payout bloqueado por disputa" : "Sem bloqueio ativo"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-3xl border border-zinc-100 bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Contexto completo</p>
              <h2 className="mt-1 text-[18px] font-semibold text-zinc-950">Contrato e partes</h2>
            </div>
            {contract ? (
              <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${contract.statusTone}`}>
                {contract.statusLabel}
              </span>
            ) : null}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-zinc-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Agencia</p>
              <p className="mt-1 text-[14px] font-semibold text-zinc-900">{data.context.agencyName}</p>
            </div>
            <div className="rounded-2xl bg-zinc-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Talento</p>
              <p className="mt-1 text-[14px] font-semibold text-zinc-900">{data.context.talentName}</p>
            </div>
            <div className="rounded-2xl bg-zinc-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Data do job</p>
              <p className="mt-1 text-[14px] font-semibold text-zinc-900">
                {fmtDate(contract?.jobDate)} {contract?.jobTime ? `- ${contract.jobTime}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-zinc-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Pagamento</p>
              <p className="mt-1 text-[14px] font-semibold text-zinc-900">{contract?.paymentStatus ?? "pending"}</p>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-zinc-100 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Contrato assinado</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {contract?.originalContractUrl ? (
                <Link className="rounded-xl bg-zinc-900 px-3 py-2 text-[12px] font-semibold text-white" href={contract.originalContractUrl} target="_blank">
                  Ver original
                </Link>
              ) : null}
              {contract?.signedContractUrl ? (
                <Link className="rounded-xl bg-teal-600 px-3 py-2 text-[12px] font-semibold text-white" href={contract.signedContractUrl} target="_blank">
                  Ver assinado
                </Link>
              ) : null}
              {!contract?.originalContractUrl && !contract?.signedContractUrl ? (
                <p className="text-[13px] text-zinc-500">Nenhum arquivo de contrato anexado.</p>
              ) : null}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-zinc-100 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Elegibilidade de payout</p>
            <p className="mt-2 text-[13px] text-zinc-600">
              {data.payoutEligibility.blocked
                ? data.payoutEligibility.blockReason
                : data.payoutEligibility.eligible
                  ? "Payout elegivel fora do bloqueio da disputa."
                  : data.payoutEligibility.reason}
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-zinc-100 bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Centro operacional</p>
              <h2 className="mt-1 text-[18px] font-semibold text-zinc-950">Resolver disputa</h2>
            </div>
            {data.dispute.status === "open" ? (
              <button
                onClick={markUnderReview}
                disabled={submitting}
                className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-700 disabled:opacity-50"
              >
                Marcar em analise
              </button>
            ) : null}
          </div>

          {!data.isValid && (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4">
              <p className="text-[13px] font-semibold text-red-800">Disputa inválida — resolução bloqueada</p>
              <ul className="mt-2 list-inside list-disc space-y-1">
                {data.invalidReasons.map((reason, i) => (
                  <li key={i} className="text-[12px] text-red-700">{reason}</li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-red-600">
                Corrija os vínculos de workspace/talento antes de resolver esta disputa.
              </p>
            </div>
          )}

          {data.canResolve ? (
            <div className="mt-5 grid gap-3">
              {(["release", "refund", "split", "close"] as ResolutionAction[]).map((action) => (
                <button
                  key={action}
                  onClick={() => {
                    setPendingAction(action);
                    setActionNote("");
                    setNoteVisibility("internal");
                    if (action === "split" && contract) {
                      setTalentAmount(String(contract.netTalentAmount));
                      setAgencyRefundAmount(String(Math.max(0, contract.gross - contract.netTalentAmount)));
                    }
                  }}
                  disabled={submitting || (!contract && action !== "close")}
                  className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4 text-left transition hover:border-teal-200 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <p className="text-[14px] font-semibold text-zinc-900">{ACTION_LABEL[action]}</p>
                  <p className="mt-1 text-[12px] leading-5 text-zinc-500">{ACTION_DESCRIPTION[action]}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl bg-zinc-50 p-4 text-[13px] text-zinc-500">
              Esta disputa esta em estado terminal. Nenhuma acao financeira adicional fica disponivel aqui.
            </div>
          )}

          {data.dispute.resolutionNote ? (
            <div className="mt-4 rounded-2xl border border-zinc-100 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Resolucao</p>
              <p className="mt-2 text-[13px] text-zinc-600">{data.dispute.resolutionNote}</p>
            </div>
          ) : null}
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-3xl border border-zinc-100 bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <h2 className="text-[18px] font-semibold text-zinc-950">Timeline</h2>
          <div className="mt-5 space-y-3">
            {data.timeline.map((item) => (
              <div key={item.id} className="flex gap-3">
                <div className={`mt-1 h-2.5 w-2.5 rounded-full ring-4 ${timelineTone(item.tone)}`} />
                <div>
                  <p className="text-[13px] font-semibold text-zinc-900">{item.label}</p>
                  <p className="text-[12px] text-zinc-500">{item.description}</p>
                  <p className="mt-0.5 text-[11px] text-zinc-400">{fmtDateTime(item.date)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-zinc-100 bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <h2 className="text-[18px] font-semibold text-zinc-950">Notas internas</h2>
          <div className="mt-4 space-y-3">
            <textarea
              value={newNote}
              onChange={(event) => setNewNote(event.target.value)}
              className="min-h-24 w-full rounded-2xl border border-zinc-200 p-3 text-[13px] outline-none focus:border-teal-400"
              placeholder="Registre contexto, evidencias ou proxima acao..."
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <select
                value={newNoteVisibility}
                onChange={(event) => setNewNoteVisibility(event.target.value === "public" ? "public" : "internal")}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[12px] text-zinc-600"
              >
                <option value="internal">Interna</option>
                <option value="public">Publica futura</option>
              </select>
              <button
                onClick={addNote}
                disabled={submitting || !newNote.trim()}
                className="rounded-xl bg-zinc-900 px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
              >
                Adicionar nota
              </button>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {data.notes.map((note) => (
              <div key={note.id} className="rounded-2xl bg-zinc-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[12px] font-semibold text-zinc-900">{note.adminName}</p>
                  <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 ring-1 ring-zinc-200">
                    {note.visibility}
                  </span>
                </div>
                <p className="mt-2 text-[13px] leading-5 text-zinc-600">{note.body}</p>
                <p className="mt-2 text-[11px] text-zinc-400">{fmtDateTime(note.createdAt)}</p>
              </div>
            ))}
            {data.notes.length === 0 ? <p className="text-[13px] text-zinc-400">Sem notas ainda.</p> : null}
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-3xl border border-zinc-100 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
        <div className="border-b border-zinc-100 p-5">
          <h2 className="text-[18px] font-semibold text-zinc-950">Wallet transactions vinculadas</h2>
          <p className="mt-1 text-[12px] text-zinc-500">Inclui custodia, payout, reembolso e comissao por referencia vinculados ao contrato.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Tipo</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Valor</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Descricao</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Criada</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Idempotencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {data.walletTransactions.map((tx) => (
                <tr key={tx.id}>
                  <td className="px-5 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${ledgerEntryTone(tx.type)}`}>
                      {ledgerEntryLabel(tx.type)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-[13px] font-semibold text-zinc-900">{brl(tx.amount)}</td>
                  <td className="max-w-[360px] px-4 py-4 text-[12px] text-zinc-500">{tx.description ?? "-"}</td>
                  <td className="px-4 py-4 text-[12px] text-zinc-500">{fmtDateTime(tx.createdAt)}</td>
                  <td className="px-4 py-4 font-mono text-[11px] text-zinc-400">{tx.idempotencyKey ?? "-"}</td>
                </tr>
              ))}
              {data.walletTransactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-[13px] text-zinc-400">
                    Nenhuma wallet transaction vinculada ao contrato.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {pendingAction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl">
            <h2 className="text-[18px] font-semibold text-zinc-950">{ACTION_LABEL[pendingAction]}</h2>
            <p className="mt-2 text-[13px] leading-5 text-zinc-500">{ACTION_DESCRIPTION[pendingAction]}</p>

            {pendingAction === "split" ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-[12px] font-semibold text-zinc-600">
                  Valor ao talento
                  <input
                    value={talentAmount}
                    onChange={(event) => setTalentAmount(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-[13px] outline-none focus:border-teal-400"
                    placeholder="0,00"
                  />
                </label>
                <label className="text-[12px] font-semibold text-zinc-600">
                  Reembolso agencia
                  <input
                    value={agencyRefundAmount}
                    onChange={(event) => setAgencyRefundAmount(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-[13px] outline-none focus:border-teal-400"
                    placeholder="0,00"
                  />
                </label>
                <p className={`sm:col-span-2 text-[12px] ${splitExceeds ? "text-red-600" : "text-zinc-500"}`}>
                  Total informado: {brl(splitTotal)} de {brl(contract?.escrowAmount ?? 0)} em custodia.
                </p>
              </div>
            ) : null}

            <label className="mt-4 block text-[12px] font-semibold text-zinc-600">
              Nota admin obrigatoria
              <textarea
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                value={actionNote}
                onChange={(event) => setActionNote(event.target.value)}
                className="mt-1 min-h-28 w-full rounded-2xl border border-zinc-200 p-3 text-[13px] outline-none focus:border-teal-400"
                placeholder="Explique a decisao, evidencias consideradas e valores liberados..."
              />
            </label>

            <div className="mt-3 flex items-center gap-2">
              <span className="text-[12px] font-semibold text-zinc-500">Visibilidade</span>
              <select
                value={noteVisibility}
                onChange={(event) => setNoteVisibility(event.target.value === "public" ? "public" : "internal")}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[12px] text-zinc-600"
              >
                <option value="internal">Interna</option>
                <option value="public">Publica futura</option>
              </select>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setPendingAction(null)}
                disabled={submitting}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-[12px] font-semibold text-zinc-600"
              >
                Cancelar
              </button>
              <button
                onClick={submitResolution}
                disabled={submitting || actionNote.trim().length < 3 || (pendingAction === "split" && splitExceeds)}
                className="rounded-xl bg-teal-600 px-4 py-2 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Enviando..." : "Confirmar decisao"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
