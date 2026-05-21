"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { brl } from "@/lib/brl";
import {
  getContractPaymentStatus,
  contractStatusLabel,
  contractStatusTone,
  resolveContractAmounts,
} from "@/lib/contractStatus";

export type PremiumContract = {
  id: string;
  jobId: string | null;
  jobTitle: string;
  talentName: string;
  talentAvatarUrl: string | null;
  status: string;
  paymentAmount: number;
  commissionAmount: number;
  netAmount: number;
  jobDate: string | null;
  location: string | null;
  createdAt: string;
  signedAt: string | null;
  paidAt: string | null;
  contractFileUrl: string | null;
  signedContractUrl: string | null;
  isPaymentEligible: boolean;
  paymentBlockReason: string | null;
};

type Props = {
  contracts: PremiumContract[];
  lang?: string;
};

function fmt(s: string | null, locale: string) {
  if (!s) return null;
  return new Date(s).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

function fmtJobDate(s: string | null, locale: string) {
  if (!s) return null;
  return new Date(s + "T00:00:00").toLocaleDateString(locale, {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

function Initials({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const letters = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
  return (
    <div className="w-7 h-7 rounded-full overflow-hidden bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
      ) : (
        <span className="text-[10px] font-bold text-white">{letters}</span>
      )}
    </div>
  );
}

function ContractProgress({
  status,
  signedAt,
  paidAt,
  locale,
}: {
  status: string;
  signedAt: string | null;
  paidAt: string | null;
  locale: string;
}) {
  if (["cancelled", "rejected"].includes(status)) return null;

  const atLeastSigned    = ["signed", "confirmed", "paid"].includes(status);
  const atLeastConfirmed = ["confirmed", "paid"].includes(status);
  const isPaid           = status === "paid";

  const steps = [
    { label: "Enviado",     done: true,              date: null },
    { label: "Assinado",    done: atLeastSigned,     date: atLeastSigned ? fmt(signedAt, locale) : null },
    { label: "Em custódia", done: atLeastConfirmed,  date: null },
    { label: "Pago",        done: isPaid,            date: isPaid ? fmt(paidAt, locale) : null },
  ];
  const connectors = [atLeastSigned, atLeastConfirmed, isPaid];

  return (
    <div className="mt-4 flex items-start">
      {steps.map((step, i) => (
        <div key={i} className="flex flex-1 flex-col items-center">
          <div className="flex w-full items-center">
            {i > 0 && (
              <div className={`flex-1 h-px ${connectors[i - 1] ? "bg-emerald-300" : "bg-zinc-200"}`} />
            )}
            <div className={[
              "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0",
              step.done ? "bg-emerald-500 text-white" : "bg-zinc-100 text-zinc-400 ring-1 ring-zinc-200",
            ].join(" ")}>
              {step.done ? (
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <span className="text-[9px] font-bold">{i + 1}</span>
              )}
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-px ${connectors[i] ? "bg-emerald-300" : "bg-zinc-200"}`} />
            )}
          </div>
          <p className={`mt-1.5 text-[10px] text-center leading-tight ${step.done ? "font-medium text-zinc-600" : "text-zinc-400"}`}>
            {step.label}
          </p>
          {step.date && (
            <p className="mt-0.5 text-[9px] text-center text-zinc-400">{step.date}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function ContractCard({ contract, locale, lang, onPaid }: { contract: PremiumContract; locale: string; lang: string; onPaid: (id: string) => void }) {
  const [paying, setPaying] = useState(false);
  const { isPaymentEligible, paymentBlockReason } = contract;

  const ps    = getContractPaymentStatus({ status: contract.status, paid_at: contract.paidAt });
  const label = contractStatusLabel(ps, lang === "en" ? "en" : "pt-BR");
  const tone  = contractStatusTone(ps);
  const { gross, commission, net, commissionPct } = resolveContractAmounts({
    payment_amount:    contract.paymentAmount,
    commission_amount: contract.commissionAmount,
    net_amount:        contract.netAmount,
  });

  const isPaid      = contract.status === "paid";
  const isActive    = ["sent", "signed", "confirmed"].includes(contract.status);
  const isCancelled = ["cancelled", "rejected"].includes(contract.status);

  async function handlePay() {
    setPaying(true);
    const res = await fetch(`/api/contracts/${contract.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pay" }),
    });
    if (res.ok) onPaid(contract.id);
    setPaying(false);
  }

  const borderCls  = isPaid ? "border-emerald-200" : isActive ? "border-amber-200" : "border-zinc-200";
  const topBarCls  = isPaid
    ? "bg-gradient-to-r from-emerald-400 to-teal-400"
    : isActive
    ? "bg-gradient-to-r from-amber-400 to-orange-400"
    : "bg-zinc-200";

  return (
    <div className={`overflow-hidden rounded-[22px] border bg-white shadow-[0_4px_16px_rgba(15,23,42,0.04)] ${borderCls} ${isCancelled ? "opacity-70" : ""}`}>
      <div className={`h-[3px] ${topBarCls}`} />
      <div className="p-5">

        {/* Title + badge */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-zinc-900 truncate">{contract.jobTitle}</p>
            {contract.jobDate && (
              <p className="mt-0.5 text-[12px] text-zinc-500">{fmtJobDate(contract.jobDate, locale)}</p>
            )}
          </div>
          <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>{label}</span>
        </div>

        {/* Talent */}
        <div className="mt-3 flex items-center gap-2">
          <Initials name={contract.talentName} avatarUrl={contract.talentAvatarUrl} />
          <span className="text-[13px] font-medium text-zinc-700">{contract.talentName}</span>
        </div>

        {/* Progress stepper */}
        <ContractProgress
          status={contract.status}
          signedAt={contract.signedAt}
          paidAt={contract.paidAt}
          locale={locale}
        />

        {/* Financials */}
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-[12px]">
          {isPaid ? (
            <>
              <span>
                <span className="text-zinc-500">Líquido: </span>
                <span className="font-bold text-emerald-600">{brl(net)}</span>
              </span>
              <span>
                <span className="text-zinc-500">Bruto: </span>
                <span className="text-zinc-700">{brl(gross)}</span>
              </span>
              <span>
                <span className="text-zinc-500">Comissão: </span>
                <span className="text-zinc-700">{commissionPct}% · {brl(commission)}</span>
              </span>
            </>
          ) : (
            <span>
              <span className="text-zinc-500">Valor: </span>
              <span className="font-semibold text-zinc-800">{brl(gross)}</span>
            </span>
          )}
          {contract.location && (
            <span>
              <span className="text-zinc-500">Local: </span>
              <span className="text-zinc-700">{contract.location}</span>
            </span>
          )}
        </div>

        {/* Footer: timestamp + actions */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-[11px] text-zinc-400">
            {isPaid && contract.paidAt ? (
              <span className="flex items-center gap-1 text-emerald-600 font-medium">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Pago em {fmt(contract.paidAt, locale)}
              </span>
            ) : (
              <span>Criado em {fmt(contract.createdAt, locale)}</span>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {contract.status === "confirmed" && (
              <>
                {isPaymentEligible ? (
                  <button
                    onClick={handlePay}
                    disabled={paying}
                    className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {paying ? "Pagando..." : "Pagar talento"}
                  </button>
                ) : (
                  <>
                    <button
                      disabled
                      className="rounded-lg bg-zinc-100 px-3 py-1.5 text-[11px] font-semibold text-zinc-400 cursor-not-allowed"
                    >
                      Pagar talento
                    </button>
                    {paymentBlockReason && (
                      <p className="text-[10px] text-zinc-400 text-right max-w-[200px] leading-tight">
                        {paymentBlockReason}
                      </p>
                    )}
                  </>
                )}
              </>
            )}
            <div className="flex gap-2 flex-wrap justify-end">
              {contract.jobId && (
                <Link
                  href={`/agency/workspace/jobs/${contract.jobId}`}
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors"
                >
                  Ver vaga
                </Link>
              )}
              {(contract.signedContractUrl ?? contract.contractFileUrl) && (
                <Link
                  href={(contract.signedContractUrl ?? contract.contractFileUrl)!}
                  target="_blank"
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors"
                >
                  Ver contrato
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WorkspacePremiumContracts({ contracts, lang = "pt-BR" }: Props) {
  const router = useRouter();
  const locale = lang === "en" ? "en-US" : "pt-BR";
  const [paidIds, setPaidIds] = useState<Set<string>>(new Set());

  function handlePaid(id: string) {
    setPaidIds((prev) => new Set([...prev, id]));
    router.refresh();
  }

  const resolvedContracts = contracts.map((c) => paidIds.has(c.id) ? { ...c, status: "paid" } : c);
  const active   = resolvedContracts.filter((c) => ["sent", "signed", "confirmed"].includes(c.status));
  const paid     = resolvedContracts.filter((c) => c.status === "paid");
  const inactive = resolvedContracts.filter((c) => ["cancelled", "rejected"].includes(c.status));

  const totalPaidNet = paid.reduce((sum, c) => {
    const { net } = resolveContractAmounts({
      payment_amount: c.paymentAmount,
      commission_amount: c.commissionAmount,
      net_amount: c.netAmount,
    });
    return sum + net;
  }, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[1.8rem] font-bold tracking-tight text-zinc-950">Contratos Premium</h1>
        <p className="mt-1 text-[14px] text-zinc-500">
          Contratos vinculados às vagas privadas que você gerencia.
        </p>
      </div>

      {/* Summary */}
      {contracts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-[12px] font-medium text-zinc-600">
            {contracts.length} contrato{contracts.length !== 1 ? "s" : ""}
          </span>
          {active.length > 0 && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[12px] font-medium text-amber-700">
              {active.length} em andamento
            </span>
          )}
          {paid.length > 0 && (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[12px] font-medium text-emerald-700">
              {paid.length} pago{paid.length !== 1 ? "s" : ""} · {brl(totalPaidNet)}
            </span>
          )}
        </div>
      )}

      {/* Empty */}
      {contracts.length === 0 && (
        <div className="rounded-[28px] border border-zinc-200 bg-white px-6 py-14 text-center shadow-[0_12px_34px_rgba(15,23,42,0.05)]">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100">
            <svg className="h-5 w-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-[14px] font-semibold text-zinc-600">Nenhum contrato Premium ainda.</p>
          <p className="mt-1 text-[13px] text-zinc-400">
            Os contratos vinculados às suas vagas privadas aparecerão aqui.
          </p>
        </div>
      )}

      {active.length > 0 && (
        <section className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Em andamento</p>
          <div className="flex flex-col gap-3">
            {active.map((c) => <ContractCard key={c.id} contract={c} locale={locale} lang={lang} onPaid={handlePaid} />)}
          </div>
        </section>
      )}

      {paid.length > 0 && (
        <section className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Concluídos</p>
          <div className="flex flex-col gap-3">
            {paid.map((c) => <ContractCard key={c.id} contract={c} locale={locale} lang={lang} onPaid={handlePaid} />)}
          </div>
        </section>
      )}

      {inactive.length > 0 && (
        <section className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Cancelados / Rejeitados</p>
          <div className="flex flex-col gap-3">
            {inactive.map((c) => <ContractCard key={c.id} contract={c} locale={locale} lang={lang} onPaid={handlePaid} />)}
          </div>
        </section>
      )}
    </div>
  );
}
