"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  contractId: string;
  contractStatus: string;
  /** Pass the dispute ID if one already exists for this contract */
  activeDisputeId: string | null;
  /** Where to navigate when viewing the active dispute */
  activeDisputeHref: string | null;
  /** Base path for the new dispute: e.g. "/talent/workspaces/slug/disputes" */
  disputeListHref: string;
};

const MIN_REASON = 20;

/**
 * Renders an inline "Abrir disputa" / "Ver disputa" action for a contract row
 * or detail modal. Self-contained: manages its own modal state.
 *
 * Shows nothing when the contract is not in "confirmed" status and has no
 * active dispute.
 */
export default function AbrirDisputaButton({
  contractId,
  contractStatus,
  activeDisputeId,
  activeDisputeHref,
  disputeListHref,
}: Props) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [reason, setReason]       = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // Show "Ver disputa" link when one is already open
  if (activeDisputeId) {
    return (
      <a
        href={activeDisputeHref ?? `${disputeListHref}/${activeDisputeId}`}
        className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800 hover:bg-amber-100 transition-colors"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        Ver disputa
      </a>
    );
  }

  // Only offer "Abrir disputa" when contract is in confirmed (escrow) status
  if (contractStatus !== "confirmed") return null;

  async function submit() {
    if (reason.trim().length < MIN_REASON) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/contracts/${contractId}/dispute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    const payload = await res.json().catch(() => ({})) as {
      ok?: boolean; id?: string; error?: string; alreadyOpen?: boolean;
    };

    if (!res.ok) {
      setError(payload.error ?? "Não foi possível abrir a disputa.");
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setShowModal(false);
    setReason("");
    router.push(`${disputeListHref}/${payload.id}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setError(null); setShowModal(true); }}
        className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700 hover:bg-red-100 transition-colors"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        Abrir disputa
      </button>

      {showModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl">
            <h2 className="text-[18px] font-semibold text-zinc-950">Abrir disputa</h2>
            <p className="mt-1 text-[13px] leading-5 text-zinc-500">
              Explique o problema com detalhes. O pagamento ficará bloqueado até a análise da equipe BrisaHub.
            </p>

            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] leading-5 text-amber-800">
              Pagamento ficará bloqueado até análise da equipe BrisaHub.
            </div>

            {error ? (
              <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-[12px] text-red-700">
                {error}
              </div>
            ) : null}

            <label className="mt-4 block">
              <span className="text-[12px] font-semibold text-zinc-600">Motivo da disputa</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={5}
                className="mt-1 w-full rounded-2xl border border-zinc-200 p-3 text-[13px] outline-none focus:border-teal-400 resize-none"
                placeholder="Descreva o problema em detalhes (mínimo 20 caracteres)..."
              />
              <p className={[
                "mt-0.5 text-right text-[11px]",
                reason.trim().length < MIN_REASON ? "text-zinc-400" : "text-emerald-600",
              ].join(" ")}>
                {reason.trim().length}/{MIN_REASON} caracteres mínimos
              </p>
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={submitting}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-[12px] font-semibold text-zinc-600 hover:bg-zinc-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={submitting || reason.trim().length < MIN_REASON}
                className="rounded-xl bg-red-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {submitting ? "Enviando..." : "Enviar disputa"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
