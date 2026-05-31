import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase.server";
import AvailabilityCalendar from "@/features/talent/AvailabilityCalendar";
import AvailabilityHeader from "@/features/talent/AvailabilityHeader";

export const metadata: Metadata = { title: "Availability — BrisaHub" };

export default async function AvailabilityPage() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">

      <AvailabilityHeader />
      <AvailabilityCalendar talentId={user.id} />
    </div>
  );
}
