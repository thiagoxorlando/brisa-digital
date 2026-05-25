import { NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import { resolveAgencyConfig, defaultEscrowConfig } from "@/lib/agencyConfig";
import { getLivePlanSetting } from "@/lib/planSettings.server";
import { parsePlan } from "@/lib/plans";

export async function GET() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerClient({ useServiceRole: true });

  const [{ data: profile }, { data: agency }] = await Promise.all([
    supabase.from("profiles").select("plan, role").eq("id", user.id).single(),
    supabase
      .from("agencies")
      .select("payment_mode, commission_percent_override, escrow_enabled, receipt_uploads_enabled")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  if (!profile || profile.role !== "agency") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const plan = parsePlan(profile.plan);
  const planSetting = await getLivePlanSetting(plan);

  const config = resolveAgencyConfig(
    agency as Record<string, unknown> | null,
    planSetting.commission_percent,
  );

  return NextResponse.json(config);
}
