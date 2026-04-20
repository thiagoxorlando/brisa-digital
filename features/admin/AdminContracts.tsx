"use client";

import { Fragment, useState } from "react";

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

const STATUS_STYLES: Record<string, string> = {
  sent:      "bg-amber-50   text-amber-700   ring-1 ring-amber-100",
  signed:    "bg-violet-50  text-violet-700  ring-1 ring-violet-100",
  confirmed: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  paid:      "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  rejected:  "bg-rose-50    text-rose-600    ring-1 ring-rose-100",
  cancelled: "bg-zinc-100   text-zinc-500    ring-1 ring-zinc-200",
};

const STATUS_LABELS: Record<string, string> = {
  sent:      "Aguardando Talento",
  signed:    "Depósito Pendente",
  confirmed: "Vaga Confirmada",
  paid:      "Pago",
  rejected:  "Rejeitado",
  cancelled: "Cancelado",
};

const CONTRACT_STATUSES = ["sent", "signed", "confirmed", "paid", "rejected", "cancelled"];

function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n);
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-BR", { month: "short", day: "numeric", year: "numeric" });
}

function fmtJobDate(s: string | null) {
  if (!s) return "—";
  return new Date(s + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function downloadContract(c: AdminContractRow) {
  const lines = [
    `CONTRACT`, ``,
    `ID:           ${c.id}`,
    `Sent:         ${fmtDate(c.createdAt)}`,
    `Status:       ${STATUS_LABELS[c.status] ?? c.status}`, ``,
    `PARTIES`,
    `Agency:       ${c.agencyName}`,
    `Talent:       ${c.talentName}`, ``,
    `JOB DETAILS`,
    `Date:         ${fmtJobDate(c.jobDate)}`,
    `Location:     ${c.location ?? "—"}`,
    `Description:  ${c.jobDescription ?? "—"}`, ``,
    `PAYMENT`,
    `Amount:       ${brl(c.paymentAmount)}`,
    `Method:       ${c.paymentMethod ?? "—"}`, ``,
    c.additionalNotes ? `NOTES\n${c.additionalNotes}` : "",
  ].filter(Boolean).join("\n");

  const blob = new Blob([lines], { type: "text/plain" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `contract-${c.id.slice(0, 8)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
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

function ContractRow({ contract: c, onDelete }: { contract: AdminContractRow; onDelete: (id: string) => void }) {
  const [expanded, setExpanded]       = useState(false);
  const [editing, setEditing]         = useState(false);
  const [confirm, setConfirm]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [editStatus, setEditStatus]   = useState(c.status);
  const [editAmount, setEditAmount]   = useState(String(c.paymentAmount));
  const [editLocation, setEditLocation] = useState(c.location ?? "");
  const [editJobDate, setEditJobDate] = useState(c.jobDate ?? "");
  const [local, setLocal]             = useState(c);

  const isPaid  = local.paymentStatus === "paid";
  const stCls   = STATUS_STYLES[local.status] ?? "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200";
  const stLabel = STATUS_LABELS[local.status] ?? local.status;

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/admin/contracts/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status:         editStatus,
        payment_amount: Number(editAmount),
        location:       editLocation || null,
        job_date:       editJobDate || null,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setLocal((v) => ({ ...v, status: editStatus, paymentAmount: Number(editAmount), location: editLocation || null, jobDate: editJobDate || null }));
      setEditing(false);
    }
  }

  async function handleDelete() {
    const res = await fetch(`/api/admin/contracts/${c.id}`, { method: "DELETE" });
    if (res.ok) onDelete(c.id);
    setConfirm(false);
  }

  return (
    <Fragment>
      {confirm && (
        <ConfirmDialog
          message={`Mover contrato entre ${local.agencyName} & ${local.talentName} para a lixeira?`}
          onConfirm={handleDelete}
          onCancel={() => setConfirm(false)}
        />
      )}
      <tr onClick={() => !editing && setExpanded((v) => !v)}
        className="hover:bg-zinc-50/60 transition-colors cursor-pointer">
        <td className="px-6 py-4">
          <p className="text-[13px] font-semibold text-zinc-900">{local.talentName}</p>
        </td>
        <td className="px-4 py-4 hidden sm:table-cell">
          <p className="text-[13px] text-zinc-700 font-medium truncate max-w-[160px]">{local.jobTitle}</p>
        </td>
        <td className="px-4 py-4 hidden sm:table-cell">
          <p className="text-[13px] text-zinc-500">{local.agencyName}</p>
        </td>
        <td className="px-4 py-4 hidden md:table-cell">
          <p className="text-[13px] text-zinc-500">{fmtJobDate(local.jobDate)}</p>
        </td>
        <td className="px-4 py-4 hidden lg:table-cell">
          <p className="text-[13px] text-zinc-500 truncate max-w-[140px]">{local.location ?? "—"}</p>
        </td>
        <td className="px-4 py-4 text-right hidden sm:table-cell">
          <p className="text-[13px] font-semibold text-zinc-900 tabular-nums">{brl(local.paymentAmount)}</p>
        </td>
        <td className="px-4 py-4">
          <span className={`inline-flex text-[11px] font-semibold px-2.5 py-1 rounded-full ${stCls}`}>{stLabel}</span>
        </td>
        <td className="px-4 py-4 hidden md:table-cell">
          <div className="flex items-center gap-1.5">
            {local.contractFileUrl ? (
              <a href={local.contractFileUrl} target="_blank" rel="noopener noreferrer" title="Contrato original"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 text-[10px] font-semibold text-blue-600 bg-blue-50 ring-1 ring-blue-100 px-2 py-0.5 rounded-full hover:bg-blue-100 transition-colors">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Original
              </a>
            ) : (
              <span className="text-[10px] text-zinc-300 font-medium">—</span>
            )}
            {local.signedContractUrl && (
              <a href={local.signedContractUrl} target="_blank" rel="noopener noreferrer" title="Contrato assinado"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 ring-1 ring-emerald-100 px-2 py-0.5 rounded-full hover:bg-emerald-100 transition-colors">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Assinado
              </a>
            )}
          </div>
        </td>
        <td className="px-6 py-4 hidden lg:table-cell">
          <p className="text-[12px] text-zinc-400">{fmtDate(local.createdAt)}</p>
        </td>
        <td className="px-4 py-4 text-right">
          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            {isPaid ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 ring-1 ring-emerald-100 px-2.5 py-1 rounded-full">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Somente leitura
              </span>
            ) : (
              <>
                <button onClick={() => { setEditing((v) => !v); setExpanded(true); }}
                  className="text-[11px] font-medium text-zinc-400 hover:text-zinc-800 transition-colors cursor-pointer px-2 py-1 rounded-lg hover:bg-zinc-100">
                  Editar
                </button>
                <button onClick={() => setConfirm(true)}
                  className="text-[11px] font-medium text-rose-400 hover:text-rose-600 transition-colors cursor-pointer px-2 py-1 rounded-lg hover:bg-rose-50">
                  Excluir
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-zinc-50/80">
          <td colSpan={10} className="px-6 py-5">
            {editing && !isPaid ? (
              <div className="space-y-4 max-w-lg">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Editar Contrato</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-1 block">Status</label>
                    <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}
                      className="w-full px-3 py-2 text-[13px] rounded-xl border border-zinc-200 focus:border-zinc-900 focus:outline-none bg-white">
                      {CONTRACT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-1 block">Pagamento (R$)</label>
                    <input type="number" value={editAmount} onChange={(e) => setEditAmount(e.target.value)}
                      className="w-full px-3 py-2 text-[13px] rounded-xl border border-zinc-200 focus:border-zinc-900 focus:outline-none bg-white" />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-1 block">Data da Vaga</label>
                    <input type="date" value={editJobDate} onChange={(e) => setEditJobDate(e.target.value)}
                      className="w-full px-3 py-2 text-[13px] rounded-xl border border-zinc-200 focus:border-zinc-900 focus:outline-none bg-white" />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-1 block">Localização</label>
                    <input value={editLocation} onChange={(e) => setEditLocation(e.target.value)}
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
              <div className="space-y-4">
                {isPaid && (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5">
                    <svg className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <p className="text-[12px] font-semibold text-emerald-700">
                      Este contrato foi pago — é somente leitura e não pode ser editado ou excluído.
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[12px]">
                  <div><p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">ID do Contrato</p><p className="font-mono text-zinc-700 truncate">{local.id}</p></div>
                  <div><p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Vaga</p><p className="text-zinc-700 font-semibold">{local.jobTitle}</p></div>
                  <div><p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Enviado</p><p className="text-zinc-700">{fmtDate(local.createdAt)}</p></div>
                  <div><p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Data da Vaga</p><p className="text-zinc-700">{fmtJobDate(local.jobDate)}</p></div>
                  <div><p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Localização</p><p className="text-zinc-700">{local.location ?? "—"}</p></div>
                  <div><p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Pagamento</p><p className="text-zinc-700 font-semibold">{brl(local.paymentAmount)}</p></div>
                  <div><p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Método</p><p className="text-zinc-700">{local.paymentMethod ?? "—"}</p></div>
                  <div><p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Talento</p><p className="text-zinc-700">{local.talentName}</p></div>
                  <div><p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Agência</p><p className="text-zinc-700">{local.agencyName}</p></div>
                  {local.signedAt && <div><p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Assinado pelo Talento</p><p className="text-zinc-700">{fmtDate(local.signedAt)}</p></div>}
                  {local.agencySignedAt && <div><p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Assinado pela Agência</p><p className="text-zinc-700">{fmtDate(local.agencySignedAt)}</p></div>}
                  {local.depositPaidAt && <div><p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Depósito Pago</p><p className="text-zinc-700">{fmtDate(local.depositPaidAt)}</p></div>}
                  {local.paidAt && <div><p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Pago</p><p className="text-zinc-700">{fmtDate(local.paidAt)}</p></div>}
                </div>
                {local.jobDescription && (
                  <div><p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Descrição</p>
                  <p className="text-[13px] text-zinc-600 leading-relaxed whitespace-pre-line">{local.jobDescription}</p></div>
                )}
                {local.additionalNotes && (
                  <div><p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Observações</p>
                  <p className="text-[13px] text-zinc-500 leading-relaxed whitespace-pre-line">{local.additionalNotes}</p></div>
                )}
                <button onClick={(e) => { e.stopPropagation(); downloadContract(local); }}
                  className="inline-flex items-center gap-2 text-[12px] font-semibold px-3.5 py-2 rounded-lg bg-white border border-zinc-200 hover:border-zinc-300 text-zinc-700 transition-colors cursor-pointer">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Baixar Contrato
                </button>
              </div>
            )}
          </td>
        </tr>
      )}
    </Fragment>
  );
}

export default function AdminContracts({ contracts: initialContracts }: { contracts: AdminContractRow[] }) {
  const [contracts, setContracts] = useState<AdminContractRow[]>(initialContracts);
  const [search, setSearch]       = useState("");
  const [statusFilter, setStatus] = useState("all");

  function handleDelete(id: string) {
    setContracts((prev) => prev.filter((c) => c.id !== id));
  }

  const filtered = contracts
    .filter((c) => statusFilter === "all" || c.status === statusFilter)
    .filter((c) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return c.talentName.toLowerCase().includes(q) || c.agencyName.toLowerCase().includes(q) || c.jobTitle.toLowerCase().includes(q);
    });

  const totalConfirmed = filtered.filter((c) => c.status === "confirmed" || c.status === "paid").reduce((s, c) => s + c.paymentAmount, 0);

  return (
    <div className="max-w-7xl space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Admin da Plataforma</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">Contratos</h1>
        <p className="text-[13px] text-zinc-400 mt-1">{contracts.length} contratos no total</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total",              value: String(contracts.length),                                                              stripe: "from-zinc-400 to-zinc-600" },
          { label: "Depósito Pendente", value: String(contracts.filter((c) => c.status === "signed").length),                         stripe: "from-violet-400 to-purple-500" },
          { label: "Confirmado",        value: String(contracts.filter((c) => c.status === "confirmed" || c.status === "paid").length), stripe: "from-emerald-400 to-teal-500" },
          { label: "Rejeitado",         value: String(contracts.filter((c) => c.status === "rejected").length),                        stripe: "from-rose-400 to-red-500" },
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
          <input type="text" placeholder="Buscar contratos…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-[13px] bg-white border border-zinc-200 rounded-xl placeholder:text-zinc-400 hover:border-zinc-300 focus:border-zinc-900 focus:outline-none transition-colors" />
        </div>
        <div className="flex items-center gap-1 bg-zinc-100 rounded-xl p-1 self-start flex-wrap">
          {(["all", "sent", "signed", "confirmed", "paid", "cancelled", "rejected"] as const).map((s) => (
            <button key={s} onClick={() => setStatus(s)}
              className={["px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap",
                statusFilter === s ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"].join(" ")}>
              {s === "all" ? "Todos" : (STATUS_LABELS[s] ?? s)}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="text-left px-6 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Talento</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden sm:table-cell">Vaga</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden sm:table-cell">Agência</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden md:table-cell">Data</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden lg:table-cell">Local</th>
                <th className="text-right px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden sm:table-cell">Pagamento</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Status</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden md:table-cell">Arquivos</th>
                <th className="text-left px-6 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden lg:table-cell">Enviado</th>
                <th className="px-4 py-3.5 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filtered.map((c) => <ContractRow key={c.id} contract={c} onDelete={handleDelete} />)}
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="px-6 py-16 text-center">
                  <p className="text-[14px] font-medium text-zinc-500">Nenhum contrato encontrado</p>
                </td></tr>
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-zinc-100 bg-zinc-50/80">
                  <td colSpan={6} className="px-6 py-3.5">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{filtered.length} contratos</p>
                  </td>
                  <td className="px-4 py-3.5 text-right hidden sm:table-cell">
                    <p className="text-[13px] font-semibold text-emerald-700 tabular-nums">{brl(totalConfirmed)} confirmado</p>
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
