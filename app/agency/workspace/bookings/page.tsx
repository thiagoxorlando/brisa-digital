import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import BookingList, { type Booking } from "@/features/agency/BookingList";
import WorkspacePremiumBookings, { type PremiumBooking } from "@/features/agency/WorkspacePremiumBookings";
import { getUnifiedBookingStatus } from "@/lib/bookingStatus";
import { requirePremiumWorkspacePageContext } from "@/lib/premiumWorkspaceApp.server";
import { resolveActorNames } from "@/lib/resolveActorName.server";

export const metadata: Metadata = { title: "Reservas Premium — BrisaHub" };

export default async function WorkspaceBookingsPage() {
  const context = await requirePremiumWorkspacePageContext();
  const supabase = createServerClient({ useServiceRole: true });

  const { data: workspaceJobs } = await supabase
    .from("jobs")
    .select("id, title, created_by_user_id")
    .eq("workspace_id", context.workspace.id);

  const visibleJobs = context.isOwner
    ? (workspaceJobs ?? [])
    : (workspaceJobs ?? []).filter((job) => job.created_by_user_id === context.userId);

  const jobIds = visibleJobs.map((job) => job.id);

  if (jobIds.length === 0) {
    return (
      <div className="rounded-[28px] border border-zinc-200 bg-white px-6 py-10 text-center shadow-[0_12px_34px_rgba(15,23,42,0.05)]">
        <p className="text-[15px] font-semibold text-zinc-900">Nenhuma reserva Premium ainda.</p>
        <p className="mt-2 text-[13px] leading-6 text-zinc-500">
          As reservas ligadas às vagas privadas do workspace aparecerão aqui.
        </p>
      </div>
    );
  }

  const { data: rows } = await supabase
    .from("bookings")
    .select(`
      id, talent_user_id, job_id, status, price, job_title, created_at,
      contracts!contracts_booking_id_fkey (
        id, status, signed_at, job_date, location, paid_at, contract_file_url, signed_contract_url, paid_by_user_id
      )
    `)
    .in("job_id", jobIds)
    .order("created_at", { ascending: false });

  // Detect which jobs are backed by an agent virtual job_commitment so the
  // booking display can reflect "funds already reserved" instead of "awaiting deposit".
  const bookingJobIds = [...new Set((rows ?? []).map((r) => r.job_id).filter((id): id is string => !!id))];
  const agentBackedJobIds = new Set<string>();
  if (bookingJobIds.length) {
    const { data: commitRows } = await supabase
      .from("premium_agent_wallet_transactions")
      .select("related_job_id")
      .in("related_job_id", bookingJobIds)
      .eq("type", "job_commitment")
      .eq("status", "completed");
    for (const r of commitRows ?? []) {
      if (r.related_job_id) agentBackedJobIds.add(String(r.related_job_id));
    }
  }

  const talentIds = [...new Set((rows ?? []).map((r) => r.talent_user_id).filter((id): id is string => !!id))];
  const { data: profiles } = talentIds.length
    ? await supabase.from("talent_profiles").select("id, full_name, avatar_url").in("id", talentIds)
    : { data: [] };

  const nameMap:   Map<string, string>      = new Map();
  const avatarMap: Map<string, string|null> = new Map();
  for (const p of profiles ?? []) {
    nameMap.set(p.id, p.full_name ?? "Talento");
    avatarMap.set(p.id, (p as { avatar_url?: string | null }).avatar_url ?? null);
  }

  // Collect all paid_by_user_id values across all contracts, then batch-resolve names.
  const allContracts = (rows ?? []).flatMap((row) => {
    const raw = (row as { contracts?: unknown[] }).contracts;
    return Array.isArray(raw) ? raw as Record<string, unknown>[] : (raw ? [raw as Record<string, unknown>] : []);
  });
  const actorIds = [...new Set(
    allContracts.map((c) => c?.paid_by_user_id as string | null | undefined).filter((id): id is string => !!id),
  )];
  const actorNameMap = await resolveActorNames(actorIds, supabase);

  // Owner → full BookingList component
  if (context.isOwner) {
    const bookings: Booking[] = (rows ?? []).map((row) => {
      const contract = Array.isArray((row as { contracts?: unknown[] }).contracts)
        ? (row as { contracts?: Record<string, unknown>[] }).contracts?.[0] ?? null
        : null;
      const paidByUserId = contract?.paid_by_user_id ? String(contract.paid_by_user_id) : null;
      return {
        id:               String(row.id ?? ""),
        contractId:       contract?.id ? String(contract.id) : null,
        talentId:         String(row.talent_user_id ?? ""),
        talentName:       nameMap.get(String(row.talent_user_id ?? "")) ?? "Talento",
        talentAvatarUrl:  avatarMap.get(String(row.talent_user_id ?? "")) ?? null,
        status:           String(row.status ?? "pending"),
        contractStatus:   contract?.status ? String(contract.status) : null,
        derivedStatus:    getUnifiedBookingStatus(String(row.status ?? "pending"), contract?.status ? String(contract.status) : null),
        totalValue:       Number(row.price ?? 0),
        jobTitle:         String(row.job_title ?? ""),
        createdAt:        String(row.created_at ?? ""),
        contractSigned:   contract?.signed_at ? String(contract.signed_at) : null,
        jobDate:          contract?.job_date ? String(contract.job_date) : null,
        paidAt:           contract?.paid_at ? String(contract.paid_at) : null,
        hasContractFile:  !!contract?.contract_file_url,
        hasSignedContract: !!contract?.signed_contract_url,
        isAgentJobBacked: row.job_id ? agentBackedJobIds.has(String(row.job_id)) : false,
        paidByName:       paidByUserId ? (actorNameMap.get(paidByUserId) ?? null) : null,
      };
    });
    return <BookingList bookings={bookings} financesHref="/agency/workspace/wallet" />;
  }

  // Agent → polished premium view
  const premiumBookings: PremiumBooking[] = (rows ?? []).map((row) => {
    const contract = Array.isArray((row as { contracts?: unknown[] }).contracts)
      ? (row as { contracts?: Record<string, unknown>[] }).contracts?.[0] ?? null
      : null;
    const contractStatus = contract?.status ? String(contract.status) : null;
    const paidByUserId = contract?.paid_by_user_id ? String(contract.paid_by_user_id) : null;
    return {
      id:             String(row.id ?? ""),
      jobId:          row.job_id ? String(row.job_id) : null,
      jobTitle:       String(row.job_title ?? ""),
      talentName:     nameMap.get(String(row.talent_user_id ?? "")) ?? "Talento",
      talentAvatarUrl: avatarMap.get(String(row.talent_user_id ?? "")) ?? null,
      status:         String(row.status ?? "pending"),
      contractStatus,
      derivedStatus:  getUnifiedBookingStatus(String(row.status ?? "pending"), contractStatus),
      totalValue:     Number(row.price ?? 0),
      createdAt:      String(row.created_at ?? ""),
      jobDate:        contract?.job_date ? String(contract.job_date) : null,
      location:         contract?.location ? String(contract.location) : null,
      paidAt:           contract?.paid_at ? String(contract.paid_at) : null,
      contractId:       contract?.id ? String(contract.id) : null,
      isAgentJobBacked: row.job_id ? agentBackedJobIds.has(String(row.job_id)) : false,
      paidByName:       paidByUserId ? (actorNameMap.get(paidByUserId) ?? null) : null,
    };
  });

  return <WorkspacePremiumBookings bookings={premiumBookings} />;
}
