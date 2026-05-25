/**
 * Central agency payment configuration.
 *
 * resolveAgencyConfig() is the single source of truth for every UI gate
 * related to escrow, commission, wallet, and internal-payment display.
 * Import it in server components; pass AgencyConfig as a prop to client components.
 *
 * Priority chain (highest wins):
 *   agency row override → global platform defaults → safe hardcoded fallback (internal)
 *
 * Never write per-page conditions for escrow/commission visibility.
 * Always derive from AgencyConfig.showXxx flags.
 */

export type PaymentMode = "internal" | "escrow";

/** Platform-wide payment defaults stored in platform_settings table. */
export type GlobalPaymentDefaults = {
  default_payment_mode: PaymentMode;
  default_commission_percent: number;
  default_escrow_enabled: boolean;
  default_receipt_upload_required: boolean;
};

/** Safe hardcoded fallback — used when platform_settings is unavailable. */
export const SAFE_GLOBAL_DEFAULTS: GlobalPaymentDefaults = {
  default_payment_mode: "internal",
  default_commission_percent: 0,
  default_escrow_enabled: false,
  default_receipt_upload_required: false,
};

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

/**
 * Resolves the effective payment configuration for an agency.
 *
 * Priority: agency row > globalDefaults > SAFE_GLOBAL_DEFAULTS
 *
 * Pass globalDefaults (loaded from platform_settings) in every call site.
 * Omitting it falls back to SAFE_GLOBAL_DEFAULTS (internal mode, 0 commission).
 */
export function resolveAgencyConfig(
  agency: AgencyRow | null | undefined,
  planCommissionPercent: number,
  globalDefaults?: GlobalPaymentDefaults,
): AgencyConfig {
  const globals = globalDefaults ?? SAFE_GLOBAL_DEFAULTS;

  // null agency.payment_mode means "use global default"
  const paymentMode: PaymentMode =
    agency?.payment_mode === "internal" ? "internal"
    : agency?.payment_mode === "escrow" ? "escrow"
    : globals.default_payment_mode;

  // Commission: agency override → plan rate → global default
  const commissionPercent =
    agency?.commission_percent_override != null
      ? Number(agency.commission_percent_override)
      : Number.isFinite(planCommissionPercent)
        ? planCommissionPercent
        : globals.default_commission_percent;

  // escrow_enabled: agency override → global default (only meaningful when mode=escrow)
  const escrowEnabled =
    paymentMode === "escrow" &&
    (agency?.escrow_enabled ?? globals.default_escrow_enabled);

  const receiptUploadsEnabled =
    agency?.receipt_uploads_enabled ?? globals.default_receipt_upload_required;

  return {
    paymentMode,
    commissionPercent,
    escrowEnabled,
    receiptUploadsEnabled,
    showCommission:           commissionPercent > 0,
    showEscrow:               escrowEnabled,
    showWalletFunding:        paymentMode === "escrow",
    showCustodyLabels:        escrowEnabled,
    showReleasePaymentFlow:   escrowEnabled,
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
