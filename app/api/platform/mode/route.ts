import { NextResponse } from "next/server";
import { getGlobalPaymentDefaults } from "@/lib/platformSettings.server";

// Public endpoint — no auth required.
// Returns the platform's configured default payment mode so
// client-only pages (landing, signup) can adapt their copy.
export async function GET() {
  try {
    const defaults = await getGlobalPaymentDefaults();
    return NextResponse.json(
      { mode: defaults.default_payment_mode },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } },
    );
  } catch {
    return NextResponse.json({ mode: "escrow" });
  }
}
