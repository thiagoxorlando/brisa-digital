"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PLAN_DEFINITIONS } from "@/lib/plans";

const PRO_PLAN = PLAN_DEFINITIONS.pro;

const VARIANTS = {
  hiring: {
    title: "Limite do plano atual",
    message: `O plano gratuito permite ate 1 vaga ativa e 3 contratacoes por vaga. Faca upgrade para o plano ${PRO_PLAN.label} e remova os limites.`,
    features: [
      "Vagas ilimitadas",
      "Contratacoes ilimitadas por vaga",
      `Comissao da plataforma de ${PRO_PLAN.commissionLabel}`,
    ],
  },
  limit: {
    title: "Limite do plano gratuito",
    message: `Gerencie vagas e contratacoes sem limites com o plano ${PRO_PLAN.label} por ${PRO_PLAN.priceLabel}/mes.`,
    features: [
      "Vagas ilimitadas",
      "Contratacoes ilimitadas por vaga",
      "Historico completo de pagamentos e contratos",
    ],
  },
} as const;

type Variant = keyof typeof VARIANTS;

interface Props {
  onClose: () => void;
  variant?: Variant;
}

export default function PaywallModal({ onClose, variant = "hiring" }: Props) {
  const router = useRouter();
  const copy = VARIANTS[variant];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleUpgrade() {
    onClose();
    router.push("/agency/billing");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />

      <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 space-y-6">
        <div className="w-12 h-12 rounded-2xl bg-violet-50 border border-violet-100 flex items-center justify-center mx-auto">
          <svg className="w-6 h-6 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.75}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>

        <div className="text-center space-y-2">
          <h2 className="text-[18px] font-semibold text-zinc-900 tracking-tight">{copy.title}</h2>
          <p className="text-[14px] text-zinc-500 leading-relaxed">{copy.message}</p>
        </div>

        <ul className="space-y-2">
          {copy.features.map((feat) => (
            <li key={feat} className="flex items-center gap-2.5 text-[13px] text-zinc-600">
              <div className="w-4 h-4 rounded-full bg-violet-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              {feat}
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2.5 pt-1">
          <button
            onClick={handleUpgrade}
            className="w-full inline-flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 active:scale-[0.98] text-white text-[15px] font-semibold py-3 rounded-xl transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
              />
            </svg>
            Ativar Plano {PRO_PLAN.label}
          </button>
          <button
            onClick={onClose}
            className="w-full text-[14px] font-medium text-zinc-400 hover:text-zinc-700 py-2.5 rounded-xl hover:bg-zinc-50 transition-all"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
