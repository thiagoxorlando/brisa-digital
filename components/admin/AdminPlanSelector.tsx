"use client";

import { useState } from "react";
import { PLAN_DEFINITIONS } from "@/lib/plans";

const PLANS = [
  { key: "free",    label: PLAN_DEFINITIONS.free.label,    price: PLAN_DEFINITIONS.free.priceLabel,    color: "bg-zinc-100 text-zinc-700 border-zinc-200" },
  { key: "pro",     label: PLAN_DEFINITIONS.pro.label,     price: PLAN_DEFINITIONS.pro.priceLabel,     color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { key: "premium", label: PLAN_DEFINITIONS.premium.label, price: PLAN_DEFINITIONS.premium.priceLabel, color: "bg-amber-50 text-amber-700 border-amber-200" },
] as const;

const ROLES = [
  { key: "talent", label: "Talent", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { key: "agency", label: "Agency", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { key: "admin",  label: "Admin",  color: "bg-violet-50 text-violet-700 border-violet-200" },
] as const;

type Plan = typeof PLANS[number]["key"];
type Role = typeof ROLES[number]["key"];

interface Props {
  userId:      string;
  currentPlan: string | null;
  currentRole: string | null;
}

export default function AdminPlanSelector({ userId, currentPlan, currentRole }: Props) {
  const [activePlan, setActivePlan] = useState<Plan>((currentPlan ?? "free") as Plan);
  const [activeRole, setActiveRole] = useState<Role>((currentRole ?? "talent") as Role);
  const [loading, setLoading]       = useState(false);
  const [toast, setToast]           = useState<{ msg: string; ok: boolean } | null>(null);

  async function patch(body: { plan?: Plan; role?: Role }) {
    if (loading) return;
    setLoading(true);
    const res = await fetch("/api/admin/users/plan", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ user_id: userId, ...body }),
    });
    setLoading(false);
    if (res.ok) {
      if (body.plan) setActivePlan(body.plan);
      if (body.role) setActiveRole(body.role);
      const label = body.role
        ? `Role → ${body.role}`
        : `Plano → ${body.plan}`;
      setToast({ msg: label, ok: true });
    } else {
      const data = await res.json().catch(() => ({}));
      setToast({ msg: data.error ?? "Erro", ok: false });
    }
    setTimeout(() => setToast(null), 3000);
  }

  return (
    <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="h-[3px] bg-gradient-to-r from-violet-500 to-indigo-600" />
      <div className="p-5 space-y-4">

        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Admin</p>
          {loading && (
            <svg className="w-3.5 h-3.5 text-zinc-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
        </div>

        {/* Role */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Role</p>
          <div className="flex gap-1.5">
            {ROLES.map((r) => {
              const isActive = activeRole === r.key;
              return (
                <button
                  key={r.key}
                  onClick={() => !isActive && patch({ role: r.key })}
                  disabled={loading || isActive}
                  className={[
                    "flex-1 py-2 rounded-xl border text-[12px] font-semibold transition-all cursor-pointer disabled:cursor-default",
                    isActive
                      ? r.color
                      : "bg-zinc-50 text-zinc-400 border-zinc-100 hover:border-zinc-200 hover:text-zinc-600",
                  ].join(" ")}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Plan — only relevant for agency */}
        {activeRole === "agency" && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Plano</p>
            <div className="flex gap-1.5">
              {PLANS.map((p) => {
                const isActive = activePlan === p.key;
                return (
                  <button
                    key={p.key}
                    onClick={() => !isActive && patch({ plan: p.key })}
                    disabled={loading || isActive}
                    className={[
                      "flex-1 py-2 rounded-xl border text-[12px] font-semibold transition-all cursor-pointer disabled:cursor-default",
                      isActive
                        ? p.color
                        : "bg-zinc-50 text-zinc-400 border-zinc-100 hover:border-zinc-200 hover:text-zinc-600",
                    ].join(" ")}
                  >
                    <span className="block">{p.label}</span>
                    <span className={`block text-[10px] font-normal mt-0.5 ${isActive ? "opacity-60" : "opacity-40"}`}>{p.price}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {toast && (
          <p className={`text-[12px] font-medium ${toast.ok ? "text-emerald-600" : "text-rose-500"}`}>
            {toast.ok ? "✓ " : "✗ "}{toast.msg}
          </p>
        )}
      </div>
    </div>
  );
}
