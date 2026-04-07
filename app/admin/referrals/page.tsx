import type { Metadata } from "next";
import AdminReferrals from "@/features/admin/AdminReferrals";
import { createServerClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Admin — Referrals — ucastanet" };

const REFERRAL_RATE = 0.02;

export default async function AdminReferralsPage() {
  const supabase = createServerClient({ useServiceRole: true });

  // All submissions with a referrer
  const { data: subs } = await supabase
    .from("submissions")
    .select("id, job_id, talent_user_id, talent_name, referrer_id, status, created_at")
    .not("referrer_id", "is", null)
    .order("created_at", { ascending: false });

  if (!subs || subs.length === 0) return <AdminReferrals referrals={[]} />;

  const jobIds      = [...new Set(subs.map((s) => s.job_id).filter(Boolean))] as string[];
  const talentIds   = [...new Set(subs.map((s) => s.talent_user_id).filter(Boolean))] as string[];
  const referrerIds = [...new Set(subs.map((s) => s.referrer_id).filter(Boolean))] as string[];

  const [jobsRes, talentRes, referrerRes, bookingsRes] = await Promise.all([
    jobIds.length      ? supabase.from("jobs").select("id, title, agency_id").in("id", jobIds)           : Promise.resolve({ data: [] }),
    talentIds.length   ? supabase.from("talent_profiles").select("id, full_name").in("id", talentIds)    : Promise.resolve({ data: [] }),
    referrerIds.length ? supabase.from("talent_profiles").select("id, full_name").in("id", referrerIds)  : Promise.resolve({ data: [] }),
    jobIds.length      ? supabase.from("bookings").select("job_id, talent_user_id, price").in("job_id", jobIds) : Promise.resolve({ data: [] }),
  ]);

  const agencyIds = [...new Set((jobsRes.data ?? []).map((j: any) => j.agency_id).filter(Boolean))] as string[];
  const agenciesRes = agencyIds.length
    ? await supabase.from("agencies").select("id, company_name").in("id", agencyIds)
    : { data: [] };

  const jobMap      = new Map<string, { title: string; agencyId: string }>((jobsRes.data ?? []).map((j: any) => [j.id, { title: j.title ?? "—", agencyId: j.agency_id }]));
  const talentMap   = new Map<string, string>((talentRes.data ?? []).map((t: any) => [t.id, t.full_name ?? ""]));
  const referrerMap = new Map<string, string>((referrerRes.data ?? []).map((t: any) => [t.id, t.full_name ?? ""]));
  const agencyMap   = new Map<string, string>((agenciesRes.data ?? []).map((a: any) => [a.id, a.company_name ?? ""]));
  const bookingMap  = new Map<string, number>((bookingsRes.data ?? []).map((b: any) => [`${b.job_id}::${b.talent_user_id}`, Number(b.price ?? 0)]));

  const referrals = subs.map((s) => {
    const job          = s.job_id ? jobMap.get(s.job_id) : null;
    const bookingValue = (s.job_id && s.talent_user_id)
      ? (bookingMap.get(`${s.job_id}::${s.talent_user_id}`) ?? 0)
      : 0;
    return {
      id:               String(s.id),
      jobTitle:         job?.title ?? "—",
      agencyName:       job?.agencyId ? (agencyMap.get(job.agencyId) ?? "—") : "—",
      talentName:       s.talent_user_id ? (talentMap.get(s.talent_user_id) ?? null) : (s.talent_name ?? null),
      referrerName:     s.referrer_id ? (referrerMap.get(s.referrer_id) ?? null) : null,
      submittedAt:      s.created_at ?? "",
      submissionStatus: s.status ?? "pending",
      booked:           bookingValue > 0,
      bookingValue,
      referralPayout:   bookingValue > 0 ? Math.round(bookingValue * REFERRAL_RATE) : 0,
    };
  });

  return <AdminReferrals referrals={referrals} />;
}
