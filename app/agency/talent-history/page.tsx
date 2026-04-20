import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import TalentHistory from "@/features/agency/TalentHistory";

export const metadata: Metadata = { title: "Minha Equipe — Brisa Digital" };

export default async function TalentHistoryPage({
  searchParams,
}: {
  searchParams?: { job_id?: string };
}) {
  const defaultJobId = searchParams?.job_id;
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
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h1 className="text-[22px] font-semibold tracking-tight text-zinc-900">Minha Equipe</h1>
        </div>
        <p className="text-[14px] text-zinc-400">
          Talentos que já trabalharam com você.
          {combined.length > 0 && (
            <span className="ml-1 font-medium text-zinc-600">
              {combined.length} {combined.length === 1 ? "talento" : "talentos"}.
            </span>
          )}
        </p>
      </div>

      {defaultJobId && (
        <div className="flex items-center gap-2.5 bg-violet-50 border border-violet-100 rounded-2xl px-5 py-3.5">
          <svg className="w-4 h-4 text-violet-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-[13px] text-violet-700 font-medium">
            Clique em "Contratar novamente" para convidar um talento diretamente para esta vaga.
          </p>
        </div>
      )}

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
