import { NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { getStripeConnectStatusForUser, StripeConnectSchemaError, syncStripeConnectAccountStatus } from "@/lib/stripeConnect";

export const runtime = "nodejs";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

export async function POST() {
  try {
    const session = await createSessionClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createServerClient({ useServiceRole: true });
    const status = await getStripeConnectStatusForUser(supabase, user.id);
    if (!status) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    let accountId = status.stripe_account_id;
    const tableName = status.role === "agency" ? "agencies" : "talent_profiles";

    if (!accountId) {
      const account = await getStripe().accounts.create({
        type: "express",
        country: "BR",
        capabilities: {
          transfers: { requested: true },
          card_payments: { requested: true },
        },
      });

      accountId = account.id;
      await syncStripeConnectAccountStatus(supabase, account);

      const { error: updateErr } = await supabase
        .from(tableName)
        .update({ stripe_account_id: accountId })
        .eq("id", user.id);

      if (updateErr) {
        const missingColumnMatch = updateErr.message.match(/column\s+([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\s+does not exist/i);
        const missingTable = missingColumnMatch?.[1] ?? tableName;
        const missingColumn = missingColumnMatch?.[2] ?? "stripe_account_id";

        console.error("[stripe connect] save account failed", {
          userId: user.id,
          role: status.role,
          table: missingTable,
          column: missingColumn,
          error: updateErr.message,
          details: updateErr.details,
          hint: updateErr.hint,
          code: updateErr.code,
        });

        return NextResponse.json(
          { error: `Erro ao salvar conta Stripe: coluna ausente ${missingTable}.${missingColumn}` },
          { status: 500 },
        );
      }
    }

    const returnPath = status.finances_path;
    const accountLink = await getStripe().accountLinks.create({
      account: accountId,
      refresh_url: `${APP_URL}/api/stripe/connect/refresh`,
      return_url: `${APP_URL}/api/stripe/connect/return`,
      type: "account_onboarding",
    });

    console.log("[stripe onboarding link] created", {
      accountId,
      userId: user.id,
      role: status.role,
      returnPath,
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (error) {
    if (error instanceof StripeConnectSchemaError) {
      console.error("[stripe connect] save account failed", {
        table: error.table,
        column: error.column,
        error: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });

      return NextResponse.json(
        { error: `Schema Stripe Connect incompleto: coluna ausente ${error.table}.${error.column ?? "unknown"}` },
        { status: 500 },
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error("[stripe connect create] unexpected error", { error: message });
    return NextResponse.json({ error: `Erro ao criar conta Stripe: ${message}` }, { status: 500 });
  }
}
