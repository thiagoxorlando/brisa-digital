import { createServerClient } from "@/lib/supabase";

export type TalentSuggestion = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  main_role: string | null;
  city: string | null;
  is_favorite: boolean;
  has_history: boolean;
  jobs_count: number;
  jobs_completed: number;
  jobs_cancelled: number;
  is_available: boolean;
  is_unavailable: boolean;
  start_time: string | null;
  already_invited: boolean;
  score: number;
};

export async function getJobSuggestions(
  jobId: string,
  agencyId: string,
  limit = 10,
  privateOnly = false,
): Promise<{ suggestions: TalentSuggestion[]; job_date: string | null }> {
  const supabase = createServerClient({ useServiceRole: true });

  const { data: job } = await supabase
    .from("jobs")
    .select("id, job_date, job_role")
    .eq("id", jobId)
    .single();

  if (!job) return { suggestions: [], job_date: null };

  const [{ data: allTalents }, { data: history }, { data: existingInvites }] =
    await Promise.all([
      supabase
        .from("talent_profiles")
        .select("id, full_name, avatar_url, main_role, city"),
      supabase
        .from("agency_talent_history")
        .select("talent_id, is_favorite, jobs_count, jobs_completed, jobs_cancelled")
        .eq("agency_id", agencyId),
      supabase
        .from("job_invites")
        .select("talent_id")
        .eq("job_id", jobId),
    ]);

  // Fetch availability separately to avoid TypeScript union issues with conditional Supabase query
  type AvailRow = { talent_id: string; is_available: boolean; start_time: string | null };
  let availRows: AvailRow[] = [];
  if (job.job_date) {
    const { data } = await supabase
      .from("talent_availability")
      .select("talent_id, is_available, start_time")
      .eq("date", job.job_date);
    availRows = data ?? [];
  }

  const jobRole      = job.job_role;
  const historyMap   = new Map((history ?? []).map((h) => [h.talent_id, h]));
  const availSet     = new Set(availRows.filter((r) => r.is_available).map((r) => r.talent_id));
  const unavailSet   = new Set(availRows.filter((r) => !r.is_available).map((r) => r.talent_id));
  const availTimeMap = new Map(availRows.filter((r) => r.is_available).map((r) => [r.talent_id, r.start_time]));
  const invitedSet   = new Set((existingInvites ?? []).map((i) => i.talent_id));

  function score(id: string, main_role: string | null): number {
    const h          = historyMap.get(id);
    const isFav      = h?.is_favorite ?? false;
    const hasHistory = !!h;
    const isAvail    = availSet.has(id);
    const isUnavail  = unavailSet.has(id);
    const roleMatch  =
      jobRole && main_role
        ? main_role.toLowerCase().trim() === jobRole.toLowerCase().trim()
        : false;

    if (isUnavail)             return 9;
    if (isFav && isAvail)      return 0;
    if (hasHistory && isAvail) return 1;
    if (isAvail && roleMatch)  return 2;
    if (isAvail)               return 3;
    if (isFav)                 return 4;
    if (hasHistory && roleMatch) return 5;
    if (hasHistory)            return 6;
    if (roleMatch)             return 7;
    return 8;
  }

  const talents = privateOnly
    ? (allTalents ?? []).filter((t) => historyMap.has(t.id))
    : (allTalents ?? []);

  const suggestions = talents
    .map((t) => ({
      id:             t.id,
      full_name:      t.full_name,
      avatar_url:     t.avatar_url,
      main_role:      t.main_role,
      city:           t.city,
      is_favorite:    historyMap.get(t.id)?.is_favorite   ?? false,
      has_history:    historyMap.has(t.id),
      jobs_count:     historyMap.get(t.id)?.jobs_count    ?? 0,
      jobs_completed: historyMap.get(t.id)?.jobs_completed ?? 0,
      jobs_cancelled: historyMap.get(t.id)?.jobs_cancelled ?? 0,
      is_available:   availSet.has(t.id),
      is_unavailable: unavailSet.has(t.id),
      start_time:     availTimeMap.get(t.id) ?? null,
      already_invited: invitedSet.has(t.id),
      score:          score(t.id, t.main_role),
    }))
    .sort((a, b) => a.score - b.score || b.jobs_count - a.jobs_count)
    .slice(0, limit);

  return { suggestions, job_date: job.job_date };
}
