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

const STATUS_MAP: Record<ContractStatus, StatusInfo> = {
  sent:      { label: "Aguardando Assinatura", badge: "bg-violet-50  text-violet-700  ring-1 ring-violet-100",   section: "sent"      },
  signed:    { label: "Aguardando Depósito",   badge: "bg-sky-50     text-sky-700     ring-1 ring-sky-100",      section: "signed"    },
  confirmed: { label: "Aguardando Pagamento",  badge: "bg-amber-50   text-amber-700   ring-1 ring-amber-100",    section: "confirmed" },
  paid:      { label: "Pago",                  badge: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",  section: "paid"      },
  cancelled: { label: "Cancelado",             badge: "bg-zinc-100   text-zinc-500    ring-1 ring-zinc-200",     section: "cancelled" },
  rejected:  { label: "Recusado",              badge: "bg-rose-50    text-rose-600    ring-1 ring-rose-100",     section: "rejected"  },
};

export function statusInfo(raw: string): StatusInfo {
  const normalised = normaliseStatus(raw);
  return STATUS_MAP[normalised] ?? { label: raw, badge: "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200", section: "sent" };
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

const UNIFIED_STATUS_MAP: Record<UnifiedBookingStatus, UnifiedStatusInfo> = {
  aguardando_assinatura: { label: "Aguardando Assinatura", badge: "bg-violet-50  text-violet-700  ring-1 ring-violet-100",   section: "aguardando_assinatura" },
  aguardando_deposito:   { label: "Aguardando Depósito",   badge: "bg-sky-50     text-sky-700     ring-1 ring-sky-100",      section: "aguardando_deposito"   },
  aguardando_pagamento:  { label: "Aguardando Pagamento",  badge: "bg-amber-50   text-amber-700   ring-1 ring-amber-100",    section: "aguardando_pagamento"  },
  pago:                  { label: "Pago",                  badge: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",  section: "pago"                  },
  cancelado:             { label: "Cancelado",             badge: "bg-zinc-100   text-zinc-500    ring-1 ring-zinc-200",     section: "cancelado"             },
};

export function unifiedStatusInfo(status: UnifiedBookingStatus | string | null | undefined): UnifiedStatusInfo {
  return UNIFIED_STATUS_MAP[status as UnifiedBookingStatus] ?? UNIFIED_STATUS_MAP["aguardando_assinatura"];
}
