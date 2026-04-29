import { NextResponse } from "next/server";

/**
 * Booking status is now controlled exclusively via /api/contracts/[id].
 * Direct status mutations on bookings are no longer accepted.
 */
export async function PATCH() {
  return NextResponse.json(
    { error: "Booking status is managed via /api/contracts/[id]. Use Stripe Checkout for funding, then actions pay | cancel_job | talent_cancel." },
    { status: 405 }
  );
}
