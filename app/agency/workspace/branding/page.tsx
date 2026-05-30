import type { Metadata } from "next";
import WorkspaceBrandingForm from "@/features/agency/WorkspaceBrandingForm";
import { requirePremiumWorkspacePageContext } from "@/lib/premiumWorkspaceApp.server";

export const metadata: Metadata = { title: "Branding — BrisaHub" };

export default async function WorkspaceBrandingPage() {
  const context = await requirePremiumWorkspacePageContext();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[1.8rem] font-bold tracking-tight text-zinc-950">Personalização</h1>
        <p className="mt-1 text-[14px] text-zinc-500">
          Ajuste nome, logo, cores e mensagem do Espaço Premium.
        </p>
      </div>

      <div className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-[0_12px_34px_rgba(15,23,42,0.05)]">
        <WorkspaceBrandingForm workspace={context.workspace} membership={context.membership} />
      </div>
    </div>
  );
}
