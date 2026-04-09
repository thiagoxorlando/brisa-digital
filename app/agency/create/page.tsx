import type { Metadata } from "next";
import CreateTalentForm from "@/features/agency/CreateTalentForm";

export const metadata: Metadata = { title: "Create Talent — Brisa Digital" };

export default function AgencyCreatePage() {
  return <CreateTalentForm />;
}
