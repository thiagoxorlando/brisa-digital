import { NextRequest, NextResponse } from "next/server";
import { MercadoPagoConfig, CustomerCard } from "mercadopago";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";

// DELETE /api/payments/card/[cardId]
// Removes card from MP and from DB.

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { cardId } = await params;
  const supabase   = createServerClient({ useServiceRole: true });

  // Fetch the card to verify ownership and get MP references
  const { data: card, error: fetchErr } = await supabase
    .from("saved_cards")
    .select("id, mp_card_id, mp_customer_id")
    .eq("id", cardId)
    .eq("user_id", user.id)
    .single();

  if (fetchErr || !card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  // Remove from MP
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN!;
  const client      = new MercadoPagoConfig({ accessToken });
  try {
    await new CustomerCard(client).remove({
      customerId: card.mp_customer_id,
      cardId:     card.mp_card_id,
    });
  } catch (err) {
    // Log but continue — we still want to remove from our DB
    console.error("[card/delete] MP remove failed:", err);
  }

  // Remove from DB
  await supabase.from("saved_cards").delete().eq("id", cardId);

  return NextResponse.json({ ok: true });
}
