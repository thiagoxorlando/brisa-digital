import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/requireAdmin";
import { loadAdminPremiumData } from "@/lib/readModels/adminPremium";
import AdminPremium from "@/features/admin/AdminPremium";

export const metadata: Metadata = {
  title: "Premium — Admin — BrisaHub",
};

export default async function AdminPremiumPage() {
  const auth = await requireAdmin();
  if (!("userId" in auth)) redirect("/");
  const data = await loadAdminPremiumData();
  return <AdminPremium data={data} />;
}
