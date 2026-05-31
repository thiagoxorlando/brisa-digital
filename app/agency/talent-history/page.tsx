import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import TalentHistory from "@/features/agency/TalentHistory";
import TalentHistoryHeader from "@/features/agency/TalentHistoryHeader";

export const metadata: Metadata = { title: "Talent History — BrisaHub" };

export default async function TalentHistoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ job_id?: string | string[] }>;
}) {
  const resolvedSearchParams = await searchParams;
  const rawJobId = resolvedSearchParams?.job_id;
  const defaultJobId = Array.isArray(rawJobId) ? rawJobId[0] : rawJobId;
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) redirect("/login");

  const agencyId = user.id;
  const supabase = createServerClient({ useServiceRole: true });

  const { data: rawHistory } = await supabase
    .from("agency_talent_history")
    .select("*")
    .eq("agency_id", agencyId)
    .order("is_favorite", { ascending: false })
    .order("last_worked_at", { ascending: false });

  const history = rawHistory ?? [];

  // Batch-join talent profiles
  const talentIds = history.map((h) => h.talent_id);
  const { data: profiles } = talentIds.length
    ? await supabase
        .from("talent_profiles")
        .select("id, full_name, avatar_url, city, country, main_role, categories")
        .in("id", talentIds)
    : { data: [] };

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const combined = history.map((h) => ({
    ...h,
    talent: profileMap.get(h.talent_id) ?? null,
  }));

  // Pre-fetch today's availability for all talent_ids
  const today = new Date().toISOString().slice(0, 10);
  const initialAvailability: Record<string, { is_available: boolean; start_time: string | null; end_time: string | null } | null> = {};
  if (talentIds.length) {
    const { data: availRows } = await supabase
      .from("talent_availability")
      .select("talent_id, is_available, start_time, end_time")
      .in("talent_id", talentIds)
      .eq("date", today);
    for (const id of talentIds) initialAvailability[id] = null;
    for (const row of availRows ?? []) {
      initialAvailability[row.talent_id] = {
        is_available: row.is_available,
        start_time:   row.start_time,
        end_time:     row.end_time,
      };
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Header — client component so it can use useT() */}
      <TalentHistoryHeader count={combined.length} defaultJobId={defaultJobId} />

      <TalentHistory
        agencyId={agencyId}
        initialHistory={combined}
        defaultJobId={defaultJobId}
        initialAvailability={initialAvailability}
        initialFilterDate={today}
      />
    </div>
  );
}
