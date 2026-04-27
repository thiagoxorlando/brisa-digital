"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface PixPaymentData {
  payment_id: number;
  qr_code: string;
  qr_code_base64: string;
}

interface PixModalProps {
  contractId: string;
  amount: number;
  data: PixPaymentData;
  onConfirmed: () => void;
  onClose: () => void;
}

function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

type ModalStatus = "pending" | "confirmed" | "expired";

export default function PixModal({ contractId, amount, data, onConfirmed, onClose }: PixModalProps) {
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<ModalStatus>("pending");
  const [toast, setToast]   = useState(false);

  function copy() {
    navigator.clipboard.writeText(data.qr_code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  function handlePaid() {
    setStatus("confirmed");
    setToast(true);
    setTimeout(onConfirmed, 2000);
  }

  useEffect(() => {
    // ── Check current state immediately (race-condition guard) ────────────
    supabase
      .from("contracts")
      .select("payment_status")
      .eq("id", contractId)
      .single()
      .then(({ data: row }) => {
        if (row?.payment_status === "paid") handlePaid();
      });

    // ── Realtime: listen for UPDATE on this contract row ──────────────────
    const channel = supabase
      .channel(`contract-pix-${contractId}`)
      .on(
        "postgres_changes",
        {
          event:  "UPDATE",
          schema: "public",
          table:  "contracts",
          filter: `id=eq.${contractId}`,
        },
        (payload) => {
          const updated = payload.new as Record<string, unknown>;
          if (updated.payment_status === "paid") handlePaid();
        }
      )
      .subscribe();

    // ── QR expires after 30 min ───────────────────────────────────────────
    const expireTimer = setTimeout(() => {
      setStatus((s) => (s === "pending" ? "expired" : s));
    }, 30 * 60 * 1000);

    return () => {
      supabase.removeChannel(channel);
      clearTimeout(expireTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Success toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2.5 bg-emerald-600 text-white text-[13px] font-medium px-5 py-3 rounded-2xl shadow-lg animate-in slide-in-from-bottom-3">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          Pagamento confirmado!
        </div>
      )}

      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div className="flex items-center gap-2.5">
            {/* PIX logo mark */}
            <div className="w-8 h-8 rounded-xl bg-[#00b4d8]/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-[#00b4d8]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <p className="text-[14px] font-semibold text-zinc-900 leading-tight">Pagar com PIX</p>
              <p className="text-[11px] text-zinc-400">Escaneie ou copie o código</p>
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

        {/* ── Confirmed ── */}
        {status === "confirmed" && (
          <div className="px-6 pb-8 pt-4 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-[16px] font-semibold text-zinc-900">Pagamento confirmado!</p>
            <p className="text-[13px] text-zinc-400">O contrato foi atualizado.</p>
          </div>
        )}

        {/* ── Expired ── */}
        {status === "expired" && (
          <div className="px-6 pb-8 pt-4 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-zinc-100 flex items-center justify-center mx-auto">
              <svg className="w-7 h-7 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-[15px] font-semibold text-zinc-700">QR code expirado</p>
            <p className="text-[13px] text-zinc-400">Feche e clique em "Pagar com PIX" novamente.</p>
            <button
              onClick={onClose}
              className="px-5 py-2 text-[13px] font-medium bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2] text-white rounded-xl transition-colors cursor-pointer"
            >
              Fechar
            </button>
          </div>
        )}

        {/* ── Pending ── */}
        {status === "pending" && (
          <div className="px-6 pb-6 space-y-4">
            {/* Amount */}
            <div className="bg-zinc-50 rounded-2xl px-4 py-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-0.5">Valor</p>
              <p className="text-[28px] font-bold text-zinc-900 tabular-nums">{brl(amount)}</p>
            </div>

            {/* QR Code */}
            {data.qr_code_base64 ? (
              <div className="flex justify-center">
                <img
                  src={`data:image/png;base64,${data.qr_code_base64}`}
                  alt="QR Code PIX"
                  className="w-52 h-52 rounded-2xl border border-zinc-100 p-2"
                />
              </div>
            ) : (
              <div className="h-52 flex items-center justify-center bg-zinc-50 rounded-2xl border border-zinc-100">
                <p className="text-[12px] text-zinc-400">Use o código abaixo</p>
              </div>
            )}

            {/* Copy code */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
                PIX Copia e Cola
              </p>
              <div className="flex gap-2">
                <div className="flex-1 min-w-0 bg-zinc-50 border border-zinc-100 rounded-xl px-3 py-2.5">
                  <p className="text-[11px] font-mono text-zinc-500 truncate">{data.qr_code}</p>
                </div>
                <button
                  onClick={copy}
                  className={[
                    "flex-shrink-0 px-3.5 rounded-xl text-[12px] font-semibold transition-all cursor-pointer",
                    copied
                      ? "bg-emerald-500 text-white"
                      : "bg-[#1F2D2E] text-white hover:bg-[#2D4142]",
                  ].join(" ")}
                >
                  {copied ? "✓ Copiado" : "Copiar"}
                </button>
              </div>
            </div>

            {/* Waiting */}
            <div className="flex items-center justify-center gap-2 py-1 text-[11px] text-zinc-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
              </span>
              Aguardando confirmação do pagamento…
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

