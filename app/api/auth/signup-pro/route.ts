/**
 * POST /api/auth/signup-pro
 *
 * Atomic PRO agency signup.
 * Order of operations:
 *   1. Create Supabase auth user (admin API)
 *   2. Create minimal profile row (required by ensureAsaasCustomer)
 *   3. Create Asaas customer + subscription with card
 *   4. On Asaas failure → delete profile + auth user → return Asaas error
 *   5. On success → create agency row, finalize profile, start trial
 *
 * The account does NOT exist until card validation passes, so failed
 * attempts leave no residue and the user can retry with corrected card data.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
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

function asaasError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function cleanupUser(supabase: ReturnType<typeof createServerClient>, userId: string) {
  try {
    await supabase.from("profiles").delete().eq("id", userId);
  } catch (e) {
    console.warn("[signup-pro] cleanup profile delete failed:", String(e));
  }
  try {
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) console.warn("[signup-pro] cleanup auth delete failed:", error.message);
  } catch (e) {
    console.warn("[signup-pro] cleanup auth delete exception:", String(e));
  }
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient({ useServiceRole: true });
  const ip = getRequestIp(req);

  const rl = checkRateLimit({
    key: buildRateLimitKey("signup-pro", ip),
    limit: 5,
    windowMs: 15 * 60 * 1000,
    message: "Muitas tentativas de cadastro. Tente novamente em alguns minutos.",
  });
  if (rl) return rl;

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const termsAccepted = body.termsAccepted === true;
  const agencyData = (body.agency ?? {}) as Record<string, unknown>;
  const cardData  = (body.card   ?? {}) as Record<string, unknown>;

  if (!email || !password) {
    return NextResponse.json({ error: "E-mail e senha são obrigatórios." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "A senha deve ter no mínimo 6 caracteres." }, { status: 400 });
  }
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

  // ── Platform trial settings ────────────────────────────────────────────────
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

  const trialsEnabled         = Boolean(platformSettings.trials_enabled          ?? true);
  const trialAutoChargeEnabled = Boolean(platformSettings.trial_auto_charge_enabled ?? true);
  const trialDurationDays     = Math.max(1, Number(platformSettings.trial_duration_days ?? 7));
  const trialDays             = trialsEnabled && trialAutoChargeEnabled ? trialDurationDays : 0;

  const now          = new Date();
  const trialEndsAt  = new Date(now.getTime());
  trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);
  const nextDueDateStr = (trialDays > 0 ? trialEndsAt : now).toISOString().slice(0, 10);

  // ── Step 1: Create Supabase auth user ────────────────────────────────────
  const { data: createData, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: "agency" },
  });

  if (createError) {
    const msg = createError.message.toLowerCase();
    if (msg.includes("already") || msg.includes("exists") || msg.includes("registered")) {
      return NextResponse.json(
        { error: "Este e-mail já está cadastrado. Faça login para continuar.", code: "email_already_registered" },
        { status: 409 },
      );
    }
    console.error("[signup-pro] createUser failed:", createError.message);
    return NextResponse.json({ error: createError.message }, { status: 400 });
  }

  const userId = createData.user.id;

  // ── Step 2: Minimal profile row (required by ensureAsaasCustomer) ─────────
  const { error: profileInitErr } = await supabase
    .from("profiles")
    .upsert({ id: userId, role: "agency" }, { onConflict: "id" });

  if (profileInitErr) {
    console.error("[signup-pro] profile init failed:", profileInitErr.message);
    await cleanupUser(supabase, userId);
    return NextResponse.json({ error: "Erro ao inicializar perfil. Tente novamente." }, { status: 500 });
  }

  // ── Step 3: Asaas customer ────────────────────────────────────────────────
  const cardCpfCnpj = normalizeCpfCnpj(String(cardData.cpfCnpj ?? agencyCpfCnpj));
  const cardPhone   = digitsOnly(String(cardData.phone ?? agencyPhone));

  let customerId: string;
  try {
    customerId = await ensureAsaasCustomer(
      userId,
      responsibleName || agencyName,
      email,
      cardCpfCnpj,
      cardPhone,
    );
  } catch (err) {
    const desc = asaasError(err);
    console.error("[signup-pro] ensureAsaasCustomer failed:", desc);
    await cleanupUser(supabase, userId);
    return NextResponse.json(
      { error: desc || "Não foi possível registrar no sistema de pagamento. Confira CPF/CNPJ e tente novamente." },
      { status: 422 },
    );
  }

  // ── Step 4: Create subscription with card ────────────────────────────────
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
      externalReference: `plan:pro:${userId}`,
      creditCard: {
        holderName:  String(cardData.holderName ?? ""),
        number:      digitsOnly(String(cardData.cardNumber ?? "")),
        expiryMonth: digitsOnly(String(cardData.expiryMonth ?? "")).slice(0, 2),
        expiryYear:  digitsOnly(expiryYear).slice(0, 4),
        ccv:         digitsOnly(String(cardData.ccv ?? "")).slice(0, 4),
      },
      creditCardHolderInfo: {
        name:              String(cardData.holderName ?? responsibleName),
        email,
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
    const desc = asaasError(err);
    console.error("[signup-pro] createSubscription failed:", desc);
    await cleanupUser(supabase, userId);
    return NextResponse.json(
      { error: desc || "Cartão recusado. Verifique os dados e tente novamente." },
      { status: 422 },
    );
  }

  // ── Step 5: First payment ID (non-fatal) ─────────────────────────────────
  let firstPaymentId: string | undefined;
  try {
    const payments = await getSubscriptionPayments(subscription.id);
    firstPaymentId = payments.data?.[0]?.id;
  } catch (err) {
    console.warn("[signup-pro] getSubscriptionPayments failed (non-fatal):", String(err));
  }

  // ── Step 6: Finalize profile ──────────────────────────────────────────────
  const fullName = agencyName || responsibleName;
  const { error: profileUpdateErr } = await supabase
    .from("profiles")
    .update({ full_name: fullName, cpf_cnpj: agencyCpfCnpj })
    .eq("id", userId);

  if (profileUpdateErr) {
    console.error("[signup-pro] profile update failed (non-fatal):", profileUpdateErr.message);
  }

  // ── Step 7: Create agency row ─────────────────────────────────────────────
  const agencyPayload: Record<string, unknown> = {
    id:                  userId,
    user_id:             userId,
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
    console.error("[signup-pro] agency upsert failed (non-fatal):", agencyErr.message);
  }

  // ── Step 8: Trial / subscription status ──────────────────────────────────
  const trialStartedAt  = now.toISOString();
  const trialEndsAtIso  = trialEndsAt.toISOString();

  if (trialDays > 0) {
    await startAgencyPlanTrial({
      supabase,
      userId,
      planKey:       "pro",
      customerId,
      subscriptionId: subscription.id,
      paymentId:      firstPaymentId,
      paymentValue:   planPrice,
      trialStartedAt,
      trialEndsAt:    trialEndsAtIso,
    });
  } else {
    await updateAgencySubscriptionProfile(supabase, userId, {
      plan:                  "pro",
      plan_status:           "pending",
      plan_expires_at:       nextDueDateStr,
      asaas_customer_id:     customerId,
      asaas_subscription_id: subscription.id,
      subscription_provider: "asaas",
    });
    await syncAgencyLegacySubscriptionStatus(supabase, userId, "pending");
  }

  // ── Step 9: Terms acceptance ──────────────────────────────────────────────
  await supabase.from("terms_acceptances").upsert(
    {
      user_id:       userId,
      terms_version: TERMS_VERSION,
      accepted_at:   now.toISOString(),
      ip_address:    ip,
      user_agent:    req.headers.get("user-agent"),
    },
    { onConflict: "user_id,terms_version" },
  );

  console.log("[signup-pro] PRO trial started", {
    userId,
    planPrice,
    trialDays,
    subscriptionId: subscription.id,
    firstPaymentId,
  });

  return NextResponse.json({ ok: true });
}
