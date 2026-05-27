/**
 * POST /api/auth/signup-pro
 *
 * Finalises an atomic PRO agency signup.
 * The caller must have an active Supabase session before calling this —
 * it calls supabase.auth.signUp() client-side first to get a session,
 * then passes control here for card validation + profile/agency creation.
 *
 * Steps:
 *   1. Verify authenticated session
 *   2. Guard: reject duplicate calls on an already-configured profile
 *   3. Create minimal profile row (required by ensureAsaasCustomer)
 *   4. Create Asaas customer
 *   5. Create Asaas subscription with card — on failure: delete profile, return real error
 *   6. Finalize profile + create agency row + start trial
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { ensureAsaasCustomer } from "@/lib/asaasCustomer";
import { createSubscription, getSubscriptionPayments, listCustomerSubscriptions } from "@/lib/asaas";
import { isValidAsaasMobilePhone, normalizeAsaasMobilePhone } from "@/lib/asaasPhone";
import {
  startAgencyPlanTrial,
  updateAgencySubscriptionProfile,
  syncAgencyLegacySubscriptionStatus,
} from "@/lib/asaasPlanSync.server";
import { getPlatformSettings } from "@/lib/platformSettings.server";
import { isValidCpfCnpj, normalizeCpfCnpj, digitsOnly } from "@/lib/cpf";
import { buildRateLimitKey, checkRateLimit, getRequestIp } from "@/lib/rateLimit";
import { resolveAsaasRemoteIp } from "@/lib/requestIp";

const TERMS_VERSION = "terms_v1_2026_05";

/**
 * Safely extracts a human-readable string from any thrown value.
 * Handles: Error instances, Supabase error objects {message,code,details},
 * plain objects, primitives.
 */
function extractErrorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null) {
    const obj = err as Record<string, unknown>;
    const msg = obj.message ?? obj.description ?? obj.error ?? obj.msg;
    if (typeof msg === "string" && msg) return msg;
    try {
      const s = JSON.stringify(err);
      // Avoid returning "{}" as an error message
      if (s && s !== "{}") return s;
    } catch {
      // ignore circular-ref errors
    }
  }
  return "Erro desconhecido";
}

/**
 * Serialise any value for structured log output without "[object Object]".
 */
function serializeForLog(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  try { return JSON.stringify(err); } catch { return String(err); }
}

async function deleteProfile(supabase: ReturnType<typeof createServerClient>, userId: string): Promise<boolean> {
  try {
    const { error } = await supabase.from("profiles").delete().eq("id", userId);
    if (error) {
      console.warn("[signup-pro] cleanup:delete_profile failed", { userId, error: serializeForLog(error) });
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[signup-pro] cleanup:delete_profile exception", { userId, error: serializeForLog(e) });
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    return await handleSignupPro(req);
  } catch (err) {
    const msg = extractErrorMessage(err);
    console.error("[signup-pro] unhandled error", { error: serializeForLog(err) });
    return NextResponse.json(
      { error: `Não foi possível concluir o cadastro. Tente novamente. (${msg})` },
      { status: 500 },
    );
  }
}

async function handleSignupPro(req: NextRequest) {
  // ── Auth check ─────────────────────────────────────────────────────────────
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sessão não encontrada. Recarregue a página e tente novamente." },
      { status: 401 },
    );
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
    return NextResponse.json(
      { error: "Você precisa aceitar os Termos de Uso para continuar." },
      { status: 400 },
    );
  }

  const agencyName      = String(agencyData.agencyName      ?? "").trim();
  const responsibleName = String(agencyData.responsibleName ?? "").trim();
  const agencyCpfCnpj   = normalizeCpfCnpj(String(agencyData.cpfCnpj ?? "").trim());
  const agencyPhone     = String(agencyData.phone ?? "").trim();

  if (!agencyName || !responsibleName || !agencyPhone) {
    return NextResponse.json(
      { error: "Preencha todos os campos obrigatórios da agência." },
      { status: 400 },
    );
  }
  if (!isValidCpfCnpj(agencyCpfCnpj)) {
    return NextResponse.json({ error: "CPF/CNPJ da agência inválido." }, { status: 400 });
  }

  // ── Guard: reject if profile already configured ───────────────────────────
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("role, plan")
    .eq("id", user.id)
    .maybeSingle();

  if (existingProfile?.role && existingProfile.role !== "agency") {
    return NextResponse.json(
      { error: "Conta já configurada com outro tipo de acesso." },
      { status: 409 },
    );
  }
  if (existingProfile?.plan && existingProfile.plan !== "free") {
    return NextResponse.json(
      { error: "Este usuário já possui um plano ativo." },
      { status: 409 },
    );
  }

  // ── Platform settings + PRO plan ──────────────────────────────────────────
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
    return NextResponse.json(
      { error: "Configuração de preço inválida para o plano PRO." },
      { status: 400 },
    );
  }

  const trialsEnabled          = Boolean(platformSettings.trials_enabled           ?? true);
  const trialAutoChargeEnabled = Boolean(platformSettings.trial_auto_charge_enabled ?? true);
  const trialDurationDays      = Math.max(1, Number(platformSettings.trial_duration_days ?? 7));
  const trialDays              = trialsEnabled && trialAutoChargeEnabled ? trialDurationDays : 0;

  const now         = new Date();
  const trialEndsAt = new Date(now.getTime());
  trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);
  const nextDueDateStr = (trialDays > 0 ? trialEndsAt : now).toISOString().slice(0, 10);

  // ── Step 1: Minimal profile (required by ensureAsaasCustomer cache) ────────
  const { error: profileInitErr } = await supabase
    .from("profiles")
    .upsert({ id: user.id, role: "agency" }, { onConflict: "id" });

  if (profileInitErr) {
    console.error("[signup-pro] step:init_profile failed", {
      userId: user.id,
      error: serializeForLog(profileInitErr),
    });
    return NextResponse.json({ error: "Erro ao inicializar perfil. Tente novamente." }, { status: 500 });
  }

  // ── Step 2: Asaas customer ─────────────────────────────────────────────────
  const cardCpfCnpj = normalizeCpfCnpj(String(cardData.cpfCnpj ?? agencyCpfCnpj));
  // PhoneInput stores "+CC localNum" — strip the country-code prefix so Asaas
  // receives only the local number (e.g. "54996869875", not "5554996869875").
  const rawCardPhone = String(cardData.phone ?? agencyPhone).trim();
  const cardPhone    = normalizeAsaasMobilePhone(rawCardPhone);

  if (!isValidAsaasMobilePhone(cardPhone)) {
    return NextResponse.json(
      { error: "Informe um telefone valido com DDD para o titular do cartao." },
      { status: 400 },
    );
  }

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
    const msg = extractErrorMessage(err);
    console.error("[signup-pro] step:create_customer failed", {
      userId: user.id,
      error: serializeForLog(err),
    });
    await deleteProfile(supabase, user.id);
    return NextResponse.json(
      { error: msg || "Não foi possível registrar no sistema de pagamento. Confira CPF/CNPJ e tente novamente." },
      { status: 422 },
    );
  }

  // Recovery: if a previous attempt already created the Asaas subscription,
  // activate local trialing state instead of creating a duplicate subscription.
  let resolvedSubscriptionId: string | null = null;
  try {
    const customerSubs = await listCustomerSubscriptions(customerId);
    const expectedRef = `plan:pro:${user.id}`;
    const found = (customerSubs.data ?? []).find((subscription) => subscription.externalReference === expectedRef);
    if (found?.id) {
      resolvedSubscriptionId = found.id;
      console.log("[signup-pro] recovery:found_existing_subscription", {
        userId: user.id,
        customerId,
        subscriptionId: resolvedSubscriptionId,
      });
    }
  } catch (error) {
    console.warn("[signup-pro] recovery:subscription_search_failed", {
      userId: user.id,
      customerId,
      error: serializeForLog(error),
    });
  }

  if (resolvedSubscriptionId) {
    let recoveryPaymentId: string | undefined;
    try {
      const payments = await getSubscriptionPayments(resolvedSubscriptionId);
      recoveryPaymentId = payments.data?.[0]?.id;
    } catch (error) {
      console.warn("[signup-pro] recovery:get_payments_failed", {
        userId: user.id,
        subscriptionId: resolvedSubscriptionId,
        error: serializeForLog(error),
      });
    }

    try {
      if (trialDays > 0) {
        await startAgencyPlanTrial({
          supabase,
          userId: user.id,
          planKey: "pro",
          customerId,
          subscriptionId: resolvedSubscriptionId,
          paymentId: recoveryPaymentId,
          paymentValue: planPrice,
          trialStartedAt: now.toISOString(),
          trialEndsAt: trialEndsAt.toISOString(),
        });
      } else {
        await updateAgencySubscriptionProfile(supabase, user.id, {
          plan:                  "pro",
          plan_status:           "pending",
          plan_expires_at:       nextDueDateStr,
          asaas_customer_id:     customerId,
          asaas_subscription_id: resolvedSubscriptionId,
          subscription_provider: "asaas",
        });
        await syncAgencyLegacySubscriptionStatus(supabase, user.id, "pending");
      }

      console.log("[signup-pro] recovery:activation_success", {
        userId: user.id,
        customerId,
        subscriptionId: resolvedSubscriptionId,
        paymentId: recoveryPaymentId ?? null,
        planStatus: trialDays > 0 ? "trialing" : "pending",
      });

      return NextResponse.json({
        ok: true,
        recovered: true,
        subscriptionId: resolvedSubscriptionId,
        paymentId: recoveryPaymentId ?? null,
      });
    } catch (error) {
      console.error("[signup-pro] recovery:activation_failed", {
        userId: user.id,
        customerId,
        subscriptionId: resolvedSubscriptionId,
        paymentId: recoveryPaymentId ?? null,
        error: serializeForLog(error),
      });
    }
  }

  // ── Step 3: Asaas subscription with card ──────────────────────────────────
  const expiryYearRaw = String(cardData.expiryYear ?? "").trim();
  const expiryYear    = expiryYearRaw.length === 2 ? `20${expiryYearRaw}` : expiryYearRaw;
  const holderName = String(cardData.holderName ?? "").trim();
  const remoteIp = resolveAsaasRemoteIp(req);

  if (!holderName) {
    return NextResponse.json({ error: "Informe o nome do titular exatamente como no cartao." }, { status: 400 });
  }
  if (!remoteIp) {
    return NextResponse.json(
      { error: "Nao foi possivel identificar o IP do comprador. Recarregue a pagina e tente novamente." },
      { status: 400 },
    );
  }

  let subscription: Awaited<ReturnType<typeof createSubscription>>;
  try {
    subscription = await createSubscription({
      customer:          customerId,
      billingType:       "CREDIT_CARD",
      value:             planPrice,
      nextDueDate:       nextDueDateStr,
      cycle:             "MONTHLY",
      description:       "Assinatura PRO - BrisaHub",
      externalReference: `plan:pro:${user.id}`,
      creditCard: {
        holderName,
        number:      digitsOnly(String(cardData.cardNumber ?? "")),
        expiryMonth: digitsOnly(String(cardData.expiryMonth ?? "")).slice(0, 2),
        expiryYear:  digitsOnly(expiryYear).slice(0, 4),
        ccv:         digitsOnly(String(cardData.ccv ?? "")).slice(0, 4),
      },
      creditCardHolderInfo: {
        name:              holderName,
        email:             user.email ?? "",
        cpfCnpj:           cardCpfCnpj,
        postalCode:        digitsOnly(String(cardData.postalCode ?? "")).slice(0, 8),
        addressNumber:     String(cardData.addressNumber ?? ""),
        addressComplement: String(cardData.addressComplement ?? "") || null,
        phone:             cardPhone,
        mobilePhone:       cardPhone,
      },
      remoteIp,
    });
  } catch (err) {
    const msg = extractErrorMessage(err);
    console.error("[signup-pro] step:create_subscription failed", {
      userId:     user.id,
      customerId,
      error:      serializeForLog(err),
    });
    const cleaned = await deleteProfile(supabase, user.id);
    if (!cleaned) {
      console.warn("[signup-pro] step:create_subscription cleanup incomplete", { userId: user.id });
    }
    return NextResponse.json(
      { error: msg || "Cartão recusado. Verifique os dados e tente novamente." },
      { status: 422 },
    );
  }

  // ── Step 4: First payment ID (non-fatal) ───────────────────────────────────
  let firstPaymentId: string | undefined;
  try {
    const payments = await getSubscriptionPayments(subscription.id);
    firstPaymentId = payments.data?.[0]?.id;
  } catch (err) {
    console.warn("[signup-pro] step:get_payments non-fatal", {
      subscriptionId: subscription.id,
      error: serializeForLog(err),
    });
  }

  // ── Step 5: Finalize profile ───────────────────────────────────────────────
  const { error: profileUpdateErr } = await supabase
    .from("profiles")
    .update({ full_name: agencyName || responsibleName, cpf_cnpj: agencyCpfCnpj })
    .eq("id", user.id);

  if (profileUpdateErr) {
    console.error("[signup-pro] step:finalize_profile non-fatal", {
      userId: user.id,
      error: serializeForLog(profileUpdateErr),
    });
  }

  // ── Step 6: Create agency row ──────────────────────────────────────────────
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
    console.error("[signup-pro] step:create_agency non-fatal", {
      userId: user.id,
      error: serializeForLog(agencyErr),
    });
  }

  // ── Step 7: Trial / subscription status ───────────────────────────────────
  const trialStartedAt = now.toISOString();
  const trialEndsAtIso = trialEndsAt.toISOString();

  try {
    if (trialDays > 0) {
      await startAgencyPlanTrial({
        supabase,
        userId:         user.id,
        planKey:        "pro",
        customerId,
        subscriptionId: subscription.id,
        paymentId:      firstPaymentId,
        paymentValue:   planPrice,
        trialStartedAt,
        trialEndsAt:    trialEndsAtIso,
      });
      console.log("[signup-pro] activation_success", {
        userId: user.id,
        customerId,
        subscriptionId: subscription.id,
        paymentId: firstPaymentId ?? null,
        planStatus: "trialing",
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
      console.log("[signup-pro] activation_success", {
        userId: user.id,
        customerId,
        subscriptionId: subscription.id,
        paymentId: firstPaymentId ?? null,
        planStatus: "pending",
      });
    }
  } catch (err) {
    // Subscription already created in Asaas — log with subscriptionId for manual recovery if needed.
    // Profile/agency rows are left in place so the user can sign in and retry from the billing page.
    console.error("[signup-pro] step:start_trial failed", {
      userId:         user.id,
      customerId,
      subscriptionId: subscription.id,
      firstPaymentId,
      error:          serializeForLog(err),
    });
    return NextResponse.json(
      {
        error:
          "Sua assinatura foi criada com sucesso, mas houve um erro ao atualizar seu perfil. " +
          "Faça login e vá até Configurações → Cobrança para verificar seu plano.",
      },
      { status: 500 },
    );
  }

  // ── Step 8: Terms acceptance ───────────────────────────────────────────────
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

  console.log("[signup-pro] step:complete", {
    userId:         user.id,
    planPrice,
    trialDays,
    subscriptionId: subscription.id,
    firstPaymentId,
  });

  return NextResponse.json({ ok: true });
}
