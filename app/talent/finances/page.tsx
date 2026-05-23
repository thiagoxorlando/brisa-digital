import type { Metadata } from "next";
import TalentFinances from "@/features/talent/TalentFinances";
import { guardOpenSpacePage } from "@/lib/talentPortalLanding";

export const metadata: Metadata = { title: "Financeiro — BrisaHub" };

export default async function TalentFinancesPage() {
  await guardOpenSpacePage();
  return <TalentFinances />;
}
