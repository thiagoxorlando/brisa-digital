"use client";

import { useEffect, useRef, useState } from "react";
import type { StripeConnectStatusResponse } from "@/app/api/stripe/connect/status/route";

type StripePayoutAvailabilityState =
  | "unconnected"
  | "connected"
  | "review"
  | "blocked"
  | "ready";

function getStripePayoutAvailabilityState(status: {
  connected: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  transfers_active: boolean;
  last_withdrawal_provider_status?: string | null;
}) {
  const lastProviderStatus = status.last_withdrawal_provider_status?.trim().toLowerCase() ?? null;

  if (!status.connected) return "unconnected" satisfies StripePayoutAvailabilityState;
  if (lastProviderStatus === "failed") return "blocked" satisfies StripePayoutAvailabilityState;
  if (!status.details_submitted) return "review" satisfies StripePayoutAvailabilityState;
  if (!status.payouts_enabled || !status.transfers_active) return "connected" satisfies StripePayoutAvailabilityState;
  return "ready" satisfies StripePayoutAvailabilityState;
}

export function StripeConnectPayoutPanel({
  onStatusChange,
}: {
  onStatusChange?: (status: { ready: boolean; loaded: boolean; state: StripePayoutAvailabilityState }) => void;
}) {
  const [acct, setAcct] = useState<StripeConnectStatusResponse | null>(null);
  const [statusLoad, setStatusLoad] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const status = params.get("stripe");
    if (status === "success" || status === "return") return "Cadastro enviado. Verificando status do Stripe...";
    if (status === "refresh") return "O link expirou. Clique abaixo para continuar o onboarding.";
    return null;
  });
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    fetch("/api/stripe/connect/status")
      .then((response) => response.json())
      .then((data: StripeConnectStatusResponse) => {
        setAcct(data);
        setStatusLoad(false);
      })
      .catch(() => {
        setAcct({
          connected: false,
          charges_enabled: false,
          payouts_enabled: false,
          details_submitted: false,
          transfers_active: false,
          last_withdrawal_status: null,
          last_withdrawal_provider_status: null,
        });
        setStatusLoad(false);
      });
  }, []);

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    try {
      const response = await fetch("/api/stripe/connect/create-account", { method: "POST" });
      const data = await response.json() as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error ?? "Erro ao iniciar configuracao do Stripe.");
    } catch {
      setError("Erro de rede. Tente novamente.");
    } finally {
      setConnecting(false);
    }
  }

  const payoutState = getStripePayoutAvailabilityState({
    connected: Boolean(acct?.connected),
    details_submitted: Boolean(acct?.details_submitted),
    payouts_enabled: Boolean(acct?.payouts_enabled),
    transfers_active: Boolean(acct?.transfers_active),
    last_withdrawal_provider_status: acct?.last_withdrawal_provider_status ?? null,
  });
  const isReady = payoutState === "ready";
  const isPending = payoutState === "review" || payoutState === "connected";
  const isBlocked = payoutState === "blocked";
  const isUnconnected = payoutState === "unconnected";

  useEffect(() => {
    onStatusChange?.({ ready: isReady, loaded: !statusLoad, state: payoutState });
  }, [isReady, onStatusChange, payoutState, statusLoad]);

  const badgeLabel = isReady
    ? "Pronto para saque"
    : isBlocked
      ? "Saques bloqueados"
      : payoutState === "review"
        ? "Em analise"
        : payoutState === "connected"
          ? "Conectado"
          : null;

  const badgeClass = isReady
    ? "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100"
    : isBlocked
      ? "bg-rose-50 text-rose-700 ring-1 ring-rose-100"
      : "bg-amber-50 text-amber-700 ring-1 ring-amber-100";

  return (
    <div id="stripe-connect-section" className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-50">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isReady ? "bg-emerald-50 border border-emerald-100" : isBlocked ? "bg-rose-50 border border-rose-100" : "bg-zinc-50 border border-zinc-100"}`}>
            <svg className={`w-4 h-4 ${isReady ? "text-emerald-600" : isBlocked ? "text-rose-600" : "text-zinc-400"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-0.5">Metodo principal</p>
            <p className="text-[15px] font-semibold text-zinc-900">Stripe automatico</p>
          </div>
        </div>
        {statusLoad && <div className="w-4 h-4 rounded-full border-2 border-zinc-200 border-t-zinc-500 animate-spin" />}
        {badgeLabel && !statusLoad && (
          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full ${badgeClass}`}>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            {badgeLabel}
          </span>
        )}
      </div>

      <div className="px-6 py-5 space-y-4">
        {statusLoad && <p className="text-[13px] text-zinc-400">Verificando status da conta Stripe...</p>}

        {note && !statusLoad && (
          <p className="text-[12px] text-indigo-700 font-medium bg-indigo-50 border border-indigo-100 px-3 py-2 rounded-xl">
            {note}
          </p>
        )}

        {!statusLoad && isUnconnected && (
          <div className="space-y-4">
            <p className="text-[13px] text-zinc-500 leading-relaxed">
              Conecte sua conta Stripe para liberar saques automaticos. Enquanto isso, o PIX continua como fallback manual.
            </p>
            <button
              type="button"
              onClick={handleConnect}
              disabled={connecting}
              className="inline-flex items-center gap-2 bg-[#635BFF] hover:bg-[#4F45E4] disabled:bg-zinc-100 disabled:text-zinc-400 text-white text-[13px] font-semibold px-5 py-2.5 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              {connecting
                ? <><div className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />Abrindo Stripe...</>
                : "Conectar com Stripe"}
            </button>
          </div>
        )}

        {!statusLoad && isPending && (
          <div className="space-y-4">
            <p className="text-[13px] text-zinc-500 leading-relaxed">
              {payoutState === "review"
                ? "Sua conta Stripe foi criada, mas ainda falta concluir o onboarding para habilitar payouts automaticos."
                : "Sua conta Stripe esta conectada, mas os saques ainda nao foram liberados para payout automatico."}
            </p>
            <button
              type="button"
              onClick={handleConnect}
              disabled={connecting}
              className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-100 disabled:text-zinc-400 text-white text-[13px] font-semibold px-5 py-2.5 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              {connecting
                ? <><div className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />Abrindo Stripe...</>
                : "Finalizar cadastro Stripe"}
            </button>
          </div>
        )}

        {!statusLoad && isBlocked && (
          <div className="space-y-2">
            <p className="text-[14px] font-semibold text-rose-700">Stripe conectado, mas saques indisponiveis. Verifique sua conta Stripe.</p>
            <p className="text-[12px] text-zinc-500">Novos saques seguem automaticamente para a fila PIX/manual enquanto o payout Stripe estiver bloqueado.</p>
          </div>
        )}

        {!statusLoad && isReady && (
          <div className="space-y-2">
            <p className="text-[14px] font-semibold text-zinc-900">Conta pronta para saque</p>
            <p className="text-[12px] text-zinc-400">Quando voce solicitar um saque, o Stripe sera usado primeiro e o PIX manual fica apenas como fallback.</p>
          </div>
        )}

        {error && <p className="text-[12px] text-rose-600 font-medium">{error}</p>}
      </div>
    </div>
  );
}
