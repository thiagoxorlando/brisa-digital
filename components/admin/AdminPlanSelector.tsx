"use client";

import { useEffect, useState } from "react";
import { buildPlanSettingsFallback, formatPlanPrice, type PublicPlanSetting } from "@/lib/planSettings.shared";
import { resolvePlanPricing } from "@/lib/planPricing";

const PLANS = [
  { key: "free",    color: "bg-zinc-100 text-zinc-700 border-zinc-200" },
  { key: "pro",     color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { key: "premium", color: "bg-amber-50 text-amber-700 border-amber-200" },
] as const;

const ROLES = [
  { key: "talent", label: "Talento",        color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { key: "agency", label: "Agência",         color: "bg-blue-50 text-blue-700 border-blue-200" },
  { key: "admin",  label: "Administração",   color: "bg-violet-50 text-violet-700 border-violet-200" },
] as const;

type Plan = typeof PLANS[number]["key"];
type Role = typeof ROLES[number]["key"];

interface Props {
  userId:      string;
  currentPlan: string | null;
  currentRole: string | null;
}

export default function AdminPlanSelector({ userId, currentPlan, currentRole }: Props) {
  const [activePlan, setActivePlan]   = useState<Plan>((currentPlan ?? "free") as Plan);
  const [activeRole, setActiveRole]   = useState<Role>((currentRole ?? "talent") as Role);
  const [loading, setLoading]         = useState(false);
  const [toast, setToast]             = useState<{ msg: string; ok: boolean } | null>(null);
  const [planSettings, setPlanSettings] = useState<Record<Plan, PublicPlanSetting>>(buildPlanSettingsFallback);

  // Reason-modal state (plan changes only)
  const [pendingPlan, setPendingPlan] = useState<Plan | null>(null);
  const [reason, setReason]           = useState("");

  useEffect(() => {
    void fetch("/api/plan-settings").then(async (res) => {
      if (!res.ok) return;
      const data = await res.json() as Record<Plan, PublicPlanSetting>;
      setPlanSettings((prev) => ({ ...prev, ...data }));
    }).catch(() => undefined);
  }, []);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  // ── Role change — no reason required ────────────────────────────────────────
  async function patchRole(role: Role) {
    if (loading) return;
    setLoading(true);
    const res = await fetch("/api/admin/users/plan", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ user_id: userId, role }),
    });
    setLoading(false);
    if (res.ok) {
      setActiveRole(role);
      showToast(`Função → ${role}`, true);
    } else {
      const data = await res.json().catch(() => ({})) as { error?: string };
      showToast(data.error ?? "Erro", false);
    }
  }

  // ── Plan change — opens reason modal ────────────────────────────────────────
  function requestPlanChange(plan: Plan) {
    if (loading) return;
    setPendingPlan(plan);
    setReason("");
  }

  function cancelPlanChange() {
    setPendingPlan(null);
    setReason("");
  }

  async function confirmPlanChange() {
    if (!pendingPlan || !reason.trim()) return;
    const plan        = pendingPlan;
    const savedReason = reason.trim();
    setPendingPlan(null);
    setReason("");

    setLoading(true);
    const res = await fetch("/api/admin/users/plan", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ user_id: userId, plan, reason: savedReason }),
    });
    setLoading(false);
    if (res.ok) {
      setActivePlan(plan);
      showToast("Plano atualizado com sucesso.", true);
    } else {
      const data = await res.json().catch(() => ({})) as { error?: string };
      showToast(data.error ?? "Não foi possível atualizar o plano.", false);
    }
  }

  return (
    <>
      {/* Reason modal */}
      {pendingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={cancelPlanChange}>
          <div
            className="bg-white rounded-2xl border border-zinc-200 shadow-xl p-6 w-full max-w-sm space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <p className="text-[14px] font-semibold text-zinc-900">
                Alterar plano para{" "}
                <span className="text-indigo-600">
                  {planSettings[pendingPlan]?.name ?? pendingPlan}
                </span>
              </p>
              <p className="text-[12px] text-zinc-500 mt-1">
                Informe o motivo da alteração manual para registro de auditoria.
              </p>
            </div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Teste interno Premium, Cortesia comercial, Correção manual…"
              rows={3}
              autoFocus
              className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-[13px] text-zinc-800 placeholder:text-zinc-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelPlanChange}
                className="flex-1 py-2.5 rounded-xl border border-zinc-200 text-[12px] font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmPlanChange}
                disabled={!reason.trim()}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-[12px] font-semibold text-white hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="h-[3px] bg-gradient-to-r from-violet-500 to-indigo-600" />
        <div className="p-5 space-y-4">

          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Administração</p>
            {loading && (
              <svg className="w-3.5 h-3.5 text-zinc-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
          </div>

          {/* Role */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Função</p>
            <div className="flex gap-1.5">
              {ROLES.map((r) => {
                const isActive = activeRole === r.key;
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => !isActive && patchRole(r.key)}
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
                  const isActive  = activePlan === p.key;
                  const setting   = planSettings[p.key] ?? buildPlanSettingsFallback()[p.key];
                  const available = setting.is_available;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => !isActive && available && requestPlanChange(p.key)}
                      disabled={loading || isActive || !available}
                      title={!available ? "Plano indisponível" : undefined}
                      className={[
                        "flex-1 py-2 rounded-xl border text-[12px] font-semibold transition-all cursor-pointer disabled:cursor-default disabled:opacity-50",
                        isActive
                          ? p.color
                          : "bg-zinc-50 text-zinc-400 border-zinc-100 hover:border-zinc-200 hover:text-zinc-600",
                      ].join(" ")}
                    >
                      <span className="block">{setting.name}</span>
                      <span className={`block text-[10px] font-normal mt-0.5 ${isActive ? "opacity-60" : "opacity-40"}`}>
                        {available ? formatPlanPrice(resolvePlanPricing(setting).recurringPrice, setting.currency) : "Em breve"}
                      </span>
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
    </>
  );
}
