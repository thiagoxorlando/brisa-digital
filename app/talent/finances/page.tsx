import type { Metadata } from "next";
import TalentFinances from "@/features/talent/TalentFinances";

export const metadata: Metadata = { title: "Finances — Brisa Digital" };

export default function TalentFinancesPage() {
  return <TalentFinances />;
}
