import type { Metadata } from "next";
import AgencyReferrals from "@/features/agency/AgencyReferrals";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";

export const metadata: Metadata = { title: "Referrals — ucastanet" };

export default async function AgencyReferralsPage() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  const supabase = createServerClient({ useServiceRole: true });

  if (!user) return <AgencyReferrals referrals={[]} />;

  // Get this agency's jobs
  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, title")
    .eq("agency_id", user.id);

  if (!jobs || jobs.length === 0) return <AgencyReferrals referrals={[]} />;

  const jobIds = jobs.map((j) => j.id);
  const jobMap = new Map<string, string>(jobs.map((j) => [j.id, j.title ?? "—"]));

  // Submissions with a referrer for this agency's jobs
  const { data: subs } = await supabase
    .from("submissions")
    .select("id, job_id, talent_user_id, talent_name, referrer_id, status, created_at")
    .in("job_id", jobIds)
    .not("referrer_id", "is", null)
    .order("created_at", { ascending: false });

  if (!subs || subs.length === 0) return <AgencyReferrals referrals={[]} />;

  const talentIds  = [...new Set(subs.map((s) => s.talent_user_id).filter(Boolean))] as string[];
  const referrerIds = [...new Set(subs.map((s) => s.referrer_id).filter(Boolean))] as string[];

  const [talentRes, referrerRes, bookingsRes] = await Promise.all([
    talentIds.length   ? supabase.from("talent_profiles").select("id, full_name").in("id", talentIds)   : Promise.resolve({ data: [] }),
    referrerIds.length ? supabase.from("talent_profiles").select("id, full_name").in("id", referrerIds) : Promise.resolve({ data: [] }),
    supabase.from("bookings").select("job_id, talent_user_id").in("job_id", jobIds),
  ]);

  const talentMap   = new Map<string, string>((talentRes.data ?? []).map((t: any) => [t.id, t.full_name ?? ""]));
  const referrerMap = new Map<string, string>((referrerRes.data ?? []).map((t: any) => [t.id, t.full_name ?? ""]));
  const bookedSet   = new Set<string>((bookingsRes.data ?? []).map((b: any) => `${b.job_id}::${b.talent_user_id}`));

  const referrals = subs.map((s) => ({
    id:               String(s.id),
    jobTitle:         s.job_id ? (jobMap.get(s.job_id) ?? "—") : "—",
    talentName:       s.talent_user_id ? (talentMap.get(s.talent_user_id) ?? null) : (s.talent_name ?? null),
    referrerName:     s.referrer_id ? (referrerMap.get(s.referrer_id) ?? null) : null,
    submittedAt:      s.created_at ?? "",
    submissionStatus: s.status ?? "pending",
    booked:           !!(s.job_id && s.talent_user_id && bookedSet.has(`${s.job_id}::${s.talent_user_id}`)),
  }));

  return <AgencyReferrals referrals={referrals} />;
}
