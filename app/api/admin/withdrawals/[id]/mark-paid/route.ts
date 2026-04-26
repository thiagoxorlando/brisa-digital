import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";

// POST /api/admin/withdrawals/[id]/mark-paid — RETIRED
// This endpoint had a TOCTOU race: bare UPDATE + .eq("status","pending") returned
// ok:true even when 0 rows were affected (already paid/cancelled).
//
// Use POST /api/admin/withdrawals/[id]/approve instead.
// That route calls mark_agency_withdrawal_paid() which uses FOR UPDATE locking.

export async function POST() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json(
    {
      error: "Este endpoint foi descontinuado. Use POST /api/admin/withdrawals/[id]/approve.",
      replacement: "/api/admin/withdrawals/[id]/approve",
    },
    { status: 410 },
  );
}
