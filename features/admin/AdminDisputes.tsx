"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  DISPUTE_STATUS_LABEL,
  DISPUTE_STATUS_TONE,
  type DisputeStatus,
} from "@/lib/disputePolicy";
import { brl } from "@/lib/brl";

export type AdminDisputeRow = {
  id: string;
  contractId: string;
  workspaceId: string | null;
  jobTitle: string | null;
  talentName: string | null;
  agencyName: string | null;
  status: DisputeStatus;
  openedAt: string;
  reason: string;
  resolvedAt?: string | null;
  resolution?: string | null;
  grossAmount: number;
  escrowAmount: number;
  contractStatus: string | null;
  urgency: "normal" | "high" | "critical" | "resolved";
};

type StatusFilter = DisputeStatus | "all";
type QuickFilter = "all" | "active" | "urgent" | "premium";

const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  all: "Todas",
  ...DISPUTE_STATUS_LABEL,
};

function fmt(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function AdminDisputes({ rows }: { rows: AdminDisputeRow[] }) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [contractId, setContractId] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = rows.filter((row) => {
    if (statusFilter !== "all" && row.status !== statusFilter) return false;
    if (quickFilter === "active") return row.status === "open" || row.status === "under_review";
    if (quickFilter === "urgent") return row.urgency === "high" || row.urgency === "critical";
    if (quickFilter === "premium") return Boolean(row.workspaceId);
    return true;
  });

  async function openDispute() {
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/admin/disputes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contractId, reason }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(String(payload.error ?? "Nao foi possivel abrir a disputa."));
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setShowOpenModal(false);
    setContractId("");
    setReason("");
    router.push(`/admin/disputes/${payload.id}`);
  }

  const quickFilters: Array<{ key: QuickFilter; label: string }> = [
    { key: "all", label: "Todas" },
    { key: "active", label: "Abertas" },
    { key: "urgent", label: "Urgentes" },
    { key: "premium", label: "Premium" },
  ];

  const urgencyTone: Record<AdminDisputeRow["urgency"], string> = {
    normal: "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200",
    high: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
    critical: "bg-red-50 text-red-700 ring-1 ring-red-100",
    resolved: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  };

  const urgencyLabel: Record<AdminDisputeRow["urgency"], string> = {
    normal: "Normal",
    high: "Alta",
    critical: "Critica",
    resolved: "Resolvida",
  };

  return (
    <div className="max-w-7xl space-y-6 px-4 sm:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
            Admin da plataforma
          </p>
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-zinc-900">
            Disputas
          </h1>
          <p className="mt-1 text-[13px] text-zinc-400">
            {rows.length} {rows.length === 1 ? "disputa" : "disputas"} - centro operacional de conflitos de escrow.
          </p>
        </div>
        <button
          onClick={() => setShowOpenModal(true)}
          className="rounded-2xl bg-zinc-950 px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm hover:bg-zinc-800"
        >
          Abrir disputa
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
        <div className="flex flex-wrap items-center gap-1 rounded-xl bg-zinc-100 p-1">
          {(["all", "open", "under_review", "resolved_refund", "resolved_release", "resolved_split", "closed"] as StatusFilter[]).map((sf) => (
            <button
              key={sf}
              onClick={() => setStatusFilter(sf)}
              className={[
                "whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all",
                statusFilter === sf
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700",
              ].join(" ")}
            >
              {STATUS_FILTER_LABEL[sf]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-xl bg-teal-50 p-1">
          {quickFilters.map((filter) => (
            <button
              key={filter.key}
              onClick={() => setQuickFilter(filter.key)}
              className={[
                "whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all",
                quickFilter === filter.key
                  ? "bg-white text-teal-800 shadow-sm"
                  : "text-teal-700 hover:text-teal-900",
              ].join(" ")}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
                  Contrato / Vaga
                </th>
                <th className="hidden px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400 sm:table-cell">
                  Talento
                </th>
                <th className="hidden px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400 md:table-cell">
                  Agencia
                </th>
                <th className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
                  Status
                </th>
                <th className="hidden px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400 lg:table-cell">
                  Custodia
                </th>
                <th className="hidden px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400 lg:table-cell">
                  Urgencia
                </th>
                <th className="hidden px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400 md:table-cell">
                  Aberta
                </th>
                <th className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
                  Motivo
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filtered.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => router.push(`/admin/disputes/${row.id}`)}
                  className="cursor-pointer hover:bg-zinc-50/80"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") router.push(`/admin/disputes/${row.id}`);
                  }}
                >
                  <td className="px-5 py-4">
                    <p className="max-w-[220px] truncate text-[13px] font-semibold text-zinc-900">
                      {row.jobTitle ?? "Vaga sem titulo"}
                    </p>
                    <div className="mt-0.5 flex items-center gap-1">
                      {row.workspaceId ? (
                        <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 ring-1 ring-violet-100">Premium</span>
                      ) : null}
                      <span className="text-[11px] text-zinc-400">{row.contractId.slice(0, 8)}...</span>
                    </div>
                  </td>
                  <td className="hidden px-4 py-4 sm:table-cell">
                    <span className="text-[13px] text-zinc-600">{row.talentName ?? "-"}</span>
                  </td>
                  <td className="hidden px-4 py-4 md:table-cell">
                    <span className="text-[13px] text-zinc-500">{row.agencyName ?? "-"}</span>
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${DISPUTE_STATUS_TONE[row.status]}`}
                    >
                      {DISPUTE_STATUS_LABEL[row.status]}
                    </span>
                  </td>
                  <td className="hidden px-4 py-4 lg:table-cell">
                    <p className="text-[13px] font-semibold text-zinc-900">{brl(row.escrowAmount)}</p>
                    <p className="text-[11px] text-zinc-400">bruto {brl(row.grossAmount)}</p>
                  </td>
                  <td className="hidden px-4 py-4 lg:table-cell">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${urgencyTone[row.urgency]}`}>
                      {urgencyLabel[row.urgency]}
                    </span>
                  </td>
                  <td className="hidden px-4 py-4 md:table-cell">
                    <span className="text-[12px] text-zinc-500">{fmt(row.openedAt)}</span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="line-clamp-2 text-[12px] text-zinc-500">{row.reason}</span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center">
                    <p className="text-[14px] font-medium text-zinc-500">Nenhuma disputa encontrada</p>
                    <p className="mt-1 text-[12px] text-zinc-400">
                      Disputas aparecem aqui quando contratos sao contestados ou abertos manualmente pelo admin.
                    </p>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {showOpenModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl">
            <h2 className="text-[18px] font-semibold text-zinc-950">Abrir disputa</h2>
            <p className="mt-2 text-[13px] leading-5 text-zinc-500">
              Informe um contrato real e o motivo. Se ja existir disputa aberta, vamos abrir o registro existente.
            </p>
            {error ? (
              <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-[13px] text-red-700">
                {error}
              </div>
            ) : null}
            <label className="mt-4 block text-[12px] font-semibold text-zinc-600">
              Contract ID
              <input
                value={contractId}
                onChange={(event) => setContractId(event.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 font-mono text-[13px] outline-none focus:border-teal-400"
                placeholder="uuid do contrato"
              />
            </label>
            <label className="mt-4 block text-[12px] font-semibold text-zinc-600">
              Motivo
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="mt-1 min-h-28 w-full rounded-2xl border border-zinc-200 p-3 text-[13px] outline-none focus:border-teal-400"
                placeholder="Descreva o conflito de escrow..."
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowOpenModal(false)}
                disabled={submitting}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-[12px] font-semibold text-zinc-600"
              >
                Cancelar
              </button>
              <button
                onClick={openDispute}
                disabled={submitting || !contractId.trim() || !reason.trim()}
                className="rounded-xl bg-teal-600 px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
              >
                Abrir
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
