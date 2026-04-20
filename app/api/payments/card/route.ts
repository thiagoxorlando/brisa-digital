import { NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";

// GET /api/payments/card
// Returns: { public_key, cards: SavedCard[] }

export async function GET() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerClient({ useServiceRole: true });

  const { data: cards } = await supabase
    .from("saved_cards")
    .select("id, brand, last_four, holder_name, expiry_month, expiry_year, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({
    public_key: process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY ?? "",
    cards:      cards ?? [],
  });
}
