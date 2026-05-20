"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { brl } from "@/lib/brl";

type Props = {
  contractId: string;
  talentName: string;
  totalValue: number;
  jobDate: string | null;
};

export default function AgentBookingActions({ contractId, talentName, totalValue, jobDate }: Props) {
  const router = useRouter();
  const [acting, setActing]           = useState<"pay" | "cancel" | null>(null);
  const [earlyPayWarning, setEarlyPayWarning] = useState(false);
  const [error, setError]             = useState<string | null>(null);

  async function callContract(action: string) {
    return fetch(`/api/contracts/${contractId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
  }

  function handlePay() {
    const jobPast = jobDate ? new Date(jobDate + "T23:59:59") < new Date() : true;
    if (!jobPast) { setEarlyPayWarning(true); return; }
    void executePay();
  }

  async function executePay() {
    setEarlyPayWarning(false);
    setError(null);
    setActing("pay");
    const res = await callContract("agent_pay");
    const d = await res.json().catch(() => ({})) as { error?: string };
    if (res.ok) {
      router.refresh();
    } else {
      setError(d.error ?? "Erro ao liberar pagamento. Tente novamente.");
    }
    setActing(null);
  }

  async function handleCancel() {
    const ok = window.confirm(`Cancelar reserva de ${talentName}?`);
    if (!ok) return;
    setError(null);
    setActing("cancel");
    const res = await callContract("cancel_job");
    const d = await res.json().catch(() => ({})) as { error?: string };
    if (res.ok) {
      router.refresh();
    } else {
      setError(d.error ?? "Erro ao cancelar. Tente novamente.");
    }
    setActing(null);
  }

  const cancelCls = "rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer";

  return (
    <div className="mt-3 space-y-2">
      {earlyPayWarning ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-amber-700 font-medium">Trabalho ainda não realizado. Pagar assim mesmo?</span>
          <button
            onClick={() => void executePay()}
            disabled={acting !== null}
            className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-60 cursor-pointer"
          >
            {acting === "pay" ? "…" : "Sim, pagar"}
          </button>
          <button
            onClick={() => setEarlyPayWarning(false)}
            className="text-[12px] font-medium px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-600 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handlePay}
            disabled={acting !== null}
            className="rounded-lg bg-emerald-500 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {acting === "pay" ? "Pagando..." : `Pagar talento · ${brl(totalValue)}`}
          </button>
          <button onClick={() => void handleCancel()} disabled={acting !== null} className={cancelCls}>
            {acting === "cancel" ? "Cancelando..." : "Cancelar reserva"}
          </button>
        </div>
      )}
      {error && <p className="text-[12px] text-rose-600 font-medium">{error}</p>}
    </div>
  );
}
