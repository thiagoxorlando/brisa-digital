import type { Metadata } from "next";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import BillingDashboard from "@/features/agency/BillingDashboard";

export const metadata: Metadata = { title: "Billing — Brisa Digital" };

export default async function BillingPage() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  const userId = user?.id ?? "";

  const supabase = createServerClient({ useServiceRole: true });

  const [
    { data: profile },
    { data: savedCards },
    { data: transactions },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("plan, wallet_balance")
      .eq("id", userId)
      .single(),

    supabase
      .from("saved_cards")
      .select("id, brand, last_four, holder_name, expiry_month, expiry_year, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),

    supabase
      .from("wallet_transactions")
      .select("id, type, amount, description, reference_id, payment_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <BillingDashboard
      userId={userId}
      plan={profile?.plan ?? "free"}
      planStatus={null}
      planExpiresAt={null}
      walletBalance={Number(profile?.wallet_balance ?? 0)}
      savedCards={savedCards ?? []}
      transactions={transactions ?? []}
      mpPublicKey={process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY ?? ""}
    />
  );
}
