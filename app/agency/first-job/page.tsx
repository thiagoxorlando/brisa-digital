import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase.server";
import AgencyFirstJobWizard from "@/features/agency/AgencyFirstJobWizard";

export const metadata: Metadata = { title: "Post Your First Job — BrisaHub" };

export default async function FirstJobPage() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  if (!user) redirect("/login");

  return <AgencyFirstJobWizard />;
}
