import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import TalentHistory from "@/features/agency/TalentHistory";

export const metadata: Metadata = { title: "Histórico de talentos — BrisaHub" };

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
      {/* Header */}
      <div className="rounded-[1.75rem] bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] px-6 py-6 text-white shadow-[0_8px_28px_rgba(26,188,156,0.28)]">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/80 mb-2">
          Histórico de contratações
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[2rem] font-black tracking-[-0.04em] leading-tight">Minha Equipe</h1>
            <p className="text-[13px] text-white/70 mt-2 max-w-2xl">
              Talentos que já trabalharam com você, com histórico, disponibilidade e ações para recontratar com contexto.
            </p>
          </div>
          <div className="rounded-2xl border border-white/20 bg-white/15 px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">Talentos no histórico</p>
            <p className="mt-1 text-2xl font-black tracking-[-0.04em] text-white">{combined.length}</p>
          </div>
        </div>
      </div>

      {defaultJobId && (
        <div className="flex items-center gap-2.5 bg-[#D1F4EB] border border-[#A7E8D6] rounded-2xl px-5 py-3.5">
          <svg className="w-4 h-4 text-emerald-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-[13px] text-emerald-900 font-semibold">
            Use "Escolher vaga e valor" para convidar um talento deste histórico para a vaga selecionada.
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
