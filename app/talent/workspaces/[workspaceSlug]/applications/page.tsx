import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { getServerLang } from "@/lib/i18n/server";
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
          .select("id, job_id, status, talent_id, talent_user_id")
          .in("job_id", workspaceJobIds)
          .or(`talent_user_id.eq.${user.id},talent_id.eq.${user.id}`)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] }),
  ]);

  const activeContractJobIds = new Set(
    (contractResult.data ?? [])
      .filter((contract) => !["cancelled", "rejected"].includes(String(contract.status ?? "")))
      .map((contract) => String(contract.job_id))
  );

  const items: WorkspaceApplicationItem[] = (submissionResult.data ?? [])
    .map((submission) => {
      const job = jobMap.get(String(submission.job_id));
      const status = String(submission.status ?? "pending");
      const hasActiveContract = activeContractJobIds.has(String(submission.job_id));
      const isPendingReview = status === "pending" || status === "in_review";
      const canCancel = isPendingReview && !hasActiveContract;

      let cancelReason: string | null = null;
      if (!isPendingReview) {
        cancelReason = "Esta candidatura já avançou e não pode mais ser cancelada.";
      } else if (hasActiveContract) {
        cancelReason = "Esta candidatura já possui contrato enviado.";
      }

      return {
        id: String(submission.id),
        jobId: submission.job_id ? String(submission.job_id) : null,
        jobTitle: job?.title ?? "Vaga",
        jobBudget: job?.budget ?? null,
        jobDate: job?.job_date ?? null,
        jobLocation: job?.location ?? null,
        status,
        createdAt: submission.created_at ?? "",
        canCancel,
        cancelReason,
      };
    })
    .sort((a, b) => {
      const ao = STATUS_ORDER[a.status] ?? 9;
      const bo = STATUS_ORDER[b.status] ?? 9;
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
