/**
 * BrisaHub Launch Readiness Checklist
 *
 * Documentation-as-code catalog of what's been verified vs. still needed.
 *
 *   [DONE]    — verified implemented
 *   [PARTIAL] — partially done; needs follow-up
 *   [TODO]    — not yet done
 *
 * Update this file as launch progresses. Reading it should give a fresh
 * engineer a complete picture of what's covered.
 */

export const LAUNCH_CHECKLIST = {
  auth: {
    signupEnabled:    "[DONE] platform_settings.agency_signup_enabled / talent_signup_enabled (lib/featureFlags.server.ts)",
    maintenanceMode:  "[DONE] platform_settings.maintenance_mode via featureFlags",
    sessionSecurity:  "[DONE] Supabase auth handles sessions (HTTP-only cookies)",
    passwordReset:    "[TODO] verify email delivery template + DNS in production",
    onboarding:       "[DONE] onboarding flow + role assignment",
  },
  security: {
    rlsPolicies:        "[DONE] Supabase RLS on all tables",
    adminRouteGuard:    "[DONE] requireAdmin() on all /api/admin/* routes",
    uploadValidation:   "[PARTIAL] upload_max_mb configurable; MIME-type allowlist still needed",
    rateLimiting:       "[TODO] no rate limiting on withdrawal/signup routes yet",
    webhookSecrets:     "[TODO] verify Asaas webhook signature validation in production",
    csrfProtection:     "[DONE] Next.js App Router default + Supabase cookies",
    envValidation:      "[DONE] lib/envValidation.ts validates required env vars",
  },
  financial: {
    escrowAtomicity:    "[DONE] confirm_booking_escrow / release_payment_payout RPCs are atomic",
    walletIdempotency:  "[DONE] wallet_transactions idempotency_key unique index",
    contractCommissionLock: "[DONE] commission_amount/net_amount stored at contract creation",
    auditLogging:       "[DONE] logAdminAction() on all admin mutations",
    withdrawalFees:     "[DONE] 4% agency fee, talent fee-free, R$100 agency minimum",
    paymentReleaseGate: "[DONE] checkPaymentReleaseEligibility() + manual override audit log",
    disputeBlocking:    "[PARTIAL] policy module ready (lib/disputePolicy.ts); contract_disputes table TODO",
  },
  observability: {
    auditLog:           "[DONE] admin_audit_logs + /admin/audit page",
    notifications:      "[DONE] notifications table + templates (lib/notificationTemplates.ts)",
    consoleErrors:      "[PARTIAL] API routes log errors but not centrally aggregated",
    monitoring:         "[TODO] no APM / error reporting wired (Sentry/equiv.)",
  },
  ux: {
    mobileResponsive:   "[DONE] admin tables wrapped in overflow-x-auto; grids have sm: breakpoints",
    translations:       "[DONE] pt.ts is the canonical source; nav+topbar keys present",
    statusHelpers:      "[DONE] lib/contractStatus.ts, bookingStatus.ts, jobStatus.ts, etc.",
    currencyFmt:        "[DONE] lib/brl.ts is the single source",
  },
  seo: {
    robotsTxt:          "[DONE] app/robots.ts disallows /admin, /api, /onboarding",
    sitemap:            "[TODO] dynamic sitemap with public jobs/talents/workspaces",
    publicMetadata:     "[PARTIAL] admin pages have metadata; some public pages still missing",
  },
  data: {
    dbBackups:          "[TODO] verify Supabase scheduled backups + restore drill",
    softDeletes:        "[DONE] deleted_at columns + trash page",
    referentialIntegrity: "[DONE] FKs in place; orphan detection in admin UI",
  },
  premium: {
    workspaceLifecycle: "[DONE] workspace status + agent reservations + settlement",
    agentLedger:        "[DONE] premium_agent_wallet_transactions committed/settled",
  },
} as const;

export type LaunchChecklistCategory = keyof typeof LAUNCH_CHECKLIST;
