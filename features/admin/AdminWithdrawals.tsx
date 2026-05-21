"use client";

import { useState, useCallback } from "react";
import { brl } from "@/lib/brl";
import { withdrawalStatusLabel, withdrawalStatusTone } from "@/lib/withdrawalStatus";

export type AdminWithdrawalRow = {
  id: string;
  userName: string;
  userRole: "agency" | "talent" | "unknown";
  amount: number;
  feeAmount: number;
  netAmount: number;
  status: string;
  createdAt: string;
  processedAt: string | null;
  provider: string | null;
  providerTransferId: string | null;
  providerStatus: string | null;
  pixKeyType: string | null;
  pixKeyValue: string | null;
  pixHolderName: string | null;
  adminNote: string | null;
};

type StatusFilter = "all" | "pending" | "processing" | "paid" | "failed" | "cancelled";

// Filter button labels (includes the "all" filter, which isn't a real status).
const FILTER_LABELS: Record<StatusFilter, string> = {
  all:        "Todos",
  pending:    withdrawalStatusLabel("pending"),
  processing: withdrawalStatusLabel("processing"),
  paid:       withdrawalStatusLabel("paid"),
  failed:     withdrawalStatusLabel("failed"),
  cancelled:  withdrawalStatusLabel("cancelled"),
};

function fmt(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" });
}

function PixInfo({ row }: { row: AdminWithdrawalRow }) {
  if (!row.pixKeyValue) return <span className="text-zinc-400">—</span>;
  return (
    <span className="text-[12px] text-zinc-600">
      {row.pixKeyType ? <span className="mr-1 text-[10px] font-semibold uppercase text-zinc-400">{row.pixKeyType}</span> : null}
      {row.pixKeyValue}
    </span>
  );
}

export default function AdminWithdrawals({ rows: initialRows }: { rows: AdminWithdrawalRow[] }) {
  const [rows, setRows]               = useState<AdminWithdrawalRow[]>(initialRows);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch]           = useState("");
  const [loadingId, setLoadingId]     = useState<string | null>(null);
  const [errorId, setErrorId]         = useState<string | null>(null);

  const filtered = rows
    .filter((r) => statusFilter === "all" || r.status === statusFilter)
    .filter((r) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return r.userName.toLowerCase().includes(q) || (r.pixKeyValue ?? "").toLowerCase().includes(q);
    });

  const pendingCount = rows.filter((r) => r.status === "pending" || r.status === "processing").length;

  const mutateRow = useCallback((id: string, patch: Partial<AdminWithdrawalRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  async function handleApprove(id: string) {
    setLoadingId(id);
    setErrorId(null);
    const res = await fetch(`/api/admin/withdrawals/${id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    setLoadingId(null);
    if (res.ok) {
      mutateRow(id, { status: "paid", processedAt: new Date().toISOString() });
    } else {
      setErrorId(id);
    }
  }

  async function handleCancel(id: string) {
    setLoadingId(id);
    setErrorId(null);
    const res = await fetch(`/api/admin/withdrawals/${id}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    setLoadingId(null);
    if (res.ok) {
      mutateRow(id, { status: "cancelled" });
    } else {
      setErrorId(id);
    }
  }

  return (
    <div className="max-w-7xl space-y-6 px-4 sm:px-6">
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Admin da plataforma</p>
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-zinc-900">Saques PIX</h1>
        <p className="mt-1 text-[13px] text-zinc-400">
          {rows.length} saques no histórico · {pendingCount} aguardando ação
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Aguardando ação",   value: String(rows.filter((r) => r.status === "pending").length),     stripe: "from-amber-400 to-orange-500" },
          { label: "Processando",       value: String(rows.filter((r) => r.status === "processing").length),  stripe: "from-indigo-400 to-violet-500" },
          { label: "Pagos (total)",     value: brl(rows.filter((r) => r.status === "paid").reduce((s, r) => s + r.netAmount, 0)), stripe: "from-emerald-400 to-teal-500" },
          { label: "Com problema",      value: String(rows.filter((r) => r.status === "failed").length),      stripe: "from-red-400 to-rose-500" },
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
          {(["all", "pending", "processing", "paid", "failed", "cancelled"] as const).map((sf) => (
            <button
              key={sf}
              onClick={() => setStatusFilter(sf)}
              className={["whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all", statusFilter === sf ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"].join(" ")}
            >
              {FILTER_LABELS[sf]}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-xs">
          <svg className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar nome ou chave PIX..."
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
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Usuário</th>
                <th className="hidden px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400 sm:table-cell">Chave PIX</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Status</th>
                <th className="px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Valor líquido</th>
                <th className="hidden px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400 md:table-cell">Solicitado</th>
                <th className="hidden px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400 md:table-cell">Processado</th>
                <th className="px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filtered.map((row) => {
                const isPending    = row.status === "pending";
                const isProcessing = row.status === "processing";
                const isLoading    = loadingId === row.id;
                const hasError     = errorId === row.id;
                return (
                  <tr key={row.id} className="hover:bg-zinc-50/60">
                    <td className="px-5 py-4">
                      <p className="text-[13px] font-semibold text-zinc-900">{row.userName}</p>
                      <span className="text-[10px] font-medium text-zinc-400 uppercase">{row.userRole === "talent" ? "Talento" : row.userRole === "agency" ? "Agência" : "Desconhecido"}</span>
                      {hasError && <p className="text-[11px] text-red-500 mt-0.5">Erro na ação. Tente novamente.</p>}
                    </td>
                    <td className="hidden px-4 py-4 sm:table-cell">
                      <PixInfo row={row} />
                      {row.pixHolderName && <p className="mt-0.5 text-[11px] text-zinc-400">{row.pixHolderName}</p>}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${withdrawalStatusTone(row.status)}`}>
                        {withdrawalStatusLabel(row.status)}
                      </span>
                      {row.adminNote && <p className="mt-1 max-w-[160px] truncate text-[11px] text-zinc-400" title={row.adminNote}>{row.adminNote}</p>}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="text-[13px] font-semibold tabular-nums text-zinc-900">{brl(row.netAmount)}</span>
                      {row.feeAmount > 0 && <p className="text-[11px] text-zinc-400">taxa {brl(row.feeAmount)}</p>}
                    </td>
                    <td className="hidden px-4 py-4 md:table-cell">
                      <span className="text-[12px] text-zinc-400">{fmt(row.createdAt)}</span>
                    </td>
                    <td className="hidden px-4 py-4 md:table-cell">
                      <span className="text-[12px] text-zinc-400">{fmt(row.processedAt)}</span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      {(isPending || isProcessing) && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleApprove(row.id)}
                            disabled={isLoading}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                          >
                            {isLoading ? "..." : "Aprovar"}
                          </button>
                          <button
                            onClick={() => handleCancel(row.id)}
                            disabled={isLoading}
                            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <p className="text-[14px] font-medium text-zinc-500">Nenhum saque encontrado</p>
                    <p className="mt-1 text-[12px] text-zinc-400">Ajuste os filtros ou aguarde novas solicitações.</p>
                  </td>
                </tr>
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-zinc-100 bg-zinc-50/80">
                  <td colSpan={3} className="px-5 py-3.5">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{filtered.length} saques</p>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <p className="text-[13px] font-semibold tabular-nums text-zinc-900">{brl(filtered.reduce((s, r) => s + r.netAmount, 0))}</p>
                  </td>
                  <td /><td /><td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
