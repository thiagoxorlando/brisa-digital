import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/requireAdmin";
import { logAdminAction } from "@/lib/auditLog";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const userId = String(body.userId ?? "").trim();
  const extraDays = Number(body.days ?? 0);

  if (!userId) return NextResponse.json({ error: "userId obrigatório." }, { status: 400 });
  if (!Number.isFinite(extraDays) || extraDays < 1 || extraDays > 365) {
    return NextResponse.json({ error: "days deve ser entre 1 e 365." }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  const { data: profile, error: fetchErr } = await supabase
    .from("profiles")
    .select("plan, plan_status, trial_ends_at, trial_started_at")
    .eq("id", userId)
    .single();

  if (fetchErr || !profile) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  }

  const profileData = profile as Record<string, unknown>;

  // Extend from current trial_ends_at if in trial, otherwise from now
  const baseDate = profileData.trial_ends_at
    ? new Date(profileData.trial_ends_at as string)
    : new Date();

  // Don't extend past a date that's already in the future by more than a year
  const now = new Date();
  if (baseDate.getTime() > now.getTime() + 365 * 86400 * 1000) {
    return NextResponse.json({ error: "Trial já estendido ao máximo." }, { status: 422 });
  }

  const newTrialEndsAt = new Date(baseDate);
  newTrialEndsAt.setDate(newTrialEndsAt.getDate() + extraDays);

  const patch: Record<string, unknown> = {
    trial_ends_at: newTrialEndsAt.toISOString(),
    plan_status: "trialing",
  };

  // If no trial_started_at, set it to now (converting a non-trial to trial)
  if (!profileData.trial_started_at) {
    patch.trial_started_at = now.toISOString();
  }

  const { error: updateErr } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId);

  if (updateErr) {
    console.error("[admin/trial/extend] update failed:", updateErr.message);
    return NextResponse.json({ error: "Erro ao estender trial." }, { status: 500 });
  }

  await logAdminAction({
    adminId: auth.userId,
    action: "trial_extended",
    entityType: "profile",
    entityId: userId,
    before: {
      trial_ends_at: profileData.trial_ends_at,
      plan_status: profileData.plan_status,
    },
    after: {
      trial_ends_at: newTrialEndsAt.toISOString(),
      plan_status: "trialing",
      extra_days_granted: extraDays,
    },
  });

  return NextResponse.json({
    success: true,
    newTrialEndsAt: newTrialEndsAt.toISOString(),
    extraDaysGranted: extraDays,
  });
}
