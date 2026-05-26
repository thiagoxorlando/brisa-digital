/**
 * POST /api/auth/signup-pro
 *
 * Finalises an atomic PRO agency signup.
 * The caller (client) must have an active Supabase session BEFORE calling this
 * endpoint — it calls supabase.auth.signUp() client-side first to get a userId,
 * then passes control here.
 *
 * Steps:
 *   1. Verify authenticated session
 *   2. Guard: no existing profile (idempotent retry is safe)
 *   3. Create minimal profile row (required by ensureAsaasCustomer)
 *   4. Create Asaas customer + subscription with card
 *   5. On Asaas failure → delete profile → return real Asaas error
 *   6. On success → finalize profile + create agency + start trial
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { ensureAsaasCustomer } from "@/lib/asaasCustomer";
import { createSubscription, getSubscriptionPayments } from "@/lib/asaas";
import {
  startAgencyPlanTrial,
  updateAgencySubscriptionProfile,
  syncAgencyLegacySubscriptionStatus,
} from "@/lib/asaasPlanSync.server";
import { getPlatformSettings } from "@/lib/platformSettings.server";
import { isValidCpfCnpj, normalizeCpfCnpj, digitsOnly } from "@/lib/cpf";
import { buildRateLimitKey, checkRateLimit, getRequestIp } from "@/lib/rateLimit";

const TERMS_VERSION = "terms_v1_2026_05";

async function deleteProfile(supabase: ReturnType<typeof createServerClient>, userId: string) {
  try {
    await supabase.from("profiles").delete().eq("id", userId);
  } catch (e) {
    console.warn("[signup-pro] cleanup profile delete failed:", String(e));
  }
}

export async function POST(req: NextRequest) {
  try {
    return await handleSignupPro(req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[signup-pro] unhandled error:", msg);
    return NextResponse.json({ error: `Erro interno: ${msg}` }, { status: 500 });
  }
}

async function handleSignupPro(req: NextRequest) {
  // ── Auth check ────────────────────────────────────────────────────────────
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sessão não encontrada. Recarregue a página e tente novamente." }, { status: 401 });
  }

  const supabase = createServerClient({ useServiceRole: true });
  const ip = getRequestIp(req);

  const rl = checkRateLimit({
    key: buildRateLimitKey("signup-pro", ip, user.id),
    limit: 10,
    windowMs: 15 * 60 * 1000,
    message: "Muitas tentativas. Tente novamente em alguns minutos.",
  });
  if (rl) return rl;

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const termsAccepted = body.termsAccepted === true;
  const agencyData = (body.agency ?? {}) as Record<string, unknown>;
  const cardData   = (body.card   ?? {}) as Record<string, unknown>;

  if (!termsAccepted) {
    return NextResponse.json({ error: "Você precisa aceitar os Termos de Uso para continuar." }, { status: 400 });
  }

  const agencyName      = String(agencyData.agencyName      ?? "").trim();
  const responsibleName = String(agencyData.responsibleName ?? "").trim();
  const agencyCpfCnpj   = normalizeCpfCnpj(String(agencyData.cpfCnpj ?? "").trim());
  const agencyPhone     = String(agencyData.phone ?? "").trim();

  if (!agencyName || !responsibleName || !agencyPhone) {
    return NextResponse.json({ error: "Preencha todos os campos obrigatórios da agência." }, { status: 400 });
  }
  if (!isValidCpfCnpj(agencyCpfCnpj)) {
    return NextResponse.json({ error: "CPF/CNPJ inválido." }, { status: 400 });
  }

  // ── Guard: if profile with role already exists, this is a duplicate call ──
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("role, plan")
    .eq("id", user.id)
    .maybeSingle();

  if (existingProfile?.role && existingProfile.role !== "agency") {
    return NextResponse.json({ error: "Conta já configurada com outro tipo de acesso." }, { status: 409 });
  }
  if (existingProfile?.plan && existingProfile.plan !== "free") {
    return NextResponse.json({ error: "Este usuário já possui um plano ativo." }, { status: 409 });
  }

  // ── Platform settings + PRO plan ─────────────────────────────────────────
  const [platformSettings, planSettingResult] = await Promise.all([
    getPlatformSettings(["trials_enabled", "trial_duration_days", "trial_auto_charge_enabled"]),
    supabase
      .from("plan_settings")
      .select("plan_key, name, price, is_available")
      .eq("plan_key", "pro")
      .maybeSingle(),
  ]);

  const planSetting = planSettingResult.data;
  if (!planSetting || !Boolean(planSetting.is_available)) {
    return NextResponse.json({ error: "Plano PRO não está disponível no momento." }, { status: 400 });
  }

  const planPrice = Number(planSetting.price);
  if (!Number.isFinite(planPrice) || planPrice <= 0) {
    return NextResponse.json({ error: "Configuração de preço inválida para o plano PRO." }, { status: 400 });
  }

  const trialsEnabled          = Boolean(platformSettings.trials_enabled           ?? true);
  const trialAutoChargeEnabled = Boolean(platformSettings.trial_auto_charge_enabled ?? true);
  const trialDurationDays      = Math.max(1, Number(platformSettings.trial_duration_days ?? 7));
  const trialDays              = trialsEnabled && trialAutoChargeEnabled ? trialDurationDays : 0;

  const now         = new Date();
  const trialEndsAt = new Date(now.getTime());
  trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);
  const nextDueDateStr = (trialDays > 0 ? trialEndsAt : now).toISOString().slice(0, 10);

  // ── Step 1: Minimal profile (needed by ensureAsaasCustomer) ──────────────
  const { error: profileInitErr } = await supabase
    .from("profiles")
    .upsert({ id: user.id, role: "agency" }, { onConflict: "id" });

  if (profileInitErr) {
    console.error("[signup-pro] profile init failed:", profileInitErr.message);
    return NextResponse.json({ error: "Erro ao inicializar perfil. Tente novamente." }, { status: 500 });
  }

  // ── Step 2: Asaas customer ────────────────────────────────────────────────
  const cardCpfCnpj = normalizeCpfCnpj(String(cardData.cpfCnpj ?? agencyCpfCnpj));
  const cardPhone   = digitsOnly(String(cardData.phone ?? agencyPhone));

  let customerId: string;
  try {
    customerId = await ensureAsaasCustomer(
      user.id,
      responsibleName || agencyName,
      user.email ?? "",
      cardCpfCnpj,
      cardPhone,
    );
  } catch (err) {
    const desc = err instanceof Error ? err.message : String(err);
    console.error("[signup-pro] ensureAsaasCustomer failed:", desc);
    await deleteProfile(supabase, user.id);
    return NextResponse.json(
      { error: desc || "Não foi possível registrar no sistema de pagamento. Confira CPF/CNPJ e tente novamente." },
      { status: 422 },
    );
  }

  // ── Step 3: Create subscription with card ────────────────────────────────
  const expiryYearRaw = String(cardData.expiryYear ?? "").trim();
  const expiryYear    = expiryYearRaw.length === 2 ? `20${expiryYearRaw}` : expiryYearRaw;

  let subscription: Awaited<ReturnType<typeof createSubscription>>;
  try {
    subscription = await createSubscription({
      customer:          customerId,
      billingType:       "CREDIT_CARD",
      value:             planPrice,
      nextDueDate:       nextDueDateStr,
      cycle:             "MONTHLY",
      description:       `Assinatura PRO - BrisaHub`,
      externalReference: `plan:pro:${user.id}`,
      creditCard: {
        holderName:  String(cardData.holderName ?? ""),
        number:      digitsOnly(String(cardData.cardNumber ?? "")),
        expiryMonth: digitsOnly(String(cardData.expiryMonth ?? "")).slice(0, 2),
        expiryYear:  digitsOnly(expiryYear).slice(0, 4),
        ccv:         digitsOnly(String(cardData.ccv ?? "")).slice(0, 4),
      },
      creditCardHolderInfo: {
        name:              String(cardData.holderName ?? responsibleName),
        email:             user.email ?? "",
        cpfCnpj:           cardCpfCnpj,
        postalCode:        digitsOnly(String(cardData.postalCode ?? "")).slice(0, 8),
        addressNumber:     String(cardData.addressNumber ?? ""),
        addressComplement: String(cardData.addressComplement ?? "") || null,
        phone:             cardPhone,
        mobilePhone:       cardPhone,
      },
      remoteIp: ip === "unknown" ? "127.0.0.1" : ip,
    });
  } catch (err) {
    const desc = err instanceof Error ? err.message : String(err);
    console.error("[signup-pro] createSubscription failed:", desc);
    await deleteProfile(supabase, user.id);
    return NextResponse.json(
      { error: desc || "Cartão recusado. Verifique os dados e tente novamente." },
      { status: 422 },
    );
  }

  // ── Step 4: First payment ID ──────────────────────────────────────────────
  let firstPaymentId: string | undefined;
  try {
    const payments = await getSubscriptionPayments(subscription.id);
    firstPaymentId = payments.data?.[0]?.id;
  } catch (err) {
    console.warn("[signup-pro] getSubscriptionPayments non-fatal:", String(err));
  }

  // ── Step 5: Finalize profile ──────────────────────────────────────────────
  const fullName = agencyName || responsibleName;
  const { error: profileUpdateErr } = await supabase
    .from("profiles")
    .update({ full_name: fullName, cpf_cnpj: agencyCpfCnpj })
    .eq("id", user.id);

  if (profileUpdateErr) {
    console.error("[signup-pro] profile update non-fatal:", profileUpdateErr.message);
  }

  // ── Step 6: Create agency row ─────────────────────────────────────────────
  const agencyPayload: Record<string, unknown> = {
    id:                  user.id,
    user_id:             user.id,
    company_name:        agencyName,
    contact_name:        responsibleName,
    phone:               agencyPhone,
    country:             String(agencyData.country ?? "Brasil").trim(),
    city:                String(agencyData.city    ?? "").trim(),
    state:               String(agencyData.state   ?? "").trim(),
    subscription_status: "trialing",
    deleted_at:          null,
  };
  if (agencyData.description) agencyPayload.description = agencyData.description;
  if (agencyData.website)     agencyPayload.website     = agencyData.website;

  const { error: agencyErr } = await supabase
    .from("agencies")
    .upsert(agencyPayload, { onConflict: "id" });

  if (agencyErr) {
    console.error("[signup-pro] agency upsert non-fatal:", agencyErr.message);
  }

  // ── Step 7: Trial / subscription status ──────────────────────────────────
  const trialStartedAt = now.toISOString();
  const trialEndsAtIso = trialEndsAt.toISOString();

  if (trialDays > 0) {
    await startAgencyPlanTrial({
      supabase,
      userId:        user.id,
      planKey:       "pro",
      customerId,
      subscriptionId: subscription.id,
      paymentId:      firstPaymentId,
      paymentValue:   planPrice,
      trialStartedAt,
      trialEndsAt:    trialEndsAtIso,
    });
  } else {
    await updateAgencySubscriptionProfile(supabase, user.id, {
      plan:                  "pro",
      plan_status:           "pending",
      plan_expires_at:       nextDueDateStr,
      asaas_customer_id:     customerId,
      asaas_subscription_id: subscription.id,
      subscription_provider: "asaas",
    });
    await syncAgencyLegacySubscriptionStatus(supabase, user.id, "pending");
  }

  // ── Step 8: Terms acceptance ──────────────────────────────────────────────
  await supabase.from("terms_acceptances").upsert(
    {
      user_id:       user.id,
      terms_version: TERMS_VERSION,
      accepted_at:   now.toISOString(),
      ip_address:    ip,
      user_agent:    req.headers.get("user-agent"),
    },
    { onConflict: "user_id,terms_version" },
  );

  console.log("[signup-pro] PRO trial started", {
    userId: user.id,
    planPrice,
    trialDays,
    subscriptionId: subscription.id,
    firstPaymentId,
  });

  return NextResponse.json({ ok: true });
}
