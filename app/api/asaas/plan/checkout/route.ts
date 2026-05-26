import { NextRequest, NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import { ensureAsaasCustomer } from "@/lib/asaasCustomer";
import { createSubscription, getSubscriptionPayments } from "@/lib/asaas";
import {
  fetchAgencySubscriptionProfile,
  startAgencyPlanTrial,
  syncAgencyLegacySubscriptionStatus,
  updateAgencySubscriptionProfile,
} from "@/lib/asaasPlanSync.server";
import { parsePlan, PLAN_KEYS, type Plan } from "@/lib/plans";
import { isValidCpfCnpj, normalizeCpfCnpj, digitsOnly } from "@/lib/cpf";
import { getPlatformSettings } from "@/lib/platformSettings.server";
import { getRequestIp } from "@/lib/rateLimit";

type ProCheckoutInput = {
  holderName: string;
  cpfCnpj: string;
  phone: string;
  postalCode: string;
  addressNumber: string;
  addressComplement: string;
  cardNumber: string;
  expiryMonth: string;
  expiryYear: string;
  ccv: string;
};

function extractAsaasError(err: unknown): string {
  try {
    const raw = err instanceof Error ? err.message : JSON.stringify(err);
    const parsed = JSON.parse(raw) as { errors?: { description?: string }[] };
    const desc = parsed?.errors?.[0]?.description;
    if (desc) return desc;
  } catch {
    // ignore malformed payloads
  }
  return err instanceof Error ? err.message : String(err);
}

function parseCheckoutInput(body: Record<string, unknown>): ProCheckoutInput {
  const expiryYearRaw = String(body.expiryYear ?? "").trim();
  const normalizedYear = expiryYearRaw.length === 2 ? `20${expiryYearRaw}` : expiryYearRaw;

  return {
    holderName: String(body.holderName ?? "").trim(),
    cpfCnpj: normalizeCpfCnpj(String(body.cpfCnpj ?? "").trim()),
    phone: digitsOnly(String(body.phone ?? "")),
    postalCode: digitsOnly(String(body.postalCode ?? "")).slice(0, 8),
    addressNumber: String(body.addressNumber ?? "").trim(),
    addressComplement: String(body.addressComplement ?? "").trim(),
    cardNumber: digitsOnly(String(body.cardNumber ?? "")),
    expiryMonth: digitsOnly(String(body.expiryMonth ?? "")).slice(0, 2),
    expiryYear: digitsOnly(normalizedYear).slice(0, 4),
    ccv: digitsOnly(String(body.ccv ?? "")).slice(0, 4),
  };
}

function validateProCheckoutInput(input: ProCheckoutInput) {
  if (input.holderName.length < 2) return "Informe o nome do titular como no cartao.";
  if (!isValidCpfCnpj(input.cpfCnpj)) return "CPF/CNPJ do titular invalido.";
  if (input.phone.length < 10) return "Informe um telefone valido do titular.";
  if (input.postalCode.length !== 8) return "Informe um CEP valido com 8 digitos.";
  if (!input.addressNumber) return "Informe o numero do endereco do titular.";
  if (input.cardNumber.length < 13) return "Informe um numero de cartao valido.";
  if (!input.expiryMonth || Number(input.expiryMonth) < 1 || Number(input.expiryMonth) > 12) {
    return "Informe um mes de validade valido.";
  }
  if (input.expiryYear.length !== 4) return "Informe um ano de validade valido.";
  if (input.ccv.length < 3) return "Informe um codigo de seguranca valido.";
  return null;
}

export async function POST(req: NextRequest) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const requestedBodyPlan = String(body.plan ?? "").trim().toLowerCase();

  if (!PLAN_KEYS.includes(requestedBodyPlan as Plan)) {
    return NextResponse.json({ error: "Plano invalido." }, { status: 400 });
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
    return NextResponse.json({ error: "Plano invalido." }, { status: 400 });
  }
  if (!planSetting) {
    return NextResponse.json({ error: "Plano invalido." }, { status: 400 });
  }
  if (!Boolean(planSetting.is_available)) {
    return NextResponse.json({ error: "Este plano ainda nao esta disponivel." }, { status: 422 });
  }

  const planPrice = Number(planSetting.price);
  if (!Number.isFinite(planPrice) || planPrice <= 0) {
    return NextResponse.json({ error: "Este plano nao requer checkout." }, { status: 400 });
  }

  const [profileResult, agencyResult, subscriptionProfile, platformSettings] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, cpf_cnpj")
      .eq("id", user.id)
      .single(),
    supabase
      .from("agencies")
      .select("phone, contact_name")
      .eq("id", user.id)
      .maybeSingle(),
    fetchAgencySubscriptionProfile(supabase, user.id),
    getPlatformSettings(["trials_enabled", "trial_duration_days", "trial_auto_charge_enabled"]),
  ]);

  const profileRaw = (profileResult.data ?? null) as Record<string, unknown> | null;
  const agencyRaw = (agencyResult.data ?? null) as Record<string, unknown> | null;
  const holderDefaultName =
    String(agencyRaw?.contact_name ?? "").trim() ||
    String(profileRaw?.full_name ?? "").trim() ||
    "Agencia";
  const planLabel = String(planSetting.name ?? requestedPlan);

  const existingSubId = subscriptionProfile?.asaas_subscription_id ?? null;
  const currentStatus = String(subscriptionProfile?.plan_status ?? "").toLowerCase();
  if (existingSubId && (currentStatus === "trialing" || currentStatus === "active")) {
    return NextResponse.json(
      { error: "Sua assinatura ja esta em andamento. Acesse a pagina de cobranca para gerencia-la." },
      { status: 409 },
    );
  }

  const rawDoc =
    requestedPlan === "pro"
      ? String(body.cpfCnpj ?? "").trim() || String(profileRaw?.cpf_cnpj ?? "").trim()
      : String(profileRaw?.cpf_cnpj ?? "").trim();
  const cleanDoc = normalizeCpfCnpj(rawDoc);

  if (!isValidCpfCnpj(cleanDoc)) {
    return NextResponse.json(
      { error: "CPF/CNPJ invalido. Verifique os numeros e tente novamente." },
      { status: 400 },
    );
  }

  const rawPhone = requestedPlan === "pro"
    ? String(body.phone ?? "").trim() || String(agencyRaw?.phone ?? "").trim()
    : String(agencyRaw?.phone ?? "").trim();
  const mobilePhone = rawPhone ? digitsOnly(rawPhone) : undefined;

  let customerId: string;
  try {
    customerId = await ensureAsaasCustomer(user.id, holderDefaultName, user.email ?? "", cleanDoc, mobilePhone);
  } catch (err) {
    const desc = extractAsaasError(err);
    console.error("[asaas/plan/checkout] ensureAsaasCustomer failed:", desc);
    return NextResponse.json(
      { error: desc || "Nao foi possivel criar o cliente no Asaas. Confira CPF/CNPJ, telefone e e-mail." },
      { status: 500 },
    );
  }

  if (requestedPlan !== "pro") {
    if (existingSubId) {
      try {
        const payments = await getSubscriptionPayments(existingSubId);
        const pending = (payments.data ?? []).find((payment) => payment.status === "PENDING");
        if (pending?.invoiceUrl) {
          return NextResponse.json({ url: pending.invoiceUrl });
        }
      } catch (err) {
        console.warn("[asaas/plan/checkout] existing non-PRO subscription not found in Asaas - creating new", {
          userId: user.id,
          plan: requestedPlan,
          subscriptionId: existingSubId,
          err: String(err),
        });
      }
    }

    const nextDueDateStr = new Date().toISOString().slice(0, 10);

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
      return NextResponse.json({ error: "Erro ao obter link de pagamento." }, { status: 500 });
    }

    await updateAgencySubscriptionProfile(supabase, user.id, {
      asaas_customer_id: customerId,
      asaas_subscription_id: subscription.id,
      subscription_provider: "asaas",
    });

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
        console.error("[asaas/plan/checkout] premium plan_charge insert failed (non-fatal)", {
          userId: user.id,
          paymentId: firstPaymentId,
          err: chargeErr.message,
        });
      }
    }

    return NextResponse.json({ url: invoiceUrl });
  }

  const checkoutInput = parseCheckoutInput({
    ...body,
    holderName: body.holderName ?? holderDefaultName,
    cpfCnpj: body.cpfCnpj ?? cleanDoc,
    phone: body.phone ?? rawPhone,
  });
  const validationError = validateProCheckoutInput(checkoutInput);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const trialsEnabled = Boolean(platformSettings.trials_enabled ?? true);
  const trialAutoChargeEnabled = Boolean(platformSettings.trial_auto_charge_enabled ?? true);
  const trialDurationDays = Math.max(1, Number(platformSettings.trial_duration_days ?? 7));
  const trialDays = trialsEnabled && trialAutoChargeEnabled ? trialDurationDays : 0;
  const now = new Date();
  const trialEndsAt = new Date(now.getTime());
  trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);
  const nextDueDateStr = (trialDays > 0 ? trialEndsAt : now).toISOString().slice(0, 10);
  const remoteIp = getRequestIp(req);

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
      creditCard: {
        holderName: checkoutInput.holderName,
        number: checkoutInput.cardNumber,
        expiryMonth: checkoutInput.expiryMonth,
        expiryYear: checkoutInput.expiryYear,
        ccv: checkoutInput.ccv,
      },
      creditCardHolderInfo: {
        name: checkoutInput.holderName,
        email: user.email ?? "",
        cpfCnpj: checkoutInput.cpfCnpj,
        postalCode: checkoutInput.postalCode,
        addressNumber: checkoutInput.addressNumber,
        addressComplement: checkoutInput.addressComplement || null,
        phone: checkoutInput.phone,
        mobilePhone: checkoutInput.phone,
      },
      remoteIp: remoteIp === "unknown" ? "127.0.0.1" : remoteIp,
    });
  } catch (err) {
    const desc = extractAsaasError(err);
    console.error("[asaas/plan/checkout] createSubscription with card failed:", desc);
    return NextResponse.json({ error: desc || "Nao foi possivel validar o cartao." }, { status: 500 });
  }

  let firstPaymentId: string | undefined;
  try {
    const payments = await getSubscriptionPayments(subscription.id);
    firstPaymentId = payments.data?.[0]?.id;
  } catch (err) {
    console.error("[asaas/plan/checkout] getSubscriptionPayments failed:", String(err));
  }

  if (trialDays > 0) {
    const trialStartedAt = now.toISOString();
    const trialEndsAtIso = trialEndsAt.toISOString();

    await startAgencyPlanTrial({
      supabase,
      userId: user.id,
      planKey: "pro",
      customerId,
      subscriptionId: subscription.id,
      paymentId: firstPaymentId,
      paymentValue: planPrice,
      trialStartedAt,
      trialEndsAt: trialEndsAtIso,
    });

    console.log("[asaas/plan/checkout] pro trial started", {
      userId: user.id,
      plan: requestedPlan,
      price: planPrice,
      billingMode: "trialing",
      nextDueDate: nextDueDateStr,
      trialEndsAt: trialEndsAtIso,
      subscriptionId: subscription.id,
      firstPaymentId,
    });

    return NextResponse.json({
      ok: true,
      mode: "trialing",
      plan: "pro",
      planStatus: "trialing",
      trialEndsAt: trialEndsAtIso,
      nextChargeDate: trialEndsAtIso,
      subscriptionId: subscription.id,
      paymentId: firstPaymentId ?? null,
    });
  }

  await updateAgencySubscriptionProfile(supabase, user.id, {
    plan: "pro",
    plan_status: "pending",
    plan_expires_at: nextDueDateStr,
    asaas_customer_id: customerId,
    asaas_subscription_id: subscription.id,
    subscription_provider: "asaas",
    trial_started_at: null,
    trial_ends_at: null,
  });
  await syncAgencyLegacySubscriptionStatus(supabase, user.id, "pending");

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
      console.error("[asaas/plan/checkout] immediate pro plan_charge insert failed (non-fatal)", {
        userId: user.id,
        paymentId: firstPaymentId,
        err: chargeErr.message,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    mode: "pending_confirmation",
    plan: "pro",
    planStatus: "pending",
    nextChargeDate: nextDueDateStr,
    subscriptionId: subscription.id,
    paymentId: firstPaymentId ?? null,
  });
}
