import { NextRequest, NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import { ensureAsaasCustomer } from "@/lib/asaasCustomer";
import { createSubscription, getSubscriptionPayments } from "@/lib/asaas";
import { parsePlan, PLAN_KEYS, type Plan } from "@/lib/plans";
import { isValidCpfCnpj, normalizeCpfCnpj, digitsOnly } from "@/lib/cpf";

function extractAsaasError(err: unknown): string {
  try {
    const raw = err instanceof Error ? err.message : JSON.stringify(err);
    const parsed = JSON.parse(raw) as { errors?: { description?: string }[] };
    const desc = parsed?.errors?.[0]?.description;
    if (desc) return desc;
  } catch { /* ignore */ }
  return err instanceof Error ? err.message : String(err);
}

export async function POST(req: NextRequest) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const requestedBodyPlan = String(body.plan ?? "").trim().toLowerCase();

  if (!PLAN_KEYS.includes(requestedBodyPlan as Plan)) {
    return NextResponse.json({ error: "Plano inválido." }, { status: 400 });
  }

  const requestedPlan = parsePlan(requestedBodyPlan);
  const supabase = createServerClient({ useServiceRole: true });

  const { data: planSetting, error: planSettingError } = await supabase
    .from("plan_settings")
    .select("plan_key, name, price, commission_percent, is_available, job_limit, max_hires_per_job")
    .eq("plan_key", requestedPlan)
    .maybeSingle();

  if (planSettingError) {
    console.error("[asaas/plan/checkout] failed to load plan_settings:", planSettingError.message);
    return NextResponse.json({ error: "Plano inválido." }, { status: 400 });
  }
  if (!planSetting) {
    return NextResponse.json({ error: "Plano inválido." }, { status: 400 });
  }
  if (!Boolean(planSetting.is_available)) {
    return NextResponse.json({ error: "Este plano ainda não está disponível." }, { status: 422 });
  }

  const planPrice = Number(planSetting.price);
  if (!Number.isFinite(planPrice) || planPrice <= 0) {
    return NextResponse.json({ error: "Este plano não requer checkout." }, { status: 400 });
  }

  const [{ data: profileRow }, { data: agencyRow }] = await Promise.all([
    supabase.from("profiles").select("full_name, cpf_cnpj, asaas_subscription_id").eq("id", user.id).single(),
    supabase.from("agencies").select("phone").eq("id", user.id).maybeSingle(),
  ]);

  const profileRaw = profileRow as Record<string, unknown> | null;
  const name = (profileRaw?.full_name as string | undefined) ?? "Agência";
  const planLabel = String(planSetting.name ?? requestedPlan);

  const existingSubId = (profileRaw?.asaas_subscription_id as string | null) ?? null;
  if (existingSubId) {
    try {
      const payments = await getSubscriptionPayments(existingSubId);
      const pending = (payments.data ?? []).find((p) => p.status === "PENDING");
      if (pending?.invoiceUrl) {
        console.log("[asaas/plan/checkout] returning pending payment for existing subscription", {
          userId: user.id,
          plan: requestedPlan,
          subscriptionId: existingSubId,
          paymentId: pending.id,
        });
        return NextResponse.json({ url: pending.invoiceUrl });
      }
      console.log("[asaas/plan/checkout] existing subscription has no pending payment - plan likely already active", {
        userId: user.id,
        plan: requestedPlan,
        subscriptionId: existingSubId,
      });
      return NextResponse.json(
        { error: "Sua assinatura já está ativa. Acesse a página de cobrança para gerenciá-la." },
        { status: 409 },
      );
    } catch (err) {
      console.warn("[asaas/plan/checkout] existing subscription not found in Asaas - creating new", {
        userId: user.id,
        plan: requestedPlan,
        subscriptionId: existingSubId,
        err: String(err),
      });
    }
  }

  const rawDoc = (body.cpfCnpj as string | undefined) ?? (profileRaw?.cpf_cnpj as string | undefined) ?? "";
  const cleanDoc = normalizeCpfCnpj(rawDoc);

  if (!isValidCpfCnpj(cleanDoc)) {
    console.error("[asaas/plan/checkout] invalid CPF/CNPJ:", { rawDoc, userId: user.id });
    return NextResponse.json(
      { error: "CPF/CNPJ inválido. Verifique os números e tente novamente." },
      { status: 400 },
    );
  }

  const rawPhone = (agencyRow as Record<string, unknown> | null)?.phone as string | undefined;
  const mobilePhone = rawPhone ? digitsOnly(rawPhone) : undefined;

  let customerId: string;
  try {
    customerId = await ensureAsaasCustomer(user.id, name, user.email ?? "", cleanDoc, mobilePhone);
  } catch (err) {
    const desc = extractAsaasError(err);
    console.error("[asaas/plan/checkout] ensureAsaasCustomer failed:", desc);
    return NextResponse.json(
      { error: desc || "Não foi possível criar o cliente no Asaas. Confira CPF/CNPJ, telefone e e-mail." },
      { status: 500 },
    );
  }

  // 7-day free trial: card is captured on the Asaas hosted page but the
  // first charge is deferred to day 8. This satisfies "card required upfront".
  const trialStartedAt = new Date();
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 7);
  const nextDueDate = new Date();
  nextDueDate.setDate(nextDueDate.getDate() + 7);
  const nextDueDateStr = nextDueDate.toISOString().slice(0, 10);

  let subscription: Awaited<ReturnType<typeof createSubscription>>;
  try {
    subscription = await createSubscription({
      customer: customerId,
      billingType: "CREDIT_CARD",
      value: planPrice,
      nextDueDate: nextDueDateStr,
      cycle: "MONTHLY",
      description: `Assinatura ${planLabel} - BrisaHub`,
      externalReference: `plan:${requestedPlan}:${user.id}`,
    });
  } catch (err) {
    const desc = extractAsaasError(err);
    console.error("[asaas/plan/checkout] createSubscription failed:", desc);
    return NextResponse.json({ error: desc || "Erro ao criar assinatura. Tente novamente." }, { status: 500 });
  }

  let invoiceUrl: string | undefined;
  let firstPaymentId: string | undefined;
  try {
    const payments = await getSubscriptionPayments(subscription.id);
    const firstPayment = payments.data?.[0];
    invoiceUrl = firstPayment?.invoiceUrl;
    firstPaymentId = firstPayment?.id;
  } catch (err) {
    console.error("[asaas/plan/checkout] getSubscriptionPayments failed:", String(err));
  }

  if (!invoiceUrl) {
    console.error("[asaas/plan/checkout] no invoiceUrl for subscription first payment", {
      plan: requestedPlan,
      subscriptionId: subscription.id,
    });
    return NextResponse.json({ error: "Erro ao obter link de pagamento." }, { status: 500 });
  }

  const { error: subUpdateErr } = await supabase
    .from("profiles")
    .update({
      plan:                  requestedPlan,
      plan_status:           "trialing",
      asaas_subscription_id: subscription.id,
      trial_started_at:      trialStartedAt.toISOString(),
      trial_ends_at:         trialEndsAt.toISOString(),
      subscription_provider: "asaas",
    } as Record<string, unknown>)
    .eq("id", user.id);

  if (subUpdateErr) {
    console.error("[asaas/plan/checkout] failed to store subscription id (non-fatal)", {
      userId: user.id,
      plan: requestedPlan,
      subscriptionId: subscription.id,
      err: subUpdateErr.message,
    });
  }

  if (firstPaymentId) {
    const { error: chargeErr } = await supabase.from("wallet_transactions").insert({
      user_id: user.id,
      type: "plan_charge",
      amount: planPrice,
      description: `Assinatura ${planLabel} - BrisaHub`,
      payment_id: firstPaymentId,
      provider: "asaas",
      status: "pending",
    } as Record<string, unknown>);

    if (chargeErr && chargeErr.code !== "23505") {
      console.error("[asaas/plan/checkout] plan_charge insert failed (non-fatal)", {
        userId: user.id,
        plan: requestedPlan,
        paymentId: firstPaymentId,
        err: chargeErr.message,
      });
    }
  }

  console.log("[asaas/plan/checkout] subscription created", {
    userId: user.id,
    plan: requestedPlan,
    price: planPrice,
    subscriptionId: subscription.id,
    firstPaymentId,
  });

  return NextResponse.json({ url: invoiceUrl });
}
