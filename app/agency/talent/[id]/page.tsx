import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AgencyTalentProfile from "@/features/agency/AgencyTalentProfile";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { canViewerAccessTalentProfile } from "@/lib/talentMarketplace";

export const metadata: Metadata = { title: "Talent Profile — BrisaHub" };
export const dynamic = "force-dynamic";

export default async function AgencyTalentProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createServerClient({ useServiceRole: true });
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  const [{ data: talent }, { data: jobs }, { data: submissions }, { count: completedJobsCount }] = await Promise.all([
    supabase
      .from("talent_profiles")
      .select("*")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("jobs")
      .select("id, title")
      .eq("status", "open")
      .order("created_at", { ascending: false }),
    supabase
      .from("submissions")
      .select("job_id")
      .eq("talent_user_id", id),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("talent_user_id", id)
      .in("status", ["paid", "completed", "confirmed"])
      .is("deleted_at", null),
  ]);

  if (!talent) notFound();

  const canAccess = await canViewerAccessTalentProfile(
    supabase,
    {
      id: String(talent.id),
      user_id: (talent.user_id as string | null) ?? null,
      marketplace_visible: (talent.marketplace_visible as boolean | null) ?? null,
    },
    user?.id ?? null,
  );

  if (!canAccess) notFound();

  const appliedJobIds = (submissions ?? []).map((s: { job_id: string }) => s.job_id);

  return (
    <AgencyTalentProfile
      talent={talent}
      jobs={jobs ?? []}
      appliedJobIds={appliedJobIds}
      completedJobsCount={completedJobsCount ?? 0}
    />
  );
}
