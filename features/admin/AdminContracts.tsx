"use client";

import { Fragment, useState } from "react";
import type { MouseEvent } from "react";

export type AdminContractRow = {
  id: string;
  jobId: string | null;
  jobTitle: string;
  talentId: string | null;
  talentName: string;
  agencyName: string;
  jobDate: string | null;
  jobTime: string | null;
  location: string | null;
  jobDescription: string | null;
  paymentMethod: string | null;
  additionalNotes: string | null;
  paymentAmount: number;
  status: string;
  paymentStatus: string;
  createdAt: string;
  signedAt: string | null;
  agencySignedAt: string | null;
  depositPaidAt: string | null;
  paidAt: string | null;
  contractFileUrl: string | null;
  signedContractUrl: string | null;
};

type DateField = "jobDate" | "createdAt" | "paidAt";

const STATUS_TONE: Record<string, string> = {
  sent: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
  signed: "bg-violet-50 text-violet-700 ring-1 ring-violet-100",
  confirmed: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  paid: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  rejected: "bg-rose-50 text-rose-600 ring-1 ring-rose-100",
  cancelled: "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200",
};

const STATUS_LABEL: Record<string, string> = {
  sent: "Aguardando talento",
  signed: "Deposito pendente",
  confirmed: "Vaga confirmada",
  paid: "Pago",
  rejected: "Rejeitado",
  cancelled: "Cancelado",
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
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function parseDateInput(value: string) {
  return new Date(`${value}T00:00:00`);
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
}

function endOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
}

function getContractFilterDate(contract: AdminContractRow, field: DateField) {
  if (field === "jobDate") return contract.jobDate ? new Date(`${contract.jobDate}T00:00:00`) : null;
  if (field === "paidAt") return contract.paidAt ? new Date(contract.paidAt) : null;
  return contract.createdAt ? new Date(contract.createdAt) : null;
}

function matchesDateRange(contract: AdminContractRow, field: DateField, fromDate: string, toDate: string) {
  if (!fromDate && !toDate) return true;

  const value = getContractFilterDate(contract, field);
  if (!value) return false;

  if (fromDate && value < startOfDay(parseDateInput(fromDate))) return false;
  if (toDate && value > endOfDay(parseDateInput(toDate))) return false;
  return true;
}

function dateFieldLabel(field: DateField) {
  if (field === "paidAt") return "Pago";
  if (field === "createdAt") return "Enviado";
  return "Data da vaga";
}

function downloadContract(contract: AdminContractRow) {
  const lines = [
    "CONTRACT",
    "",
    `ID: ${contract.id}`,
    `Enviado: ${formatDate(contract.createdAt)}`,
    `Status: ${STATUS_LABEL[contract.status] ?? contract.status}`,
    "",
    "PARTES",
    `Agencia: ${contract.agencyName}`,
    `Talento: ${contract.talentName}`,
    "",
    "DETALHES DA VAGA",
    `Data: ${formatJobDate(contract.jobDate)}`,
    `Local: ${contract.location ?? "-"}`,
    `Descricao: ${contract.jobDescription ?? "-"}`,
    "",
    "PAGAMENTO",
    `Valor: ${brl(contract.paymentAmount)}`,
    `Metodo: ${contract.paymentMethod ?? "-"}`,
    "",
    contract.additionalNotes ? `OBSERVACOES\n${contract.additionalNotes}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const blob = new Blob([lines], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `contract-${contract.id.slice(0, 8)}.txt`;
  link.click();
  URL.revokeObjectURL(url);
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
      <div className="mx-4 w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <p className="text-[14px] font-medium text-zinc-700">{message}</p>
        <div className="flex gap-3">
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

function ContractRow({
  contract,
  onDelete,
  selected,
  onToggleSelected,
}: {
  contract: AdminContractRow;
  onDelete: (id: string) => void;
  selected: boolean;
  onToggleSelected: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editAmount, setEditAmount] = useState(String(contract.paymentAmount));
  const [editLocation, setEditLocation] = useState(contract.location ?? "");
  const [editJobDate, setEditJobDate] = useState(contract.jobDate ?? "");
  const [local, setLocal] = useState(contract);

  const isPaid = local.paymentStatus === "paid";
  const amountLocked = local.status === "confirmed";
  const statusTone = STATUS_TONE[local.status] ?? "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200";
  const statusLabel = STATUS_LABEL[local.status] ?? local.status;

  async function handleSave() {
    setSaving(true);
    const response = await fetch(`/api/admin/contracts/${contract.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payment_amount: Number(editAmount),
        location: editLocation || null,
        job_date: editJobDate || null,
      }),
    });
    setSaving(false);

    if (response.ok) {
      setLocal((current) => ({
        ...current,
        paymentAmount: Number(editAmount),
        location: editLocation || null,
        jobDate: editJobDate || null,
      }));
      setEditing(false);
    }
  }

  async function handleDelete() {
    const response = await fetch(`/api/admin/contracts/${contract.id}`, { method: "DELETE" });
    if (response.ok) onDelete(contract.id);
    setConfirm(false);
  }

  function handleRowClick(event: MouseEvent<HTMLTableRowElement>) {
    if ((event.target as HTMLElement).closest("button, input, a")) return;
    if (!editing) setExpanded((current) => !current);
  }

  return (
    <Fragment>
      {confirm ? (
        <ConfirmDialog
          message={`Mover contrato entre ${local.agencyName} e ${local.talentName} para a lixeira?`}
          onConfirm={handleDelete}
          onCancel={() => setConfirm(false)}
        />
      ) : null}

      <tr onClick={handleRowClick} className="cursor-pointer transition-colors hover:bg-zinc-50/60">
        <td className="px-4 py-4" onClick={(event) => event.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => {
              event.stopPropagation();
              onToggleSelected(contract.id);
            }}
            aria-label={`Selecionar contrato ${local.id}`}
            className="h-4 w-4 cursor-pointer rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
          />
        </td>
        <td className="px-6 py-4">
          <p className="text-[13px] font-semibold text-zinc-900">{local.talentName}</p>
        </td>
        <td className="hidden px-4 py-4 sm:table-cell">
          <p className="max-w-[160px] truncate text-[13px] font-medium text-zinc-700">{local.jobTitle}</p>
        </td>
        <td className="hidden px-4 py-4 sm:table-cell">
          <p className="text-[13px] text-zinc-500">{local.agencyName}</p>
        </td>
        <td className="hidden px-4 py-4 md:table-cell">
          <p className="text-[13px] text-zinc-500">{formatJobDate(local.jobDate)}</p>
        </td>
        <td className="hidden px-4 py-4 lg:table-cell">
          <p className="max-w-[140px] truncate text-[13px] text-zinc-500">{local.location ?? "-"}</p>
        </td>
        <td className="hidden px-4 py-4 text-right sm:table-cell">
          <p className="text-[13px] font-semibold tabular-nums text-zinc-900">{brl(local.paymentAmount)}</p>
        </td>
        <td className="px-4 py-4">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusTone}`}>{statusLabel}</span>
        </td>
        <td className="hidden px-4 py-4 md:table-cell">
          <div className="flex items-center gap-1.5">
            {local.contractFileUrl ? (
              <a
                href={local.contractFileUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Contrato original"
                onClick={(event) => event.stopPropagation()}
                className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600 ring-1 ring-blue-100 transition-colors hover:bg-blue-100"
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Original
              </a>
            ) : (
              <span className="text-[10px] font-medium text-[#647B7B]">-</span>
            )}
            {local.signedContractUrl ? (
              <a
                href={local.signedContractUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Contrato assinado"
                onClick={(event) => event.stopPropagation()}
                className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 ring-1 ring-emerald-100 transition-colors hover:bg-emerald-100"
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Assinado
              </a>
            ) : null}
          </div>
        </td>
        <td className="hidden px-6 py-4 lg:table-cell">
          <p className="text-[12px] text-zinc-400">{formatDate(local.createdAt)}</p>
        </td>
        <td className="px-4 py-4 text-right">
          <div className="flex items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
            {isPaid ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-600 ring-1 ring-emerald-100">
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Somente leitura
              </span>
            ) : (
              <>
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
              </>
            )}
          </div>
        </td>
      </tr>

      {expanded ? (
        <tr className="bg-zinc-50/80">
          <td colSpan={11} className="px-6 py-5">
            {editing && !isPaid ? (
              <div className="max-w-lg space-y-4">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Editar contrato</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Status</label>
                    <div className="w-full rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-[13px] text-zinc-500">
                      {statusLabel}
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-400">Use o fluxo normal para escrow, pagamento ou cancelamento.</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Pagamento (R$)</label>
                    <input
                      type="number"
                      value={editAmount}
                      onChange={(event) => setEditAmount(event.target.value)}
                      disabled={amountLocked}
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[13px] focus:border-zinc-900 focus:outline-none disabled:bg-zinc-50 disabled:text-zinc-400"
                    />
                    {amountLocked ? (
                      <p className="mt-1 text-[11px] text-zinc-400">Valor bloqueado porque o escrow ja foi reservado.</p>
                    ) : null}
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Data da vaga</label>
                    <input
                      type="date"
                      value={editJobDate}
                      onChange={(event) => setEditJobDate(event.target.value)}
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[13px] focus:border-zinc-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Localizacao</label>
                    <input
                      value={editLocation}
                      onChange={(event) => setEditLocation(event.target.value)}
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
              <div className="space-y-4">
                {isPaid ? (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-2.5">
                    <svg className="h-3.5 w-3.5 flex-shrink-0 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <p className="text-[12px] font-semibold text-emerald-700">
                      Este contrato foi pago e agora esta somente para leitura.
                    </p>
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-4 text-[12px] sm:grid-cols-4">
                  <div>
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">ID do contrato</p>
                    <p className="truncate font-mono text-zinc-700">{local.id}</p>
                  </div>
                  <div>
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Vaga</p>
                    <p className="font-semibold text-zinc-700">{local.jobTitle}</p>
                  </div>
                  <div>
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Enviado</p>
                    <p className="text-zinc-700">{formatDate(local.createdAt)}</p>
                  </div>
                  <div>
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Data da vaga</p>
                    <p className="text-zinc-700">{formatJobDate(local.jobDate)}</p>
                  </div>
                  <div>
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Localizacao</p>
                    <p className="text-zinc-700">{local.location ?? "-"}</p>
                  </div>
                  <div>
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Pagamento</p>
                    <p className="font-semibold text-zinc-700">{brl(local.paymentAmount)}</p>
                  </div>
                  <div>
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Metodo</p>
                    <p className="text-zinc-700">{local.paymentMethod ?? "-"}</p>
                  </div>
                  <div>
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Talento</p>
                    <p className="text-zinc-700">{local.talentName}</p>
                  </div>
                  <div>
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Agencia</p>
                    <p className="text-zinc-700">{local.agencyName}</p>
                  </div>
                  {local.signedAt ? (
                    <div>
                      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Assinado pelo talento</p>
                      <p className="text-zinc-700">{formatDate(local.signedAt)}</p>
                    </div>
                  ) : null}
                  {local.agencySignedAt ? (
                    <div>
                      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Assinado pela agencia</p>
                      <p className="text-zinc-700">{formatDate(local.agencySignedAt)}</p>
                    </div>
                  ) : null}
                  {local.depositPaidAt ? (
                    <div>
                      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Deposito pago</p>
                      <p className="text-zinc-700">{formatDate(local.depositPaidAt)}</p>
                    </div>
                  ) : null}
                  {local.paidAt ? (
                    <div>
                      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Pago</p>
                      <p className="text-zinc-700">{formatDate(local.paidAt)}</p>
                    </div>
                  ) : null}
                </div>

                {local.jobDescription ? (
                  <div>
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Descricao</p>
                    <p className="whitespace-pre-line text-[13px] leading-relaxed text-zinc-600">{local.jobDescription}</p>
                  </div>
                ) : null}

                {local.additionalNotes ? (
                  <div>
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Observacoes</p>
                    <p className="whitespace-pre-line text-[13px] leading-relaxed text-zinc-500">{local.additionalNotes}</p>
                  </div>
                ) : null}

                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    downloadContract(local);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-[12px] font-semibold text-zinc-700 transition-colors hover:border-zinc-300"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Baixar contrato
                </button>
              </div>
            )}
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

export default function AdminContracts({ contracts: initialContracts }: { contracts: AdminContractRow[] }) {
  const [contracts, setContracts] = useState<AdminContractRow[]>(initialContracts);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateField, setDateField] = useState<DateField>("createdAt");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [error, setError] = useState("");

  function handleDelete(id: string) {
    setContracts((current) => current.filter((contract) => contract.id !== id));
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  const filtered = contracts
    .filter((contract) => (statusFilter === "all" ? true : contract.status === statusFilter))
    .filter((contract) => matchesDateRange(contract, dateField, fromDate, toDate))
    .filter((contract) => {
      if (!search) return true;
      const query = search.toLowerCase();
      return (
        contract.talentName.toLowerCase().includes(query) ||
        contract.agencyName.toLowerCase().includes(query) ||
        contract.jobTitle.toLowerCase().includes(query)
      );
    });

  const totalConfirmed = filtered
    .filter((contract) => contract.status === "confirmed" || contract.status === "paid")
    .reduce((sum, contract) => sum + contract.paymentAmount, 0);
  const filteredIds = filtered.map((contract) => contract.id);
  const selectedCount = selectedIds.size;
  const selectedFilteredCount = filteredIds.filter((id) => selectedIds.has(id)).length;
  const allFilteredSelected = filteredIds.length > 0 && selectedFilteredCount === filteredIds.length;
  const someFilteredSelected = selectedFilteredCount > 0 && !allFilteredSelected;

  function toggleSelected(contractId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(contractId)) next.delete(contractId);
      else next.add(contractId);
      return next;
    });
  }

  function toggleSelectAllFiltered() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allFilteredSelected) {
        for (const id of filteredIds) next.delete(id);
      } else {
        for (const id of filteredIds) next.add(id);
      }
      return next;
    });
  }

  async function handleBulkDelete() {
    if (selectedCount === 0) return;
    if (!window.confirm(`Tem certeza que deseja mover ${selectedCount} contratos selecionados para a lixeira?`)) return;

    setBulkDeleting(true);
    setError("");
    const ids = Array.from(selectedIds);

    const response = await fetch("/api/admin/contracts/bulk", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });

    if (response.ok) {
      const selected = new Set(ids);
      setContracts((current) => current.filter((contract) => !selected.has(contract.id)));
      setSelectedIds(new Set());
    } else {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error ?? "Falha ao mover os contratos selecionados para a lixeira.");
    }

    setBulkDeleting(false);
  }

  return (
    <div className="max-w-7xl space-y-6">
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Admin da plataforma</p>
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-zinc-900">Contratos</h1>
        <p className="mt-1 text-[13px] text-zinc-400">{contracts.length} contratos no total</p>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] text-rose-600">{error}</p>
      ) : null}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total", value: String(contracts.length), stripe: "from-zinc-400 to-zinc-600" },
          {
            label: "Deposito pendente",
            value: String(contracts.filter((contract) => contract.status === "signed").length),
            stripe: "from-violet-400 to-purple-500",
          },
          {
            label: "Confirmado",
            value: String(contracts.filter((contract) => contract.status === "confirmed" || contract.status === "paid").length),
            stripe: "from-emerald-400 to-teal-500",
          },
          {
            label: "Rejeitado",
            value: String(contracts.filter((contract) => contract.status === "rejected").length),
            stripe: "from-rose-400 to-red-500",
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
            placeholder="Buscar contratos..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-10 pr-4 text-[13px] transition-colors placeholder:text-zinc-400 hover:border-zinc-300 focus:border-zinc-900 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1 self-start rounded-xl bg-zinc-100 p-1">
          {(["all", "sent", "signed", "confirmed", "paid", "cancelled", "rejected"] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={[
                "whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all",
                statusFilter === status ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700",
              ].join(" ")}
            >
              {status === "all" ? "Todos" : STATUS_LABEL[status] ?? status}
            </button>
          ))}
        </div>
      </div>

      {selectedCount > 0 ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-[0_1px_4px_rgba(0,0,0,0.04)] sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] font-semibold text-zinc-900">{selectedCount} contratos selecionados</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="rounded-xl bg-rose-600 px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bulkDeleting ? "Movendo..." : "Mover selecionados para lixeira"}
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              disabled={bulkDeleting}
              className="rounded-xl px-3.5 py-2 text-[12px] font-medium text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Limpar seleção
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 rounded-2xl border border-zinc-100 bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)] md:grid-cols-[minmax(0,220px)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Filtrar por</label>
          <select
            value={dateField}
            onChange={(event) => setDateField(event.target.value as DateField)}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[13px] text-zinc-700 transition-colors focus:border-zinc-900 focus:outline-none"
          >
            <option value="createdAt">Enviado</option>
            <option value="jobDate">Data da vaga</option>
            <option value="paidAt">Pago</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-zinc-400">De</label>
          <input
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[13px] text-zinc-700 transition-colors focus:border-zinc-900 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Ate</label>
          <input
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[13px] text-zinc-700 transition-colors focus:border-zinc-900 focus:outline-none"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={() => {
              setFromDate("");
              setToDate("");
            }}
            className="rounded-xl border border-zinc-200 px-3.5 py-2.5 text-[12px] font-medium text-zinc-600 transition-colors hover:border-zinc-300"
          >
            Limpar datas
          </button>
        </div>
        <p className="md:col-span-4 text-[12px] text-zinc-400">
          Revisando por <strong className="text-zinc-600">{dateFieldLabel(dateField).toLowerCase()}</strong>.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)]">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="px-4 py-3.5">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    disabled={filteredIds.length === 0}
                    ref={(node) => {
                      if (node) node.indeterminate = someFilteredSelected;
                    }}
                    onChange={toggleSelectAllFiltered}
                    aria-label="Selecionar contratos filtrados"
                    className="h-4 w-4 cursor-pointer rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </th>
                <th className="px-6 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Talento</th>
                <th className="hidden px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400 sm:table-cell">Vaga</th>
                <th className="hidden px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400 sm:table-cell">Agencia</th>
                <th className="hidden px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400 md:table-cell">Data</th>
                <th className="hidden px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400 lg:table-cell">Local</th>
                <th className="hidden px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-widest text-zinc-400 sm:table-cell">Pagamento</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Status</th>
                <th className="hidden px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400 md:table-cell">Arquivos</th>
                <th className="hidden px-6 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400 lg:table-cell">Enviado</th>
                <th className="w-24 px-4 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filtered.map((contract) => (
                <ContractRow
                  key={contract.id}
                  contract={contract}
                  onDelete={handleDelete}
                  selected={selectedIds.has(contract.id)}
                  onToggleSelected={toggleSelected}
                />
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-6 py-16 text-center">
                    <p className="text-[14px] font-medium text-zinc-500">Nenhum contrato encontrado</p>
                    <p className="mt-1 text-[13px] text-zinc-400">Tente ajustar a busca, o status ou o intervalo de datas.</p>
                  </td>
                </tr>
              ) : null}
            </tbody>
            {filtered.length > 0 ? (
              <tfoot>
                <tr className="border-t-2 border-zinc-100 bg-zinc-50/80">
                  <td colSpan={7} className="px-6 py-3.5">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{filtered.length} contratos</p>
                  </td>
                  <td className="hidden px-4 py-3.5 text-right sm:table-cell">
                    <p className="text-[13px] font-semibold tabular-nums text-emerald-700">{brl(totalConfirmed)} confirmado</p>
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>
    </div>
  );
}
