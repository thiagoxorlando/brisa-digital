"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  VALID_TRANSITIONS,
  normaliseStatus,
  statusInfo,
  unifiedStatusInfo,
  type UnifiedBookingStatus,
} from "@/lib/bookingStatus";
import { useRealtimeRefresh } from "@/lib/hooks/useRealtimeRefresh";

export type AdminBooking = {
  id: string;
  jobTitle: string;
  talentName: string;
  agencyName: string;
  status: string;
  contractStatus: string | null;
  derivedStatus: string;
  price: number;
  contractAmount: number | null;
  created_at: string;
  contractSentAt: string | null;
  contractSignedAt: string | null;
  contractConfirmedAt: string | null;
};


function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n);
}

function formatDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-BR", { month: "short", day: "numeric", year: "numeric" });
}

function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4 space-y-4">
        <p className="text-[14px] text-zinc-700 font-medium">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 text-[13px] font-medium text-zinc-600 hover:border-zinc-300 transition-colors cursor-pointer">
            Cancelar
          </button>
          <button onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[13px] font-semibold transition-colors cursor-pointer">
            Mover para Lixeira
          </button>
        </div>
      </div>
    </div>
  );
}


function BookingRow({ booking: b, onDelete }: { booking: AdminBooking; onDelete: (id: string) => void }) {
  const [expanded, setExpanded]     = useState(false);
  const [editing, setEditing]       = useState(false);
  const [confirm, setConfirm]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [editStatus, setEditStatus] = useState(b.status);
  const [editPrice, setEditPrice]   = useState(String(b.price));
  const [local, setLocal]           = useState(b);

  const derivedStatus = local.derivedStatus as UnifiedBookingStatus;
  const st = unifiedStatusInfo(derivedStatus);
  const isPaid = derivedStatus === "pago";
  const paymentCls   = isPaid ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700";
  const paymentLabel = isPaid ? "Pago" : "Pendente";
  // Edit form: valid transitions are still driven by the raw booking status
  const validNext = VALID_TRANSITIONS[normaliseStatus(local.status)] ?? [];
  const statusOptions: string[] = [normaliseStatus(local.status), ...validNext];

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/admin/bookings/${b.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: editStatus, price: Number(editPrice) }),
    });
    setSaving(false);
    if (res.ok) {
      const d = await res.json().catch(() => ({}));
      setLocal((v) => ({ ...v, status: editStatus, price: Number(editPrice), derivedStatus: d.derived_status ?? v.derivedStatus }));
      setEditing(false);
    }
  }

  async function handleDelete() {
    const res = await fetch(`/api/admin/bookings/${b.id}`, { method: "DELETE" });
    if (res.ok) onDelete(b.id);
    setConfirm(false);
  }

  return (
    <Fragment>
      {confirm && (
        <ConfirmDialog
          message={`Mover reserva de "${local.jobTitle}" para a lixeira?`}
          onConfirm={handleDelete}
          onCancel={() => setConfirm(false)}
        />
      )}
      <tr onClick={() => !editing && setExpanded((v) => !v)}
        className="hover:bg-zinc-50/60 transition-colors cursor-pointer">
        <td className="px-6 py-4">
          <p className="text-[13px] font-semibold text-zinc-900 truncate max-w-[180px]">{local.jobTitle || "—"}</p>
        </td>
        <td className="px-4 py-4 hidden sm:table-cell">
          <span className="text-[13px] text-zinc-600">{local.talentName}</span>
        </td>
        <td className="px-4 py-4 hidden md:table-cell">
          <span className="text-[13px] text-zinc-500">{local.agencyName}</span>
        </td>
        <td className="px-4 py-4">
          <span className={`inline-flex text-[11px] font-semibold px-2.5 py-1 rounded-full ${st.badge}`}>
            {st.label}
          </span>
        </td>
        <td className="px-4 py-4 hidden sm:table-cell">
          <span className="text-[12px] text-zinc-300">—</span>
        </td>
        <td className="px-4 py-4 text-right hidden sm:table-cell">
          <span className="text-[13px] font-semibold text-zinc-900 tabular-nums">{(local.contractAmount ?? local.price) > 0 ? brl(local.contractAmount ?? local.price) : "—"}</span>
        </td>
        <td className="px-4 py-4 hidden lg:table-cell">
          <span className="text-[12px] text-zinc-400">{formatDate(local.created_at)}</span>
        </td>
        <td className="px-4 py-4 text-right">
          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { setEditing((v) => !v); setExpanded(true); }}
              className="text-[11px] font-medium text-zinc-400 hover:text-zinc-800 transition-colors cursor-pointer px-2 py-1 rounded-lg hover:bg-zinc-100">
              Editar
            </button>
            <button onClick={() => setConfirm(true)}
              className="text-[11px] font-medium text-rose-400 hover:text-rose-600 transition-colors cursor-pointer px-2 py-1 rounded-lg hover:bg-rose-50">
              Excluir
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-zinc-50/80">
          <td colSpan={8} className="px-6 py-5">
            {editing ? (
              <div className="space-y-4 max-w-sm">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Editar Reserva</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-1 block">Status</label>
                    <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}
                      className="w-full px-3 py-2 text-[13px] rounded-xl border border-zinc-200 focus:border-zinc-900 focus:outline-none bg-white">
                      {statusOptions.map((s) => <option key={s} value={s}>{statusInfo(s).label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-1 block">Valor (R$)</label>
                    <input type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)}
                      className="w-full px-3 py-2 text-[13px] rounded-xl border border-zinc-200 focus:border-zinc-900 focus:outline-none bg-white" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleSave} disabled={saving}
                    className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white text-[12px] font-semibold rounded-xl transition-colors cursor-pointer">
                    {saving ? "Salvando…" : "Salvar"}
                  </button>
                  <button onClick={() => setEditing(false)}
                    className="px-4 py-2 bg-white border border-zinc-200 text-zinc-600 text-[12px] font-medium rounded-xl hover:border-zinc-300 transition-colors cursor-pointer">
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Awaiting agency deposit */}
                {derivedStatus === "aguardando_deposito" && (
                  <div className="flex items-start gap-2.5 bg-sky-50 border border-sky-100 rounded-xl px-4 py-3">
                    <svg className="w-4 h-4 text-sky-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-[12px] text-sky-700 font-medium">
                      Aguardando depósito da agência para garantir o pagamento do talento
                    </p>
                  </div>
                )}
                {/* Timeline */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">Fluxo</p>
                  <div className="flex items-center gap-0 overflow-x-auto pb-1">
                    {[
                      {
                        label: "Criado",
                        done:  true,
                        date:  local.created_at,
                      },
                      {
                        label: "Contrato Enviado",
                        done:  !!local.contractSentAt,
                        date:  local.contractSentAt,
                      },
                      {
                        label: "Contrato Assinado",
                        done:  ["aguardando_deposito","aguardando_pagamento","pago"].includes(derivedStatus),
                        date:  local.contractSignedAt,
                      },
                      {
                        label: "Depósito",
                        done:  ["aguardando_pagamento","pago"].includes(derivedStatus),
                        date:  local.contractConfirmedAt,
                      },
                      {
                        label: "Pago",
                        done:  derivedStatus === "pago",
                        date:  null,
                      },
                    ].map((step, i, arr) => (
                      <div key={step.label} className="flex items-center flex-shrink-0">
                        <div className="flex flex-col items-center gap-1.5">
                          <div className={[
                            "w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                            step.done ? "bg-emerald-500 border-emerald-500" : "bg-white border-zinc-200",
                          ].join(" ")}>
                            {step.done && (
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <p className={`text-[10px] font-medium text-center whitespace-nowrap ${step.done ? "text-zinc-700" : "text-zinc-300"}`}>
                            {step.label}
                          </p>
                          {step.date && step.done && (
                            <p className="text-[9px] text-zinc-400 whitespace-nowrap">{formatDate(step.date)}</p>
                          )}
                        </div>
                        {i < arr.length - 1 && (
                          <div className={`w-10 h-0.5 mb-6 mx-1 flex-shrink-0 ${step.done && arr[i + 1].done ? "bg-emerald-300" : "bg-zinc-100"}`} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                {/* Details grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 text-[12px]">
                  <div><p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Vaga</p><p className="text-zinc-700 font-medium">{local.jobTitle || "—"}</p></div>
                  <div><p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">ID da Reserva</p><p className="font-mono text-zinc-700 truncate">{local.id}</p></div>
                  <div><p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Talento</p><p className="text-zinc-700">{local.talentName}</p></div>
                  <div><p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Agência</p><p className="text-zinc-700">{local.agencyName}</p></div>
                  <div>
                    <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-1">Pagamento</p>
                    <p className="text-zinc-700 font-semibold">{(local.contractAmount ?? local.price) > 0 ? brl(local.contractAmount ?? local.price) : "—"}</p>
                    <span className={`inline-flex mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${paymentCls}`}>{paymentLabel}</span>
                  </div>
                  <div><p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Status</p>
                    <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full ${st.badge}`}>
                      {st.label}
                    </span>
                  </div>
                  <div><p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Criado em</p><p className="text-zinc-700">{formatDate(local.created_at)}</p></div>
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </Fragment>
  );
}

export default function AdminBookings({ bookings: initialBookings }: { bookings: AdminBooking[] }) {
  const [bookings, setBookings] = useState<AdminBooking[]>(initialBookings);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const router = useRouter();

  // Sync when server re-renders with fresh props (after router.refresh())
  useEffect(() => { setBookings(initialBookings); }, [initialBookings]);

  const { refreshing } = useRealtimeRefresh(
    [{ table: "bookings" }, { table: "contracts" }],
    () => router.refresh(),
  );

  function handleDelete(id: string) {
    setBookings((prev) => prev.filter((b) => b.id !== id));
  }

  const filtered = bookings
    .filter((b) => {
      if (statusFilter === "all") return true;
      return b.derivedStatus === statusFilter;
    })
    .filter((b) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return b.jobTitle.toLowerCase().includes(q) || b.talentName.toLowerCase().includes(q) || b.agencyName.toLowerCase().includes(q);
    });

  const totalValue     = filtered.reduce((s, b) => s + (b.contractAmount ?? b.price), 0);
  const confirmedValue = filtered
    .filter((b) => ["aguardando_pagamento", "pago"].includes(b.derivedStatus))
    .reduce((s, b) => s + (b.contractAmount ?? b.price), 0);

  return (
    <div className="max-w-7xl space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Admin da Plataforma</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">Reservas</h1>
        <div className="flex items-center gap-3 mt-1">
          <p className="text-[13px] text-zinc-400">{bookings.length} reservas no total</p>
          {refreshing && (
            <span className="flex items-center gap-1.5 text-[11px] text-zinc-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Atualizando…
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {[
          { label: "Total",                value: brl(totalValue),     stripe: "from-zinc-400 to-zinc-600"    },
          { label: "Pago",                 value: brl(confirmedValue), stripe: "from-emerald-400 to-teal-500" },
          { label: "Aguardando Depósito",  value: String(filtered.filter((b) => b.derivedStatus === "aguardando_deposito").length),   stripe: "from-sky-400 to-blue-500"    },
          { label: "Aguardando Pagamento", value: String(filtered.filter((b) => b.derivedStatus === "aguardando_pagamento").length), stripe: "from-amber-400 to-orange-500" },
          { label: "Cancelado",            value: String(filtered.filter((b) => b.derivedStatus === "cancelado").length),             stripe: "from-zinc-300 to-zinc-400"    },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className={`h-[3px] bg-gradient-to-r ${s.stripe}`} />
            <div className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">{s.label}</p>
              <p className="text-[1.5rem] font-semibold tracking-tighter text-zinc-900 leading-none">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" placeholder="Buscar reservas…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-[13px] bg-white border border-zinc-200 rounded-xl placeholder:text-zinc-400 hover:border-zinc-300 focus:border-zinc-900 focus:outline-none transition-colors" />
        </div>
        <div className="flex items-center gap-1 bg-zinc-100 rounded-xl p-1 self-start flex-wrap">
          {(["all", "aguardando_assinatura", "aguardando_deposito", "aguardando_pagamento", "pago", "cancelado"] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={["px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap",
                statusFilter === s ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"].join(" ")}>
              {{
                all:                    "Todos",
                aguardando_assinatura:  "Aguard. Assinatura",
                aguardando_deposito:    "Aguard. Depósito",
                aguardando_pagamento:   "Aguard. Pagamento",
                pago:                   "Pago",
                cancelado:              "Cancelado",
              }[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="text-left px-6 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Vaga</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden sm:table-cell">Talento</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden md:table-cell">Agência</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Status</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden sm:table-cell">Contrato</th>
                <th className="text-right px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden sm:table-cell">Valor</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden lg:table-cell">Data</th>
                <th className="px-4 py-3.5 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filtered.map((b) => <BookingRow key={b.id} booking={b} onDelete={handleDelete} />)}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-6 py-16 text-center">
                  <p className="text-[14px] font-medium text-zinc-500">Nenhuma reserva encontrada</p>
                </td></tr>
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-zinc-100 bg-zinc-50/80">
                  <td colSpan={5} className="px-6 py-3.5">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{filtered.length} reservas</p>
                  </td>
                  <td className="px-4 py-3.5 text-right hidden sm:table-cell">
                    <p className="text-[13px] font-semibold text-zinc-900 tabular-nums">{totalValue > 0 ? brl(totalValue) : "—"}</p>
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
