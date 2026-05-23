"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import {
  DISPUTE_STATUS_LABEL,
  DISPUTE_STATUS_TONE,
  type DisputeStatus,
} from "@/lib/disputePolicy";
import {
  getContractPaymentStatus,
  contractStatusLabel,
  contractStatusTone,
} from "@/lib/contractStatus";
import { brl } from "@/lib/brl";
import type { ContractSearchResult } from "@/app/api/admin/contracts/search/route";

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
  isValid: boolean;
  invalidReasons: string[];
  scope: "open_space" | "premium" | "unknown";
};

type StatusFilter = DisputeStatus | "all";
type QuickFilter = "all" | "active" | "urgent" | "premium" | "invalid";

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
  const [openModalMode, setOpenModalMode] = useState<"normal" | "qa">("normal");
  const [contractId, setContractId] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Contract search state
  const [inputMode, setInputMode] = useState<"search" | "manual">("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ContractSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedContract, setSelectedContract] = useState<ContractSearchResult | null>(null);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/contracts/search?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json() as { results: ContractSearchResult[] };
        setSearchResults(data.results ?? []);
        setShowResults(true);
      } catch {
        // ignore transient errors
      } finally {
        setSearching(false);
      }
    }, 380);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  function selectContract(c: ContractSearchResult) {
    setSelectedContract(c);
    setContractId(c.id);
    setShowResults(false);
  }

  function clearSelection() {
    setSelectedContract(null);
    setContractId("");
    setSearchQuery("");
    setShowResults(false);
  }

  function closeModal() {
    setShowOpenModal(false);
    setContractId("");
    setReason("");
    setSearchQuery("");
    setSearchResults([]);
    setSelectedContract(null);
    setShowResults(false);
    setInputMode("search");
    setError(null);
  }

  const filtered = rows.filter((row) => {
    if (statusFilter !== "all" && row.status !== statusFilter) return false;
    if (quickFilter === "active") return row.status === "open" || row.status === "under_review";
    if (quickFilter === "urgent") return row.urgency === "high" || row.urgency === "critical";
    if (quickFilter === "premium") return Boolean(row.workspaceId);
    if (quickFilter === "invalid") return !row.isValid;
    return true;
  });

  const invalidCount = rows.filter((r) => !r.isValid).length;

  async function openDispute() {
    setSubmitting(true);
    setError(null);
    const isQa = openModalMode === "qa";
    const endpoint = isQa ? "/api/admin/disputes/qa-create" : "/api/admin/disputes";
    const body = isQa
      ? { contract_id: contractId, reason }
      : { contractId, reason };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await res.json().catch(() => ({})) as { error?: string; invalidReasons?: string[]; id?: string };
    if (!res.ok) {
      const msg = payload.invalidReasons?.length
        ? `${payload.error ?? ""} — ${payload.invalidReasons.join("; ")}`
        : String(payload.error ?? "Nao foi possivel abrir a disputa.");
      setError(msg);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setShowOpenModal(false);
    setContractId("");
    setReason("");
    router.push(`/admin/disputes/${payload.id}`);
  }

  function openNormalModal() { setInputMode("search"); setOpenModalMode("normal"); setShowOpenModal(true); }
  function openQaModal()     { setInputMode("search"); setOpenModalMode("qa");     setShowOpenModal(true); }

  const quickFilters: Array<{ key: QuickFilter; label: string; badge?: number }> = [
    { key: "all",     label: "Todas" },
    { key: "active",  label: "Abertas" },
    { key: "urgent",  label: "Urgentes" },
    { key: "premium", label: "Premium" },
    { key: "invalid", label: "Inválidas", badge: invalidCount },
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
        <div className="flex gap-2">
          <button
            onClick={openQaModal}
            className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] font-semibold text-amber-800 shadow-sm hover:bg-amber-100"
          >
            Criar QA
          </button>
          <button
            onClick={openNormalModal}
            className="rounded-2xl bg-zinc-950 px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm hover:bg-zinc-800"
          >
            Abrir disputa
          </button>
        </div>
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
                "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all",
                quickFilter === filter.key
                  ? "bg-white text-teal-800 shadow-sm"
                  : "text-teal-700 hover:text-teal-900",
              ].join(" ")}
            >
              {filter.label}
              {filter.badge != null && filter.badge > 0 ? (
                <span className="rounded-full bg-red-500 px-1.5 py-px text-[10px] font-bold leading-none text-white">
                  {filter.badge}
                </span>
              ) : null}
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
                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                      {row.workspaceId ? (
                        <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 ring-1 ring-violet-100">Premium</span>
                      ) : (
                        <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500 ring-1 ring-zinc-200">Open Space</span>
                      )}
                      {!row.isValid ? (
                        <span
                          className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 ring-1 ring-red-200"
                          title={row.invalidReasons.join(" | ")}
                        >
                          Inválida
                        </span>
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl">

            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-[18px] font-semibold text-zinc-950">
                {openModalMode === "qa" ? "Criar disputa QA" : "Abrir disputa"}
              </h2>
              <button
                onClick={closeModal}
                className="mt-0.5 rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {openModalMode === "qa" ? (
              <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] leading-5 text-amber-800">
                <strong>Ferramenta de teste</strong> — cria uma disputa de QA neste contrato. O motivo será marcado com [QA test]. Todos os relacionamentos são validados normalmente.
              </div>
            ) : (
              <p className="mt-2 text-[13px] leading-5 text-zinc-500">
                Informe um contrato e o motivo. Se já existir disputa aberta, o registro existente será aberto.
              </p>
            )}

            {/* ── Contract selector ── */}
            <div className="mt-4">
              <p className="text-[12px] font-semibold text-zinc-600">
                {inputMode === "search" ? "Buscar contrato" : "Contract ID (UUID)"}
              </p>

              {inputMode === "search" ? (
                <>
                  {selectedContract ? (
                    /* ── Selected contract preview ── */
                    <div className="mt-1 rounded-2xl border border-teal-200 bg-teal-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {selectedContract.workspaceId ? (
                              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700 ring-1 ring-violet-200">Premium</span>
                            ) : (
                              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-500 ring-1 ring-zinc-200">Open Space</span>
                            )}
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${contractStatusTone(getContractPaymentStatus({ status: selectedContract.status }))}`}
                            >
                              {contractStatusLabel(getContractPaymentStatus({ status: selectedContract.status }))}
                            </span>
                          </div>
                          <p className="mt-1.5 truncate text-[14px] font-semibold text-zinc-900">
                            {selectedContract.jobTitle ?? "Contrato sem vaga"}
                          </p>
                          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
                            <span>
                              <span className="text-zinc-500">Agência: </span>
                              <span className="font-medium text-zinc-700">{selectedContract.agencyName ?? "—"}</span>
                            </span>
                            <span>
                              <span className="text-zinc-500">Talento: </span>
                              <span className="font-medium text-zinc-700">{selectedContract.talentName ?? "—"}</span>
                            </span>
                            <span>
                              <span className="text-zinc-500">Valor: </span>
                              <span className="font-semibold text-zinc-800">{brl(selectedContract.paymentAmount)}</span>
                            </span>
                          </div>
                          <p className="mt-2 font-mono text-[10px] text-zinc-400">{selectedContract.id}</p>
                        </div>
                        <button
                          onClick={clearSelection}
                          className="mt-0.5 flex-shrink-0 rounded-lg p-1 text-zinc-400 hover:bg-teal-100 hover:text-zinc-700 transition-colors"
                          title="Alterar contrato"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── Search input + dropdown ── */
                    <div ref={searchRef} className="relative mt-1">
                      <div className="flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 focus-within:border-teal-400 transition-colors">
                        <svg className="h-3.5 w-3.5 flex-shrink-0 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onFocus={() => { if (searchResults.length > 0) setShowResults(true); }}
                          onBlur={() => setTimeout(() => setShowResults(false), 160)}
                          placeholder="Vaga, talento, agência ou ID…"
                          className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-zinc-400"
                          autoFocus
                        />
                        {searching && (
                          <svg className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-teal-500" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                          </svg>
                        )}
                      </div>

                      {showResults && (
                        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-2xl border border-zinc-100 bg-white shadow-xl">
                          {searchResults.length === 0 ? (
                            <p className="px-4 py-4 text-[13px] text-zinc-400">
                              Nenhum contrato encontrado
                            </p>
                          ) : (
                            searchResults.map((r) => {
                              const ps = getContractPaymentStatus({ status: r.status });
                              return (
                                <button
                                  key={r.id}
                                  onMouseDown={() => selectContract(r)}
                                  className="w-full border-b border-zinc-50 px-4 py-3 text-left last:border-b-0 hover:bg-zinc-50 transition-colors"
                                >
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {r.workspaceId ? (
                                      <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold text-violet-700">Premium</span>
                                    ) : (
                                      <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[9px] font-bold text-zinc-500">Open Space</span>
                                    )}
                                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${contractStatusTone(ps)}`}>
                                      {contractStatusLabel(ps)}
                                    </span>
                                    <span className="truncate text-[13px] font-semibold text-zinc-900">
                                      {r.jobTitle ?? "Contrato sem vaga"}
                                    </span>
                                  </div>
                                  <p className="mt-0.5 text-[11px] text-zinc-400">
                                    {[r.talentName, r.agencyName, brl(r.paymentAmount), r.shortId].filter(Boolean).join(" · ")}
                                  </p>
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => { setInputMode("manual"); setSelectedContract(null); setContractId(""); }}
                    className="mt-2 text-[11px] text-zinc-400 hover:text-zinc-700 transition-colors"
                  >
                    Usar UUID manualmente →
                  </button>
                </>
              ) : (
                /* ── Manual UUID input ── */
                <>
                  <input
                    value={contractId}
                    onChange={(e) => setContractId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 font-mono text-[13px] outline-none focus:border-teal-400"
                    placeholder="uuid do contrato"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => { setInputMode("search"); setContractId(""); }}
                    className="mt-2 text-[11px] text-zinc-400 hover:text-zinc-700 transition-colors"
                  >
                    ← Voltar para busca
                  </button>
                </>
              )}
            </div>

            {error ? (
              <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-[13px] text-red-700">
                {error}
              </div>
            ) : null}

            <label className="mt-4 block text-[12px] font-semibold text-zinc-600">
              Motivo
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="mt-1 min-h-28 w-full rounded-2xl border border-zinc-200 p-3 text-[13px] outline-none focus:border-teal-400 resize-none"
                placeholder="Descreva o conflito de escrow…"
              />
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={closeModal}
                disabled={submitting}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-[12px] font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={openDispute}
                disabled={submitting || !contractId.trim() || !reason.trim()}
                className="rounded-xl bg-teal-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? "Abrindo…" : "Abrir"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
