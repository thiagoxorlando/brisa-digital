"use client";

import { useState } from "react";
import {
  DISPUTE_STATUS_LABEL,
  DISPUTE_STATUS_TONE,
  type DisputeStatus,
} from "@/lib/disputePolicy";

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
};

type StatusFilter = DisputeStatus | "all";

const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  all: "Todas",
  ...DISPUTE_STATUS_LABEL,
};

function fmt(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function AdminDisputes({ rows }: { rows: AdminDisputeRow[] }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const filtered = rows.filter(
    (r) => statusFilter === "all" || r.status === statusFilter,
  );

  return (
    <div className="max-w-7xl space-y-6 px-4 sm:px-6">
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
          Admin da plataforma
        </p>
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-zinc-900">
          Disputas
        </h1>
        <p className="mt-1 text-[13px] text-zinc-400">
          {rows.length} {rows.length === 1 ? "disputa" : "disputas"} — contratos contestados aguardando resolução admin.
        </p>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap items-center gap-1 rounded-xl bg-zinc-100 p-1">
        {(["all", "open", "under_review", "resolved_refund", "resolved_release", "closed"] as StatusFilter[]).map(
          (sf) => (
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
          ),
        )}
      </div>

      {/* Table */}
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
                  Agência
                </th>
                <th className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
                  Status
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
                <tr key={row.id} className="hover:bg-zinc-50/60">
                  <td className="px-5 py-4">
                    <p className="max-w-[200px] truncate text-[13px] font-semibold text-zinc-900">
                      {row.jobTitle ?? "Vaga sem título"}
                    </p>
                    <div className="mt-0.5 flex items-center gap-1">
                      {row.workspaceId && (
                        <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 ring-1 ring-violet-100">Premium</span>
                      )}
                      <span className="text-[11px] text-zinc-400">{row.contractId.slice(0, 8)}…</span>
                    </div>
                  </td>
                  <td className="hidden px-4 py-4 sm:table-cell">
                    <span className="text-[13px] text-zinc-600">{row.talentName ?? "—"}</span>
                  </td>
                  <td className="hidden px-4 py-4 md:table-cell">
                    <span className="text-[13px] text-zinc-500">{row.agencyName ?? "—"}</span>
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${DISPUTE_STATUS_TONE[row.status]}`}
                    >
                      {DISPUTE_STATUS_LABEL[row.status]}
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
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <p className="text-[14px] font-medium text-zinc-500">Nenhuma disputa encontrada</p>
                    <p className="mt-1 text-[12px] text-zinc-400">
                      Disputas aparecem aqui quando contratos são contestados após a data do trabalho.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
