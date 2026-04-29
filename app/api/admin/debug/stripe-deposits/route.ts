import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { createServerClient } from "@/lib/supabase";

// GET /api/admin/debug/stripe-deposits
// Temporary admin-only debug endpoint for recent Stripe wallet deposit rows.
export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = createServerClient({ useServiceRole: true });
  const { data, error } = await supabase
    .from("wallet_transactions")
    .select("id, user_id, amount, status, provider, payment_id, reference_id, provider_status, provider_transfer_id, processed_at, created_at, admin_note")
    .eq("provider", "stripe")
    .eq("type", "deposit")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data ?? [] });
}
