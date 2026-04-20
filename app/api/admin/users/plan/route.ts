import { NextRequest, NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";

const VALID_PLANS = ["free", "pro", "premium"] as const;
const VALID_ROLES = ["talent", "agency", "admin"] as const;

type Plan = typeof VALID_PLANS[number];
type Role = typeof VALID_ROLES[number];

function isMissingPlanStatusColumn(error: { message?: string } | null) {
  return !!error?.message?.includes("plan_status");
}

// PATCH /api/admin/users/plan
// Body: { user_id, plan?, role? }
// Admin-only: bypasses payment, sets plan and/or role.
export async function PATCH(req: NextRequest) {
  const session = await createSessionClient();
  const {
    data: { user },
  } = await session.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  const { data: caller } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (caller?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as { user_id: string; plan?: Plan; role?: Role };
  const { user_id, plan, role } = body;

  if (!user_id) {
    return NextResponse.json({ error: "invalid_params" }, { status: 400 });
  }

  if (plan && !VALID_PLANS.includes(plan)) {
    return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
  }

  if (role && !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "invalid_role" }, { status: 400 });
  }

  if (role) {
    const { error } = await supabase.from("profiles").update({ role }).eq("id", user_id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (role === "agency") {
      await supabase.from("agencies").upsert({ id: user_id }, { onConflict: "id", ignoreDuplicates: true });
    }
  }

  if (plan) {
    const isFree = plan === "free";
    const planStatus = isFree ? "inactive" : "active";
    const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);

    const primaryUpdate = await supabase
      .from("profiles")
      .update({ plan, plan_status: planStatus })
      .eq("id", user_id);

    if (primaryUpdate.error && !isMissingPlanStatusColumn(primaryUpdate.error)) {
      return NextResponse.json({ error: primaryUpdate.error.message }, { status: 500 });
    }

    if (isMissingPlanStatusColumn(primaryUpdate.error)) {
      const fallbackUpdate = await supabase
        .from("profiles")
        .update({ plan })
        .eq("id", user_id);

      if (fallbackUpdate.error) {
        return NextResponse.json({ error: fallbackUpdate.error.message }, { status: 500 });
      }
    }

    const agencyUpdate = await supabase
      .from("agencies")
      .update({ subscription_status: planStatus })
      .eq("id", user_id);

    if (agencyUpdate.error) {
      console.warn("[admin/plan] agency subscription_status update failed:", agencyUpdate.error.message);
    }

    const { error: txError } = await supabase.from("wallet_transactions").insert({
      user_id,
      type: "admin_grant",
      amount: 0,
      description: `Plano ${planLabel} - ativado por admin (R$0)`,
    });

    if (txError) {
      console.error("[admin/plan] tx insert failed:", txError.message);
    }
  }

  return NextResponse.json({ ok: true });
}
