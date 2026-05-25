"use client";

import Link from "next/link";
import { useSubscription } from "@/lib/SubscriptionContext";

type TrialStatusBannerProps = {
  className?: string;
  /** Compact mode: single line, no cancel action */
  compact?: boolean;
};

export default function TrialStatusBanner({ className = "", compact = false }: TrialStatusBannerProps) {
  const { isTrialing, trialDaysRemaining, trialEndsAt, subscriptionStatus } = useSubscription();

  if (!isTrialing && subscriptionStatus !== "past_due") return null;

  if (subscriptionStatus === "past_due") {
    return (
      <div className={`flex items-start gap-3 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3.5 ${className}`}>
        <svg className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-rose-800">Falha no pagamento da assinatura</p>
          <p className="text-[12px] text-rose-700 mt-0.5">
            Não foi possível cobrar seu cartão. Acesse{" "}
            <Link href="/agency/billing" className="underline hover:no-underline">Cobrança</Link>{" "}
            para atualizar.
          </p>
        </div>
      </div>
    );
  }

  if (!isTrialing) return null;

  const days = trialDaysRemaining ?? 0;
  const endsDateStr = trialEndsAt
    ? new Date(trialEndsAt).toLocaleDateString("pt-BR", { day: "numeric", month: "long" })
    : null;

  if (compact) {
    return (
      <div className={`flex items-center gap-2.5 bg-indigo-50 border border-indigo-200 rounded-xl px-3.5 py-2.5 ${className}`}>
        <svg className="w-4 h-4 text-indigo-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-[12px] font-medium text-indigo-800 flex-1">
          {days > 0
            ? `Trial PRO: ${days} dia${days !== 1 ? "s" : ""} restante${days !== 1 ? "s" : ""}`
            : "Trial PRO encerrado"}
          {endsDateStr && days > 0 && (
            <span className="text-indigo-600 ml-1">· cobrança em {endsDateStr}</span>
          )}
        </p>
        <Link href="/agency/billing" className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 underline flex-shrink-0">
          Gerenciar
        </Link>
      </div>
    );
  }

  return (
    <div className={`flex items-start gap-3 bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-4 ${className}`}>
      {/* Countdown badge */}
      <div className="flex-shrink-0 flex flex-col items-center justify-center bg-indigo-600 text-white rounded-xl w-12 h-12 shadow-sm">
        <span className="text-[18px] font-black leading-none">{days}</span>
        <span className="text-[9px] font-semibold uppercase tracking-wider opacity-80 leading-none mt-0.5">
          {days !== 1 ? "dias" : "dia"}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-bold text-indigo-900">
          {days > 0 ? "Seu trial PRO está ativo" : "Período de trial encerrado"}
        </p>
        {days > 0 && endsDateStr ? (
          <p className="text-[12px] text-indigo-700 mt-0.5 leading-relaxed">
            Você tem acesso completo ao plano PRO até{" "}
            <span className="font-semibold">{endsDateStr}</span>.
            Sua assinatura será ativada automaticamente — nenhuma ação necessária.
          </p>
        ) : (
          <p className="text-[12px] text-indigo-700 mt-0.5">
            O trial encerrou. Sua assinatura já está ativa.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3 mt-2.5">
          <Link
            href="/agency/billing"
            className="inline-flex items-center gap-1.5 text-[12px] font-bold text-indigo-700 hover:text-indigo-900 underline"
          >
            Gerenciar assinatura
          </Link>
        </div>
      </div>
    </div>
  );
}
