import type { Metadata } from "next";
import TalentProfileEdit from "@/features/talent/TalentProfileEdit";

export const metadata: Metadata = { title: "My Profile — Brisa Digital" };

export default function TalentProfilePage() {
  return <TalentProfileEdit />;
}
