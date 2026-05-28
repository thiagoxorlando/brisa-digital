import type { createServerClient } from "@/lib/supabase";

type AdminSupabaseClient = ReturnType<typeof createServerClient>;

/**
 * Returns true when the agency's payment mode is escrow (the default for all
 * existing agencies). Returns false for internal-payment agencies where no
 * wallet deposit, custody, or escrow notification should ever be generated.
 *
 * Fails OPEN (returns true / escrow assumed) when:
 *   - agencyId is null/empty
 *   - the agencies.payment_mode column does not exist (pre-migration environment)
 *   - the agency row is not found
 *
 * This means the escrow flow is allowed when we have no contrary evidence,
 * preserving backward compatibility with all existing agencies.
 */
export async function isEscrowFlow(
  supabase: AdminSupabaseClient,
  agencyId: string | null | undefined,
): Promise<boolean> {
  if (!agencyId) return true; // no agency → can't determine → allow escrow (safe default)

  try {
    const { data, error } = await supabase
      .from("agencies")
      .select("payment_mode, escrow_enabled")
      .eq("id", agencyId)
      .maybeSingle();

    if (error) {
      // PGRST204 = column does not exist in schema cache (migration not applied).
      // In this case all agencies implicitly use escrow — fail open.
      if (error.code === "PGRST204" || (error.message ?? "").includes("payment_mode")) {
        console.info("[isEscrowFlow] payment_mode column absent — assuming escrow", { agencyId });
        return true;
      }
      console.warn("[isEscrowFlow] agencies fetch failed (defaulting to escrow)", {
        agencyId,
        error: error.message,
        code: error.code,
      });
      return true; // unknown → fail open (escrow assumed)
    }

    const row = data as Record<string, unknown> | null;
    const paymentMode   = (row?.payment_mode   as string  | null) ?? "escrow";
    const escrowEnabled = (row?.escrow_enabled as boolean | null) ?? true;

    // Internal mode: no escrow at all.
    if (paymentMode === "internal") return false;
    // Escrow mode but escrow specifically disabled for this agency.
    if (paymentMode === "escrow" && escrowEnabled === false) return false;

    return true;
  } catch {
    return true; // unexpected exception → fail open
  }
}
