/**
 * POST /api/auth/signup-pro — DEPRECATED
 *
 * Legacy PRO signup endpoint. Paid plans are started through the single
 * active checkout route:
 *   POST /api/asaas/plan/checkout  (Asaas, BRL — see lib/planCheckoutClient.ts)
 *
 * The signup page (app/signup/page.tsx) no longer calls this route.
 * Returns 410 Gone to any client that still has this route cached.
 */

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:   "This endpoint has been deprecated.",
      message: "Use POST /api/asaas/plan/checkout to start a paid plan.",
    },
    { status: 410 },
  );
}
