import { createServerClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

/**
 * Returns null if the agency has an active subscription.
 * Returns a 403 NextResponse if inactive — call-site should return it immediately.
 */
export async function requireActiveSubscription(agencyId: string): Promise<NextResponse | null> {
  if (!agencyId) return null; // no agency context, skip

  const supabase = createServerClient({ useServiceRole: true });

  const { data } = await supabase
    .from("agencies")
    .select("subscription_status")
    .eq("id", agencyId)
    .single();

  if (data?.subscription_status === "inactive") {
    return NextResponse.json(
      { error: "Subscription inactive. Reactivate your plan to perform this action." },
      { status: 403 }
    );
  }

  return null;
}
