import type { Metadata } from "next";
import AgencySubmissions, { type SubmissionEntry } from "@/features/agency/AgencySubmissions";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";

export const metadata: Metadata = { title: "Submissions — Brisa Digital" };

export default async function SubmissionsPage() {
  const session  = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  const supabase = createServerClient({ useServiceRole: true });

  // Fetch agency's jobs
  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, title")
    .eq("agency_id", user?.id ?? "");

  const jobIds = (jobs ?? []).map((j) => j.id);
  const jobTitleMap = new Map<string, string>();
  for (const j of jobs ?? []) jobTitleMap.set(j.id, j.title ?? "Untitled Job");

  if (!jobIds.length) {
    return <AgencySubmissions submissions={[]} />;
  }

  // Fetch submissions, contracts, and bookings in parallel
  const [{ data: subsData }, { data: contractsData }, { data: bookingsData }] = await Promise.all([
    supabase
      .from("submissions")
      .select("id, job_id, talent_user_id, bio, mode, status, created_at, photo_front_url, photo_left_url, photo_right_url, video_url")
      .in("job_id", jobIds)
      .order("created_at", { ascending: false }),
    supabase
      .from("contracts")
      .select("talent_id, job_id, status")
      .in("job_id", jobIds),
    supabase
      .from("bookings")
      .select("talent_user_id, job_id, status")
      .in("job_id", jobIds),
  ]);

  // Build contract map: `${talentId}:${jobId}` → status
  const contractMap = new Map<string, string>();
  for (const c of contractsData ?? []) {
    if (c.talent_id && c.job_id) {
      contractMap.set(`${c.talent_id}:${c.job_id}`, c.status);
    }
  }

  // Build booking map: `${talentId}:${jobId}` → status
  const bookingMap = new Map<string, string>();
  for (const b of bookingsData ?? []) {
    if (b.talent_user_id && b.job_id) {
      bookingMap.set(`${b.talent_user_id}:${b.job_id}`, b.status);
    }
  }

  const talentIds = [
    ...new Set((subsData ?? []).map((s) => s.talent_user_id).filter(Boolean)),
  ] as string[];

  const profileMap = new Map<string, { full_name: string; avatar_url: string | null }>();
  if (talentIds.length) {
    const { data: profiles } = await supabase
      .from("talent_profiles")
      .select("id, full_name, avatar_url")
      .in("id", talentIds);
    for (const p of profiles ?? []) {
      profileMap.set(p.id, { full_name: p.full_name ?? "", avatar_url: p.avatar_url ?? null });
    }
  }

  const submissions: SubmissionEntry[] = (subsData ?? []).map((s) => {
    const profile = s.talent_user_id ? profileMap.get(s.talent_user_id) : null;
    const key = s.talent_user_id && s.job_id ? `${s.talent_user_id}:${s.job_id}` : null;
    return {
      id:             s.id,
      jobId:          s.job_id        ?? "",
      jobTitle:       jobTitleMap.get(s.job_id) ?? "Unknown Job",
      talentId:       s.talent_user_id ?? null,
      talentName:     profile?.full_name ?? "External Referral",
      avatarUrl:      profile?.avatar_url ?? null,
      bio:            s.bio            ?? "",
      mode:           s.mode           ?? "other",
      status:         s.status         ?? "pending",
      submittedAt:    s.created_at     ?? "",
      photoFrontUrl:  s.photo_front_url ?? null,
      photoLeftUrl:   s.photo_left_url  ?? null,
      photoRightUrl:  s.photo_right_url ?? null,
      videoUrl:       s.video_url       ?? null,
      contractStatus: key ? (contractMap.get(key) ?? null) : null,
      bookingStatus:  key ? (bookingMap.get(key)  ?? null) : null,
    };
  });

  return <AgencySubmissions submissions={submissions} />;
}
