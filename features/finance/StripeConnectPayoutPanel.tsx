"use client";

import { useEffect, useState } from "react";
import type { StripeConnectStatusResponse } from "@/app/api/stripe/connect/status/route";

type StripePayoutAvailabilityState =
  | "unconnected"
  | "review"
  | "processing"
  | "available"
  | "blocked";

function badgeForState(state: StripePayoutAvailabilityState) {
  switch (state) {
    case "available":
      return {
        label: "Pronto para saque",
        className: "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100",
      };
    case "processing":
      return {
        label: "Em processamento",
        className: "bg-sky-50 text-sky-700 ring-1 ring-sky-100",
      };
    case "review":
      return {
        label: "Em análise",
        className: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
      };
    case "blocked":
      return {
        label: "Indisponível",
        className: "bg-rose-50 text-rose-700 ring-1 ring-rose-100",
      };
    default:
      return {
        label: "Conectado",
        className: "bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200",
      };
  }
}

function fallbackStatus(): StripeConnectStatusResponse {
  return {
    connected: false,
    details_submitted: false,
    payouts_enabled: false,
    transfers_active: false,
    bank_ready: false,
    can_withdraw: false,
    availability_state: "blocked",
    display_message: "Saque automático indisponível — fale com o suporte",
  };
}

export function StripeConnectPayoutPanel({
  amount = 0.01,
  onStatusChange,
}: {
  amount?: number;
  onStatusChange?: (status: { ready: boolean; loaded: boolean; state: StripePayoutAvailabilityState; message: string }) => void;
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

  useEffect(() => {
    setStatusLoad(true);
    fetch(`/api/stripe/connect/status?amount=${encodeURIComponent(String(amount > 0 ? amount : 0.01))}`)
      .then((response) => response.json())
      .then((data: StripeConnectStatusResponse) => {
        setAcct(data);
        setStatusLoad(false);
      })
      .catch(() => {
        setAcct(fallbackStatus());
        setStatusLoad(false);
      });
  }, [amount]);

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
      setError(data.error ?? "Erro ao iniciar configuração do Stripe.");
    } catch {
      setError("Erro de rede. Tente novamente.");
    } finally {
      setConnecting(false);
    }
  }

  const payoutState = acct?.availability_state ?? "blocked";
  const isReady = Boolean(acct?.can_withdraw);
  const badge = badgeForState(payoutState);
  const message = acct?.display_message ?? "Saque automático indisponível — fale com o suporte";

  useEffect(() => {
    onStatusChange?.({
      ready: isReady,
      loaded: !statusLoad,
      state: payoutState,
      message,
    });
  }, [isReady, message, onStatusChange, payoutState, statusLoad]);

  return (
    <div id="stripe-connect-section" className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)]">
      <div className="flex items-center justify-between border-b border-zinc-50 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border ${isReady ? "border-emerald-100 bg-emerald-50" : "border-zinc-100 bg-zinc-50"}`}>
            <svg className={`h-4 w-4 ${isReady ? "text-emerald-600" : "text-zinc-400"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </div>
          <div>
            <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Método principal</p>
            <p className="text-[15px] font-semibold text-zinc-900">Stripe automático</p>
          </div>
        </div>
        {statusLoad && <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-500" />}
        {!statusLoad && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${badge.className}`}>
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            {badge.label}
          </span>
        )}
      </div>

      <div className="space-y-4 px-6 py-5">
        {statusLoad && <p className="text-[13px] text-zinc-400">Verificando status da conta Stripe...</p>}

        {note && !statusLoad && (
          <p className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-[12px] font-medium text-indigo-700">
            {note}
          </p>
        )}

        {!statusLoad && (
          <div className="space-y-3">
            <p className="text-[13px] leading-relaxed text-zinc-600">{message}</p>

            {!acct?.connected && (
              <button
                type="button"
                onClick={handleConnect}
                disabled={connecting}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#635BFF] px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#4F45E4] disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
              >
                {connecting
                  ? <><div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />Abrindo Stripe...</>
                  : "Conectar com Stripe"}
              </button>
            )}

            {acct?.connected && (payoutState === "review" || payoutState === "unconnected") && (
              <button
                type="button"
                onClick={handleConnect}
                disabled={connecting}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
              >
                {connecting
                  ? <><div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />Abrindo Stripe...</>
                  : "Revisar conta Stripe"}
              </button>
            )}
          </div>
        )}

        {error && <p className="text-[12px] font-medium text-rose-600">{error}</p>}
      </div>
    </div>
  );
}
