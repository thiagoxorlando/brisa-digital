"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
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
  jobDate: string | null;
  contractSentAt: string | null;
  contractSignedAt: string | null;
  contractConfirmedAt: string | null;
};

function brl(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-BR", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatJobDate(value: string | null) {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <p className="text-[14px] font-medium text-zinc-700">{message}</p>
        <div className="mt-4 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-zinc-200 px-4 py-2.5 text-[13px] font-medium text-zinc-600 transition-colors hover:border-zinc-300"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-rose-700"
          >
            Mover para lixeira
          </button>
        </div>
      </div>
    </div>
  );
}

function BookingRow({
  booking,
  onDelete,
}: {
  booking: AdminBooking;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editPrice, setEditPrice] = useState(String(booking.price));
  const [local, setLocal] = useState(booking);

  const derivedStatus = local.derivedStatus as UnifiedBookingStatus;
  const derivedStatusInfo = unifiedStatusInfo(derivedStatus);
  const isPaid = derivedStatus === "pago";
  const paymentTone = isPaid ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700";
  const paymentLabel = isPaid ? "Pago" : "Pendente";

  async function handleSave() {
    setSaving(true);
    const response = await fetch(`/api/admin/bookings/${booking.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price: Number(editPrice) }),
    });
    setSaving(false);

    if (response.ok) {
      setLocal((current) => ({ ...current, price: Number(editPrice) }));
      setEditing(false);
    }
  }

  async function handleDelete() {
    const response = await fetch(`/api/admin/bookings/${booking.id}`, { method: "DELETE" });
    if (response.ok) onDelete(booking.id);
    setConfirm(false);
  }

  return (
    <Fragment>
      {confirm ? (
        <ConfirmDialog
          message={`Mover reserva de "${local.jobTitle}" para a lixeira?`}
          onConfirm={handleDelete}
          onCancel={() => setConfirm(false)}
        />
      ) : null}

      <tr
        onClick={() => !editing && setExpanded((current) => !current)}
        className="cursor-pointer transition-colors hover:bg-zinc-50/60"
      >
        <td className="px-6 py-4">
          <p className="max-w-[180px] truncate text-[13px] font-semibold text-zinc-900">{local.jobTitle || "-"}</p>
        </td>
        <td className="hidden px-4 py-4 sm:table-cell">
          <span className="text-[13px] text-zinc-600">{local.talentName}</span>
        </td>
        <td className="hidden px-4 py-4 md:table-cell">
          <span className="text-[13px] text-zinc-500">{local.agencyName}</span>
        </td>
        <td className="px-4 py-4">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${derivedStatusInfo.badge}`}>
            {derivedStatusInfo.label}
          </span>
        </td>
        <td className="hidden px-4 py-4 sm:table-cell">
          <span className="text-[12px] text-zinc-500">{formatJobDate(local.jobDate)}</span>
        </td>
        <td className="hidden px-4 py-4 text-right sm:table-cell">
          <span className="text-[13px] font-semibold tabular-nums text-zinc-900">
            {(local.contractAmount ?? local.price) > 0 ? brl(local.contractAmount ?? local.price) : "-"}
          </span>
        </td>
        <td className="hidden px-4 py-4 lg:table-cell">
          <span className="text-[12px] text-zinc-400">{formatDate(local.created_at)}</span>
        </td>
        <td className="px-4 py-4 text-right">
          <div className="flex items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
            <button
              onClick={() => {
                setEditing((current) => !current);
                setExpanded(true);
              }}
              className="rounded-lg px-2 py-1 text-[11px] font-medium text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-800"
            >
              Editar
            </button>
            <button
              onClick={() => setConfirm(true)}
              className="rounded-lg px-2 py-1 text-[11px] font-medium text-rose-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
            >
              Excluir
            </button>
          </div>
        </td>
      </tr>

      {expanded ? (
        <tr className="bg-zinc-50/80">
          <td colSpan={8} className="px-6 py-5">
            {editing ? (
              <div className="max-w-sm space-y-4">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Editar reserva</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                      Status
                    </label>
                    <div className="w-full rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-[13px] text-zinc-500">
                      {statusInfo(local.status).label}
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-400">
                      Use o fluxo do contrato para escrow, pagamento ou cancelamento.
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                      Valor (R$)
                    </label>
                    <input
                      type="number"
                      value={editPrice}
                      onChange={(event) => setEditPrice(event.target.value)}
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[13px] focus:border-zinc-900 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded-xl bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:from-[#17A58A] hover:to-[#22B5C2] disabled:opacity-50"
                  >
                    {saving ? "Salvando..." : "Salvar"}
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-[12px] font-medium text-zinc-600 transition-colors hover:border-zinc-300"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {derivedStatus === "aguardando_deposito" ? (
                  <div className="flex items-start gap-2.5 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3">
                    <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <p className="text-[12px] font-medium text-sky-700">
                      Aguardando deposito da agencia para garantir o pagamento do talento.
                    </p>
                  </div>
                ) : null}

                <div>
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Fluxo</p>
                  <div className="flex items-center gap-0 overflow-x-auto pb-1">
                    {[
                      { label: "Criado", done: true, date: local.created_at },
                      { label: "Contrato enviado", done: !!local.contractSentAt, date: local.contractSentAt },
                      {
                        label: "Contrato assinado",
                        done: ["aguardando_deposito", "aguardando_pagamento", "pago"].includes(derivedStatus),
                        date: local.contractSignedAt,
                      },
                      {
                        label: "Deposito",
                        done: ["aguardando_pagamento", "pago"].includes(derivedStatus),
                        date: local.contractConfirmedAt,
                      },
                      { label: "Pago", done: derivedStatus === "pago", date: null },
                    ].map((step, index, steps) => (
                      <div key={step.label} className="flex flex-shrink-0 items-center">
                        <div className="flex flex-col items-center gap-1.5">
                          <div
                            className={[
                              "flex h-6 w-6 items-center justify-center rounded-full border-2",
                              step.done ? "border-emerald-500 bg-emerald-500" : "border-zinc-200 bg-white",
                            ].join(" ")}
                          >
                            {step.done ? (
                              <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : null}
                          </div>
                          <p className={`whitespace-nowrap text-center text-[10px] font-medium ${step.done ? "text-zinc-700" : "text-[#647B7B]"}`}>
                            {step.label}
                          </p>
                          {step.date && step.done ? (
                            <p className="whitespace-nowrap text-[9px] text-zinc-400">{formatDate(step.date)}</p>
                          ) : null}
                        </div>
                        {index < steps.length - 1 ? (
                          <div
                            className={`mx-1 mb-6 h-0.5 w-10 flex-shrink-0 ${
                              step.done && steps[index + 1].done ? "bg-emerald-300" : "bg-zinc-100"
                            }`}
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-5 text-[12px] sm:grid-cols-4">
                  <div>
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Vaga</p>
                    <p className="font-medium text-zinc-700">{local.jobTitle || "-"}</p>
                  </div>
                  <div>
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Data da vaga</p>
                    <p className="text-zinc-700">{formatJobDate(local.jobDate)}</p>
                  </div>
                  <div>
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">ID da reserva</p>
                    <p className="truncate font-mono text-zinc-700">{local.id}</p>
                  </div>
                  <div>
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Criado em</p>
                    <p className="text-zinc-700">{formatDate(local.created_at)}</p>
                  </div>
                  <div>
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Talento</p>
                    <p className="text-zinc-700">{local.talentName}</p>
                  </div>
                  <div>
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Agencia</p>
                    <p className="text-zinc-700">{local.agencyName}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Pagamento</p>
                    <p className="font-semibold text-zinc-700">
                      {(local.contractAmount ?? local.price) > 0 ? brl(local.contractAmount ?? local.price) : "-"}
                    </p>
                    <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${paymentTone}`}>
                      {paymentLabel}
                    </span>
                  </div>
                  <div>
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Status</p>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${derivedStatusInfo.badge}`}>
                      {derivedStatusInfo.label}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

export default function AdminBookings({ bookings: initialBookings }: { bookings: AdminBooking[] }) {
  const [bookings, setBookings] = useState<AdminBooking[]>(initialBookings);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const router = useRouter();

  useEffect(() => {
    setBookings(initialBookings);
  }, [initialBookings]);

  const { refreshing } = useRealtimeRefresh(
    [{ table: "bookings" }, { table: "contracts" }],
    () => router.refresh(),
  );

  function handleDelete(id: string) {
    setBookings((current) => current.filter((booking) => booking.id !== id));
  }

  const filtered = bookings
    .filter((booking) => (statusFilter === "all" ? true : booking.derivedStatus === statusFilter))
    .filter((booking) => {
      if (!search) return true;
      const query = search.toLowerCase();
      return (
        booking.jobTitle.toLowerCase().includes(query) ||
        booking.talentName.toLowerCase().includes(query) ||
        booking.agencyName.toLowerCase().includes(query)
      );
    });

  const totalValue = filtered.reduce((sum, booking) => sum + (booking.contractAmount ?? booking.price), 0);
  const confirmedValue = filtered
    .filter((booking) => ["aguardando_pagamento", "pago"].includes(booking.derivedStatus))
    .reduce((sum, booking) => sum + (booking.contractAmount ?? booking.price), 0);

  return (
    <div className="max-w-7xl space-y-6">
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Admin da plataforma</p>
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-zinc-900">Reservas</h1>
        <div className="mt-1 flex items-center gap-3">
          <p className="text-[13px] text-zinc-400">{bookings.length} reservas no total</p>
          {refreshing ? (
            <span className="flex items-center gap-1.5 text-[11px] text-zinc-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              Atualizando...
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {[
          { label: "Total", value: brl(totalValue), stripe: "from-zinc-400 to-zinc-600" },
          { label: "Pago", value: brl(confirmedValue), stripe: "from-emerald-400 to-teal-500" },
          {
            label: "Aguardando deposito",
            value: String(filtered.filter((booking) => booking.derivedStatus === "aguardando_deposito").length),
            stripe: "from-sky-400 to-blue-500",
          },
          {
            label: "Aguardando pagamento",
            value: String(filtered.filter((booking) => booking.derivedStatus === "aguardando_pagamento").length),
            stripe: "from-amber-400 to-orange-500",
          },
          {
            label: "Cancelado",
            value: String(filtered.filter((booking) => booking.derivedStatus === "cancelado").length),
            stripe: "from-zinc-300 to-zinc-400",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.04)]"
          >
            <div className={`h-[3px] bg-gradient-to-r ${stat.stripe}`} />
            <div className="p-4">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{stat.label}</p>
              <p className="text-[1.5rem] font-semibold leading-none tracking-tighter text-zinc-900">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative max-w-sm flex-1">
          <svg className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar reservas..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-10 pr-4 text-[13px] transition-colors placeholder:text-zinc-400 hover:border-zinc-300 focus:border-zinc-900 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1 self-start rounded-xl bg-zinc-100 p-1">
          {(["all", "aguardando_assinatura", "aguardando_deposito", "aguardando_pagamento", "pago", "cancelado"] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={[
                "whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all",
                statusFilter === status ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700",
              ].join(" ")}
            >
              {{
                all: "Todos",
                aguardando_assinatura: "Aguard. assinatura",
                aguardando_deposito: "Aguard. deposito",
                aguardando_pagamento: "Aguard. pagamento",
                pago: "Pago",
                cancelado: "Cancelado",
              }[status]}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)]">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="px-6 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Vaga</th>
                <th className="hidden px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400 sm:table-cell">Talento</th>
                <th className="hidden px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400 md:table-cell">Agencia</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Status</th>
                <th className="hidden px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400 sm:table-cell">Data da vaga</th>
                <th className="hidden px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-widest text-zinc-400 sm:table-cell">Valor</th>
                <th className="hidden px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400 lg:table-cell">Criado</th>
                <th className="w-24 px-4 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filtered.map((booking) => (
                <BookingRow key={booking.id} booking={booking} onDelete={handleDelete} />
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center">
                    <p className="text-[14px] font-medium text-zinc-500">Nenhuma reserva encontrada</p>
                  </td>
                </tr>
              ) : null}
            </tbody>
            {filtered.length > 0 ? (
              <tfoot>
                <tr className="border-t-2 border-zinc-100 bg-zinc-50/80">
                  <td colSpan={5} className="px-6 py-3.5">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{filtered.length} reservas</p>
                  </td>
                  <td className="hidden px-4 py-3.5 text-right sm:table-cell">
                    <p className="text-[13px] font-semibold tabular-nums text-zinc-900">{totalValue > 0 ? brl(totalValue) : "-"}</p>
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>
    </div>
  );
}


