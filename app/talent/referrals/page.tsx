import type { Metadata } from "next";
import TalentReferrals from "@/features/talent/TalentReferrals";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";

export const metadata: Metadata = { title: "Indicações — Brisa Digital" };

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

  // Referral invites created by this user
  const { data: invites } = await supabase
    .from("referral_invites")
    .select("id, submission_id, status, commission_paid")
    .eq("referrer_id", user.id);

  const inviteBySubmission = new Map<string, { id: string; status: string; commission_paid: number | null }>(
    (invites ?? [])
      .filter((i: any) => i.submission_id)
      .map((i: any) => [i.submission_id, { id: i.id, status: i.status, commission_paid: i.commission_paid ?? null }])
  );

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
    const job    = s.job_id ? jobMap.get(s.job_id) : null;
    const booked = !!(s.job_id && s.talent_user_id && bookedSet.has(`${s.job_id}::${s.talent_user_id}`));
    const invite = inviteBySubmission.get(s.id);
    return {
      id:               String(s.id),
      jobTitle:         job?.title ?? "—",
      agencyName:       job?.agencyId ? (agencyMap.get(job.agencyId) ?? "—") : "—",
      talentName:       s.talent_user_id ? (talentMap.get(s.talent_user_id) ?? null) : (s.talent_name ?? null),
      submittedAt:      s.created_at ?? "",
      submissionStatus: s.status ?? "pending",
      booked,
      commissionAmount: invite?.commission_paid ?? null,
      fraudReported:    invite?.status === "fraud_reported",
      referralInviteId: invite?.id ?? null,
      hasAccount:       !!s.talent_user_id,
    };
  });

  return <TalentReferrals referrals={referrals} />;
}
