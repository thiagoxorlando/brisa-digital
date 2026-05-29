import { getGlobalPaymentDefaults } from "@/lib/platformSettings.server";
import type { createServerClient } from "@/lib/supabase";

type AdminSupabaseClient = ReturnType<typeof createServerClient>;

/**
 * Returns true when the resolved payment mode for this agency is escrow.
 * Returns false for internal-payment agencies (explicit or via global default).
 *
 * Priority (mirrors resolveAgencyConfig):
 *   agencies.payment_mode = 'internal' → false
 *   agencies.payment_mode = 'escrow'   → true  (unless escrow_enabled=false)
 *   agencies.payment_mode = NULL       → use platform_settings.default_payment_mode
 *   anything else / row missing        → fail open (true / escrow assumed)
 *
 * Fail-open means we never silently block an escrow agency from paying.
 * Fail-closed would be safer for internal-mode but risks breaking legitimate
 * escrow flows when the DB/column is temporarily unavailable.
 */
export async function isEscrowFlow(
  supabase: AdminSupabaseClient,
  agencyId: string | null | undefined,
): Promise<boolean> {
  if (!agencyId) return true;

  try {
    const { data, error } = await supabase
      .from("agencies")
      .select("payment_mode, escrow_enabled")
      .eq("id", agencyId)
      .maybeSingle();

    if (error) {
      // PGRST204 = column absent (pre-migration). Fall open — all agencies are
      // implicitly escrow in that environment.
      if (
        error.code === "PGRST204" ||
        (error.message ?? "").includes("payment_mode")
      ) {
        console.info("[isEscrowFlow] payment_mode column absent — assuming escrow", { agencyId });
        return true;
      }
      console.warn("[isEscrowFlow] agencies fetch failed (defaulting to escrow)", {
        agencyId,
        error: error.message,
        code: error.code,
      });
      return true;
    }

    const row = data as Record<string, unknown> | null;
    const paymentMode   = (row?.payment_mode   as string  | null) ?? null;
    const escrowEnabled = (row?.escrow_enabled as boolean | null) ?? null;

    // ── Explicit agency-level override ───────────────────────────────────────
    if (paymentMode === "internal") return false;
    if (paymentMode === "escrow") {
      // escrow_enabled=false means escrow is explicitly disabled for this agency
      return escrowEnabled !== false;
    }

    // ── NULL = inherit global default ────────────────────────────────────────
    const globals = await getGlobalPaymentDefaults();
    if (globals.default_payment_mode === "internal") return false;
    return globals.default_escrow_enabled;
  } catch {
    return true; // unexpected exception → fail open
  }
}
