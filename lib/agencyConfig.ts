/**
 * Central agency payment configuration.
 *
 * resolveAgencyConfig() is the single source of truth for every UI gate
 * related to escrow, commission, wallet, and internal-payment display.
 * Import it in server components; pass AgencyConfig as a prop to client components.
 *
 * Never write per-page conditions for escrow/commission visibility.
 * Always derive from AgencyConfig.showXxx flags.
 */

export type PaymentMode = "internal" | "escrow";

export type AgencyConfig = {
  paymentMode: PaymentMode;
  /** Effective commission percentage (0–100). Uses override if set, else plan default. */
  commissionPercent: number;
  escrowEnabled: boolean;
  receiptUploadsEnabled: boolean;

  // ── Derived display flags ─────────────────────────────────────────────────
  /** Show commission percentages and amounts in UI. False when commissionPercent = 0. */
  showCommission: boolean;
  /** Show escrow/custody flow UI (deposit, lock, release-payment). */
  showEscrow: boolean;
  /** Show wallet funding / deposit-into-platform messaging. */
  showWalletFunding: boolean;
  /** Show "Em custódia" labels and escrow state indicators. */
  showCustodyLabels: boolean;
  /** Show the release-payment / liberar pagamento button flow. */
  showReleasePaymentFlow: boolean;
  /** Show internal-payment confirmation buttons (Marcar enviado / Confirmar recebimento). */
  showInternalConfirmation: boolean;
};

type AgencyRow = {
  payment_mode?: string | null;
  commission_percent_override?: number | null;
  escrow_enabled?: boolean | null;
  receipt_uploads_enabled?: boolean | null;
};

export function resolveAgencyConfig(
  agency: AgencyRow | null | undefined,
  planCommissionPercent: number,
): AgencyConfig {
  const paymentMode: PaymentMode =
    agency?.payment_mode === "internal" ? "internal" : "escrow";

  const commissionPercent =
    agency?.commission_percent_override != null
      ? Number(agency.commission_percent_override)
      : planCommissionPercent;

  const escrowEnabled =
    paymentMode === "escrow" && (agency?.escrow_enabled ?? true);

  const receiptUploadsEnabled = agency?.receipt_uploads_enabled ?? true;

  return {
    paymentMode,
    commissionPercent,
    escrowEnabled,
    receiptUploadsEnabled,
    showCommission:          commissionPercent > 0,
    showEscrow:              escrowEnabled,
    showWalletFunding:       paymentMode === "escrow",
    showCustodyLabels:       escrowEnabled,
    showReleasePaymentFlow:  escrowEnabled,
    showInternalConfirmation: paymentMode === "internal",
  };
}

/** Fallback for server contexts where the agency row failed to load. */
export function defaultEscrowConfig(planCommissionPercent: number): AgencyConfig {
  return resolveAgencyConfig(
    { payment_mode: "escrow", escrow_enabled: true },
    planCommissionPercent,
  );
}

/** Fallback for internal-mode agencies when commission is unknown. */
export function defaultInternalConfig(): AgencyConfig {
  return resolveAgencyConfig(
    { payment_mode: "internal", escrow_enabled: false, commission_percent_override: 0 },
    0,
  );
}
