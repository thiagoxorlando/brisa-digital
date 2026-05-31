import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getPlatformSetting, getGlobalPaymentDefaults } from "@/lib/platformSettings.server";
import { logAdminAction } from "@/lib/auditLog";
import { notify } from "@/lib/notify";

// Called by an external cron (e.g. Vercel Cron, GitHub Actions, uptime service).
// Requires CRON_SECRET header to prevent unauthorized triggering.
//
// Auto-confirms internal-mode payments where:
//   - agency_payment_sent_at IS set
//   - talent_payment_confirmed_at IS NULL
//   - agency_payment_sent_at < NOW() - (internal_payment_auto_confirm_days)

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  if (secret && req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const autoConfirmDays = await getPlatformSetting<number>(
    "internal_payment_auto_confirm_days",
    5,
  );

  if (autoConfirmDays <= 0) {
    return NextResponse.json({ ok: true, processed: 0, message: "Auto-confirm disabled (days = 0)." });
  }

  const supabase = createServerClient({ useServiceRole: true });
  const cutoff = new Date(Date.now() - autoConfirmDays * 24 * 60 * 60 * 1000).toISOString();

  // Resolve global payment mode for NULL-inheritance.
  // Only agencies in internal mode set agency_payment_sent_at, but as a
  // defence-in-depth guard we explicitly restrict to internal mode agencies.
  const globalDefaults = await getGlobalPaymentDefaults();

  const { data: contractsRaw, error: fetchErr } = await supabase
    .from("contracts")
    .select("id, agency_id, talent_id, talent_user_id, status, agency_payment_sent_at, agencies!inner(payment_mode)")
    .not("agency_payment_sent_at", "is", null)
    .is("talent_payment_confirmed_at", null)
    .neq("status", "paid")
    .neq("status", "cancelled")
    .neq("status", "rejected")
    .lt("agency_payment_sent_at", cutoff);

  // Filter: only process contracts where the agency's effective payment mode is "internal".
  // Resolution chain: agency.payment_mode → global default.
  type ContractRow = typeof contractsRaw extends (infer T)[] | null ? T : never;
  const contracts = (contractsRaw ?? []).filter((c: ContractRow) => {
    const row = c as ContractRow & { agencies?: { payment_mode: string | null } | null };
    const agencyMode = row.agencies?.payment_mode ?? null;
    const effectiveMode =
      agencyMode === "internal" ? "internal" :
      agencyMode === "escrow"   ? "escrow"   :
      globalDefaults.default_payment_mode;
    return effectiveMode === "internal";
  });

  if (fetchErr) {
    console.error("[auto-confirm-payments] fetch failed:", fetchErr.message);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!contracts || contracts.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const now = new Date().toISOString();
  let processed = 0;
  const errors: string[] = [];

  for (const contract of contracts) {
    const { error: updateErr } = await supabase
      .from("contracts")
      .update({
        talent_payment_confirmed_at: now,
        status:  "paid",
        paid_at: now,
      } as Record<string, unknown>)
      .eq("id", contract.id)
      .is("talent_payment_confirmed_at", null); // idempotent guard

    if (updateErr) {
      errors.push(`${contract.id}: ${updateErr.message}`);
      continue;
    }

    processed++;

    // Notify talent that payment was auto-confirmed
    const talentUserId = contract.talent_user_id ?? contract.talent_id;
    if (talentUserId) {
      await notify(
        talentUserId,
        "payment_auto_confirmed",
        `Pagamento do contrato foi confirmado automaticamente após ${autoConfirmDays} dias sem resposta.`,
        "/talent/contracts",
        `auto_confirm:${contract.id}`,
      ).catch((e) => console.warn("[auto-confirm-payments] notify talent failed:", e));
    }

    // Notify agency that auto-confirm triggered
    if (contract.agency_id) {
      await notify(
        contract.agency_id,
        "payment_auto_confirmed",
        "Pagamento marcado como recebido automaticamente após prazo sem confirmação do talento.",
        "/agency/contracts",
        `auto_confirm:${contract.id}`,
      ).catch((e) => console.warn("[auto-confirm-payments] notify agency failed:", e));
    }

    // Audit log per confirmed contract
    await logAdminAction({
      adminId: "system",
      action:       "contract_auto_confirmed",
      entityType:   "contract",
      entityId:     contract.id,
      before:       { status: contract.status, talent_payment_confirmed_at: null },
      after:        { status: "paid", talent_payment_confirmed_at: now },
    }).catch((e) => console.warn("[auto-confirm-payments] auditLog failed:", e));
  }

  return NextResponse.json({
    ok:        true,
    processed,
    errors:    errors.length > 0 ? errors : undefined,
    cutoff,
    days:      autoConfirmDays,
  });
}

// Allow GET for easy health-check / debugging from browser (still guarded by secret).
export async function GET(req: NextRequest) {
  return POST(req);
}
