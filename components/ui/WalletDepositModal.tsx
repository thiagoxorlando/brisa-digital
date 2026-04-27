"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface WalletDepositModalProps {
  txId: string;
  amount: number;        // total charged (what the payer sends)
  creditAmount?: number; // amount credited to wallet (may differ when fee > 0)
  fee?: number;          // processing fee shown to payer
  qrCode: string;
  qrCodeBase64: string | null;
  onConfirmed: () => void;
  onClose: () => void;
}

function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

type ModalStatus = "pending" | "confirmed" | "expired";

export default function WalletDepositModal({
  txId,
  amount,
  creditAmount,
  fee,
  qrCode,
  qrCodeBase64,
  onConfirmed,
  onClose,
}: WalletDepositModalProps) {
  const hasFee = fee != null && fee > 0;
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<ModalStatus>("pending");
  const [toast, setToast]   = useState(false);

  function copy() {
    navigator.clipboard.writeText(qrCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  function handleConfirmed() {
    setStatus("confirmed");
    setToast(true);
    setTimeout(onConfirmed, 2000);
  }

  useEffect(() => {
    // Check immediately in case webhook already fired
    supabase
      .from("wallet_transactions")
      .select("description")
      .eq("id", txId)
      .single()
      .then(({ data: row }) => {
        if (row?.description === "Depósito via PIX") handleConfirmed();
      });

    // Listen for the webhook to update this transaction
    const channel = supabase
      .channel(`wallet-deposit-${txId}`)
      .on(
        "postgres_changes",
        {
          event:  "UPDATE",
          schema: "public",
          table:  "wallet_transactions",
          filter: `id=eq.${txId}`,
        },
        (payload) => {
          const updated = payload.new as Record<string, unknown>;
          if (updated.description === "Depósito via PIX") handleConfirmed();
        }
      )
      .subscribe();

    // QR expires after 30 minutes
    const expireTimer = setTimeout(
      () => setStatus((s) => (s === "pending" ? "expired" : s)),
      30 * 60 * 1000
    );

    return () => {
      supabase.removeChannel(channel);
      clearTimeout(expireTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2.5 bg-emerald-600 text-white text-[13px] font-medium px-5 py-3 rounded-2xl shadow-lg">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          Depósito confirmado! Saldo atualizado.
        </div>
      )}

      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-[14px] font-semibold text-zinc-900 leading-tight">Depositar Fundos</p>
              <p className="text-[11px] text-zinc-400">PIX · Crédito imediato</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Confirmed */}
        {status === "confirmed" && (
          <div className="px-6 pb-8 pt-4 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-[16px] font-semibold text-zinc-900">Depósito confirmado!</p>
            <p className="text-[13px] text-zinc-400">Seu saldo foi atualizado.</p>
          </div>
        )}

        {/* Expired */}
        {status === "expired" && (
          <div className="px-6 pb-8 pt-4 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-zinc-100 flex items-center justify-center mx-auto">
              <svg className="w-7 h-7 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-[15px] font-semibold text-zinc-700">QR code expirado</p>
            <p className="text-[13px] text-zinc-400">Feche e tente novamente.</p>
            <button
              onClick={onClose}
              className="px-5 py-2 text-[13px] font-medium bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2] text-white rounded-xl transition-colors cursor-pointer"
            >
              Fechar
            </button>
          </div>
        )}

        {/* Pending */}
        {status === "pending" && (
          <div className="px-6 pb-6 space-y-4">
            <div className="bg-zinc-50 rounded-2xl px-4 py-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-0.5">
                {hasFee ? "Total a pagar" : "Valor do depósito"}
              </p>
              <p className="text-[28px] font-bold text-zinc-900 tabular-nums">{brl(amount)}</p>
              {hasFee && creditAmount != null && (
                <div className="mt-1.5 space-y-0.5">
                  <p className="text-[11px] text-zinc-400">
                    Crédito na carteira: <span className="font-semibold text-zinc-700">{brl(creditAmount)}</span>
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Taxa de processamento: <span className="font-semibold text-zinc-500">{brl(fee!)}</span>
                  </p>
                </div>
              )}
            </div>

            {qrCodeBase64 ? (
              <div className="flex justify-center">
                <img
                  src={`data:image/png;base64,${qrCodeBase64}`}
                  alt="QR Code PIX"
                  className="w-52 h-52 rounded-2xl border border-zinc-100 p-2"
                />
              </div>
            ) : (
              <div className="h-52 flex items-center justify-center bg-zinc-50 rounded-2xl border border-zinc-100">
                <p className="text-[12px] text-zinc-400">Use o código abaixo</p>
              </div>
            )}

            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">PIX Copia e Cola</p>
              <div className="flex gap-2">
                <div className="flex-1 min-w-0 bg-zinc-50 border border-zinc-100 rounded-xl px-3 py-2.5">
                  <p className="text-[11px] font-mono text-zinc-500 truncate">{qrCode}</p>
                </div>
                <button
                  onClick={copy}
                  className={[
                    "flex-shrink-0 px-3.5 rounded-xl text-[12px] font-semibold transition-all cursor-pointer",
                    copied ? "bg-emerald-500 text-white" : "bg-[#1F2D2E] text-white hover:bg-[#2D4142]",
                  ].join(" ")}
                >
                  {copied ? "✓ Copiado" : "Copiar"}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 py-1 text-[11px] text-zinc-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              Aguardando confirmação do pagamento…
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

