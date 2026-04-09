import type { Metadata } from "next";
import TalentProfileForm from "@/features/talent/TalentProfileForm";

export const metadata: Metadata = {
  title: "Create Profile — Brisa Digital",
};

export default function CreateProfilePage() {
  return <TalentProfileForm />;
}
