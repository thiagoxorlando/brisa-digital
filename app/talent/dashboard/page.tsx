import type { Metadata } from "next";
import TalentDashboard from "@/features/talent/TalentDashboard";

export const metadata: Metadata = { title: "Talent Dashboard — ucastanet" };

export default function TalentDashboardPage() {
  return <TalentDashboard />;
}
