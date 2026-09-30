import type { Metadata } from "next";
import CreateTalentForm from "@/features/agency/CreateTalentForm";

export const metadata: Metadata = { title: "Add Talent — CastAnet" };

export default function AgencyCreatePage() {
  return <CreateTalentForm />;
}
