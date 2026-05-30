import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { createServerClient } from "@/lib/supabase";
import { updateSubscription } from "@/lib/asaas";
import { notify } from "@/lib/notify";
import { logAdminAction } from "@/lib/auditLog";

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = createServerClient({ useServiceRole: true });
  const { data, error } = await supabase
    .from("plan_settings")
    .select("plan_key, name, price, commission_percent, is_available, job_limit, max_hires_per_job, included_agent_seats, extra_agent_seat_price, trial_days, intro_price, intro_cycles, recurring_price, currency")
    .order("plan_key");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

const VALID_PLAN_KEYS = ["free", "pro", "premium"] as const;

function brlFormat(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function planLabel(key: string) {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null) as unknown;
  if (!Array.isArray(body)) {
    return NextResponse.json({ error: "Body must be an array of plan settings." }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  // Fetch all current settings before making any changes
  const { data: currentRows } = await supabase
    .from("plan_settings")
    .select("plan_key, name, price, commission_percent, is_available, job_limit, max_hires_per_job, included_agent_seats, extra_agent_seat_price, trial_days, intro_price, intro_cycles, recurring_price, currency");

  const currentMap = new Map(
    (currentRows ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return [
        row.plan_key as string,
        {
          price: Number(row.price),
          commission_percent: Number(row.commission_percent),
          is_available: Boolean(row.is_available),
          job_limit: (row.job_limit as number | null) ?? null,
          max_hires_per_job: (row.max_hires_per_job as number | null) ?? null,
          included_agent_seats: (row.included_agent_seats as number | null) ?? null,
          extra_agent_seat_price: (row.extra_agent_seat_price as number | null) ?? null,
          name: String(row.name ?? row.plan_key),
          trial_days: Number(r.trial_days ?? 0),
          intro_price: Number(r.intro_price ?? 0),
          intro_cycles: Number(r.intro_cycles ?? 0),
          recurring_price: Number(r.recurring_price ?? 0),
          currency: (r.currency === "USD" || r.currency === "BRL") ? r.currency : "USD",
        },
      ];
    }),
  );

  for (const setting of body as Record<string, unknown>[]) {
    const planKey = setting.plan_key as string;
    if (!VALID_PLAN_KEYS.includes(planKey as (typeof VALID_PLAN_KEYS)[number])) {
      return NextResponse.json({ error: `Invalid plan_key: ${planKey}` }, { status: 400 });
    }

    const price = Number(setting.price);
    const commission = Number(setting.commission_percent);
    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: "price must be a non-negative number." }, { status: 400 });
    }
    if (!Number.isFinite(commission) || commission < 0 || commission > 100) {
      return NextResponse.json({ error: "commission_percent must be between 0 and 100." }, { status: 400 });
    }

    const jobLimitRaw = setting.job_limit;
    const jobLimit =
      jobLimitRaw === null || jobLimitRaw === undefined || jobLimitRaw === ""
        ? null
        : Number(jobLimitRaw);
    const maxHiresRaw = setting.max_hires_per_job;
    const maxHiresPerJob =
      maxHiresRaw === null || maxHiresRaw === undefined || maxHiresRaw === ""
        ? null
        : Number(maxHiresRaw);
    if (jobLimit !== null && (!Number.isFinite(jobLimit) || jobLimit < 1)) {
      return NextResponse.json({ error: "job_limit must be null or at least 1." }, { status: 400 });
    }
    if (maxHiresPerJob !== null && (!Number.isFinite(maxHiresPerJob) || maxHiresPerJob < 1)) {
      return NextResponse.json({ error: "max_hires_per_job must be null or at least 1." }, { status: 400 });
    }

    const includedSeatsRaw = setting.included_agent_seats;
    const includedAgentSeats =
      includedSeatsRaw === null || includedSeatsRaw === undefined || includedSeatsRaw === ""
        ? null
        : Number(includedSeatsRaw);
    const extraSeatPriceRaw = setting.extra_agent_seat_price;
    const extraAgentSeatPrice =
      extraSeatPriceRaw === null || extraSeatPriceRaw === undefined || extraSeatPriceRaw === ""
        ? null
        : Number(extraSeatPriceRaw);

    if (includedAgentSeats !== null && (!Number.isInteger(includedAgentSeats) || includedAgentSeats < 0)) {
      return NextResponse.json({ error: "included_agent_seats must be null or a non-negative integer." }, { status: 400 });
    }
    if (extraAgentSeatPrice !== null && (!Number.isFinite(extraAgentSeatPrice) || extraAgentSeatPrice < 0)) {
      return NextResponse.json({ error: "extra_agent_seat_price must be null or a non-negative number." }, { status: 400 });
    }

    const trialDays = Math.max(0, Math.floor(Number(setting.trial_days ?? 0)));
    const introPrice = Math.max(0, Number(setting.intro_price ?? 0));
    const introCycles = Math.max(0, Math.floor(Number(setting.intro_cycles ?? 0)));
    const recurringPrice = Math.max(0, Number(setting.recurring_price ?? 0));
    const currency = setting.currency === "BRL" ? "BRL" : "USD";

    if (!Number.isFinite(trialDays)) {
      return NextResponse.json({ error: "trial_days must be a non-negative integer." }, { status: 400 });
    }
    if (!Number.isFinite(introPrice)) {
      return NextResponse.json({ error: "intro_price must be a non-negative number." }, { status: 400 });
    }
    if (!Number.isFinite(introCycles)) {
      return NextResponse.json({ error: "intro_cycles must be a non-negative integer." }, { status: 400 });
    }
    if (!Number.isFinite(recurringPrice)) {
      return NextResponse.json({ error: "recurring_price must be a non-negative number." }, { status: 400 });
    }

    const current = currentMap.get(planKey);
    if (!current) {
      return NextResponse.json({ error: `Plan settings for "${planKey}" not found. Run the migration first.` }, { status: 404 });
    }

    const newIsAvailable = Boolean(setting.is_available);
    const newName = String(setting.name ?? planKey);

    const nameChanged = newName !== current.name;
    const priceChanged = price !== current.price;
    const commissionChanged = commission !== current.commission_percent;
    const availabilityChanged = newIsAvailable !== current.is_available;
    const jobLimitChanged = jobLimit !== current.job_limit;
    const maxHiresChanged = maxHiresPerJob !== current.max_hires_per_job;
    const includedSeatsChanged = includedAgentSeats !== current.included_agent_seats;
    const extraSeatPriceChanged = extraAgentSeatPrice !== current.extra_agent_seat_price;
    const trialDaysChanged = trialDays !== current.trial_days;
    const introPriceChanged = introPrice !== current.intro_price;
    const introCyclesChanged = introCycles !== current.intro_cycles;
    const recurringPriceChanged = recurringPrice !== current.recurring_price;
    const currencyChanged = currency !== (current as Record<string, unknown>).currency;
    const anythingChanged =
      nameChanged ||
      priceChanged ||
      commissionChanged ||
      availabilityChanged ||
      jobLimitChanged ||
      maxHiresChanged ||
      includedSeatsChanged ||
      extraSeatPriceChanged ||
      trialDaysChanged ||
      introPriceChanged ||
      introCyclesChanged ||
      recurringPriceChanged ||
      currencyChanged;

    // 1. Update the plan_settings row
    const { error: updateError } = await supabase
      .from("plan_settings")
      .update({
        name: newName,
        price,
        commission_percent: commission,
        is_available: newIsAvailable,
        job_limit: jobLimit,
        max_hires_per_job: maxHiresPerJob,
        included_agent_seats: includedAgentSeats,
        extra_agent_seat_price: extraAgentSeatPrice,
        trial_days: trialDays,
        intro_price: introPrice,
        intro_cycles: introCycles,
        recurring_price: recurringPrice,
        currency,
        updated_at: new Date().toISOString(),
      } as Record<string, unknown>)
      .eq("plan_key", planKey);

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    await logAdminAction({
      adminId: auth.userId,
      action: "plan_settings_changed",
      entityType: "plan_settings",
      entityId: planKey,
      before: current,
      after: {
        ...current,
        name: newName,
        price,
        commission_percent: commission,
        is_available: newIsAvailable,
        job_limit: jobLimit,
        max_hires_per_job: maxHiresPerJob,
        included_agent_seats: includedAgentSeats,
        extra_agent_seat_price: extraAgentSeatPrice,
        trial_days: trialDays,
        intro_price: introPrice,
        intro_cycles: introCycles,
        recurring_price: recurringPrice,
        currency,
      },
    });

    // 2. Insert audit record
    if (anythingChanged) {
      const { error: historyError } = await supabase
        .from("plan_settings_history")
        .insert({
          plan_key: planKey,
          changed_by: auth.userId,
          old_price: current.price,
          new_price: price,
          old_commission_percent: current.commission_percent,
          new_commission_percent: commission,
          old_is_available: current.is_available,
          new_is_available: newIsAvailable,
          old_job_limit: current.job_limit,
          new_job_limit: jobLimit,
          old_included_agent_seats: current.included_agent_seats,
          new_included_agent_seats: includedAgentSeats,
          old_extra_agent_seat_price: current.extra_agent_seat_price,
          new_extra_agent_seat_price: extraAgentSeatPrice,
        } as Record<string, unknown>);

      if (historyError) {
        console.error("[plan-settings/patch] audit insert failed (non-fatal):", historyError.message);
      }
    }

    // 3. If price changed for a paid plan: update Asaas subscriptions + notify agencies
    if (priceChanged && planKey !== "free") {
      const { data: affectedProfiles } = await supabase
        .from("profiles")
        .select("id, asaas_subscription_id, plan_expires_at")
        .eq("plan", planKey)
        .in("plan_status", ["active", "trialing"])
        .not("asaas_subscription_id", "is", null);

      const affected = (affectedProfiles ?? []) as {
        id: string;
        asaas_subscription_id: string;
        plan_expires_at: string | null;
      }[];

      if (affected.length > 0) {
        // Notify all affected agencies
        const affectedIds = affected.map((a) => a.id);
        const nextBillingNote =
          affected[0].plan_expires_at
            ? ` na renovação de ${new Date(affected[0].plan_expires_at).toLocaleDateString("pt-BR")}`
            : " na próxima renovação";

        const message = `O preço do plano ${planLabel(planKey)} foi atualizado de ${brlFormat(current.price)} para ${brlFormat(price)}. O novo valor será cobrado${nextBillingNote}.`;

        await notify(affectedIds, "plan_price_change", message, "/agency/billing").catch((err) => {
          console.error("[plan-settings/patch] notify failed (non-fatal):", err);
        });

        // Update Asaas subscription for each affected agency
        if (price > 0) {
          for (const profile of affected) {
            try {
              await updateSubscription(profile.asaas_subscription_id, { value: price });
              console.log(`[plan-settings/patch] Updated Asaas sub ${profile.asaas_subscription_id} → ${price} for agency ${profile.id}`);
            } catch (err) {
              console.error(`[plan-settings/patch] Asaas update failed for sub ${profile.asaas_subscription_id} (non-fatal):`, String(err));
            }
          }
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
