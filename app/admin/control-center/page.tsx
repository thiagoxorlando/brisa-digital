import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/requireAdmin";
import { buildAdminControlCenterData } from "@/lib/readModels/adminControlCenter";
import AdminControlCenter from "@/features/admin/AdminControlCenter";

export const metadata: Metadata = { title: "Control Center — Admin — BrisaHub" };

export default async function AdminControlCenterPage() {
  const auth = await requireAdmin();
  if (!("userId" in auth)) redirect("/");

  const data = await buildAdminControlCenterData();

  return <AdminControlCenter data={data} />;
}
