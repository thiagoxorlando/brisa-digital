import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import WorkspacePipelineBoard, {
  type PipelineJob,
  type PipelineCandidate,
  type PipelineNote,
  type PresentationSummary,
} from "@/features/agency/WorkspacePipelineBoard";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { getUserPremiumWorkspace } from "@/lib/premiumWorkspace.server";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = createServerClient({ useServiceRole: true });
  const { data } = await supabase.from("jobs").select("title").eq("id", id).single();
  return { title: data ? `${data.title} — BrisaHub Premium` : "Vaga privada — BrisaHub" };
}

export default async function WorkspaceJobDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = createServerClient({ useServiceRole: true });
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  if (!user) redirect("/login");

  const workspaceAccess = await getUserPremiumWorkspace(user.id);
  if (!workspaceAccess || workspaceAccess.membership.status !== "active") notFound();

  const isWorkspaceOwner = workspaceAccess.membership.role === "owner";

  const { data: jobData } = await supabase
    .from("jobs")
    .select(
      "id, title, description, category, budget, deadline, job_date, job_time, location, status, created_at, number_of_talents_required, visibility, invite_only, workspace_id, agency_id, created_by_user_id, gender, age_min, age_max, application_requirements"
    )
    .eq("id", id)
    .single();

  if (!jobData) notFound();

  const workspaceId = (jobData as { workspace_id?: string | null }).workspace_id ?? null;
  if (!workspaceId || workspaceAccess.workspace.id !== workspaceId) notFound();

  const isCreator = (jobData as { created_by_user_id?: string | null }).created_by_user_id === user.id;
  const readOnly = !(isWorkspaceOwner || isCreator);

  // Try fetching submissions with pipeline_status (requires migration 20260517).
  // If the column doesn't exist yet PostgREST returns data:null — fall back to
  // the legacy select so candidates are never silently empty.
  const BASE_SELECT = "id, talent_user_id, talent_name, referrer_id, bio, status, mode, created_at, photo_front_url, photo_left_url, photo_right_url, video_url, curriculum_url, portfolio_url";

  const [subsResult, { data: bookingsData }] = await Promise.all([
    supabase
      .from("submissions")
      .select(`${BASE_SELECT}, pipeline_status`)
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

  // If pipeline_status column doesn't exist the query returns data:null — retry without it
  const submissionsData = subsResult.data
    ?? (await supabase
        .from("submissions")
        .select(BASE_SELECT)
        .eq("job_id", id)
        .order("created_at", { ascending: false })
      ).data;

  const submissions = submissionsData ?? [];
  const bookings   = bookingsData   ?? [];

  const talentIds = [
    ...new Set(
      [
        ...submissions.map((s) => s.talent_user_id),
        ...bookings.map((b) => b.talent_user_id),
      ].filter((tid): tid is string => !!tid)
    ),
  ];

  const submissionIds = submissions.map((s) => s.id).filter(Boolean);

  const [profilesResult, notesResult, presResult] = await Promise.all([
    talentIds.length
      ? supabase
          .from("talent_profiles")
          .select("id, full_name, avatar_url, age, city, gender, bio")
          .in("id", talentIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null; avatar_url: string | null; age: number | null; city: string | null; gender: string | null; bio: string | null }> }),
    submissionIds.length
      ? supabase
          .from("submission_pipeline_notes")
          .select("id, submission_id, author_name, body, created_at")
          .in("submission_id", submissionIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as Array<{ id: string; submission_id: string; author_name: string; body: string; created_at: string }> }),
    supabase
      .from("workspace_presentations")
      .select("id, title, token, expires_at, view_count, created_at, password_hash")
      .eq("job_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const presIds = (presResult.data ?? []).map((p) => p.id);

  const [presCandResult, feedbackResult, subFbResult] = await Promise.all([
    presIds.length
      ? supabase
          .from("workspace_presentation_candidates")
          .select("presentation_id, submission_id")
          .in("presentation_id", presIds)
      : Promise.resolve({ data: [] as Array<{ presentation_id: string; submission_id: string }> }),
    presIds.length
      ? supabase
          .from("presentation_feedback")
          .select("presentation_id, vote, viewer_name, viewer_company")
          .in("presentation_id", presIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as Array<{ presentation_id: string; vote: string; viewer_name: string | null; viewer_company: string | null }> }),
    // Per-submission feedback — used to show client approval badges directly on candidate cards
    submissionIds.length
      ? supabase
          .from("presentation_feedback")
          .select("submission_id, vote")
          .in("submission_id", submissionIds)
      : Promise.resolve({ data: [] as Array<{ submission_id: string; vote: string }> }),
  ]);

  const profileMap = new Map<string, { full_name: string; avatar_url: string | null; age: number | null; city: string | null; gender: string | null; bio: string | null }>();
  for (const p of profilesResult.data ?? []) {
    profileMap.set(p.id, {
      full_name:  p.full_name  ?? "",
      avatar_url: p.avatar_url ?? null,
      age:        p.age        ?? null,
      city:       p.city       ?? null,
      gender:     p.gender     ?? null,
      bio:        (p as { bio?: string | null }).bio ?? null,
    });
  }

  // Group notes by submission id
  const notesMap = new Map<string, PipelineNote[]>();
  for (const n of notesResult.data ?? []) {
    const list = notesMap.get(n.submission_id) ?? [];
    list.push({ id: n.id, authorName: n.author_name, body: n.body, createdAt: n.created_at });
    notesMap.set(n.submission_id, list);
  }

  function isActiveBookingStatus(status: string | null | undefined): boolean {
    return !!status && !["cancelled", "rejected"].includes(status);
  }

  // Index bookings by talent_user_id.
  // Prefer an active booking if one exists; otherwise keep the most recent row.
  const bookingByTalent = new Map<string, { bookingId: string; bookingStatus: string; contractId: string | null }>();
  for (const b of bookings) {
    if (!b.talent_user_id) continue;
    const contractArr = Array.isArray((b as { contracts?: Array<{ id?: string | null }> }).contracts)
      ? ((b as { contracts?: Array<{ id?: string | null }> }).contracts ?? [])
      : [];
    const nextBooking = {
      bookingId:     String(b.id),
      bookingStatus: b.status ?? "pending",
      contractId:    contractArr[0]?.id ?? null,
    };

    const currentBooking = bookingByTalent.get(b.talent_user_id);
    if (!currentBooking) {
      bookingByTalent.set(b.talent_user_id, nextBooking);
      continue;
    }

    if (!isActiveBookingStatus(currentBooking.bookingStatus) && isActiveBookingStatus(nextBooking.bookingStatus)) {
      bookingByTalent.set(b.talent_user_id, nextBooking);
    }
  }

  function legacyStatusToStage(status: string | null | undefined): string {
    if (status === "approved") return "aprovado";
    if (status === "rejected") return "rejeitado";
    return "novo";
  }

  // Aggregate per-submission feedback for candidate card badges — must be built BEFORE candidates map
  const subFeedbackMap = new Map<string, { approved: number; rejected: number; favorite: number }>();
  for (const f of subFbResult.data ?? []) {
    const cur = subFeedbackMap.get(f.submission_id) ?? { approved: 0, rejected: 0, favorite: 0 };
    if (f.vote === "approved") cur.approved++;
    if (f.vote === "rejected") cur.rejected++;
    if (f.vote === "favorite") cur.favorite++;
    subFeedbackMap.set(f.submission_id, cur);
  }

  const candidates: PipelineCandidate[] = submissions.map((s) => {
    const profile  = s.talent_user_id ? profileMap.get(s.talent_user_id) : null;
    const booking  = s.talent_user_id ? bookingByTalent.get(s.talent_user_id) : null;
    const rawPipelineStatus = (s as { pipeline_status?: string | null }).pipeline_status;
    const rawFb = subFeedbackMap.get(String(s.id));
    return {
      id:            String(s.id),
      talentId:      s.talent_user_id ?? null,
      talentName:    profile?.full_name ?? s.talent_name ?? "",
      avatarUrl:     profile?.avatar_url ?? null,
      age:           profile?.age    ?? null,
      city:          profile?.city   ?? null,
      country:       null,
      gender:        profile?.gender ?? null,
      bio:           s.bio || profile?.bio || "",
      // Use pipeline_status if set; fall back to mapping from legacy submission.status
      pipelineStatus: rawPipelineStatus ?? legacyStatusToStage(s.status),
      submittedAt:   s.created_at ?? "",
      isReferral:    Boolean(s.referrer_id),
      photoFrontUrl: s.photo_front_url  ?? null,
      photoLeftUrl:  s.photo_left_url   ?? null,
      photoRightUrl: s.photo_right_url  ?? null,
      videoUrl:      s.video_url        ?? null,
      curriculumUrl: s.curriculum_url   ?? null,
      portfolioUrl:  s.portfolio_url    ?? null,
      bookingId:     booking?.bookingId     ?? null,
      bookingStatus: booking?.bookingStatus ?? null,
      contractId:    booking?.contractId    ?? null,
      notes:         notesMap.get(String(s.id)) ?? [],
      clientFeedback: rawFb && (rawFb.approved + rawFb.rejected + rawFb.favorite) > 0 ? rawFb : null,
    };
  });

  // Build presentations list with counts + feedback
  const presRows = presResult.data ?? [];

  const presCandCount = new Map<string, number>();
  const presSubIds    = new Map<string, string[]>();
  for (const c of presCandResult.data ?? []) {
    presCandCount.set(c.presentation_id, (presCandCount.get(c.presentation_id) ?? 0) + 1);
    const list = presSubIds.get(c.presentation_id) ?? [];
    list.push(c.submission_id);
    presSubIds.set(c.presentation_id, list);
  }

  const presFbMap     = new Map<string, PresentationSummary["feedbackSummary"]>();
  const presFbEntries = new Map<string, PresentationSummary["feedbackEntries"]>();
  for (const f of feedbackResult.data ?? []) {
    const cur = presFbMap.get(f.presentation_id) ?? { approved: 0, rejected: 0, favorite: 0 };
    if (f.vote === "approved")  cur.approved++;
    if (f.vote === "rejected")  cur.rejected++;
    if (f.vote === "favorite")  cur.favorite++;
    presFbMap.set(f.presentation_id, cur);

    const entries = presFbEntries.get(f.presentation_id) ?? [];
    entries.push({
      viewerName:    f.viewer_name    ?? "Cliente",
      viewerCompany: f.viewer_company ?? null,
      vote:          f.vote as "approved" | "favorite" | "rejected",
    });
    presFbEntries.set(f.presentation_id, entries);
  }

  const presentations: PresentationSummary[] = presRows.map((p) => ({
    id:              p.id,
    title:           p.title,
    token:           p.token,
    expiresAt:       (p as { expires_at?: string | null }).expires_at ?? null,
    viewCount:       (p as { view_count?: number }).view_count ?? 0,
    createdAt:       p.created_at,
    hasPassword:     !!(p as { password_hash?: string | null }).password_hash,
    candidateCount:  presCandCount.get(p.id) ?? 0,
    feedbackSummary: presFbMap.get(p.id) ?? { approved: 0, rejected: 0, favorite: 0 },
    feedbackEntries: presFbEntries.get(p.id) ?? [],
    submissionIds:   presSubIds.get(p.id) ?? [],
  }));

  const jd = jobData as typeof jobData & {
    job_time?: string | null;
    location?: string | null;
    gender?: string | null;
    age_min?: number | null;
    age_max?: number | null;
    application_requirements?: string[] | null;
    invite_only?: boolean | null;
  };

  const job: PipelineJob = {
    id:                     String(jobData.id),
    title:                  jobData.title        ?? "",
    status:                 jobData.status       ?? "open",
    visibility:             (jobData.visibility  ?? "public") as string,
    budget:                 jobData.budget       ?? 0,
    deadline:               jobData.deadline     ?? null,
    jobDate:                jobData.job_date      ?? null,
    jobTime:                jd.job_time           ?? null,
    location:               jd.location           ?? null,
    description:            jobData.description  ?? "",
    category:               jobData.category     ?? "",
    numberOfTalentsRequired: jobData.number_of_talents_required ?? 1,
    workspaceId:            workspaceId,
    agencyId:               String(jobData.agency_id ?? user.id),
    createdAt:              jobData.created_at   ?? null,
    gender:                 jd.gender             ?? null,
    ageMin:                 jd.age_min            ?? null,
    ageMax:                 jd.age_max            ?? null,
    applicationRequirements: jd.application_requirements ?? null,
    inviteOnly:             jd.invite_only        ?? false,
  };

  return (
    <WorkspacePipelineBoard
      job={job}
      candidates={candidates}
      presentations={presentations}
      userId={user.id}
      isOwner={isWorkspaceOwner}
      readOnly={readOnly}
      brandPrimary={workspaceAccess.workspace.brandPrimaryColor ?? "#1ABC9C"}
      brandAccent={workspaceAccess.workspace.brandAccentColor ?? "#27C1D6"}
    />
  );
}
