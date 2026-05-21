import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/requireAdmin";
import { redirect } from "next/navigation";
import AdminControlCenter from "@/features/admin/AdminControlCenter";

export const metadata: Metadata = { title: "Centro de Controle — Administração — BrisaHub" };

export default async function AdminControlCenterPage() {
  const auth = await requireAdmin();
  if (!("userId" in auth)) redirect("/");

  const supabase = createServerClient({ useServiceRole: true });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  const [
    { count: pendingWithdrawals },
    { count: failedWithdrawals },
    { count: pendingSupport },
    { count: pendingPlanCharges },
    { count: activeWorkspaces },
    { count: activeEscrow },
    { count: newUsersToday },
    { count: bookingsToday },
    escrowRes,
  ] = await Promise.all([
    supabase
      .from("wallet_transactions")
      .select("id", { count: "exact", head: true })
      .eq("type", "withdrawal")
      .in("status", ["pending", "processing"]),
    supabase
      .from("wallet_transactions")
      .select("id", { count: "exact", head: true })
      .eq("type", "withdrawal")
      .in("status", ["failed", "cancelled", "canceled", "past_due", "overdue"]),
    supabase
      .from("support_conversations")
      .select("id", { count: "exact", head: true })
      .eq("status", "waiting_admin")
      .is("archived_at", null),
    supabase
      .from("wallet_transactions")
      .select("id", { count: "exact", head: true })
      .eq("type", "plan_charge")
      .in("status", ["pending", "processing", "awaiting_payment", "pending_payment"]),
    supabase
      .from("premium_workspaces")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .is("deleted_at", null),
    supabase
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("status", "confirmed"),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("created_at", todayIso),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("created_at", todayIso),
    supabase
      .from("contracts")
      .select("payment_amount")
      .is("deleted_at", null)
      .eq("status", "confirmed"),
  ]);

  const escrowTotal = (escrowRes.data ?? []).reduce(
    (sum, c) => sum + Number((c as { payment_amount?: number | null }).payment_amount ?? 0),
    0,
  );

  const counts = {
    pendingWithdrawals:  pendingWithdrawals  ?? 0,
    failedWithdrawals:   failedWithdrawals   ?? 0,
    pendingSupport:      pendingSupport      ?? 0,
    pendingPlanCharges:  pendingPlanCharges  ?? 0,
    activeWorkspaces:    activeWorkspaces    ?? 0,
    activeEscrow:        activeEscrow        ?? 0,
    newUsersToday:       newUsersToday       ?? 0,
    bookingsToday:       bookingsToday       ?? 0,
    escrowTotal,
  };

  return <AdminControlCenter counts={counts} />;
}
