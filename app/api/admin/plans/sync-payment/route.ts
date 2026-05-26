import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { createServerClient } from "@/lib/supabase";
import { getPayment } from "@/lib/asaas";
import {
  fetchAgencySubscriptionProfile,
  isAsaasPlanPaymentConfirmed,
  syncAgencyPlanFromAsaasPayment,
} from "@/lib/asaasPlanSync.server";
import { logAdminAction } from "@/lib/auditLog";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({})) as {
    paymentId?: string;
    agencyId?: string;
  };

  const paymentId = String(body.paymentId ?? "").trim();
  const requestedAgencyId = String(body.agencyId ?? "").trim() || null;

  if (!paymentId) {
    return NextResponse.json({ error: "Informe o payment id do Asaas." }, { status: 400 });
  }

  const payment = await getPayment(paymentId).catch((error: unknown) => {
    console.error("[admin/plans/sync-payment] getPayment failed", {
      paymentId,
      err: error instanceof Error ? error.message : String(error),
    });
    return null;
  });

  if (!payment) {
    return NextResponse.json({ error: "Nao foi possivel consultar o pagamento no Asaas." }, { status: 502 });
  }

  if (!isAsaasPlanPaymentConfirmed(payment.status)) {
    return NextResponse.json(
      { error: `Pagamento ${paymentId} ainda nao esta confirmado no Asaas (${payment.status}).` },
      { status: 409 },
    );
  }

  const supabase = createServerClient({ useServiceRole: true });

  let beforeProfile = null;
  if (requestedAgencyId) {
    beforeProfile = await fetchAgencySubscriptionProfile(supabase, requestedAgencyId).catch(() => null);
  }

  const syncResult = await syncAgencyPlanFromAsaasPayment({
    supabase,
    payment: {
      id: payment.id,
      status: payment.status,
      value: payment.value,
      customer: payment.customer,
      dueDate: payment.dueDate,
      externalReference: payment.externalReference,
      subscription: payment.subscription,
      subscriptionId: payment.subscriptionId,
    },
  }).catch((error: unknown) => {
    console.error("[admin/plans/sync-payment] sync failed", {
      paymentId,
      err: error instanceof Error ? error.message : String(error),
    });
    return null;
  });

  if (!syncResult) {
    return NextResponse.json({ error: "Falha ao sincronizar a assinatura." }, { status: 500 });
  }

  if (!syncResult.ok) {
    return NextResponse.json({ error: "Pagamento nao pertence a um plano reconhecido." }, { status: 422 });
  }

  if (requestedAgencyId && syncResult.userId !== requestedAgencyId) {
    return NextResponse.json(
      { error: "O payment id informado pertence a outra agencia." },
      { status: 409 },
    );
  }

  const afterProfile = await fetchAgencySubscriptionProfile(supabase, syncResult.userId).catch(() => null);

  await logAdminAction({
    adminId: auth.userId,
    action: "asaas_plan_payment_synced",
    entityType: "plan_payment",
    entityId: paymentId,
    before: beforeProfile as Record<string, unknown> | undefined,
    after: afterProfile as Record<string, unknown> | undefined,
    metadata: {
      agencyId: syncResult.userId,
      planKey: syncResult.planKey,
      paymentStatus: payment.status,
      source: "manual_admin_sync",
    },
  });

  return NextResponse.json({
    ok: true,
    agencyId: syncResult.userId,
    plan: syncResult.planKey,
    plan_expires_at: syncResult.planExpiresAt,
  });
}
