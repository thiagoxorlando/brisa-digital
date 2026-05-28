import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import TalentContracts from "@/features/talent/TalentContracts";
import { guardOpenSpacePage } from "@/lib/talentPortalLanding";
import { loadTalentContractsPageData } from "@/lib/talentContractsPage.server";

export const metadata: Metadata = { title: “Contratos — BrisaHub” };

export default async function TalentContractsPage() {
  const talentId = await guardOpenSpacePage();
  const supabase = createServerClient({ useServiceRole: true });
  const data = await loadTalentContractsPageData(supabase, talentId);

  return (
    <TalentContracts
      contracts={data.contracts}
      approvedSubmissions={data.approvedSubmissions}
    />
  );
}
