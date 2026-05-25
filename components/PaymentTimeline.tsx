"use client";

function CheckIcon() {
  return (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

type Step = {
  label: string;
  sublabel?: string | null;
  completed: boolean;
  active: boolean;
};

function fmtTs(s: string | null | undefined) {
  if (!s) return null;
  return new Date(s).toLocaleString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function StepNode({ step, isLast }: { step: Step; isLast: boolean }) {
  const dot = step.completed
    ? "bg-emerald-500 border-emerald-500 text-white"
    : step.active
      ? "bg-white border-[#0E7C86] ring-2 ring-[#0E7C86]/20"
      : "bg-white border-zinc-200";

  return (
    <div className="flex gap-3 min-w-0">
      <div className="flex flex-col items-center flex-shrink-0">
        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center z-10 ${dot}`}>
          {step.completed && <CheckIcon />}
          {step.active && !step.completed && (
            <div className="w-2 h-2 rounded-full bg-[#0E7C86]" />
          )}
        </div>
        {!isLast && (
          <div
            className={`w-0.5 flex-1 mt-1 ${step.completed ? "bg-emerald-200" : "bg-zinc-100"}`}
            style={{ minHeight: "18px" }}
          />
        )}
      </div>
      <div className={`${isLast ? "pb-0" : "pb-4"} flex-1 min-w-0`}>
        <p
          className={`text-[13px] font-semibold leading-tight ${
            step.completed
              ? "text-zinc-600"
              : step.active
                ? "text-[#1F2D2E]"
                : "text-zinc-400"
          }`}
        >
          {step.label}
        </p>
        {step.sublabel && (
          <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">{step.sublabel}</p>
        )}
      </div>
    </div>
  );
}

export type PaymentTimelineProps = {
  mode: "internal" | "escrow";
  status: string;
  /** ISO timestamp when the contract was signed by the talent. */
  signedAt?: string | null;
  /** ISO timestamp when the agency deposited into escrow (escrow mode). */
  depositPaidAt?: string | null;
  /** ISO timestamp when the agency marked the external payment as sent (internal mode). */
  agencyPaymentSentAt?: string | null;
  /** ISO timestamp when the talent confirmed receipt (internal mode). */
  talentPaymentConfirmedAt?: string | null;
  /** ISO timestamp when the payment was fully released / completed. */
  paidAt?: string | null;
  className?: string;
};

export default function PaymentTimeline({
  mode,
  status,
  signedAt,
  depositPaidAt,
  agencyPaymentSentAt,
  talentPaymentConfirmedAt,
  paidAt,
  className = "",
}: PaymentTimelineProps) {
  const isSigned  = status !== "sent";
  const isPaid    = status === "paid";

  let steps: Step[];

  if (mode === "internal") {
    const paymentSent      = !!agencyPaymentSentAt;
    const paymentConfirmed = !!talentPaymentConfirmedAt || isPaid;

    steps = [
      {
        label:     "Contrato assinado",
        sublabel:  isSigned ? fmtTs(signedAt) : null,
        completed: isSigned,
        active:    !isSigned,
      },
      {
        label:     "Pagamento enviado pela agência",
        sublabel:  paymentSent
          ? fmtTs(agencyPaymentSentAt)
          : isSigned
            ? "Aguardando confirmação da agência"
            : null,
        completed: paymentSent,
        active:    isSigned && !paymentSent,
      },
      {
        label:     "Recebimento confirmado pelo talento",
        sublabel:  paymentConfirmed
          ? fmtTs(talentPaymentConfirmedAt ?? paidAt)
          : paymentSent
            ? "Aguardando confirmação do talento"
            : null,
        completed: paymentConfirmed,
        active:    paymentSent && !paymentConfirmed,
      },
    ];
  } else {
    const escrowed = !!depositPaidAt || ["confirmed", "paid"].includes(status);

    steps = [
      {
        label:     "Contrato assinado",
        sublabel:  isSigned ? fmtTs(signedAt) : null,
        completed: isSigned,
        active:    !isSigned,
      },
      {
        label:     "Pagamento em custódia",
        sublabel:  escrowed
          ? fmtTs(depositPaidAt)
          : isSigned
            ? "Aguardando depósito da agência"
            : null,
        completed: escrowed,
        active:    isSigned && !escrowed,
      },
      {
        label:     "Pagamento liberado ao talento",
        sublabel:  isPaid
          ? fmtTs(paidAt)
          : escrowed
            ? "Aguardando liberação"
            : null,
        completed: isPaid,
        active:    escrowed && !isPaid,
      },
    ];
  }

  return (
    <div className={className}>
      {steps.map((step, i) => (
        <StepNode key={step.label} step={step} isLast={i === steps.length - 1} />
      ))}
    </div>
  );
}
