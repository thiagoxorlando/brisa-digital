"use client";

import { useState } from "react";
import { brl } from "@/lib/brl";
import { getContractLifecycleState, type ContractLifecycleState } from "@/lib/readModels/contractLifecycle";
import { type SpaceFilter, SPACE_FILTER_LABELS, matchesSpaceFilter } from "@/lib/spaceFilter";

export type AdminEscrowRow = {
  id: string;
  jobTitle: string;
  talentName: string;
  agencyName: string;
  amount: number;
  status: string;
  createdAt: string;
  signedAt: string | null;
  depositPaidAt: string | null;
  confirmedAt: string | null;
  paidAt: string | null;
  jobDate: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
};

type LifecycleFilter = "all" | "pending" | "signed" | "escrowed";

const LIFECYCLE_LABELS: Record<LifecycleFilter, string> = {
  all:      "Todos",
  pending:  "Aguardando talento",
  signed:   "Aguardando depósito",
  escrowed: "Em custódia",
};

const LIFECYCLE_BADGE: Record<ContractLifecycleState, string> = {
  pending:   "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200",
  signed:    "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
  escrowed:  "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100",
  paid:      "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  cancelled: "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200",
  rejected:  "bg-red-50 text-red-600 ring-1 ring-red-100",
};

const LIFECYCLE_LABEL_MAP: Record<ContractLifecycleState, string> = {
  pending:   "Aguardando talento",
  signed:    "Aguardando depósito",
  escrowed:  "Em custódia",
  paid:      "Pago",
  cancelled: "Cancelado",
  rejected:  "Rejeitado",
};

function fmt(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" });
}

function fmtJobDate(value: string | null) {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" });
}

export default function AdminEscrow({ rows: initialRows }: { rows: AdminEscrowRow[] }) {
  const [spaceFilter, setSpaceFilter] = useState<SpaceFilter>("all");
  const [lifecycleFilter, setLifecycleFilter] = useState<LifecycleFilter>("all");
  const [search, setSearch] = useState("");

  const filtered = initialRows
    .filter((r) => matchesSpaceFilter(r.workspaceId, spaceFilter))
    .filter((r) => {
      if (lifecycleFilter === "all") return true;
      const state = getContractLifecycleState(r);
      return state === lifecycleFilter;
    })
    .filter((r) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        r.jobTitle.toLowerCase().includes(q) ||
        r.talentName.toLowerCase().includes(q) ||
        r.agencyName.toLowerCase().includes(q)
      );
    });

  const escrowedTotal = filtered
    .filter((r) => getContractLifecycleState(r) === "escrowed")
    .reduce((s, r) => s + r.amount, 0);

  const counts = {
    escrowed: initialRows.filter((r) => getContractLifecycleState(r) === "escrowed").length,
    signed:   initialRows.filter((r) => getContractLifecycleState(r) === "signed").length,
    pending:  initialRows.filter((r) => getContractLifecycleState(r) === "pending").length,
  };

  return (
    <div className="max-w-7xl space-y-6 px-4 sm:px-6">
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Admin da plataforma</p>
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-zinc-900">Custódia / Escrow</h1>
        <p className="mt-1 text-[13px] text-zinc-400">
          {initialRows.length} contratos ativos — {initialRows.filter((r) => !r.workspaceId).length} Open Space · {initialRows.filter((r) => !!r.workspaceId).length} Premium
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Em custódia",          value: brl(escrowedTotal),          stripe: "from-indigo-400 to-violet-500" },
          { label: "Contratos confirmados", value: String(counts.escrowed),     stripe: "from-indigo-400 to-violet-500" },
          { label: "Aguardando depósito",   value: String(counts.signed),       stripe: "from-amber-400 to-orange-500" },
          { label: "Aguardando talento",    value: String(counts.pending),      stripe: "from-zinc-300 to-zinc-400" },
        ].map((stat) => (
          <div key={stat.label} className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
            <div className={`h-[3px] bg-gradient-to-r ${stat.stripe}`} />
            <div className="p-4">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{stat.label}</p>
              <p className="text-[1.5rem] font-semibold leading-none tracking-tighter text-zinc-900">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-xl bg-zinc-100 p-1">
          {(["all", "open", "premium"] as const).map((sf) => (
            <button
              key={sf}
              onClick={() => setSpaceFilter(sf)}
              className={["whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all", spaceFilter === sf ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"].join(" ")}
            >
              {SPACE_FILTER_LABELS[sf]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 rounded-xl bg-zinc-100 p-1">
          {(["all", "escrowed", "signed", "pending"] as const).map((lf) => (
            <button
              key={lf}
              onClick={() => setLifecycleFilter(lf)}
              className={["whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all", lifecycleFilter === lf ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"].join(" ")}
            >
              {LIFECYCLE_LABELS[lf]}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-xs">
          <svg className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-10 pr-4 text-[13px] placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Vaga / Espaço</th>
                <th className="hidden px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400 sm:table-cell">Talento</th>
                <th className="hidden px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400 md:table-cell">Agência</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Status</th>
                <th className="hidden px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400 md:table-cell">Data da vaga</th>
                <th className="px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Valor</th>
                <th className="hidden px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400 lg:table-cell">Criado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filtered.map((row) => {
                const state = getContractLifecycleState(row);
                return (
                  <tr key={row.id} className="hover:bg-zinc-50/60">
                    <td className="px-5 py-4">
                      <p className="max-w-[200px] truncate text-[13px] font-semibold text-zinc-900">{row.jobTitle}</p>
                      {row.workspaceId ? (
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 ring-1 ring-violet-100">Premium</span>
                          {row.workspaceName && <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">{row.workspaceName}</span>}
                        </div>
                      ) : (
                        <span className="text-[10px] font-medium text-zinc-400">Open Space</span>
                      )}
                    </td>
                    <td className="hidden px-4 py-4 sm:table-cell">
                      <span className="text-[13px] text-zinc-600">{row.talentName}</span>
                    </td>
                    <td className="hidden px-4 py-4 md:table-cell">
                      <span className="text-[13px] text-zinc-500">{row.agencyName}</span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${LIFECYCLE_BADGE[state]}`}>
                        {LIFECYCLE_LABEL_MAP[state]}
                      </span>
                    </td>
                    <td className="hidden px-4 py-4 md:table-cell">
                      <span className="text-[12px] text-zinc-500">{fmtJobDate(row.jobDate)}</span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className={["text-[13px] font-semibold tabular-nums", state === "escrowed" ? "text-indigo-700" : "text-zinc-900"].join(" ")}>
                        {brl(row.amount)}
                      </span>
                    </td>
                    <td className="hidden px-4 py-4 lg:table-cell">
                      <span className="text-[12px] text-zinc-400">{fmt(row.createdAt)}</span>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <p className="text-[14px] font-medium text-zinc-500">Nenhum contrato ativo encontrado</p>
                    <p className="mt-1 text-[12px] text-zinc-400">Ajuste os filtros ou aguarde novos contratos.</p>
                  </td>
                </tr>
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-zinc-100 bg-zinc-50/80">
                  <td colSpan={5} className="px-5 py-3.5">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{filtered.length} contratos</p>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <p className="text-[13px] font-semibold tabular-nums text-zinc-900">{brl(filtered.reduce((s, r) => s + r.amount, 0))}</p>
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
