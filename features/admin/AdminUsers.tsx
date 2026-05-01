"use client";

import { useState } from "react";
import type { MouseEvent } from "react";
import { useRouter } from "next/navigation";

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  plan: string | null;
  isFrozen: boolean;
  created_at: string;
  totalEarned: number;
  totalSpent: number;
  commissionGenerated: number;
  walletBalance: number;
};

const ROLE_STYLES: Record<string, string> = {
  admin: "bg-violet-50 text-violet-700 ring-1 ring-violet-100",
  agency: "bg-blue-50 text-blue-700 ring-1 ring-blue-100",
  talent: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
};

type SortKey = "none" | "earned" | "spent" | "commission";

function brl(value: number, options?: { zeroLabel?: string }) {
  if (value === 0) return options?.zeroLabel ?? "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase() || "?";
}

function primaryFinancialValue(user: AdminUser) {
  return user.role === "agency" ? user.walletBalance : user.totalEarned;
}

function FinancialCell({
  value,
  tone,
  note,
  zeroLabel,
}: {
  value: number;
  tone: string;
  note: string;
  zeroLabel?: string;
}) {
  return (
    <div>
      <span className={`text-[13px] font-semibold tabular-nums ${tone}`}>{brl(value, { zeroLabel })}</span>
      <p className="mt-0.5 text-[10px] text-zinc-400">{note}</p>
    </div>
  );
}

export default function AdminUsers({ users: initialUsers }: { users: AdminUser[] }) {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>(initialUsers);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("none");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [updating, setUpdating] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState<"freeze" | "delete" | null>(null);
  const [error, setError] = useState("");
  const [creditModal, setCreditModal] = useState<{ userId: string; name: string; balance: number } | null>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditNote, setCreditNote] = useState("");
  const [crediting, setCrediting] = useState(false);

  const filtered = users
    .filter((user) => {
      if (roleFilter !== "all" && user.role !== roleFilter) return false;
      if (!search) return true;
      const query = search.toLowerCase();
      return (
        user.name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query) ||
        user.role.toLowerCase().includes(query)
      );
    })
    .sort((left, right) => {
      if (sortKey === "earned") return primaryFinancialValue(right) - primaryFinancialValue(left);
      if (sortKey === "spent") return right.totalSpent - left.totalSpent;
      if (sortKey === "commission") return right.commissionGenerated - left.commissionGenerated;
      return 0;
    });

  async function changeRole(userId: string, newRole: string) {
    setUpdating(userId);
    setError("");

    const response = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });

    if (response.ok) {
      setUsers((current) => current.map((user) => (user.id === userId ? { ...user, role: newRole } : user)));
      router.refresh();
    } else {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error ?? "Falha ao atualizar o papel.");
    }

    setUpdating(null);
  }

  async function toggleFreeze(user: AdminUser) {
    const action = user.isFrozen ? "unfreeze" : "freeze";
    setUpdating(user.id);
    setError("");

    const response = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });

    if (response.ok) {
      setUsers((current) =>
        current.map((item) => (item.id === user.id ? { ...item, isFrozen: !item.isFrozen } : item)),
      );
    } else {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error ?? "Falha ao congelar a conta.");
    }

    setUpdating(null);
  }

  async function handleDelete(user: AdminUser) {
    const response = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });

    if (response.ok) {
      setUsers((current) => current.filter((item) => item.id !== user.id));
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(user.id);
        return next;
      });
    } else {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error ?? "Falha ao deletar o usuario.");
    }

    setDeleting(null);
  }

  async function handleAddBalance() {
    if (!creditModal) return;

    const amount = parseFloat(creditAmount.replace(",", "."));
    if (!amount || amount <= 0) return;

    setCrediting(true);
    const response = await fetch(`/api/admin/users/${creditModal.userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_balance", amount, description: creditNote }),
    });

    if (response.ok) {
      const payload = (await response.json()) as { newBalance: number };
      setUsers((current) =>
        current.map((user) => (user.id === creditModal.userId ? { ...user, walletBalance: payload.newBalance } : user)),
      );
      setCreditModal(null);
      setCreditAmount("");
      setCreditNote("");
    } else {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error ?? "Falha ao adicionar saldo.");
    }

    setCrediting(false);
  }

  function handleRowClick(user: AdminUser, event: MouseEvent) {
    if ((event.target as HTMLElement).closest("select, button, input")) return;
    router.push(`/admin/users/${user.id}`);
  }

  function toggleSelected(userId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function toggleSelectAllFiltered() {
    const filteredIds = filtered.map((user) => user.id);
    const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));

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

  async function handleBulkFreeze() {
    if (selectedIds.size === 0) return;
    setBulkBusy("freeze");
    setError("");

    const ids = Array.from(selectedIds);
    const response = await fetch("/api/admin/users/bulk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action: "freeze" }),
    });

    if (response.ok) {
      const selected = new Set(ids);
      setUsers((current) => current.map((user) => (selected.has(user.id) ? { ...user, isFrozen: true } : user)));
      setSelectedIds(new Set());
    } else {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error ?? "Falha ao desabilitar os usuarios selecionados.");
    }

    setBulkBusy(null);
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Tem certeza que deseja excluir ${selectedIds.size} usuários selecionados?`)) return;
    setBulkBusy("delete");
    setError("");

    const ids = Array.from(selectedIds);
    const response = await fetch("/api/admin/users/bulk", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });

    if (response.ok) {
      const selected = new Set(ids);
      setUsers((current) => current.filter((user) => !selected.has(user.id)));
      setSelectedIds(new Set());
    } else {
      const payload = await response.json().catch(() => ({}));
      const detail = payload.id ? ` (${payload.id})` : "";
      setError((payload.error ?? "Falha ao excluir os usuarios selecionados.") + detail);
    }

    setBulkBusy(null);
  }

  const userToDelete = deleting ? users.find((user) => user.id === deleting) : null;
  const filteredIds = filtered.map((user) => user.id);
  const selectedCount = selectedIds.size;
  const selectedFilteredCount = filteredIds.filter((id) => selectedIds.has(id)).length;
  const allFilteredSelected = filteredIds.length > 0 && selectedFilteredCount === filteredIds.length;
  const someFilteredSelected = selectedFilteredCount > 0 && !allFilteredSelected;

  return (
    <div className="max-w-7xl space-y-6">
      {userToDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-xl">
            <p className="text-[14px] font-medium text-zinc-700">
              Deletar permanentemente <strong>{userToDelete.name || userToDelete.email}</strong>?
            </p>
            <p className="text-[12px] text-zinc-400">
              Isso remove os dados do usuario, mantendo apenas os registros financeiros que precisarem permanecer.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleting(null)}
                className="flex-1 rounded-xl border border-zinc-200 px-4 py-2.5 text-[13px] font-medium text-zinc-600 transition-colors hover:border-zinc-300"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(userToDelete)}
                className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-rose-700"
              >
                Deletar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {creditModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm space-y-5 rounded-2xl bg-white p-6 shadow-xl">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Agencia</p>
              <h3 className="text-[16px] font-semibold text-zinc-900">{creditModal.name || "Sem nome"}</h3>
              <p className="mt-0.5 text-[12px] text-zinc-400">
                Saldo atual: <strong className="text-zinc-700">{brl(creditModal.balance, { zeroLabel: "R$ 0" })}</strong>
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
                  Valor a adicionar (R$)
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0,00"
                  value={creditAmount}
                  onChange={(event) => setCreditAmount(event.target.value)}
                  autoFocus
                  className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-[14px] font-semibold transition-colors focus:border-zinc-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
                  Motivo (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: credito promocional, ajuste..."
                  value={creditNote}
                  onChange={(event) => setCreditNote(event.target.value)}
                  className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-[13px] transition-colors placeholder:text-[#647B7B] focus:border-zinc-900 focus:outline-none"
                />
              </div>
            </div>

            {creditAmount && parseFloat(creditAmount.replace(",", ".")) > 0 ? (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-2.5">
                <p className="text-[12px] text-emerald-700">
                  Novo saldo:{" "}
                  <strong>
                    {new Intl.NumberFormat("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                      maximumFractionDigits: 0,
                    }).format(creditModal.balance + parseFloat(creditAmount.replace(",", ".")))}
                  </strong>
                </p>
              </div>
            ) : null}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => {
                  setCreditModal(null);
                  setCreditAmount("");
                  setCreditNote("");
                }}
                className="flex-1 rounded-xl border border-zinc-200 px-4 py-2.5 text-[13px] font-medium text-zinc-600 transition-colors hover:border-zinc-300"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddBalance}
                disabled={crediting || !creditAmount || parseFloat(creditAmount.replace(",", ".")) <= 0}
                className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400"
              >
                {crediting ? "Adicionando..." : "Adicionar saldo"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Admin da plataforma</p>
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-zinc-900">Usuarios</h1>
        <p className="mt-1 text-[13px] text-zinc-400">{users.length} usuarios no total</p>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] text-rose-600">{error}</p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <div className="relative max-w-sm flex-1">
          <svg className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar usuarios..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-10 pr-4 text-[13px] transition-colors placeholder:text-zinc-400 hover:border-zinc-300 focus:border-zinc-900 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1 self-start rounded-xl bg-zinc-100 p-1">
          {(["all", "talent", "agency", "admin"] as const).map((role) => (
            <button
              key={role}
              onClick={() => setRoleFilter(role)}
              className={[
                "rounded-lg px-3 py-1.5 text-[12px] font-medium capitalize transition-all",
                roleFilter === role ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700",
              ].join(" ")}
            >
              {role === "all" ? "Todos" : role}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 self-start rounded-xl bg-zinc-100 p-1">
          {([
            { key: "none" as SortKey, label: "Padrao" },
            { key: "earned" as SortKey, label: "Ganhos / saldo" },
            { key: "spent" as SortKey, label: "Gastos" },
            { key: "commission" as SortKey, label: "Comissao" },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSortKey(key)}
              className={[
                "whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all",
                sortKey === key ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {selectedCount > 0 ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-[0_1px_4px_rgba(0,0,0,0.04)] sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] font-semibold text-zinc-900">{selectedCount} selecionados</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleBulkFreeze}
              disabled={bulkBusy !== null}
              className="rounded-xl border border-zinc-200 px-3.5 py-2 text-[12px] font-semibold text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bulkBusy === "freeze" ? "Desabilitando..." : "Desabilitar selecionados"}
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={bulkBusy !== null}
              className="rounded-xl bg-rose-600 px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bulkBusy === "delete" ? "Excluindo..." : "Excluir selecionados"}
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              disabled={bulkBusy !== null}
              className="rounded-xl px-3.5 py-2 text-[12px] font-medium text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Limpar seleção
            </button>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)]">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="px-4 py-3.5">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    ref={(node) => {
                      if (node) node.indeterminate = someFilteredSelected;
                    }}
                    onChange={toggleSelectAllFiltered}
                    aria-label="Selecionar usuarios filtrados"
                    className="h-4 w-4 cursor-pointer rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                  />
                </th>
                <th className="px-6 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Usuario</th>
                <th className="hidden px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400 sm:table-cell">Email</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Papel</th>
                <th className="hidden px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400 sm:table-cell">Plano</th>
                <th className="hidden px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400 md:table-cell">Entrou</th>
                <th className="hidden px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-widest text-zinc-400 lg:table-cell">Ganhos / saldo</th>
                <th className="hidden px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-widest text-zinc-400 lg:table-cell">Gastos</th>
                <th className="hidden px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-widest text-zinc-400 xl:table-cell">Comissao</th>
                <th className="px-6 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Alterar papel</th>
                <th className="w-36 px-4 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filtered.map((user) => {
                const roleTone = ROLE_STYLES[user.role] ?? "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200";

                return (
                  <tr
                    key={user.id}
                    onClick={(event) => handleRowClick(user, event)}
                    className={["cursor-pointer transition-colors hover:bg-zinc-50/60", user.isFrozen ? "opacity-60" : ""].join(" ")}
                  >
                    <td className="px-4 py-4" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(user.id)}
                        onChange={() => toggleSelected(user.id)}
                        aria-label={`Selecionar ${user.name || user.email}`}
                        className="h-4 w-4 cursor-pointer rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={[
                            "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full",
                            user.isFrozen ? "bg-sky-100" : "bg-zinc-100",
                          ].join(" ")}
                        >
                          <span className={`text-[11px] font-bold ${user.isFrozen ? "text-sky-500" : "text-zinc-500"}`}>
                            {initials(user.name)}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="max-w-[160px] truncate text-[13px] font-semibold text-zinc-900">
                            {user.name || <span className="font-normal text-zinc-400">Sem nome</span>}
                          </p>
                          {user.isFrozen ? (
                            <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-600 ring-1 ring-sky-100">
                              <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20">
                                <path
                                  fillRule="evenodd"
                                  d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                              Congelado
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </td>

                    <td className="hidden px-4 py-4 sm:table-cell">
                      <span className="block max-w-[200px] truncate text-[13px] text-zinc-500">{user.email}</span>
                    </td>

                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${roleTone}`}>
                        {user.role}
                      </span>
                    </td>

                    <td className="hidden px-4 py-4 sm:table-cell">
                      {user.role === "agency" ? (
                        <span
                          className={[
                            "inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize",
                            user.plan === "pro"
                              ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100"
                              : user.plan === "premium"
                                ? "bg-amber-50 text-amber-700 ring-1 ring-amber-100"
                                : "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200",
                          ].join(" ")}
                        >
                          {user.plan ?? "free"}
                        </span>
                      ) : (
                        <span className="text-[11px] text-[#647B7B]">—</span>
                      )}
                    </td>

                    <td className="hidden px-4 py-4 md:table-cell">
                      <span className="text-[12px] text-zinc-400">{formatDate(user.created_at)}</span>
                    </td>

                    <td className="hidden px-4 py-4 text-right lg:table-cell">
                      {user.role === "agency" ? (
                        <FinancialCell
                          value={user.walletBalance}
                          tone={user.walletBalance > 0 ? "text-emerald-700" : "text-zinc-500"}
                          note="saldo em carteira"
                          zeroLabel="R$ 0"
                        />
                      ) : user.role === "talent" ? (
                        <FinancialCell
                          value={user.totalEarned}
                          tone={user.totalEarned > 0 ? "text-emerald-700" : "text-[#647B7B]"}
                          note="ganhos confirmados"
                        />
                      ) : (
                        <span className="text-[13px] text-[#647B7B]">—</span>
                      )}
                    </td>

                    <td className="hidden px-4 py-4 text-right lg:table-cell">
                      {user.role === "agency" ? (
                        <FinancialCell
                          value={user.totalSpent}
                          tone={user.totalSpent > 0 ? "text-zinc-900" : "text-[#647B7B]"}
                          note="gastos confirmados"
                        />
                      ) : (
                        <span className="text-[13px] text-[#647B7B]">—</span>
                      )}
                    </td>

                    <td className="hidden px-4 py-4 text-right xl:table-cell">
                      {user.role === "admin" ? (
                        <span className="text-[13px] text-[#647B7B]">—</span>
                      ) : (
                        <FinancialCell
                          value={user.commissionGenerated}
                          tone={user.commissionGenerated > 0 ? "text-violet-700" : "text-[#647B7B]"}
                          note="comissao da plataforma"
                        />
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <select
                        value={user.role}
                        disabled={updating === user.id}
                        onChange={(event) => changeRole(user.id, event.target.value)}
                        className="cursor-pointer rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-[12px] text-zinc-700 transition-colors hover:border-zinc-300 focus:border-zinc-900 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="talent">talent</option>
                        <option value="agency">agency</option>
                        <option value="admin">admin</option>
                      </select>
                      {updating === user.id ? <span className="ml-2 text-[11px] text-zinc-400">Salvando...</span> : null}
                    </td>

                    <td className="px-4 py-4 text-right" onClick={(event) => event.stopPropagation()}>
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {user.role === "agency" ? (
                          <button
                            onClick={() => {
                              setCreditModal({ userId: user.id, name: user.name, balance: user.walletBalance });
                              setCreditAmount("");
                              setCreditNote("");
                            }}
                            title="Adicionar saldo a carteira"
                            className="rounded-lg px-2 py-1 text-[11px] font-medium text-emerald-600 transition-colors hover:bg-emerald-50 hover:text-emerald-800"
                          >
                            + Saldo
                          </button>
                        ) : null}

                        <button
                          onClick={() => toggleFreeze(user)}
                          disabled={updating === user.id}
                          title={user.isFrozen ? "Descongelar conta" : "Congelar conta"}
                          className={[
                            "rounded-lg px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50",
                            user.isFrozen
                              ? "text-sky-600 hover:bg-sky-50 hover:text-sky-800"
                              : "text-zinc-400 hover:bg-sky-50 hover:text-sky-600",
                          ].join(" ")}
                        >
                          {user.isFrozen ? "Descongelar" : "Congelar"}
                        </button>

                        <button
                          onClick={() => setDeleting(user.id)}
                          className="rounded-lg px-2 py-1 text-[11px] font-medium text-rose-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                        >
                          Deletar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-6 py-16 text-center">
                    <p className="text-[14px] font-medium text-zinc-500">Nenhum usuario encontrado</p>
                    <p className="mt-1 text-[13px] text-zinc-400">Tente ajustar a busca ou o filtro.</p>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="border-t border-zinc-100 bg-zinc-50/50 px-6 py-3.5">
          <p className="text-[12px] font-medium text-zinc-400">
            {filtered.length} de {users.length} usuarios
          </p>
        </div>
      </div>
    </div>
  );
}

