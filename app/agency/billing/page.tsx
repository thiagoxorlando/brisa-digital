import type { Metadata } from "next";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import BillingDashboard from "@/features/agency/BillingDashboard";

export const metadata: Metadata = { title: "Assinatura — BrisaHub" };

export default async function BillingPage() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  const userId = user?.id ?? "";

  const supabase = createServerClient({ useServiceRole: true });

  const [
    { data: profile },
    { data: transactions },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("plan, plan_status, plan_expires_at")
      .eq("id", userId)
      .single(),

    supabase
      .from("wallet_transactions")
      .select("id, type, amount, description, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <BillingDashboard
      plan={profile?.plan ?? "free"}
      planStatus={profile?.plan_status ?? null}
      planExpiresAt={profile?.plan_expires_at ?? null}
      transactions={transactions ?? []}
    />
  );
}
