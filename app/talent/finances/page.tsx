import type { Metadata } from "next";
import TalentFinances from "@/features/talent/TalentFinances";
import { guardOpenSpacePage } from "@/lib/talentPortalLanding";
import { getGlobalPaymentDefaults } from "@/lib/platformSettings.server";

export const metadata: Metadata = { title: "Finances — BrisaHub" };

export default async function TalentFinancesPage() {
  await guardOpenSpacePage();
  const globalDefaults = await getGlobalPaymentDefaults();
  return <TalentFinances paymentMode={globalDefaults.default_payment_mode} />;
}
