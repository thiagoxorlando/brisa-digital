/**
 * Single source of truth for booking/contract status.
 * Contracts are the master — bookings always mirror contract.status.
 * This module is the ONLY place that defines labels, styles, and valid transitions.
 *
 * IMPORTANT: frontends must NEVER create their own status derivation logic.
 * Always use getUnifiedBookingStatus() to derive display state from raw DB values.
 */

export type ContractStatus =
  | "sent"
  | "signed"
  | "confirmed"
  | "paid"
  | "cancelled"
  | "rejected";

/** Exhaustive list of valid booking statuses. "signed" is contract-only — never a booking status. */
export const VALID_BOOKING_STATUSES = ["pending", "pending_payment", "confirmed", "paid", "cancelled"] as const;
export type BookingStatus = typeof VALID_BOOKING_STATUSES[number];

/** Returns an error string if `s` is not a valid booking status, null if ok. */
export function validateBookingStatus(s: string): string | null {
  return (VALID_BOOKING_STATUSES as readonly string[]).includes(s)
    ? null
    : `Invalid booking status "${s}". Must be one of: ${VALID_BOOKING_STATUSES.join(", ")}`;
}

/** Map legacy booking-only values to their contract equivalent. */
export function normaliseStatus(s: string): ContractStatus {
  if (s === "pending")         return "sent";
  if (s === "pending_payment") return "signed";
  return s as ContractStatus;
}

export interface StatusInfo {
  label:   string;
  badge:   string;   // Tailwind classes for inline badge
  section: ContractStatus;
}

type StatusLang = "pt-BR" | "en";

const STATUS_LABELS: Record<StatusLang, Record<ContractStatus, string>> = {
  "pt-BR": {
    sent:      "Aguardando Assinatura",
    signed:    "Aguardando Depósito",
    confirmed: "Aguardando Pagamento",
    paid:      "Pago",
    cancelled: "Cancelado",
    rejected:  "Recusado",
  },
  en: {
    sent:      "Awaiting Signature",
    signed:    "Awaiting Deposit",
    confirmed: "Awaiting Payment",
    paid:      "Paid",
    cancelled: "Cancelled",
    rejected:  "Rejected",
  },
};

const STATUS_BADGES: Record<ContractStatus, string> = {
  sent:      "bg-violet-50  text-violet-700  ring-1 ring-violet-100",
  signed:    "bg-sky-50     text-sky-700     ring-1 ring-sky-100",
  confirmed: "bg-amber-50   text-amber-700   ring-1 ring-amber-100",
  paid:      "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  cancelled: "bg-zinc-100   text-zinc-500    ring-1 ring-zinc-200",
  rejected:  "bg-rose-50    text-rose-600    ring-1 ring-rose-100",
};

export function statusInfo(raw: string, lang: StatusLang = "en"): StatusInfo {
  const normalised = normaliseStatus(raw);
  const labels = STATUS_LABELS[lang] ?? STATUS_LABELS["pt-BR"];
  const label = labels[normalised] ?? raw;
  const badge = STATUS_BADGES[normalised] ?? "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200";
  return { label, badge, section: normalised };
}

/**
 * Valid state machine.
 * enforce() returns an error string if the transition is illegal, null if ok.
 */
export const VALID_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  sent:      ["signed", "rejected", "cancelled"],
  signed:    ["confirmed", "cancelled"],
  confirmed: ["paid", "cancelled"],
  paid:      [],
  cancelled: [],
  rejected:  [],
};

export function enforce(from: string, to: string): string | null {
  const f = normaliseStatus(from);
  const t = normaliseStatus(to);
  if ((VALID_TRANSITIONS[f] ?? []).includes(t)) return null;
  return `Invalid transition: ${f} → ${t}`;
}

// ── Unified booking status ─────────────────────────────────────────────────────
// Derived from BOTH the raw booking status and the raw contract status.
// This is the single resolver all frontends must use — never write ad-hoc logic.

export type UnifiedBookingStatus =
  | "aguardando_assinatura"
  | "aguardando_deposito"
  | "aguardando_pagamento"
  | "pago"
  | "cancelado";

/**
 * Derive the display state for a booking from its raw DB values.
 *
 * @param bookingStatus  - bookings.status from the database
 * @param contractStatus - contracts.status from the database (null if no contract yet)
 */
export function getUnifiedBookingStatus(
  bookingStatus: string | null | undefined,
  contractStatus: string | null | undefined,
): UnifiedBookingStatus {
  const bs = (!bookingStatus || bookingStatus === "signed") ? "pending_payment" : bookingStatus;

  // Cancellation can come from either side — check first
  if (bs === "cancelled" || contractStatus === "cancelled" || contractStatus === "rejected") return "cancelado";

  // Contract is the master record — its status drives display regardless of
  // whether the booking mirror has caught up (syncBooking may lag).
  if (!contractStatus || contractStatus === "sent") return "aguardando_assinatura";
  if (contractStatus === "signed")    return "aguardando_deposito";
  if (contractStatus === "confirmed") return "aguardando_pagamento";
  if (contractStatus === "paid")      return "pago";

  return "aguardando_assinatura";
}

export interface UnifiedStatusInfo {
  label:   string;
  badge:   string;
  section: UnifiedBookingStatus;
}

const UNIFIED_LABELS: Record<StatusLang, Record<UnifiedBookingStatus, string>> = {
  "pt-BR": {
    aguardando_assinatura: "Aguardando Assinatura",
    aguardando_deposito:   "Aguardando Depósito",
    aguardando_pagamento:  "Aguardando Pagamento",
    pago:                  "Pago",
    cancelado:             "Cancelado",
  },
  en: {
    aguardando_assinatura: "Awaiting Signature",
    aguardando_deposito:   "Awaiting Deposit",
    aguardando_pagamento:  "Awaiting Payment",
    pago:                  "Paid",
    cancelado:             "Cancelled",
  },
};

// Labels for internal (direct) payment mode — no escrow/deposit language.
const INTERNAL_UNIFIED_LABELS: Record<StatusLang, Partial<Record<UnifiedBookingStatus, string>>> = {
  "pt-BR": {
    aguardando_deposito:  "Contrato Assinado",
    aguardando_pagamento: "Pagamento em Andamento",
  },
  en: {
    aguardando_deposito:  "Contract Signed",
    aguardando_pagamento: "Payment in Progress",
  },
};

const UNIFIED_BADGES: Record<UnifiedBookingStatus, string> = {
  aguardando_assinatura: "bg-violet-50  text-violet-700  ring-1 ring-violet-100",
  aguardando_deposito:   "bg-sky-50     text-sky-700     ring-1 ring-sky-100",
  aguardando_pagamento:  "bg-amber-50   text-amber-700   ring-1 ring-amber-100",
  pago:                  "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  cancelado:             "bg-zinc-100   text-zinc-500    ring-1 ring-zinc-200",
};

export function unifiedStatusInfo(
  status: UnifiedBookingStatus | string | null | undefined,
  lang: StatusLang = "en",
  paymentMode: "escrow" | "internal" = "escrow",
): UnifiedStatusInfo {
  const key = (status as UnifiedBookingStatus) ?? "aguardando_assinatura";
  const escrowLabels = UNIFIED_LABELS[lang] ?? UNIFIED_LABELS["pt-BR"];
  const internalOverrides = INTERNAL_UNIFIED_LABELS[lang] ?? INTERNAL_UNIFIED_LABELS["pt-BR"];
  const modeLabels = paymentMode === "internal" ? { ...escrowLabels, ...internalOverrides } : escrowLabels;
  const label = modeLabels[key] ?? escrowLabels[key] ?? String(status ?? "");
  const badge = UNIFIED_BADGES[key] ?? UNIFIED_BADGES["aguardando_assinatura"];
  return { label, badge, section: key };
}
