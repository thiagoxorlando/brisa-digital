import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import JobDetail from "@/features/agency/JobDetail";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { getUserPremiumWorkspace } from "@/lib/premiumWorkspace.server";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = createServerClient({ useServiceRole: true });
  const { data } = await supabase.from("jobs").select("title").eq("id", id).single();
  return { title: data ? `${data.title} — BrisaHub` : "Vaga não encontrada — BrisaHub" };
}

export default async function JobDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = createServerClient({ useServiceRole: true });
  const session = await createSessionClient();
  const {
    data: { user },
  } = await session.auth.getUser();

  if (!user) redirect("/login");

  const workspaceAccess = await getUserPremiumWorkspace(user.id);

  const { data: jobData } = await supabase
    .from("jobs")
    .select(
      "id, title, description, category, budget, deadline, job_date, job_time, location, status, created_at, number_of_talents_required, visibility, invite_only, workspace_id, agency_id, created_by_user_id"
    )
    .eq("id", id)
    .single();

  if (!jobData) notFound();

  const workspaceId = (jobData as { workspace_id?: string | null }).workspace_id ?? null;
  const canAccessWorkspaceJob =
    !!workspaceId &&
    workspaceAccess?.workspace.id === workspaceId &&
    workspaceAccess.membership.status === "active";
  const canAccessStandaloneJob = !workspaceId && jobData.agency_id === user.id;

  if (!canAccessWorkspaceJob && !canAccessStandaloneJob) {
    notFound();
  }

  if (canAccessWorkspaceJob) {
    redirect(`/agency/workspace/jobs/${id}`);
  }

  const [{ data: submissionsData }, { data: bookingsData }] = await Promise.all([
    supabase
      .from("submissions")
      .select("id, talent_user_id, talent_name, referrer_id, bio, status, mode, created_at, photo_front_url, photo_left_url, photo_right_url, video_url, curriculum_url, portfolio_url")
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

  const talentIds = [
    ...new Set(
      [
        ...(submissionsData ?? []).map((submission) => submission.talent_user_id),
        ...(bookingsData ?? []).map((booking) => booking.talent_user_id),
      ].filter((talentId): talentId is string => !!talentId)
    ),
  ];

  const profileMap = new Map<string, { full_name: string; avatar_url: string | null; bio: string | null }>();
  if (talentIds.length) {
    const { data: profiles } = await supabase
      .from("talent_profiles")
      .select("id, full_name, avatar_url, bio")
      .in("id", talentIds);
    for (const profile of profiles ?? []) {
      profileMap.set(profile.id, {
        full_name: profile.full_name ?? "",
        avatar_url: profile.avatar_url ?? null,
        bio: (profile as { bio?: string | null }).bio ?? null,
      });
    }
  }

  const job = {
    id: String(jobData.id),
    title: jobData.title ?? "",
    description: jobData.description ?? "",
    category: jobData.category ?? "",
    budget: jobData.budget ?? 0,
    deadline: jobData.deadline ?? "",
    jobDate: jobData.job_date ?? null,
    jobTime: jobData.job_time ?? null,
    location: jobData.location ?? null,
    visibility: (jobData.visibility ?? "public") as "public" | "private" | "private_invite",
    inviteOnly: (jobData as { invite_only?: boolean }).invite_only ?? false,
    workspaceId: workspaceId,
    status: (jobData.status ?? "open") as "open" | "closed" | "draft" | "inactive" | "paused",
    postedAt: jobData.created_at ?? "",
    agencyId: String(jobData.agency_id ?? user.id),
    numberOfTalentsRequired: jobData.number_of_talents_required ?? 1,
  };

  const submissions = (submissionsData ?? []).map((submission) => {
    const profile = submission.talent_user_id ? profileMap.get(submission.talent_user_id) : null;
    return {
      id: String(submission.id),
      talentId: submission.talent_user_id ?? null,
      talentName: profile?.full_name ?? submission.talent_name ?? "",
      avatarUrl: profile?.avatar_url ?? null,
      bio: submission.bio || profile?.bio || "",
      status: submission.status ?? "pending",
      mode: submission.mode ?? "other",
      isReferral: Boolean(submission.referrer_id),
      submittedAt: submission.created_at ?? "",
      photoFrontUrl:  submission.photo_front_url ?? null,
      photoLeftUrl:   submission.photo_left_url ?? null,
      photoRightUrl:  submission.photo_right_url ?? null,
      videoUrl:       submission.video_url ?? null,
      curriculumUrl:  submission.curriculum_url ?? null,
      portfolioUrl:   submission.portfolio_url ?? null,
    };
  });

  const bookings = (bookingsData ?? []).map((booking) => {
    const profile = booking.talent_user_id ? profileMap.get(booking.talent_user_id) : null;
    const contractArr = Array.isArray((booking as { contracts?: Array<{ id?: string | null }> }).contracts)
      ? ((booking as { contracts?: Array<{ id?: string | null }> }).contracts ?? [])
      : [];

    return {
      id: String(booking.id),
      talentId: booking.talent_user_id ?? null,
      talentName: profile?.full_name ?? "Talento sem nome",
      jobTitle: booking.job_title ?? job.title ?? "—",
      price: booking.price ?? 0,
      status: booking.status ?? "pending",
      createdAt: booking.created_at ?? "",
      contractId: contractArr[0]?.id ?? null,
    };
  });

  return <JobDetail job={job} submissions={submissions} bookings={bookings} agencyId={String(jobData.agency_id ?? user.id)} />;
}
