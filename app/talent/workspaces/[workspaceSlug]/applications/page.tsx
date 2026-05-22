import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { getServerLang } from "@/lib/i18n/server";
import { getContractPaymentStatus } from "@/lib/contractStatus";
import WorkspaceApplicationsClient, {
  type WorkspaceApplicationItem,
} from "@/features/talent/WorkspaceApplicationsClient";

export const metadata: Metadata = { title: "Reservas — BrisaHub" };

type Props = { params: Promise<{ workspaceSlug: string }> };

const STATUS_ORDER: Record<string, number> = {
  approved: 0,
  pending: 1,
  in_review: 1,
  rejected: 2,
  cancelled: 3,
};

export default async function WorkspaceApplicationsPage({ params }: Props) {
  const { workspaceSlug } = await params;
  const lang = await getServerLang();
  const locale = lang === "en" ? "en-US" : "pt-BR";
  const statusLang = lang === "en" ? "en" : "pt-BR";

  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) notFound();

  const supabase = createServerClient({ useServiceRole: true });

  const { data: workspace } = await supabase
    .from("premium_workspaces")
    .select("id, name, logo_url, brand_primary_color, brand_accent_color")
    .eq("slug", workspaceSlug)
    .is("deleted_at", null)
    .eq("status", "active")
    .maybeSingle();

  if (!workspace) notFound();

  const { data: allJobs } = await supabase
    .from("jobs")
    .select("id, title, budget, job_date, location")
    .eq("workspace_id", workspace.id)
    .is("deleted_at", null);

  const workspaceJobIds = (allJobs ?? []).map((job) => job.id);
  const jobMap = new Map((allJobs ?? []).map((job) => [String(job.id), job]));

  const [submissionResult, contractResult] = await Promise.all([
    workspaceJobIds.length
      ? supabase
          .from("submissions")
          .select("id, job_id, status, created_at")
          .eq("talent_user_id", user.id)
          .in("job_id", workspaceJobIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    workspaceJobIds.length
      ? supabase
          .from("contracts")
          .select("id, job_id, status, paid_at, talent_id, talent_user_id")
          .in("job_id", workspaceJobIds)
          .or(`talent_user_id.eq.${user.id},talent_id.eq.${user.id}`)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] }),
  ]);

  // Detect which jobs are backed by an agent job_commitment so the status badge
  // can reflect "Em custódia" instead of "Aguardando depósito".
  const contractJobIds = [
    ...new Set(
      (contractResult.data ?? [])
        .map((c) => c.job_id)
        .filter((id): id is string => !!id),
    ),
  ];
  const agentBackedJobIds = new Set<string>();
  if (contractJobIds.length > 0) {
    const { data: commitRows } = await supabase
      .from("premium_agent_wallet_transactions")
      .select("related_job_id")
      .in("related_job_id", contractJobIds)
      .eq("type", "job_commitment")
      .eq("status", "completed");
    for (const r of commitRows ?? []) {
      if (r.related_job_id) agentBackedJobIds.add(String(r.related_job_id));
    }
  }

  // Build a map: job_id → most-relevant contract for this talent
  // For each job, prefer active contracts over cancelled/rejected ones.
  const contractsByJobId = new Map<
    string,
    { id: string; status: string; paid_at: string | null }
  >();
  for (const contract of contractResult.data ?? []) {
    const key = String(contract.job_id);
    const existing = contractsByJobId.get(key);
    const isActive = !["cancelled", "rejected"].includes(String(contract.status ?? ""));
    const existingIsActive = existing
      ? !["cancelled", "rejected"].includes(existing.status)
      : false;
    // Prefer active contract over terminal ones; if both active/terminal, keep first found
    if (!existing || (isActive && !existingIsActive)) {
      contractsByJobId.set(key, {
        id: String(contract.id),
        status: String(contract.status ?? ""),
        paid_at: (contract.paid_at as string | null) ?? null,
      });
    }
  }

  const activeContractJobIds = new Set(
    [...contractsByJobId.entries()]
      .filter(([, c]) => !["cancelled", "rejected"].includes(c.status))
      .map(([jobId]) => jobId)
  );

  const items: WorkspaceApplicationItem[] = (submissionResult.data ?? [])
    .map((submission) => {
      const job = jobMap.get(String(submission.job_id));
      const submissionStatus = String(submission.status ?? "pending");
      const jobIdStr = String(submission.job_id);
      const contract = contractsByJobId.get(jobIdStr) ?? null;
      const hasActiveContract = activeContractJobIds.has(jobIdStr);

      // Derive contract payment status if contract exists
      const contractPaymentStatus = contract
        ? getContractPaymentStatus({ status: contract.status, paid_at: contract.paid_at })
        : null;

      const isPendingReview = submissionStatus === "pending" || submissionStatus === "in_review";
      // Can only cancel if still in review AND no active contract exists
      const canCancel = isPendingReview && !hasActiveContract;

      let cancelReason: string | null = null;
      if (contractPaymentStatus === "paid_to_wallet") {
        cancelReason = "Esta reserva já foi paga.";
      } else if (contractPaymentStatus === "escrow") {
        cancelReason = "Esta reserva está em custódia.";
      } else if (contractPaymentStatus === "signed") {
        cancelReason = "Esta reserva já possui contrato enviado.";
      } else if (contractPaymentStatus === "pending") {
        cancelReason = "Esta reserva já possui contrato enviado.";
      } else if (!isPendingReview) {
        cancelReason = "Esta reserva já avançou e não pode mais ser cancelada.";
      }

      return {
        id: String(submission.id),
        jobId: submission.job_id ? jobIdStr : null,
        jobTitle: job?.title ?? "Vaga",
        jobBudget: job?.budget ?? null,
        jobDate: job?.job_date ?? null,
        jobLocation: job?.location ?? null,
        submissionStatus,
        contractPaymentStatus,
        contractRawStatus: contract ? contract.status : null,
        createdAt: submission.created_at ?? "",
        canCancel,
        cancelReason,
        isAgentJobBacked: submission.job_id ? agentBackedJobIds.has(String(submission.job_id)) : false,
      };
    })
    .sort((a, b) => {
      const ao = STATUS_ORDER[a.submissionStatus] ?? 9;
      const bo = STATUS_ORDER[b.submissionStatus] ?? 9;
      if (ao !== bo) return ao - bo;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const primary = (workspace.brand_primary_color as string | null) ?? "#1ABC9C";
  const accent = (workspace.brand_accent_color as string | null) ?? "#27C1D6";

  return (
    <WorkspaceApplicationsClient
      workspaceName={String(workspace.name ?? "")}
      workspaceSlug={workspaceSlug}
      workspaceLogoUrl={(workspace.logo_url as string | null) ?? null}
      primary={primary}
      accent={accent}
      locale={locale}
      statusLang={statusLang}
      items={items}
    />
  );
}
