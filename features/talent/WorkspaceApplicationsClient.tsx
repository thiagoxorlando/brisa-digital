"use client";

import Link from "next/link";
import { useState } from "react";
import { brl } from "@/lib/brl";
import { type ContractPaymentStatus } from "@/lib/contractStatus";
import { submissionStatusLabel, submissionStatusTone } from "@/lib/submissionStatus";
import { getContractComputedState } from "@/lib/contractState";

export type WorkspaceApplicationItem = {
  id: string;
  jobId: string | null;
  jobTitle: string;
  jobBudget: number | null;
  jobDate: string | null;
  jobLocation: string | null;
  submissionStatus: string;
  contractPaymentStatus: ContractPaymentStatus | null;
  /** Raw contract.status for lifecycle derivation (present when contractPaymentStatus is set). */
  contractRawStatus?: string | null;
  createdAt: string;
  canCancel: boolean;
  cancelReason: string | null;
  /** True when a completed job_commitment transaction exists for this job. */
  isAgentJobBacked?: boolean;
};

type Props = {
  workspaceName: string;
  workspaceSlug: string;
  workspaceLogoUrl: string | null;
  primary: string;
  accent: string;
  locale: string;
  statusLang: "en" | "pt-BR";
  items: WorkspaceApplicationItem[];
  paymentMode?: "escrow" | "internal";
};

/**
 * Derive the display status label and tone for a reservation card.
 * Contract lifecycle overrides application status when a contract exists.
 */
function resolveDisplayStatus(
  item: WorkspaceApplicationItem,
  statusLang: "en" | "pt-BR",
): { label: string; tone: string } {
  if (item.contractRawStatus) {
    const state = getContractComputedState(
      { status: item.contractRawStatus, workspace_id: "ws" },
      { isAgentJobBacked: item.isAgentJobBacked ?? false, viewerRole: "talent" },
    );
    return { label: state.displayBadge, tone: state.displayTone };
  }
  const rawStatus = item.submissionStatus;
  if (rawStatus === "in_review") {
    const label = statusLang === "en" ? "In review" : "Em análise";
    return { label, tone: "bg-amber-50 text-amber-700 ring-1 ring-amber-100" };
  }
  return {
    label: submissionStatusLabel(rawStatus, statusLang),
    tone: submissionStatusTone(rawStatus),
  };
}

export default function WorkspaceApplicationsClient({
  workspaceName,
  workspaceSlug,
  workspaceLogoUrl,
  primary,
  accent,
  locale,
  statusLang,
  items: initialItems,
  paymentMode = "escrow",
}: Props) {
  const isInternalMode = paymentMode === "internal";
  const [items, setItems] = useState(initialItems);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, string | null>>({});

  const pending = items.filter(
    (item) => item.submissionStatus === "pending" || item.submissionStatus === "in_review",
  );
  const approved = items.filter((item) => item.submissionStatus === "approved");
  const rejected = items.filter((item) => item.submissionStatus === "rejected");
  const cancelled = items.filter((item) => item.submissionStatus === "cancelled");
  const withContract = items.filter((item) => item.contractPaymentStatus !== null);

  async function handleCancel(item: WorkspaceApplicationItem) {
    if (!item.canCancel || busyId) return;
    setBusyId(item.id);
    setFeedback((current) => ({ ...current, [item.id]: null }));

    try {
      const res = await fetch(`/api/submissions/${item.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({})) as { error?: string };

      if (!res.ok) {
        setFeedback((current) => ({
          ...current,
          [item.id]: data.error ?? "Não foi possível cancelar esta reserva.",
        }));
        return;
      }

      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? { ...entry, submissionStatus: "cancelled", canCancel: false }
            : entry,
        ),
      );
    } catch {
      setFeedback((current) => ({
        ...current,
        [item.id]: "Não foi possível cancelar esta reserva.",
      }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3.5">
        {workspaceLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={workspaceLogoUrl}
            alt={workspaceName}
            className="h-10 w-10 flex-shrink-0 rounded-xl border border-zinc-200 object-cover shadow-sm"
          />
        ) : (
          <div
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm"
            style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }}
          >
            {workspaceName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-zinc-400">
            {workspaceName}
          </p>
          <h1 className="text-[1.3rem] font-bold leading-tight text-zinc-950">Reservas</h1>
        </div>
      </div>

      {items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-[12px] font-medium text-zinc-600">
            {items.length} total
          </span>
          {withContract.length > 0 && (
            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[12px] font-medium text-indigo-700">
              {withContract.length} com contrato
            </span>
          )}
          {approved.length > 0 && (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[12px] font-medium text-emerald-700">
              {approved.length} aprovada{approved.length !== 1 ? "s" : ""}
            </span>
          )}
          {pending.length > 0 && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[12px] font-medium text-amber-700">
              {pending.length} em análise
            </span>
          )}
          {rejected.length > 0 && (
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-[12px] font-medium text-zinc-500">
              {rejected.length} não selecionada{rejected.length !== 1 ? "s" : ""}
            </span>
          )}
          {cancelled.length > 0 && (
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-[12px] font-medium text-zinc-400">
              {cancelled.length} cancelada{cancelled.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {items.length === 0 && (
        <div className="rounded-[22px] border border-zinc-200 bg-white px-6 py-14 text-center">
          <div
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl"
            style={{ background: `linear-gradient(135deg, ${primary}20, ${accent}10)` }}
          >
            <svg className="h-5 w-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-[14px] font-semibold text-zinc-600">Nenhuma reserva ainda.</p>
          <p className="mt-1 text-[13px] text-zinc-400">
            Candidate-se às{" "}
            <Link href={`/talent/workspaces/${workspaceSlug}/jobs`} className="font-medium text-zinc-700 underline-offset-2 hover:underline">
              vagas privadas
            </Link>{" "}
            desta agência para aparecer aqui.
          </p>
        </div>
      )}

      {items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((item) => {
            const { label, tone } = resolveDisplayStatus(item, statusLang);
            const isPendingReview =
              item.submissionStatus === "pending" || item.submissionStatus === "in_review";
            const isApproved = item.submissionStatus === "approved";
            const isCancelled = item.submissionStatus === "cancelled";
            const hasContract = item.contractPaymentStatus !== null;
            const isPaid = item.contractPaymentStatus === "paid_to_wallet";
            // Agent-backed signed contracts are effectively in escrow from the talent's perspective
            const isAgentReservedSigned =
              !!item.isAgentJobBacked &&
              (item.contractPaymentStatus === "signed" || item.contractPaymentStatus === "escrow");
            const isEscrow = item.contractPaymentStatus === "escrow" || isAgentReservedSigned;
            // "isContractSent" = awaiting deposit (not agent-backed)
            const isContractSent =
              (item.contractPaymentStatus === "pending" ||
               item.contractPaymentStatus === "signed") &&
              !isAgentReservedSigned;
            const disableReason = item.canCancel
              ? null
              : (item.cancelReason ?? "Esta reserva não pode mais ser cancelada.");

            return (
              <li key={item.id}>
                <div
                  className={`overflow-hidden rounded-[20px] border bg-white shadow-[0_4px_16px_rgba(15,23,42,0.04)] ${
                    isPaid
                      ? "border-emerald-200"
                      : isEscrow
                        ? "border-indigo-200"
                        : isApproved
                          ? "border-emerald-200"
                          : isCancelled
                            ? "border-zinc-100 opacity-60"
                            : "border-zinc-200"
                  }`}
                >
                  {(isPaid || isApproved) && (
                    <div
                      className="h-[3px]"
                      style={{ background: `linear-gradient(to right, ${primary}, ${accent})` }}
                    />
                  )}
                  {isEscrow && (
                    <div className="h-[3px] bg-gradient-to-r from-indigo-500 to-indigo-400" />
                  )}
                  <div className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold text-zinc-900">
                          {item.jobTitle}
                        </p>
                        {item.jobDate && (
                          <p className="mt-0.5 text-[12px] text-zinc-500">
                            {new Date(`${item.jobDate}T00:00:00`).toLocaleDateString(locale, {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                            })}
                          </p>
                        )}
                      </div>
                      <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>
                        {label}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-4 text-[12px] text-zinc-500">
                      {item.jobBudget != null && (
                        <span>
                          <span className="font-medium text-zinc-700">Cachê:</span>{" "}
                          <span className="font-semibold text-emerald-600">{brl(item.jobBudget)}</span>
                        </span>
                      )}
                      {item.jobLocation && (
                        <span>
                          <span className="font-medium text-zinc-700">Local:</span>{" "}
                          {item.jobLocation}
                        </span>
                      )}
                      <span className="text-zinc-400">
                        Reservado em{" "}
                        {new Date(item.createdAt).toLocaleDateString(locale, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>

                    {/* Context banners — contract lifecycle takes precedence */}
                    {isPaid && (
                      <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5">
                        <p className="text-[12px] leading-relaxed text-emerald-700">
                          {isInternalMode
                            ? "Pagamento confirmado."
                            : "Pagamento liberado. O valor já está disponível na sua carteira."}
                        </p>
                      </div>
                    )}

                    {isEscrow && (
                      <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2.5">
                        <p className="text-[12px] leading-relaxed text-indigo-700">
                          O pagamento está em custódia. Aguarde a liberação pela agência após a conclusão do trabalho.
                        </p>
                      </div>
                    )}

                    {isContractSent && !isEscrow && (
                      <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2.5">
                        <p className="text-[12px] leading-relaxed text-sky-700">
                          {item.contractPaymentStatus === "signed"
                            ? isInternalMode
                              ? "Contrato assinado. Aguardando pagamento direto da agência."
                              : "Contrato assinado. Aguardando depósito da agência."
                            : "Contrato enviado. Verifique a página de Contratos para assinar."}
                        </p>
                      </div>
                    )}

                    {!hasContract && isPendingReview && (
                      <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5">
                        <p className="text-[12px] leading-relaxed text-amber-700">
                          Sua reserva está em análise. Você pode cancelar enquanto não houver contrato enviado.
                        </p>
                      </div>
                    )}

                    {!hasContract && isApproved && (
                      <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5">
                        <p className="text-[12px] leading-relaxed text-emerald-700">
                          Reserva aprovada. Aguarde o envio do contrato pela agência.
                        </p>
                      </div>
                    )}

                    {isCancelled && (
                      <div className="mt-3 rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5">
                        <p className="text-[12px] leading-relaxed text-zinc-500">
                          Reserva cancelada.
                        </p>
                      </div>
                    )}

                    {feedback[item.id] && (
                      <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5">
                        <p className="text-[12px] leading-relaxed text-rose-700">{feedback[item.id]}</p>
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                      {!isCancelled && (
                        <button
                          type="button"
                          onClick={() => void handleCancel(item)}
                          disabled={!item.canCancel || busyId === item.id}
                          title={disableReason ?? undefined}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3.5 py-2 text-[12px] font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400 disabled:hover:bg-white"
                        >
                          {busyId === item.id ? "Cancelando..." : "Cancelar reserva"}
                        </button>
                      )}
                      {item.jobId && (
                        <Link
                          href={`/talent/workspaces/${workspaceSlug}/jobs/${item.jobId}`}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-[12px] font-semibold text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-100"
                        >
                          Ver vaga
                          <svg className="h-3.5 w-3.5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      )}
                      {hasContract && item.jobId && (
                        <Link
                          href={`/talent/workspaces/${workspaceSlug}/contracts`}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-[12px] font-semibold text-indigo-700 transition-colors hover:border-indigo-300 hover:bg-indigo-100"
                        >
                          Ver contrato
                          <svg className="h-3.5 w-3.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      )}
                    </div>

                    {!item.canCancel && disableReason && (
                      <p className="mt-2 text-right text-[11px] text-zinc-400">{disableReason}</p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
