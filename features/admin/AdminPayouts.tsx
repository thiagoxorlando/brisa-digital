"use client";

import { useState } from "react";
import { brl } from "@/lib/brl";
import { type SpaceFilter, SPACE_FILTER_LABELS, matchesSpaceFilter } from "@/lib/spaceFilter";

export type AdminPayoutRow = {
  id: string;
  contractId: string | null;
  talentName: string;
  agencyName: string;
  jobTitle: string;
  gross: number;
  commission: number;
  net: number;
  payoutAmount: number;
  payoutDate: string;
  workspaceId: string | null;
  workspaceName: string | null;
};

function fmt(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" });
}

export default function AdminPayouts({ rows: initialRows }: { rows: AdminPayoutRow[] }) {
  const [spaceFilter, setSpaceFilter] = useState<SpaceFilter>("all");
  const [search, setSearch] = useState("");

  const filtered = initialRows
    .filter((r) => matchesSpaceFilter(r.workspaceId, spaceFilter))
    .filter((r) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        r.talentName.toLowerCase().includes(q) ||
        r.agencyName.toLowerCase().includes(q) ||
        r.jobTitle.toLowerCase().includes(q)
      );
    });

  const totalGross    = filtered.reduce((s, r) => s + r.gross, 0);
  const totalNet      = filtered.reduce((s, r) => s + r.net, 0);
  const totalCommission = filtered.reduce((s, r) => s + r.commission, 0);

  return (
    <div className="max-w-7xl space-y-6 px-4 sm:px-6">
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Admin da plataforma</p>
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-zinc-900">Pagamentos a talentos</h1>
        <p className="mt-1 text-[13px] text-zinc-400">
          {initialRows.length} pagamentos realizados — {initialRows.filter((r) => !r.workspaceId).length} Open Space · {initialRows.filter((r) => !!r.workspaceId).length} Premium
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {[
          { label: "Total bruto",      value: brl(totalGross),       stripe: "from-zinc-300 to-zinc-400" },
          { label: "Comissão brisa",   value: brl(totalCommission),  stripe: "from-indigo-400 to-violet-500" },
          { label: "Pago aos talentos", value: brl(totalNet),        stripe: "from-emerald-400 to-teal-500" },
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

        <div className="relative flex-1 max-w-xs">
          <svg className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar talento, agência ou vaga..."
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
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Talento</th>
                <th className="hidden px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400 sm:table-cell">Vaga / Espaço</th>
                <th className="hidden px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400 md:table-cell">Agência</th>
                <th className="px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Bruto</th>
                <th className="hidden px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-widest text-zinc-400 md:table-cell">Comissão</th>
                <th className="px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Líquido</th>
                <th className="hidden px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400 lg:table-cell">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filtered.map((row) => (
                <tr key={row.id} className="hover:bg-zinc-50/60">
                  <td className="px-5 py-4">
                    <span className="text-[13px] font-semibold text-zinc-900">{row.talentName}</span>
                  </td>
                  <td className="hidden px-4 py-4 sm:table-cell">
                    <p className="max-w-[180px] truncate text-[13px] text-zinc-700">{row.jobTitle}</p>
                    {row.workspaceId ? (
                      <div className="mt-0.5 flex gap-1">
                        <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 ring-1 ring-violet-100">Premium</span>
                        {row.workspaceName && <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">{row.workspaceName}</span>}
                      </div>
                    ) : (
                      <span className="text-[10px] font-medium text-zinc-400">Open Space</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-4 md:table-cell">
                    <span className="text-[13px] text-zinc-500">{row.agencyName}</span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className="text-[13px] tabular-nums text-zinc-700">{brl(row.gross)}</span>
                  </td>
                  <td className="hidden px-4 py-4 text-right md:table-cell">
                    <span className="text-[13px] tabular-nums text-indigo-700">{brl(row.commission)}</span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className="text-[13px] font-semibold tabular-nums text-emerald-700">{brl(row.net)}</span>
                  </td>
                  <td className="hidden px-4 py-4 lg:table-cell">
                    <span className="text-[12px] text-zinc-400">{fmt(row.payoutDate)}</span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <p className="text-[14px] font-medium text-zinc-500">Nenhum pagamento encontrado</p>
                    <p className="mt-1 text-[12px] text-zinc-400">Ajuste os filtros ou aguarde novos pagamentos.</p>
                  </td>
                </tr>
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-zinc-100 bg-zinc-50/80">
                  <td colSpan={3} className="px-5 py-3.5">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{filtered.length} pagamentos</p>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <p className="text-[13px] tabular-nums text-zinc-700">{brl(totalGross)}</p>
                  </td>
                  <td className="hidden px-4 py-3.5 text-right md:table-cell">
                    <p className="text-[13px] tabular-nums text-indigo-700">{brl(totalCommission)}</p>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <p className="text-[13px] font-semibold tabular-nums text-emerald-700">{brl(totalNet)}</p>
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
