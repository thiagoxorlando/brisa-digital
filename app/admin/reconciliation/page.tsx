import type { Metadata } from "next";
import { requireAdmin } from "@/lib/requireAdmin";
import { redirect } from "next/navigation";
import { buildReconciliationData } from "@/lib/readModels/reconciliation";
import AdminReconciliation from "@/features/admin/AdminReconciliation";

export const metadata: Metadata = { title: "Reconciliation — Admin — BrisaHub" };

export default async function AdminReconciliationPage() {
  const auth = await requireAdmin();
  if (!("userId" in auth)) redirect("/");

  const data = await buildReconciliationData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold text-[#1F2D2E]">Reconciliação financeira</h1>
        <p className="text-[14px] text-[#647B7B] mt-1">
          Comparação entre registros do app e eventos Asaas. Página somente leitura.
        </p>
      </div>
      <AdminReconciliation data={data} />
    </div>
  );
}
