"use client";

import { useState } from "react";
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
  admin:  "bg-violet-50 text-violet-700 ring-1 ring-violet-100",
  agency: "bg-blue-50   text-blue-700   ring-1 ring-blue-100",
  talent: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
};

function brl(n: number) {
  if (n === 0) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL", maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(s: string) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-BR", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}

type SortKey = "none" | "earned" | "spent" | "commission";

export default function AdminUsers({ users: initial }: { users: AdminUser[] }) {
  const router = useRouter();
  const [users, setUsers]           = useState<AdminUser[]>(initial);
  const [search, setSearch]         = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sortKey, setSortKey]       = useState<SortKey>("none");
  const [updating, setUpdating]     = useState<string | null>(null);
  const [deleting, setDeleting]     = useState<string | null>(null);
  const [error, setError]           = useState("");
  const [creditModal, setCreditModal] = useState<{ userId: string; name: string; balance: number } | null>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditNote, setCreditNote]     = useState("");
  const [crediting, setCrediting]       = useState(false);

  const filtered = users
    .filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sortKey === "earned")     return b.totalEarned - a.totalEarned;
      if (sortKey === "spent")      return b.totalSpent - a.totalSpent;
      if (sortKey === "commission") return b.commissionGenerated - a.commissionGenerated;
      return 0;
    });

  async function changeRole(userId: string, newRole: string) {
    setUpdating(userId);
    setError("");
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
      router.refresh();
    } else {
      const d = await res.json();
      setError(d.error ?? "Role update failed.");
    }
    setUpdating(null);
  }

  async function toggleFreeze(u: AdminUser) {
    const action = u.isFrozen ? "unfreeze" : "freeze";
    setUpdating(u.id);
    setError("");
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) {
      setUsers((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, isFrozen: !x.isFrozen } : x))
      );
    } else {
      const d = await res.json();
      setError(d.error ?? "Freeze action failed.");
    }
    setUpdating(null);
  }

  async function handleDelete(u: AdminUser) {
    const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    if (res.ok) {
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Delete failed.");
    }
    setDeleting(null);
  }

  async function handleAddBalance() {
    if (!creditModal) return;
    const amount = parseFloat(creditAmount.replace(",", "."));
    if (!amount || amount <= 0) return;
    setCrediting(true);
    const res = await fetch(`/api/admin/users/${creditModal.userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_balance", amount, description: creditNote }),
    });
    if (res.ok) {
      const { newBalance } = await res.json();
      setUsers((prev) =>
        prev.map((u) => u.id === creditModal.userId ? { ...u, walletBalance: newBalance } : u)
      );
      setCreditModal(null);
      setCreditAmount("");
      setCreditNote("");
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Falha ao adicionar saldo.");
    }
    setCrediting(false);
  }

  function handleRowClick(u: AdminUser, e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("select, button")) return;
    router.push(`/admin/users/${u.id}`);
  }

  const userToDelete = deleting ? users.find((u) => u.id === deleting) : null;

  return (
    <div className="max-w-7xl space-y-6">

      {/* Delete confirmation modal */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <p className="text-[14px] text-zinc-700 font-medium">
              Deletar permanentemente <strong>{userToDelete.name || userToDelete.email}</strong>?
            </p>
            <p className="text-[12px] text-zinc-400">
              Isso irá remover todos os dados do usuário, incluindo contratos não pagos, candidaturas e vagas. Contratos pagos são preservados como registros financeiros.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleting(null)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 text-[13px] font-medium text-zinc-600 hover:border-zinc-300 transition-colors cursor-pointer">
                Cancelar
              </button>
              <button onClick={() => handleDelete(userToDelete)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[13px] font-semibold transition-colors cursor-pointer">
                Deletar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add balance modal */}
      {creditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4 space-y-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Agência</p>
              <h3 className="text-[16px] font-semibold text-zinc-900">{creditModal.name || "Sem nome"}</h3>
              <p className="text-[12px] text-zinc-400 mt-0.5">
                Saldo atual: <strong className="text-zinc-700">{brl(creditModal.balance) === "—" ? "R$ 0" : brl(creditModal.balance)}</strong>
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1.5 block">
                  Valor a adicionar (R$)
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0,00"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  autoFocus
                  className="w-full px-3.5 py-2.5 text-[14px] font-semibold border border-zinc-200 rounded-xl focus:border-zinc-900 focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1.5 block">
                  Motivo (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Crédito promocional, correção…"
                  value={creditNote}
                  onChange={(e) => setCreditNote(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-[13px] border border-zinc-200 rounded-xl focus:border-zinc-900 focus:outline-none transition-colors placeholder:text-zinc-300"
                />
              </div>
            </div>

            {creditAmount && parseFloat(creditAmount.replace(",", ".")) > 0 && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5">
                <p className="text-[12px] text-emerald-700">
                  Novo saldo: <strong>
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
                      .format(creditModal.balance + parseFloat(creditAmount.replace(",", ".")))}
                  </strong>
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setCreditModal(null); setCreditAmount(""); setCreditNote(""); }}
                className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 text-[13px] font-medium text-zinc-600 hover:border-zinc-300 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddBalance}
                disabled={crediting || !creditAmount || parseFloat(creditAmount.replace(",", ".")) <= 0}
                className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-200 disabled:text-zinc-400 text-white text-[13px] font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {crediting ? "Adicionando…" : "Adicionar Saldo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">
          Admin da Plataforma
        </p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">
          Usuários
        </h1>
        <p className="text-[13px] text-zinc-400 mt-1">{users.length} usuários no total</p>
      </div>

      {error && (
        <p className="text-[13px] text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar usuários…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-[13px] bg-white border border-zinc-200 rounded-xl placeholder:text-zinc-400 hover:border-zinc-300 focus:border-zinc-900 focus:outline-none transition-colors"
          />
        </div>
        <div className="flex items-center gap-1 bg-zinc-100 rounded-xl p-1 self-start">
          {(["all", "talent", "agency", "admin"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={[
                "px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all duration-150 capitalize cursor-pointer",
                roleFilter === r
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700",
              ].join(" ")}
            >
              {r === "all" ? "Todos" : r}
            </button>
          ))}
        </div>
        {/* Sort */}
        <div className="flex items-center gap-1 bg-zinc-100 rounded-xl p-1 self-start">
          {([
            { key: "none" as SortKey,       label: "Padrão" },
            { key: "earned" as SortKey,     label: "Ganhos ↓" },
            { key: "spent" as SortKey,      label: "Gasto ↓" },
            { key: "commission" as SortKey, label: "Comissão ↓" },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSortKey(key)}
              className={[
                "px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all duration-150 whitespace-nowrap cursor-pointer",
                sortKey === key
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="text-left px-6 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Usuário</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden sm:table-cell">Email</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Papel</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden sm:table-cell">Plano</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden md:table-cell">Entrou</th>
                <th className="text-right px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden lg:table-cell">Ganhos</th>
                <th className="text-right px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden lg:table-cell">Gasto</th>
                <th className="text-right px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden xl:table-cell">Comissão</th>
                <th className="text-left px-6 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Alterar Papel</th>
                <th className="px-4 py-3.5 w-36" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filtered.map((u) => {
                const roleCls = ROLE_STYLES[u.role] ?? "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200";
                return (
                  <tr
                    key={u.id}
                    onClick={(e) => handleRowClick(u, e)}
                    className={[
                      "transition-colors hover:bg-zinc-50/60 cursor-pointer",
                      u.isFrozen ? "opacity-60" : "",
                    ].join(" ")}
                  >
                    {/* User */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={[
                          "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                          u.isFrozen ? "bg-sky-100" : "bg-zinc-100",
                        ].join(" ")}>
                          <span className={`text-[11px] font-bold ${u.isFrozen ? "text-sky-500" : "text-zinc-500"}`}>
                            {initials(u.name)}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-zinc-900 truncate max-w-[160px]">
                            {u.name || <span className="text-zinc-400 font-normal">Sem nome</span>}
                          </p>
                          {u.isFrozen && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded-full ring-1 ring-sky-100 mt-0.5">
                              <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                              </svg>
                              Congelado
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Email */}
                    <td className="px-4 py-4 hidden sm:table-cell">
                      <span className="text-[13px] text-zinc-500 truncate max-w-[200px] block">{u.email}</span>
                    </td>

                    {/* Role badge */}
                    <td className="px-4 py-4">
                      <span className={`inline-flex text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize ${roleCls}`}>
                        {u.role}
                      </span>
                    </td>

                    {/* Plan badge */}
                    <td className="px-4 py-4 hidden sm:table-cell">
                      {u.role === "agency" ? (
                        <span className={[
                          "inline-flex text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize",
                          u.plan === "pro"     ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100" :
                          u.plan === "premium" ? "bg-amber-50 text-amber-700 ring-1 ring-amber-100"   :
                                                 "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200",
                        ].join(" ")}>
                          {u.plan ?? "free"}
                        </span>
                      ) : (
                        <span className="text-zinc-300 text-[11px]">—</span>
                      )}
                    </td>

                    {/* Joined */}
                    <td className="px-4 py-4 hidden md:table-cell">
                      <span className="text-[12px] text-zinc-400">{formatDate(u.created_at)}</span>
                    </td>

                    {/* Financials */}
                    <td className="px-4 py-4 text-right hidden lg:table-cell">
                      {u.role === "agency" ? (
                        <div>
                          <span className={`text-[13px] font-semibold tabular-nums ${u.walletBalance > 0 ? "text-emerald-700" : "text-zinc-300"}`}>
                            {u.walletBalance > 0 ? brl(u.walletBalance) : "—"}
                          </span>
                          <p className="text-[10px] text-zinc-400 mt-0.5">carteira</p>
                        </div>
                      ) : (
                        <span className={`text-[13px] font-semibold tabular-nums ${u.totalEarned > 0 ? "text-emerald-700" : "text-zinc-300"}`}>
                          {brl(u.totalEarned)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right hidden lg:table-cell">
                      <span className={`text-[13px] font-semibold tabular-nums ${u.totalSpent > 0 ? "text-zinc-900" : "text-zinc-300"}`}>
                        {brl(u.totalSpent)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right hidden xl:table-cell">
                      <span className={`text-[13px] font-semibold tabular-nums ${u.commissionGenerated > 0 ? "text-violet-700" : "text-zinc-300"}`}>
                        {brl(u.commissionGenerated)}
                      </span>
                    </td>

                    {/* Role selector */}
                    <td className="px-6 py-4">
                      <select
                        value={u.role}
                        disabled={updating === u.id}
                        onChange={(e) => changeRole(u.id, e.target.value)}
                        className="text-[12px] border border-zinc-200 rounded-lg px-2 py-1.5 bg-white text-zinc-700 hover:border-zinc-300 focus:border-zinc-900 focus:outline-none transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                      >
                        <option value="talent">talent</option>
                        <option value="agency">agency</option>
                        <option value="admin">admin</option>
                      </select>
                      {updating === u.id && (
                        <span className="ml-2 text-[11px] text-zinc-400">Salvando…</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        {/* Add balance — agency only */}
                        {u.role === "agency" && (
                          <button
                            onClick={() => { setCreditModal({ userId: u.id, name: u.name, balance: u.walletBalance }); setCreditAmount(""); setCreditNote(""); }}
                            title="Adicionar saldo à carteira"
                            className="text-[11px] font-medium text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 transition-colors cursor-pointer px-2 py-1 rounded-lg"
                          >
                            + Saldo
                          </button>
                        )}

                        {/* Freeze / Unfreeze */}
                        <button
                          onClick={() => toggleFreeze(u)}
                          disabled={updating === u.id}
                          title={u.isFrozen ? "Descongelar conta" : "Congelar conta"}
                          className={[
                            "text-[11px] font-medium px-2 py-1 rounded-lg transition-colors cursor-pointer disabled:opacity-50",
                            u.isFrozen
                              ? "text-sky-600 hover:text-sky-800 hover:bg-sky-50"
                              : "text-zinc-400 hover:text-sky-600 hover:bg-sky-50",
                          ].join(" ")}
                        >
                          {u.isFrozen ? "Descongelar" : "Congelar"}
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => setDeleting(u.id)}
                          className="text-[11px] font-medium text-rose-400 hover:text-rose-600 transition-colors cursor-pointer px-2 py-1 rounded-lg hover:bg-rose-50"
                        >
                          Deletar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-6 py-16 text-center">
                    <p className="text-[14px] font-medium text-zinc-500">Nenhum usuário encontrado</p>
                    <p className="text-[13px] text-zinc-400 mt-1">Tente ajustar a busca ou o filtro.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3.5 border-t border-zinc-100 bg-zinc-50/50">
          <p className="text-[12px] text-zinc-400 font-medium">
            {filtered.length} de {users.length} usuários
          </p>
        </div>
      </div>
    </div>
  );
}
