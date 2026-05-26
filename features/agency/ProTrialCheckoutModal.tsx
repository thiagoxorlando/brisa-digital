"use client";

import { useMemo, useState } from "react";
import PhoneInput from "@/components/ui/PhoneInput";
import { formatCpfCnpj } from "@/lib/cpf";

export type ProTrialCheckoutPayload = {
  holderName: string;
  cpfCnpj: string;
  phone: string;
  postalCode: string;
  addressNumber: string;
  addressComplement: string;
  cardNumber: string;
  expiryMonth: string;
  expiryYear: string;
  ccv: string;
};

type Props = {
  email: string;
  planLabel: string;
  priceLabel: string;
  trialDays: number;
  initialHolderName: string;
  initialCpfCnpj: string;
  initialPhone: string;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (payload: ProTrialCheckoutPayload) => Promise<void>;
};

const INPUT_CLS =
  "w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-[13px] text-zinc-900 " +
  "placeholder:text-zinc-400 focus:outline-none focus:border-zinc-900 transition-colors";

function formatCardNumber(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 19);
  const groups = digits.match(/.{1,4}/g) ?? [];
  return groups.join(" ");
}

function formatExpiryMonth(value: string) {
  return value.replace(/\D/g, "").slice(0, 2);
}

function formatExpiryYear(value: string) {
  return value.replace(/\D/g, "").slice(0, 4);
}

function formatPostalCode(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export default function ProTrialCheckoutModal({
  email,
  planLabel,
  priceLabel,
  trialDays,
  initialHolderName,
  initialCpfCnpj,
  initialPhone,
  submitting,
  onClose,
  onSubmit,
}: Props) {
  const [holderName, setHolderName] = useState(initialHolderName);
  const [cpfCnpj, setCpfCnpj] = useState(initialCpfCnpj);
  const [phone, setPhone] = useState(initialPhone);
  const [postalCode, setPostalCode] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [addressComplement, setAddressComplement] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiryMonth, setExpiryMonth] = useState("");
  const [expiryYear, setExpiryYear] = useState("");
  const [ccv, setCcv] = useState("");
  const [error, setError] = useState("");

  const isValid = useMemo(() => {
    return (
      holderName.trim().length >= 2 &&
      cpfCnpj.replace(/\D/g, "").length >= 11 &&
      phone.replace(/\D/g, "").length >= 10 &&
      postalCode.replace(/\D/g, "").length === 8 &&
      addressNumber.trim().length >= 1 &&
      cardNumber.replace(/\D/g, "").length >= 13 &&
      Number(expiryMonth) >= 1 &&
      Number(expiryMonth) <= 12 &&
      expiryYear.replace(/\D/g, "").length >= 2 &&
      ccv.replace(/\D/g, "").length >= 3
    );
  }, [addressNumber, cardNumber, ccv, cpfCnpj, expiryMonth, expiryYear, holderName, phone, postalCode]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!isValid || submitting) return;
    setError("");

    try {
      const expiryYearDigits = expiryYear.replace(/\D/g, "");
      await onSubmit({
        holderName: holderName.trim(),
        cpfCnpj,
        phone,
        postalCode,
        addressNumber: addressNumber.trim(),
        addressComplement: addressComplement.trim(),
        cardNumber,
        expiryMonth,
        expiryYear: expiryYearDigits.length === 2 ? `20${expiryYearDigits}` : expiryYearDigits,
        ccv,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel iniciar o teste gratis.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-3xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-zinc-100 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-indigo-500">Teste gratis</p>
              <h2 className="mt-1 text-[20px] font-semibold text-zinc-900">Ativar {planLabel}</h2>
              <p className="mt-1 text-[13px] text-zinc-500">
                Validamos seu cartao hoje e a primeira cobranca acontece em {trialDays} dias.
              </p>
            </div>
            <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 transition-colors">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-[12px] text-indigo-800">
            <p className="font-semibold">Resumo</p>
            <p className="mt-1">Plano {planLabel} por {priceLabel}/mes.</p>
            <p className="mt-0.5">Nenhuma cobranca hoje. Primeira cobranca ao final do teste gratis.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Nome do titular</label>
              <input
                type="text"
                value={holderName}
                onChange={(event) => setHolderName(event.target.value)}
                autoComplete="cc-name"
                className={INPUT_CLS}
                placeholder="Nome como no cartao"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-zinc-500">CPF/CNPJ</label>
              <input
                type="text"
                value={cpfCnpj}
                onChange={(event) => setCpfCnpj(formatCpfCnpj(event.target.value))}
                className={INPUT_CLS}
                placeholder="000.000.000-00"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Email</label>
              <input type="email" value={email} disabled className={`${INPUT_CLS} bg-zinc-50 text-zinc-500`} />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Telefone</label>
              <PhoneInput value={phone} onChange={setPhone} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-zinc-500">CEP</label>
              <input
                type="text"
                value={postalCode}
                onChange={(event) => setPostalCode(formatPostalCode(event.target.value))}
                className={INPUT_CLS}
                placeholder="00000-000"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Numero</label>
              <input
                type="text"
                value={addressNumber}
                onChange={(event) => setAddressNumber(event.target.value)}
                className={INPUT_CLS}
                placeholder="123"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Complemento</label>
              <input
                type="text"
                value={addressComplement}
                onChange={(event) => setAddressComplement(event.target.value)}
                className={INPUT_CLS}
                placeholder="Sala, apto, bloco"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Numero do cartao</label>
            <input
              type="text"
              value={cardNumber}
              onChange={(event) => setCardNumber(formatCardNumber(event.target.value))}
              autoComplete="cc-number"
              inputMode="numeric"
              className={INPUT_CLS}
              placeholder="0000 0000 0000 0000"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Mes</label>
              <input
                type="text"
                value={expiryMonth}
                onChange={(event) => setExpiryMonth(formatExpiryMonth(event.target.value))}
                autoComplete="cc-exp-month"
                inputMode="numeric"
                className={INPUT_CLS}
                placeholder="MM"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Ano</label>
              <input
                type="text"
                value={expiryYear}
                onChange={(event) => setExpiryYear(formatExpiryYear(event.target.value))}
                autoComplete="cc-exp-year"
                inputMode="numeric"
                className={INPUT_CLS}
                placeholder="AAAA"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-zinc-500">CVV</label>
              <input
                type="text"
                value={ccv}
                onChange={(event) => setCcv(event.target.value.replace(/\D/g, "").slice(0, 4))}
                autoComplete="cc-csc"
                inputMode="numeric"
                className={INPUT_CLS}
                placeholder="123"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[12px] text-rose-700">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-zinc-100 pt-5 sm:flex-row">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-zinc-200 px-4 py-3 text-[13px] font-medium text-zinc-600 hover:border-zinc-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!isValid || submitting}
              className="flex-1 rounded-xl bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] px-4 py-3 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Validando cartao..." : "Iniciar teste gratis"}
            </button>
          </div>

          <p className="text-center text-[11px] text-zinc-400">
            Os dados do cartao sao usados apenas para autorizar a assinatura no Asaas e nao sao armazenados no BrisaHub.
          </p>
        </form>
      </div>
    </div>
  );
}
