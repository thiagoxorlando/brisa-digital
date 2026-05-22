import Link from "next/link";
import { brl } from "@/lib/brl";
import { unifiedStatusInfo } from "@/lib/bookingStatus";
import AgentBookingActions from "@/features/agency/AgentBookingActions";

export type PremiumBooking = {
  id: string;
  jobId: string | null;
  jobTitle: string;
  talentName: string;
  talentAvatarUrl: string | null;
  status: string;
  contractStatus: string | null;
  derivedStatus: string;
  totalValue: number;
  createdAt: string;
  jobDate: string | null;
  location: string | null;
  paidAt: string | null;
  contractId: string | null;
  isAgentJobBacked: boolean;
  /** Display name of the user who released payment. NULL for legacy rows. */
  paidByName?: string | null;
};

type Props = { bookings: PremiumBooking[] };

function fmt(s: string | null) {
  if (!s) return null;
  return new Date(s).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" });
}

function fmtJobDate(s: string | null) {
  if (!s) return null;
  return new Date(s + "T00:00:00").toLocaleDateString("pt-BR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function Initials({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const letters = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
  return (
    <div className="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
      ) : (
        <span className="text-[11px] font-bold text-white">{letters}</span>
      )}
    </div>
  );
}

// When the job was created by an agent, the job_commitment already reserves the funds.
// Override the "Aguardando Depósito" label to reflect that the budget is already held.
const AGENT_ESCROW_STATUS = {
  label: "Reservado pelo agente",
  badge: "bg-teal-50 text-teal-700 ring-1 ring-teal-100",
};

function BookingCard({ booking }: { booking: PremiumBooking }) {
  const isAgentDeposit = booking.derivedStatus === "aguardando_deposito" && booking.isAgentJobBacked;
  const si         = isAgentDeposit ? AGENT_ESCROW_STATUS : unifiedStatusInfo(booking.derivedStatus);
  const isPaid     = booking.derivedStatus === "pago";
  const isCanceled = booking.derivedStatus === "cancelado";

  const borderCls  = isPaid ? "border-emerald-200" : isCanceled ? "border-zinc-200" : isAgentDeposit ? "border-teal-200" : "border-violet-200";
  const topBarCls  = isPaid
    ? "bg-gradient-to-r from-emerald-400 to-teal-400"
    : isCanceled
    ? "bg-zinc-200"
    : isAgentDeposit
    ? "bg-gradient-to-r from-teal-400 to-cyan-400"
    : "bg-gradient-to-r from-violet-400 to-indigo-400";

  // Status hint line
  const hint: Record<string, string> = {
    aguardando_assinatura: "Aguardando assinatura do contrato pelo talento.",
    aguardando_deposito:   "Contrato assinado. Aguardando depósito da agência.",
    aguardando_pagamento:  "Fundos em custódia. Aguardando liberação do pagamento.",
    pago:                  "Pagamento concluído.",
    cancelado:             "Esta reserva foi cancelada.",
  };
  // Agent-backed: funds already reserved from agent budget — no deposit action needed.
  const effectiveHint = isAgentDeposit
    ? "Fundos reservados do seu orçamento. Aguardando confirmação do portal para liberar pagamento."
    : hint[booking.derivedStatus];

  return (
    <div className={`overflow-hidden rounded-[22px] border bg-white shadow-[0_4px_16px_rgba(15,23,42,0.04)] ${borderCls} ${isCanceled ? "opacity-70" : ""}`}>
      <div className={`h-[3px] ${topBarCls}`} />
      <div className="p-5">

        {/* Talent row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Initials name={booking.talentName} avatarUrl={booking.talentAvatarUrl} />
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-zinc-900 truncate">{booking.talentName}</p>
              <p className="text-[12px] text-zinc-500 truncate">{booking.jobTitle}</p>
            </div>
          </div>
          <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${si.badge}`}>
            {si.label}
          </span>
        </div>

        {/* Date + location */}
        {(booking.jobDate || booking.location) && (
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12px] text-zinc-600">
            {booking.jobDate && (
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {fmtJobDate(booking.jobDate)}
              </span>
            )}
            {booking.location && (
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {booking.location}
              </span>
            )}
          </div>
        )}

        {/* Status hint */}
        {effectiveHint && (
          <p className={`mt-3 text-[12px] ${isPaid ? "text-emerald-600" : isCanceled ? "text-zinc-400" : isAgentDeposit ? "text-teal-600" : "text-violet-600"}`}>
            {effectiveHint}
          </p>
        )}

        {/* Footer: value + timestamp + actions */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
            <span>
              <span className="text-zinc-500">Valor: </span>
              <span className={`font-semibold ${isPaid ? "text-emerald-600" : "text-zinc-800"}`}>
                {brl(booking.totalValue)}
              </span>
            </span>
            <span className="text-zinc-400">
              {isPaid && booking.paidAt
                ? (booking.paidByName
                    ? `Pago por ${booking.paidByName} em ${fmt(booking.paidAt)}`
                    : `Pago em ${fmt(booking.paidAt)}`)
                : `Criado em ${fmt(booking.createdAt)}`}
            </span>
          </div>
          <div className="flex gap-2">
            {booking.jobId && (
              <Link
                href={`/agency/workspace/jobs/${booking.jobId}`}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors"
              >
                Ver vaga
              </Link>
            )}
          </div>
        </div>

        {/* Agent-pay actions island — only when agent-reserved and still awaiting payment */}
        {isAgentDeposit && booking.contractId && (
          <AgentBookingActions
            contractId={booking.contractId}
            talentName={booking.talentName}
            totalValue={booking.totalValue}
            jobDate={booking.jobDate}
          />
        )}
      </div>
    </div>
  );
}

export default function WorkspacePremiumBookings({ bookings }: Props) {
  const active   = bookings.filter((b) => !["pago", "cancelado"].includes(b.derivedStatus));
  const paid     = bookings.filter((b) => b.derivedStatus === "pago");
  const canceled = bookings.filter((b) => b.derivedStatus === "cancelado");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[1.8rem] font-bold tracking-tight text-zinc-950">Reservas Premium</h1>
        <p className="mt-1 text-[14px] text-zinc-500">
          Reservas vinculadas às vagas privadas que você gerencia.
        </p>
      </div>

      {/* Summary */}
      {bookings.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-[12px] font-medium text-zinc-600">
            {bookings.length} reserva{bookings.length !== 1 ? "s" : ""}
          </span>
          {active.length > 0 && (
            <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[12px] font-medium text-violet-700">
              {active.length} em andamento
            </span>
          )}
          {paid.length > 0 && (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[12px] font-medium text-emerald-700">
              {paid.length} concluída{paid.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {/* Empty */}
      {bookings.length === 0 && (
        <div className="rounded-[28px] border border-zinc-200 bg-white px-6 py-14 text-center shadow-[0_12px_34px_rgba(15,23,42,0.05)]">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100">
            <svg className="h-5 w-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-[14px] font-semibold text-zinc-600">Nenhuma reserva Premium ainda.</p>
          <p className="mt-1 text-[13px] text-zinc-400">
            As reservas vinculadas às suas vagas privadas aparecerão aqui.
          </p>
        </div>
      )}

      {active.length > 0 && (
        <section className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Em andamento</p>
          <div className="flex flex-col gap-3">
            {active.map((b) => <BookingCard key={b.id} booking={b} />)}
          </div>
        </section>
      )}

      {paid.length > 0 && (
        <section className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Concluídas</p>
          <div className="flex flex-col gap-3">
            {paid.map((b) => <BookingCard key={b.id} booking={b} />)}
          </div>
        </section>
      )}

      {canceled.length > 0 && (
        <section className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Canceladas</p>
          <div className="flex flex-col gap-3">
            {canceled.map((b) => <BookingCard key={b.id} booking={b} />)}
          </div>
        </section>
      )}
    </div>
  );
}
