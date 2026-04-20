import type { Metadata } from "next";
import JobDetail from "@/features/agency/JobDetail";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = createServerClient({ useServiceRole: true });
  const { data } = await supabase.from("jobs").select("title").eq("id", id).single();
  return { title: data ? `${data.title} — Brisa Digital` : "Job Not Found — Brisa Digital" };
}

export default async function JobDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = createServerClient({ useServiceRole: true });
  const session  = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  const [{ data: jobData }, { data: submissionsData }, { data: bookingsData }] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, title, description, category, budget, deadline, job_date, job_time, status, created_at, number_of_talents_required, visibility")
      .eq("id", id)
      .single(),
    supabase
      .from("submissions")
      .select("id, talent_user_id, bio, status, mode, created_at, photo_front_url, photo_left_url, photo_right_url, video_url")
      .eq("job_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("bookings")
      .select(`
        id, talent_user_id, job_title, price, status, created_at,
        contracts!contracts_booking_id_fkey ( id )
      `)
      .eq("job_id", id)
      .order("created_at", { ascending: false }),
  ]);

  // Resolve talent names from talent_profiles
  const talentIds = [
    ...new Set([
      ...(submissionsData ?? []).map((s) => s.talent_user_id),
      ...(bookingsData ?? []).map((b) => b.talent_user_id),
    ].filter((id): id is string => !!id)),
  ];

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

  const job = jobData
    ? {
        id:          String(jobData.id),
        title:       jobData.title       ?? "",
        description: jobData.description ?? "",
        category:    jobData.category    ?? "",
        budget:      jobData.budget      ?? 0,
        deadline:    jobData.deadline    ?? "",
        jobDate:     jobData.job_date  ?? null,
        jobTime:     jobData.job_time  ?? null,
        visibility:  (jobData.visibility ?? "public") as "public" | "private",
        status:                    (jobData.status ?? "open") as "open" | "closed" | "draft" | "inactive",
        postedAt:                  jobData.created_at ?? "",
        agencyId:                  user?.id,
        numberOfTalentsRequired:   jobData.number_of_talents_required ?? 1,
      }
    : null;

  const submissions = (submissionsData ?? []).map((s) => {
    const profile = s.talent_user_id ? profileMap.get(s.talent_user_id) : null;
    return {
      id:             String(s.id),
      talentId:       s.talent_user_id ?? null,
      talentName:     profile?.full_name ?? "External Referral",
      avatarUrl:      profile?.avatar_url ?? null,
      bio:            s.bio              ?? "",
      status:         s.status           ?? "pending",
      mode:           s.mode             ?? "other",
      submittedAt:    s.created_at       ?? "",
      photoFrontUrl:  s.photo_front_url  ?? null,
      photoLeftUrl:   s.photo_left_url   ?? null,
      photoRightUrl:  s.photo_right_url  ?? null,
      videoUrl:       s.video_url        ?? null,
    };
  });

  const bookings = (bookingsData ?? []).map((b) => {
    const profile     = b.talent_user_id ? profileMap.get(b.talent_user_id) : null;
    const contractArr = Array.isArray((b as any).contracts) ? (b as any).contracts : [];
    return {
      id:          String(b.id),
      talentId:    b.talent_user_id ?? null,
      talentName:  profile?.full_name ?? "Talento sem nome",
      jobTitle:    b.job_title  ?? job?.title ?? "—",
      price:       b.price      ?? 0,
      status:      b.status     ?? "pending",
      createdAt:   b.created_at ?? "",
      contractId:  contractArr[0]?.id ?? null,
    };
  });

  return <JobDetail job={job} submissions={submissions} bookings={bookings} agencyId={user?.id} />;
}
