import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";

// GET /api/admin/platform-balance
// Fetches the available balance from the Mercado Pago account.
// Returns: { available_balance: number }

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json({ error: "MERCADO_PAGO_ACCESS_TOKEN not configured" }, { status: 500 });
  }

  let data: Record<string, unknown>;
  try {
    const res = await fetch("https://api.mercadopago.com/v1/account/balance", {
      headers: { Authorization: `Bearer ${accessToken}` },
      // Don't cache — always return the live balance
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[platform-balance] MP error", res.status, text);
      return NextResponse.json({ error: "Failed to fetch balance from Mercado Pago" }, { status: 502 });
    }

    data = await res.json();
  } catch (err) {
    console.error("[platform-balance] fetch error", err);
    return NextResponse.json({ error: "Network error" }, { status: 502 });
  }

  const available = Number(data.available_balance ?? 0);
  return NextResponse.json({ available_balance: available });
}
