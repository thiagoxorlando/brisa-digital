import type { Metadata } from "next";
import AdminBookings from "@/features/admin/AdminBookings";
import { getUnifiedBookingStatus } from "@/lib/bookingStatus";
import { createServerClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Administracao - Reservas - BrisaHub" };

export default async function AdminBookingsPage() {
  const supabase = createServerClient({ useServiceRole: true });

  const { data: bookingsData } = await supabase
    .from("bookings")
    .select(`
      id, job_id, job_title, talent_user_id, agency_id, price, status, created_at,
      contracts!contracts_booking_id_fkey (
        id, status, payment_amount, created_at, signed_at, confirmed_at, agency_signed_at, paid_at
      )
    `)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const rows = bookingsData ?? [];
  const jobIds = [...new Set(rows.map((booking) => booking.job_id).filter((id): id is string => Boolean(id)))];
  const talentIds = [...new Set(rows.map((booking) => booking.talent_user_id).filter((id): id is string => Boolean(id)))];
  const agencyIds = [...new Set(rows.map((booking) => booking.agency_id).filter((id): id is string => Boolean(id)))];

  const [talentData, agencyData, jobsData, authUsersRes, profilesRes] = await Promise.all([
    talentIds.length ? supabase.from("talent_profiles").select("id, full_name").in("id", talentIds).then((result) => result.data ?? []) : Promise.resolve([]),
    agencyIds.length ? supabase.from("agencies").select("id, user_id, company_name").in("id", agencyIds).then((result) => result.data ?? []) : Promise.resolve([]),
    jobIds.length ? supabase.from("jobs").select("id, job_date, workspace_id").in("id", jobIds).then((result) => result.data ?? []) : Promise.resolve([]),
    supabase.auth.admin.listUsers({ perPage: 1000 }),
    supabase.from("profiles").select("id").is("deleted_at", null),
  ]);

  const validUserIds = new Set((authUsersRes.data?.users ?? []).map((user) => user.id));
  const validProfileIds = new Set((profilesRes.data ?? []).map((profile) => profile.id));
  const talentMap = new Map<string, string>();
  const agencyMap = new Map<string, string>();
  const jobDateMap = new Map<string, string | null>();
  const jobWorkspaceIdMap = new Map<string, string | null>();

  for (const talent of talentData) {
    talentMap.set(talent.id, talent.full_name ?? "Talento órfão / usuário deletado");
  }
  for (const agency of agencyData) {
    const ownerId = (agency as { user_id?: string | null }).user_id ?? agency.id;
    const isOrphan = !ownerId || !validUserIds.has(ownerId) || !validProfileIds.has(ownerId);
    agencyMap.set(agency.id, isOrphan ? "Agência órfã / usuário deletado" : agency.company_name ?? "Agência sem nome");
  }
  for (const job of jobsData) {
    jobDateMap.set(job.id, (job as { job_date?: string | null }).job_date ?? null);
    jobWorkspaceIdMap.set(job.id, (job as { workspace_id?: string | null }).workspace_id ?? null);
  }

  const bookingWorkspaceIds = [...new Set([...jobWorkspaceIdMap.values()].filter((id): id is string => Boolean(id)))];
  const bookingWorkspaceNameMap = new Map<string, string>();
  if (bookingWorkspaceIds.length) {
    const { data: workspaces } = await supabase.from("premium_workspaces").select("id, name").in("id", bookingWorkspaceIds).is("deleted_at", null);
    for (const workspace of workspaces ?? []) bookingWorkspaceNameMap.set(workspace.id, workspace.name ?? "Workspace órfão");
  }

  const bookings = rows.map((booking) => {
    const contracts = Array.isArray((booking as { contracts?: unknown }).contracts) ? ((booking as { contracts?: Array<Record<string, unknown>> }).contracts ?? []) : [];
    const contract = contracts[0] ?? null;
    const workspaceId = booking.job_id ? (jobWorkspaceIdMap.get(booking.job_id) ?? null) : null;

    return {
      id: booking.id,
      jobTitle: booking.job_title ?? "—",
      talentName: booking.talent_user_id ? (talentMap.get(booking.talent_user_id) ?? "Talento órfão / usuário deletado") : "Talento órfão / usuário deletado",
      agencyName: booking.agency_id ? (agencyMap.get(booking.agency_id) ?? "Agência órfã / usuário deletado") : "—",
      status: booking.status ?? "pending",
      contractStatus: (contract?.status as string | null) ?? null,
      derivedStatus: getUnifiedBookingStatus(booking.status ?? "pending", (contract?.status as string | null) ?? null),
      price: booking.price ?? 0,
      contractAmount: (contract?.payment_amount as number | null) ?? null,
      created_at: booking.created_at ?? "",
      jobDate: booking.job_id ? (jobDateMap.get(booking.job_id) ?? null) : null,
      contractSentAt: (contract?.created_at as string | null) ?? null,
      contractSignedAt: (contract?.signed_at as string | null) ?? null,
      contractConfirmedAt: (contract?.confirmed_at as string | null) ?? (contract?.agency_signed_at as string | null) ?? null,
      paidAt: (contract?.paid_at as string | null) ?? null,
      workspaceId,
      workspaceName: workspaceId ? (bookingWorkspaceNameMap.get(workspaceId) ?? "Workspace órfão") : null,
    };
  });

  return <AdminBookings bookings={bookings} />;
}
