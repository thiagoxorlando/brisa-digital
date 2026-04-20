import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { PLAN_DEFINITIONS, PLAN_KEYS, type Plan } from "@/lib/plans";

const PLAN_PRICES: Record<Plan, number> = Object.fromEntries(
  PLAN_KEYS.map((plan) => [plan, PLAN_DEFINITIONS[plan].price]),
) as Record<Plan, number>;

export async function POST(req: NextRequest) {
  const { user_id, plan } = await req.json();

  if (!user_id || !plan) {
    return NextResponse.json({ error: "Missing user_id or plan" }, { status: 400 });
  }

  if (!PLAN_KEYS.includes(plan as Plan)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const supabase    = createServerClient({ useServiceRole: true });
  const planStatus  = plan === "free" ? "inactive" : "active";
  const expiresAt   = plan === "free" ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  // Attempt full update; fall back to plan-only if extra columns not in schema cache
  const { error: fullError } = await supabase
    .from("profiles")
    .update({ plan, plan_status: planStatus, plan_expires_at: expiresAt })
    .eq("id", user_id);

  if (fullError) {
    console.warn("[agency-plan] full update failed, falling back to plan-only:", fullError.message);
    const { error: fallbackError } = await supabase
      .from("profiles")
      .update({ plan })
      .eq("id", user_id);
    if (fallbackError) {
      console.error("[agency-plan/route] update failed:", fallbackError.message);
      return NextResponse.json({ error: fallbackError.message }, { status: 400 });
    }
  }

  // Mirror to agencies.subscription_status for legacy compat
  await supabase
    .from("agencies")
    .update({ subscription_status: planStatus })
    .eq("id", user_id);

  return NextResponse.json({ ok: true, plan, price: PLAN_PRICES[plan as Plan] }, { status: 201 });
}
