"use client";

import Link from "next/link";
import { useState } from "react";

export type LaunchChecklistData = {
  hasJob: boolean;
  hasApplication: boolean;
  hasContract: boolean;
  hasPaidContract: boolean;
  hasBranding: boolean;
};

type ChecklistItem = {
  key: keyof LaunchChecklistData;
  label: string;
  description: string;
  href: string;
  actionLabel: string;
};

const ITEMS: ChecklistItem[] = [
  {
    key: "hasJob",
    label: "Criar primeira vaga",
    description: "Publique sua primeira vaga e obtenha o link de candidatura.",
    href: "/agency/post-job",
    actionLabel: "Criar vaga",
  },
  {
    key: "hasApplication",
    label: "Compartilhar link com talentos",
    description: "Envie o link da vaga diretamente para seus talentos via WhatsApp ou e-mail.",
    href: "/agency/jobs",
    actionLabel: "Ver vagas",
  },
  {
    key: "hasContract",
    label: "Emitir primeiro contrato",
    description: "Aprove uma candidatura e gere o contrato automaticamente.",
    href: "/agency/bookings",
    actionLabel: "Ver aprovações",
  },
  {
    key: "hasPaidContract",
    label: "Concluir primeiro pagamento",
    description: "Confirme o pagamento e finalize o ciclo operacional.",
    href: "/agency/contracts",
    actionLabel: "Ver contratos",
  },
  {
    key: "hasBranding",
    label: "Configurar identidade da agência",
    description: "Adicione logotipo e nome da empresa para personalizar a plataforma.",
    href: "/agency/profile",
    actionLabel: "Configurar perfil",
  },
];

type Props = {
  data: LaunchChecklistData;
  className?: string;
};

export default function AgencyLaunchChecklist({ data, className = "" }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const completedCount = ITEMS.filter((item) => data[item.key]).length;
  const total = ITEMS.length;
  const allDone = completedCount === total;
  const pct = Math.round((completedCount / total) * 100);

  if (allDone) return null;

  return (
    <div className={`bg-white rounded-2xl border border-[#DDE6E6] shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] overflow-hidden ${className}`}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-zinc-50/60 transition-colors cursor-pointer"
      >
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2.5">
            <span className="text-[13px] font-black uppercase tracking-[0.16em] text-zinc-400">Configuração inicial</span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-100">
              {completedCount}/{total}
            </span>
          </div>
          {/* Progress bar */}
          <div className="mt-2 h-1.5 rounded-full bg-zinc-100 overflow-hidden w-full max-w-xs">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <svg
          className={`w-4 h-4 text-zinc-400 flex-shrink-0 transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Items */}
      {!collapsed && (
        <div className="divide-y divide-zinc-50 border-t border-zinc-100">
          {ITEMS.map((item) => {
            const done = data[item.key];
            return (
              <div key={item.key} className="flex items-start gap-3.5 px-5 py-4">
                {/* Status icon */}
                <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5 transition-colors ${
                  done ? "bg-emerald-100" : "bg-zinc-100"
                }`}>
                  {done ? (
                    <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-zinc-300" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] font-semibold leading-snug ${done ? "line-through text-zinc-400" : "text-zinc-800"}`}>
                    {item.label}
                  </p>
                  {!done && (
                    <p className="text-[12px] text-zinc-500 mt-0.5 leading-relaxed">{item.description}</p>
                  )}
                </div>

                {!done && (
                  <Link
                    href={item.href}
                    className="flex-shrink-0 text-[12px] font-bold text-teal-700 hover:text-teal-900 px-3 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 border border-teal-100 transition-colors whitespace-nowrap"
                  >
                    {item.actionLabel}
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
