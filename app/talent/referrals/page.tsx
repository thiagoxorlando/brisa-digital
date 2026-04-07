import type { Metadata } from "next";
import TalentReferrals from "@/features/talent/TalentReferrals";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";

export const metadata: Metadata = { title: "Referrals — ucastanet" };

const REFERRAL_RATE = 0.02;

export default async function TalentReferralsPage() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  const supabase = createServerClient({ useServiceRole: true });

  if (!user) return <TalentReferrals referrals={[]} />;

  // Submissions where I'm the referrer
  const { data: subs } = await supabase
    .from("submissions")
    .select("id, job_id, talent_user_id, talent_name, status, created_at")
    .eq("referrer_id", user.id)
    .order("created_at", { ascending: false });

  if (!subs || subs.length === 0) return <TalentReferrals referrals={[]} />;

  const jobIds    = [...new Set(subs.map((s) => s.job_id).filter(Boolean))] as string[];
  const talentIds = [...new Set(subs.map((s) => s.talent_user_id).filter(Boolean))] as string[];

  const [jobsRes, talentRes, bookingsRes] = await Promise.all([
    jobIds.length    ? supabase.from("jobs").select("id, title, agency_id").in("id", jobIds) : Promise.resolve({ data: [] }),
    talentIds.length ? supabase.from("talent_profiles").select("id, full_name").in("id", talentIds) : Promise.resolve({ data: [] }),
    jobIds.length    ? supabase.from("bookings").select("job_id, talent_user_id").in("job_id", jobIds) : Promise.resolve({ data: [] }),
  ]);

  const agencyIds = [...new Set((jobsRes.data ?? []).map((j: any) => j.agency_id).filter(Boolean))] as string[];
  const agenciesRes = agencyIds.length
    ? await supabase.from("agencies").select("id, company_name").in("id", agencyIds)
    : { data: [] };

  const jobMap     = new Map<string, { title: string; agencyId: string }>((jobsRes.data ?? []).map((j: any) => [j.id, { title: j.title ?? "—", agencyId: j.agency_id }]));
  const talentMap  = new Map<string, string>((talentRes.data ?? []).map((t: any) => [t.id, t.full_name ?? ""]));
  const agencyMap  = new Map<string, string>((agenciesRes.data ?? []).map((a: any) => [a.id, a.company_name ?? ""]));
  const bookedSet  = new Set<string>((bookingsRes.data ?? []).map((b: any) => `${b.job_id}::${b.talent_user_id}`));

  const referrals = subs.map((s) => {
    const job = s.job_id ? jobMap.get(s.job_id) : null;
    const booked = !!(s.job_id && s.talent_user_id && bookedSet.has(`${s.job_id}::${s.talent_user_id}`));
    return {
      id:               String(s.id),
      jobTitle:         job?.title ?? "—",
      agencyName:       job?.agencyId ? (agencyMap.get(job.agencyId) ?? "—") : "—",
      talentName:       s.talent_user_id ? (talentMap.get(s.talent_user_id) ?? null) : (s.talent_name ?? null),
      submittedAt:      s.created_at ?? "",
      submissionStatus: s.status ?? "pending",
      booked,
    };
  });

  return <TalentReferrals referrals={referrals} />;
}
