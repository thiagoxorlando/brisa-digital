"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
  totalEarned: number;
  totalSpent: number;
  commissionGenerated: number;
};

const ROLE_STYLES: Record<string, string> = {
  admin:  "bg-violet-50 text-violet-700 ring-1 ring-violet-100",
  agency: "bg-blue-50   text-blue-700   ring-1 ring-blue-100",
  talent: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
};

const COMMISSION_RATE = 0.15;

function usd(n: number) {
  if (n === 0) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(s: string) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}

type SortKey = "none" | "earned" | "spent" | "commission";

export default function AdminUsers({ users: initial }: { users: AdminUser[] }) {
  const router = useRouter();
  const [users, setUsers]     = useState<AdminUser[]>(initial);
  const [search, setSearch]   = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("none");
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError]     = useState("");

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
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
      router.refresh();
    } else {
      const d = await res.json();
      setError(d.error ?? "Role update failed.");
    }
    setUpdating(null);
  }

  function handleRowClick(u: AdminUser, e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("select")) return;
    router.push(`/admin/users/${u.id}`);
  }

  return (
    <div className="max-w-7xl space-y-6">

      {/* Header */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">
          Platform Admin
        </p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">
          Users
        </h1>
        <p className="text-[13px] text-zinc-400 mt-1">{users.length} total users</p>
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
            placeholder="Search users…"
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
              {r}
            </button>
          ))}
        </div>
        {/* Sort */}
        <div className="flex items-center gap-1 bg-zinc-100 rounded-xl p-1 self-start">
          {([
            { key: "none" as SortKey, label: "Default" },
            { key: "earned" as SortKey, label: "Earnings ↓" },
            { key: "spent" as SortKey, label: "Spend ↓" },
            { key: "commission" as SortKey, label: "Commission ↓" },
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
                <th className="text-left px-6 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">User</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden sm:table-cell">Email</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Role</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden md:table-cell">Joined</th>
                <th className="text-right px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden lg:table-cell">Earned</th>
                <th className="text-right px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden lg:table-cell">Spent</th>
                <th className="text-right px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden xl:table-cell">Commission</th>
                <th className="text-left px-6 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filtered.map((u) => {
                const roleCls = ROLE_STYLES[u.role] ?? "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200";
                const isClickable = true;
                return (
                  <tr
                    key={u.id}
                    onClick={(e) => handleRowClick(u, e)}
                    className={[
                      "transition-colors",
                      isClickable ? "hover:bg-zinc-50/60 cursor-pointer" : "hover:bg-zinc-50/40",
                    ].join(" ")}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-[11px] font-bold text-zinc-500">
                            {initials(u.name)}
                          </span>
                        </div>
                        <p className="text-[13px] font-semibold text-zinc-900 truncate max-w-[160px]">
                          {u.name || <span className="text-zinc-400 font-normal">No name</span>}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-4 hidden sm:table-cell">
                      <span className="text-[13px] text-zinc-500 truncate max-w-[200px] block">{u.email}</span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize ${roleCls}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell">
                      <span className="text-[12px] text-zinc-400">{formatDate(u.created_at)}</span>
                    </td>
                    <td className="px-4 py-4 text-right hidden lg:table-cell">
                      <span className={`text-[13px] font-semibold tabular-nums ${u.totalEarned > 0 ? "text-emerald-700" : "text-zinc-300"}`}>
                        {usd(u.totalEarned)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right hidden lg:table-cell">
                      <span className={`text-[13px] font-semibold tabular-nums ${u.totalSpent > 0 ? "text-zinc-900" : "text-zinc-300"}`}>
                        {usd(u.totalSpent)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right hidden xl:table-cell">
                      <span className={`text-[13px] font-semibold tabular-nums ${u.commissionGenerated > 0 ? "text-violet-700" : "text-zinc-300"}`}>
                        {usd(u.commissionGenerated)}
                      </span>
                    </td>
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
                        <span className="ml-2 text-[11px] text-zinc-400">Saving…</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center">
                    <p className="text-[14px] font-medium text-zinc-500">No users found</p>
                    <p className="text-[13px] text-zinc-400 mt-1">Try adjusting your search or filter.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3.5 border-t border-zinc-100 bg-zinc-50/50">
          <p className="text-[12px] text-zinc-400 font-medium">
            {filtered.length} of {users.length} users
          </p>
        </div>
      </div>
    </div>
  );
}
