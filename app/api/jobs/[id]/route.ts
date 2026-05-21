import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { requireTalentsNeededForJob } from "@/lib/requireActiveSubscription";
import { getLivePlanSetting } from "@/lib/planSettings.server";
import { isJobFull, JOB_FULL_MESSAGE } from "@/lib/jobAvailability";
import type { Plan } from "@/lib/plans";
import { getUserPremiumWorkspace } from "@/lib/premiumWorkspace.server";
import { calculateJobReservation, calculateReservationDelta } from "@/lib/jobReservationPolicy";

const JOB_STATUS_ALIASES: Record<string, "open" | "closed" | "draft" | "inactive" | "paused"> = {
  open: "open",
  aberta: "open",
  paused: "paused",
  pausada: "paused",
  closed: "closed",
  fechada: "closed",
  draft: "draft",
  rascunho: "draft",
  inactive: "inactive",
  inativa: "inactive",
};

const PATCH_ALLOWED = [
  "title",
  "description",
  "category",
  "budget",
  "deadline",
  "job_date",
  "job_time",
  "status",
  "location",
  "gender",
  "age_min",
  "age_max",
  "number_of_talents_required",
  "visibility",
  "application_requirements",
];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const update: Record<string, unknown> = {};
  for (const key of PATCH_ALLOWED) {
    if (key in body) update[key] = body[key];
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nenhum campo válido para atualizar." }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });
  const session = await createSessionClient();
  const {
    data: { user },
  } = await session.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { data: caller } = await supabase
    .from("profiles")
    .select("role, plan")
    .eq("id", user.id)
    .single();

  if (caller?.role !== "agency") {
    return NextResponse.json({ error: "Você não tem permissão para alterar esta vaga." }, { status: 403 });
  }

  const { data: existingJob } = await supabase
    .from("jobs")
    .select(
      "agency_id, deleted_at, status, number_of_talents_required, budget, created_by_user_id, workspace_id, visibility"
    )
    .eq("id", id)
    .single();

  if (!existingJob) {
    return NextResponse.json({ error: "Vaga não encontrada." }, { status: 404 });
  }
  if (existingJob.deleted_at) {
    return NextResponse.json({ error: "Vaga não encontrada ou foi removida." }, { status: 404 });
  }

  const workspaceId = (existingJob as { workspace_id?: string | null }).workspace_id ?? null;
  const workspaceAccess = workspaceId ? await getUserPremiumWorkspace(user.id) : null;
  const belongsToWorkspace =
    !!workspaceId && workspaceAccess?.workspace.id === workspaceId && workspaceAccess.membership.status === "active";
  const isWorkspaceOwner = belongsToWorkspace && workspaceAccess?.membership.role === "owner";
  const isWorkspaceCreator =
    belongsToWorkspace &&
    (existingJob as { created_by_user_id?: string | null }).created_by_user_id === user.id;
  const isStandaloneOwner = !workspaceId && existingJob.agency_id === user.id;

  if (!isStandaloneOwner && !isWorkspaceOwner && !isWorkspaceCreator) {
    return NextResponse.json({ error: "Você não tem permissão para alterar esta vaga." }, { status: 403 });
  }

  if (typeof update.status === "string") {
    const normalizedStatus = JOB_STATUS_ALIASES[String(update.status).trim().toLowerCase()];
    if (!normalizedStatus) {
      return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    }
    update.status = normalizedStatus;
  }

  if (workspaceId && "visibility" in update) {
    update.visibility = update.visibility === "public" ? "public" : "private_invite";
    update.invite_only = update.visibility === "private_invite";
  } else if (update.visibility === "private" && caller.plan !== "premium") {
    return NextResponse.json({ error: "Vagas privadas estão disponíveis apenas no Premium." }, { status: 403 });
  }

  // Delta-commitment: when an agent edits budget or number_of_talents_required on a
  // workspace job, adjust the virtual ledger so the committed amount stays in sync.
  // We do this BEFORE the DB update so we can validate available balance on increases.
  const isAgentEdit =
    belongsToWorkspace && !isWorkspaceOwner && isWorkspaceCreator && !!workspaceId;
  const budgetChanging = "budget" in update;
  const talentsChanging = "number_of_talents_required" in update;

  if (isAgentEdit && (budgetChanging || talentsChanging)) {
    const newBudget = Number(update.budget ?? existingJob.budget ?? 0);
    const newTalents = Number(update.number_of_talents_required ?? existingJob.number_of_talents_required ?? 1);
    // Policy 3 — canonical formula in lib/jobReservationPolicy.ts.
    const newTotal = calculateJobReservation(newBudget, newTalents);

    const { data: wsRow } = await supabase
      .from("premium_workspaces").select("owner_user_id").eq("id", workspaceId).maybeSingle();

    if (wsRow) {
      // Sum all job_commitment rows for this job (there may be multiple from previous deltas)
      const { data: commitRows } = await supabase
        .from("premium_agent_wallet_transactions")
        .select("amount")
        .eq("related_job_id", id)
        .eq("type", "job_commitment")
        .eq("status", "completed")
        .is("reversed_at", null);

      const { data: releaseRows } = await supabase
        .from("premium_agent_wallet_transactions")
        .select("amount")
        .eq("related_job_id", id)
        .eq("type", "job_release")
        .eq("status", "completed")
        .is("reversed_at", null);

      const totalCommitted = (commitRows ?? []).reduce((s, tx) => s + Number(tx.amount), 0);
      const totalReleased  = (releaseRows ?? []).reduce((s, tx) => s + Number(tx.amount), 0);
      const netCommitment  = totalCommitted - totalReleased;
      // Policy 3 — delta math centralised. `reservationDelta.net` is signed.
      const reservationDelta = calculateReservationDelta(netCommitment, newTotal);
      const delta          = reservationDelta.net;

      if (delta > 0) {
        // Increase: validate agent has enough available balance
        const { getAgentLedgerBalance } = await import("@/lib/premiumWorkspace.server");
        const ledger = await getAgentLedgerBalance(workspaceId, user.id);
        if (delta > ledger.availableAmount) {
          return NextResponse.json(
            { error: "Saldo alocado insuficiente para esta alteração. Solicite mais saldo ao proprietário." },
            { status: 403 }
          );
        }
        await supabase.from("premium_agent_wallet_transactions").insert({
          workspace_id:   workspaceId,
          agent_user_id:  user.id,
          owner_user_id:  wsRow.owner_user_id,
          type:           "job_commitment",
          amount:         delta,
          status:         "completed",
          related_job_id: id,
          created_by:     user.id,
          note:           "Ajuste de comprometimento ao editar orçamento/talentos.",
        });
      } else if (delta < 0) {
        // Decrease: release the surplus back to agent's available balance
        await supabase.from("premium_agent_wallet_transactions").insert({
          workspace_id:   workspaceId,
          agent_user_id:  user.id,
          owner_user_id:  wsRow.owner_user_id,
          type:           "job_release",
          amount:         Math.abs(delta),
          status:         "completed",
          related_job_id: id,
          created_by:     user.id,
          note:           "Alocação parcialmente liberada ao reduzir orçamento/talentos.",
        });
      }
    }
  }

  const ownerAgencyId = workspaceId ? existingJob.agency_id : user.id;
  const effectivePlan = (workspaceId && belongsToWorkspace ? "premium" : (caller.plan ?? "free")) as Plan;
  const liveSetting = await getLivePlanSetting(effectivePlan);
  const nextTalentsNeeded = Number(update.number_of_talents_required ?? existingJob.number_of_talents_required ?? 1);
  const { count: activeHireCount } = await supabase
    .from("contracts")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", ownerAgencyId)
    .eq("job_id", id)
    .not("status", "in", '("cancelled","rejected")')
    .is("deleted_at", null);

  const hasReachedCapacity = isJobFull({
    currentHires: activeHireCount ?? 0,
    talentsNeeded: nextTalentsNeeded,
    maxHiresPerJob: liveSetting.max_hires_per_job,
  });

  if (update.status !== undefined) {
    const validStatuses = ["open", "closed", "draft", "inactive", "paused"];
    if (!validStatuses.includes(update.status as string)) {
      return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    }

    if (update.status === "open") {
      const { count: paidContractCount } = await supabase
        .from("contracts")
        .select("id", { count: "exact", head: true })
        .eq("job_id", id)
        .eq("status", "paid")
        .is("deleted_at", null);

      if ((paidContractCount ?? 0) > 0) {
        return NextResponse.json(
          { error: "Esta vaga já possui reserva paga e não pode ser reaberta." },
          { status: 409 }
        );
      }

      if (hasReachedCapacity) {
        return NextResponse.json({ error: JOB_FULL_MESSAGE }, { status: 409 });
      }

      const jobLimit = liveSetting.job_limit;
      if (jobLimit !== null) {
        const { count } = await supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("agency_id", ownerAgencyId)
          .eq("status", "open")
          .neq("id", id)
          .is("deleted_at", null);
        if ((count ?? 0) >= jobLimit) {
          return NextResponse.json(
            {
              error: `O plano Free permite ${jobLimit} vaga${jobLimit > 1 ? "s" : ""} ativa${
                jobLimit > 1 ? "s" : ""
              }. Faça upgrade para reabrir esta vaga.`,
            },
            { status: 402 }
          );
        }
      }
    }
  }

  if (typeof update.number_of_talents_required === "number" && !workspaceId) {
    const hiresLimited = await requireTalentsNeededForJob(
      String(ownerAgencyId ?? user.id),
      update.number_of_talents_required
    );
    if (hiresLimited) return hiresLimited;
  }

  if (hasReachedCapacity && update.status !== "inactive") {
    update.status = "closed";
  }

  const { data, error } = await supabase.from("jobs").update(update).eq("id", id).select().single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Release agent allocation commitment when job is deactivated/closed.
  // Only release the portion NOT already settled by paid contracts, so that
  // paid jobs do not restore phantom available balance to the agent.
  const isDeactivating = update.status === "inactive" || update.status === "closed";
  const agentCreatorId = (existingJob as { created_by_user_id?: string | null }).created_by_user_id ?? null;
  if (isDeactivating && workspaceId && agentCreatorId && isWorkspaceCreator && !isWorkspaceOwner) {
    const { data: wsRow } = await supabase
      .from("premium_workspaces").select("owner_user_id").eq("id", workspaceId).maybeSingle();
    if (wsRow) {
      const [commitRes, settledRes, existingReleaseRes] = await Promise.all([
        supabase
          .from("premium_agent_wallet_transactions")
          .select("id, amount")
          .eq("related_job_id", id)
          .eq("type", "job_commitment")
          .eq("status", "completed")
          .is("reversed_at", null)
          .maybeSingle(),
        supabase
          .from("premium_agent_wallet_transactions")
          .select("amount")
          .eq("related_job_id", id)
          .eq("type", "job_settlement")
          .eq("status", "completed")
          .is("reversed_at", null),
        supabase
          .from("premium_agent_wallet_transactions")
          .select("id")
          .eq("related_job_id", id)
          .eq("type", "job_release")
          .eq("status", "completed")
          .maybeSingle(),
      ]);

      const commitTx = commitRes.data;
      // Skip if no commitment exists or release already recorded
      if (commitTx && !existingReleaseRes.data) {
        const alreadySettled = (settledRes.data ?? []).reduce((s, tx) => s + Number(tx.amount), 0);
        const releaseAmount = Number(commitTx.amount) - alreadySettled;
        if (releaseAmount > 0) {
          await supabase.from("premium_agent_wallet_transactions").insert({
            workspace_id:   workspaceId,
            agent_user_id:  agentCreatorId,
            owner_user_id:  wsRow.owner_user_id,
            type:           "job_release",
            amount:         releaseAmount,
            status:         "completed",
            related_job_id: id,
            created_by:     user.id,
            note:           "Alocação liberada ao fechar/inativar a vaga.",
          });
        }
      }
    }
  }

  return NextResponse.json({ job: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let hard = false;
  try {
    const body = await req.json();
    hard = body?.hard === true;
  } catch {
    hard = false;
  }

  const supabase = createServerClient({ useServiceRole: true });
  const session = await createSessionClient();
  const {
    data: { user },
  } = await session.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const { data: job } = await supabase
    .from("jobs")
    .select("agency_id, workspace_id, created_by_user_id")
    .eq("id", id)
    .single();

  if (!job) {
    return NextResponse.json({ error: "Vaga não encontrada." }, { status: 404 });
  }

  const isAdmin = profile?.role === "admin";
  const workspaceId = (job as { workspace_id?: string | null }).workspace_id ?? null;
  const workspaceAccess = workspaceId ? await getUserPremiumWorkspace(user.id) : null;
  const isWorkspaceOwner =
    !!workspaceId &&
    workspaceAccess?.workspace.id === workspaceId &&
    workspaceAccess.membership.role === "owner" &&
    workspaceAccess.membership.status === "active";
  const isWorkspaceCreator =
    !!workspaceId &&
    workspaceAccess?.workspace.id === workspaceId &&
    workspaceAccess.membership.status === "active" &&
    (job as { created_by_user_id?: string | null }).created_by_user_id === user.id;
  const isStandaloneOwner = !workspaceId && profile?.role === "agency" && job.agency_id === user.id;

  if (!isAdmin && !isWorkspaceOwner && !isWorkspaceCreator && !isStandaloneOwner) {
    return NextResponse.json({ error: "Você não tem permissão para remover esta vaga." }, { status: 403 });
  }

  if (!hard) {
    const { error } = await supabase.from("jobs").update({ status: "inactive" }).eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    // Release agent allocation commitment on soft-delete.
    // Only release the portion NOT already settled by paid contracts.
    const softDeleteWorkspaceId = (job as { workspace_id?: string | null }).workspace_id ?? null;
    const softDeleteCreatorId = (job as { created_by_user_id?: string | null }).created_by_user_id ?? null;
    if (softDeleteWorkspaceId && softDeleteCreatorId) {
      const { data: wsRow } = await supabase
        .from("premium_workspaces").select("owner_user_id").eq("id", softDeleteWorkspaceId).maybeSingle();
      if (wsRow) {
        const [commitRes, settledRes, existingReleaseRes] = await Promise.all([
          supabase
            .from("premium_agent_wallet_transactions")
            .select("id, amount")
            .eq("related_job_id", id)
            .eq("type", "job_commitment")
            .eq("status", "completed")
            .is("reversed_at", null)
            .maybeSingle(),
          supabase
            .from("premium_agent_wallet_transactions")
            .select("amount")
            .eq("related_job_id", id)
            .eq("type", "job_settlement")
            .eq("status", "completed")
            .is("reversed_at", null),
          supabase
            .from("premium_agent_wallet_transactions")
            .select("id")
            .eq("related_job_id", id)
            .eq("type", "job_release")
            .eq("status", "completed")
            .maybeSingle(),
        ]);

        const commitTx = commitRes.data;
        if (commitTx && !existingReleaseRes.data) {
          const alreadySettled = (settledRes.data ?? []).reduce((s, tx) => s + Number(tx.amount), 0);
          const releaseAmount = Number(commitTx.amount) - alreadySettled;
          if (releaseAmount > 0) {
            await supabase.from("premium_agent_wallet_transactions").insert({
              workspace_id:   softDeleteWorkspaceId,
              agent_user_id:  softDeleteCreatorId,
              owner_user_id:  wsRow.owner_user_id,
              type:           "job_release",
              amount:         releaseAmount,
              status:         "completed",
              related_job_id: id,
              created_by:     user.id,
              note:           "Alocação liberada ao excluir a vaga.",
            });
          }
        }
      }
    }
    return NextResponse.json({ ok: true, deleted: false });
  }

  await supabase.from("submissions").delete().eq("job_id", id);
  const { error } = await supabase.from("jobs").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, deleted: true });
}
