"use client";

import { useState } from "react";

export type AdminJob = {
  id: string;
  title: string;
  category: string | null;
  budget: number | null;
  deadline: string | null;
  created_at: string;
  status: string;
  agencyName: string;
  submissionCount: number;
  description: string | null;
  location: string | null;
  gender: string | null;
  ageMin: number | null;
  ageMax: number | null;
  jobDate: string | null;
  assignedTalents?: { id: string; name: string; status: string }[];
  invitedTalents?: { id: string; name: string; status: string }[];
};

type DateField = "jobDate" | "deadline" | "created_at";

const STATUS_STYLES: Record<string, string> = {
  open: "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100",
  closed: "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200",
  draft: "bg-amber-50 text-amber-600 ring-1 ring-amber-100",
  inactive: "bg-zinc-100 text-zinc-400 ring-1 ring-zinc-200",
};

const JOB_STATUSES = ["open", "draft", "closed", "inactive"] as const;

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
  if (!value) return null;
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR", {
    weekday: "short",
    month: "short",
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

function getJobFilterDate(job: AdminJob, field: DateField) {
  if (field === "jobDate") return job.jobDate ? new Date(`${job.jobDate}T00:00:00`) : null;
  if (field === "deadline") return job.deadline ? new Date(`${job.deadline}T00:00:00`) : null;
  return job.created_at ? new Date(job.created_at) : null;
}

function matchesDateRange(job: AdminJob, field: DateField, fromDate: string, toDate: string) {
  if (!fromDate && !toDate) return true;

  const value = getJobFilterDate(job, field);
  if (!value) return false;

  if (fromDate && value < startOfDay(parseDateInput(fromDate))) return false;
  if (toDate && value > endOfDay(parseDateInput(toDate))) return false;
  return true;
}

function dateFieldLabel(field: DateField) {
  if (field === "deadline") return "Prazo";
  if (field === "created_at") return "Publicado";
  return "Data da vaga";
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

const CONTRACT_STATUS_LABEL: Record<string, string> = {
  sent: "Contrato enviado",
  signed: "Contrato assinado",
  confirmed: "Confirmado",
  paid: "Pago",
};

const CONTRACT_STATUS_TONE: Record<string, string> = {
  sent: "bg-violet-50 text-violet-700 ring-1 ring-violet-100",
  signed: "bg-sky-50 text-sky-700 ring-1 ring-sky-100",
  confirmed: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  paid: "bg-teal-50 text-teal-700 ring-1 ring-teal-100",
};

function ContractStatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${CONTRACT_STATUS_TONE[status] ?? "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200"}`}>
      {CONTRACT_STATUS_LABEL[status] ?? status}
    </span>
  );
}

const SUBMISSION_STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  selected: "Selecionado",
  approved: "Aprovado",
  rejected: "Recusado",
};

const SUBMISSION_STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
  selected: "bg-sky-50 text-sky-700 ring-1 ring-sky-100",
  approved: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  rejected: "bg-zinc-100 text-zinc-400 ring-1 ring-zinc-200",
};

function SubmissionStatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${SUBMISSION_STATUS_TONE[status] ?? "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200"}`}>
      {SUBMISSION_STATUS_LABEL[status] ?? status}
    </span>
  );
}

function JobRow({ job, onDelete }: { job: AdminJob; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editTitle, setEditTitle] = useState(job.title);
  const [editStatus, setEditStatus] = useState(job.status);
  const [editBudget, setEditBudget] = useState(String(job.budget ?? ""));
  const [editDeadline, setEditDeadline] = useState(job.deadline ?? "");
  const [localJob, setLocalJob] = useState(job);

  const statusTone = STATUS_STYLES[localJob.status] ?? STATUS_STYLES.closed;

  async function handleSave() {
    setSaving(true);
    const response = await fetch(`/api/admin/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editTitle.trim(),
        status: editStatus,
        budget: editBudget ? Number(editBudget) : null,
        deadline: editDeadline || null,
      }),
    });
    setSaving(false);

    if (response.ok) {
      setLocalJob((current) => ({
        ...current,
        title: editTitle.trim(),
        status: editStatus,
        budget: editBudget ? Number(editBudget) : null,
        deadline: editDeadline || null,
      }));
      setEditing(false);
    }
  }

  async function handleDelete() {
    const response = await fetch(`/api/admin/jobs/${job.id}`, { method: "DELETE" });
    if (response.ok) onDelete(job.id);
    setConfirm(false);
  }

  const detailItems = [
    { label: "Agencia", value: localJob.agencyName },
    { label: "Status", value: localJob.status },
    { label: "Orcamento", value: localJob.budget ? brl(localJob.budget) : "-" },
    { label: "Candidaturas", value: String(localJob.submissionCount) },
    { label: "Categoria", value: localJob.category ?? "-" },
    { label: "Localizacao", value: localJob.location ?? "-" },
    { label: "Genero", value: localJob.gender ?? "-" },
    {
      label: "Faixa etaria",
      value: localJob.ageMin || localJob.ageMax ? `${localJob.ageMin ?? "Qualquer"} - ${localJob.ageMax ?? "Qualquer"}` : "-",
    },
    { label: "Data da vaga", value: formatJobDate(localJob.jobDate) ?? "-" },
    { label: "Prazo", value: formatDate(localJob.deadline) },
    { label: "Publicado", value: formatDate(localJob.created_at) },
  ];

  return (
    <>
      {confirm ? (
        <ConfirmDialog
          message={`Mover "${localJob.title}" para a lixeira?`}
          onConfirm={handleDelete}
          onCancel={() => setConfirm(false)}
        />
      ) : null}

      <tr onClick={() => !editing && setExpanded((current) => !current)} className="cursor-pointer transition-colors hover:bg-zinc-50/60">
        <td className="px-6 py-4">
          <div className="flex items-center gap-2">
            <svg className={`h-3.5 w-3.5 flex-shrink-0 text-[#647B7B] transition-transform ${expanded ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <p className="max-w-[180px] truncate text-[13px] font-semibold text-zinc-900">{localJob.title}</p>
          </div>
        </td>
        <td className="px-4 py-4">
          <span className="block max-w-[160px] truncate text-[13px] text-zinc-500">{localJob.agencyName}</span>
        </td>
        <td className="hidden px-4 py-4 sm:table-cell">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${statusTone}`}>
            {localJob.status}
          </span>
        </td>
        <td className="hidden px-4 py-4 sm:table-cell">
          {localJob.category ? (
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-500">{localJob.category}</span>
          ) : (
            <span className="text-[13px] text-[#647B7B]">-</span>
          )}
        </td>
        <td className="hidden px-4 py-4 text-right md:table-cell">
          <span className="text-[13px] font-semibold tabular-nums text-zinc-900">{localJob.budget ? brl(localJob.budget) : "-"}</span>
        </td>
        <td className="hidden px-4 py-4 text-right md:table-cell">
          <span className="text-[13px] tabular-nums text-zinc-500">{localJob.submissionCount}</span>
        </td>
        <td className="hidden px-4 py-4 lg:table-cell">
          <span className="text-[13px] text-zinc-500">{localJob.jobDate ? formatJobDate(localJob.jobDate) : "-"}</span>
        </td>
        <td className="hidden px-4 py-4 lg:table-cell">
          <span className="text-[13px] text-zinc-500">{localJob.deadline ? formatDate(localJob.deadline) : "-"}</span>
        </td>
        <td className="hidden px-4 py-4 lg:table-cell">
          <span className="text-[12px] text-zinc-400">{formatDate(localJob.created_at)}</span>
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
        <tr>
          <td colSpan={10} className="px-0 py-0">
            <div className="space-y-4 border-t border-zinc-50 bg-zinc-50/60 px-6 py-5">
              {editing ? (
                <div className="max-w-xl space-y-4">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Editar vaga</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Titulo</label>
                      <input
                        value={editTitle}
                        onChange={(event) => setEditTitle(event.target.value)}
                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[13px] focus:border-zinc-900 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Status</label>
                      <select
                        value={editStatus}
                        onChange={(event) => setEditStatus(event.target.value)}
                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[13px] focus:border-zinc-900 focus:outline-none"
                      >
                        {JOB_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Orcamento (R$)</label>
                      <input
                        type="number"
                        value={editBudget}
                        onChange={(event) => setEditBudget(event.target.value)}
                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[13px] focus:border-zinc-900 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Prazo</label>
                      <input
                        type="date"
                        value={editDeadline}
                        onChange={(event) => setEditDeadline(event.target.value)}
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
                <>
                  <div className="grid grid-cols-2 gap-4 text-[12px] sm:grid-cols-3 lg:grid-cols-4">
                    {detailItems.map((item) => (
                      <div key={item.label}>
                        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">{item.label}</p>
                        <p className="font-medium text-zinc-700">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  {localJob.description ? (
                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Descricao</p>
                      <p className="max-w-2xl whitespace-pre-line text-[13px] leading-relaxed text-zinc-600">{localJob.description}</p>
                    </div>
                  ) : null}

                  {localJob.assignedTalents && localJob.assignedTalents.length > 0 ? (
                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
                        Talentos com contrato ({localJob.assignedTalents.length})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {localJob.assignedTalents.map((talent) => (
                          <div key={talent.id} className="flex items-center gap-1.5 rounded-full border border-zinc-100 bg-white py-1 pl-2.5 pr-1.5 shadow-sm">
                            <span className="text-[12px] font-medium text-zinc-800">{talent.name}</span>
                            <ContractStatusBadge status={talent.status} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {localJob.invitedTalents && localJob.invitedTalents.length > 0 ? (
                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
                        Candidatos ({localJob.invitedTalents.length})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {localJob.invitedTalents.map((talent) => (
                          <div key={talent.id} className="flex items-center gap-1.5 rounded-full border border-zinc-100 bg-white py-1 pl-2.5 pr-1.5 shadow-sm">
                            <span className="text-[12px] font-medium text-zinc-800">{talent.name}</span>
                            <SubmissionStatusBadge status={talent.status} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

export default function AdminJobs({ jobs: initialJobs }: { jobs: AdminJob[] }) {
  const [jobs, setJobs] = useState<AdminJob[]>(initialJobs);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateField, setDateField] = useState<DateField>("jobDate");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  function handleDelete(id: string) {
    setJobs((current) => current.filter((job) => job.id !== id));
  }

  const filtered = jobs.filter((job) => {
    const matchesStatus = statusFilter === "all" || job.status === statusFilter;
    if (!matchesStatus) return false;

    const matchesDates = matchesDateRange(job, dateField, fromDate, toDate);
    if (!matchesDates) return false;

    if (!search) return true;
    const query = search.toLowerCase();
    return (
      job.title.toLowerCase().includes(query) ||
      (job.category ?? "").toLowerCase().includes(query) ||
      job.agencyName.toLowerCase().includes(query)
    );
  });

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Admin da plataforma</p>
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-zinc-900">Vagas</h1>
          <p className="mt-1 text-[13px] text-zinc-400">{jobs.length} vagas no total</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative max-w-sm flex-1">
          <svg className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar vagas..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-10 pr-4 text-[13px] transition-colors placeholder:text-zinc-400 hover:border-zinc-300 focus:border-zinc-900 focus:outline-none"
          />
        </div>
        <div className="flex flex-shrink-0 items-center gap-1 self-start rounded-xl bg-zinc-100 p-1">
          {(["all", "open", "draft", "closed", "inactive"] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={[
                "whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] font-medium capitalize transition-all",
                statusFilter === status ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700",
              ].join(" ")}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 rounded-2xl border border-zinc-100 bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)] md:grid-cols-[minmax(0,220px)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Filtrar por</label>
          <select
            value={dateField}
            onChange={(event) => setDateField(event.target.value as DateField)}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[13px] text-zinc-700 transition-colors focus:border-zinc-900 focus:outline-none"
          >
            <option value="jobDate">Data da vaga</option>
            <option value="deadline">Prazo</option>
            <option value="created_at">Publicado</option>
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
                <th className="whitespace-nowrap px-6 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Titulo</th>
                <th className="whitespace-nowrap px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Agencia</th>
                <th className="hidden whitespace-nowrap px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400 sm:table-cell">Status</th>
                <th className="hidden whitespace-nowrap px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400 sm:table-cell">Categoria</th>
                <th className="hidden whitespace-nowrap px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-widest text-zinc-400 md:table-cell">Orcamento</th>
                <th className="hidden whitespace-nowrap px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-widest text-zinc-400 md:table-cell">Cands.</th>
                <th className="hidden whitespace-nowrap px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400 lg:table-cell">Data da vaga</th>
                <th className="hidden whitespace-nowrap px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400 lg:table-cell">Prazo</th>
                <th className="hidden whitespace-nowrap px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400 lg:table-cell">Publicado</th>
                <th className="w-24 px-4 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filtered.map((job) => (
                <JobRow key={job.id} job={job} onDelete={handleDelete} />
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-16 text-center">
                    <p className="text-[14px] font-medium text-zinc-500">Nenhuma vaga encontrada</p>
                    <p className="mt-1 text-[13px] text-zinc-400">Tente ajustar a busca, o status ou o intervalo de datas.</p>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="border-t border-zinc-100 bg-zinc-50/50 px-6 py-3.5">
          <p className="text-[12px] font-medium text-zinc-400">
            {filtered.length} de {jobs.length} vagas
          </p>
        </div>
      </div>
    </div>
  );
}


