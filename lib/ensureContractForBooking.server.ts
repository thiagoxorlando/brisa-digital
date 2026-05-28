import { getExistingContractColumns } from "@/lib/contractCreationAccess.server";
import { getLivePlanSetting } from "@/lib/planSettings.server";
import { parsePlan, type Plan } from "@/lib/plans";
import type { createServerClient } from "@/lib/supabase";

type AdminSupabaseClient = ReturnType<typeof createServerClient>;

type EnsureContractForBookingArgs = {
  supabase: AdminSupabaseClient;
  booking: {
    id: string;
    agency_id: string;
    talent_user_id: string;
    job_id: string | null;
    job_title?: string | null;
    price?: number | null;
    created_at?: string | null;
  };
  overrides?: {
    contract_file_url?: string | null;
    job_date?: string | null;
    job_time?: string | null;
    location?: string | null;
    job_description?: string | null;
    payment_amount?: number | null;
    payment_method?: string | null;
    additional_notes?: string | null;
    workspace_id?: string | null;
    created_by_user_id?: string | null;
    status?: string | null;
  };
};

type ExistingContractRow = {
  id: string;
  booking_id: string | null;
  agency_id: string | null;
  talent_id: string | null;
  talent_user_id: string | null;
  job_id: string | null;
  payment_amount: number | null;
  commission_amount: number | null;
  net_amount: number | null;
  contract_file_url: string | null;
  job_date: string | null;
  job_time: string | null;
  location: string | null;
  job_description: string | null;
  payment_method: string | null;
  additional_notes: string | null;
  status: string | null;
  workspace_id?: string | null;
  created_by_user_id?: string | null;
};

let contractColumnsPromise: Promise<{ hasWorkspaceId: boolean; hasCreatedByUserId: boolean }> | null = null;

function getContractColumnsCached() {
  if (!contractColumnsPromise) {
    contractColumnsPromise = getExistingContractColumns();
  }
  return contractColumnsPromise;
}

function pickValue<T>(...values: Array<T | null | undefined>): T | null {
  for (const value of values) {
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export async function ensureContractForBooking({
  supabase,
  booking,
  overrides = {},
}: EnsureContractForBookingArgs) {
  console.info("[ensureContractForBooking] called", {
    bookingId: booking.id,
    agencyId: booking.agency_id,
    talentUserId: booking.talent_user_id,
    jobId: booking.job_id,
  });

  const existingResult = await supabase
    .from("contracts")
    .select(`
      id, booking_id, agency_id, talent_id, talent_user_id, job_id,
      payment_amount, commission_amount, net_amount, contract_file_url,
      job_date, job_time, location, job_description, payment_method,
      additional_notes, status, workspace_id, created_by_user_id
    `)
    .eq("booking_id", booking.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(2);

  if (existingResult.error) {
    console.error("[ensureContractForBooking] existing_check_failed", {
      bookingId: booking.id,
      error: existingResult.error.message,
      code: existingResult.error.code,
    });
    throw new Error(existingResult.error.message);
  }

  const existingContracts = (existingResult.data ?? []) as ExistingContractRow[];
  if (existingContracts.length > 1) {
    console.error("[ensureContractForBooking] duplicate_contracts_for_booking", {
      bookingId: booking.id,
      contractIds: existingContracts.map((contract) => contract.id),
    });
  }

  const existing = existingContracts[0] ?? null;

  const { data: job } = booking.job_id
    ? await supabase
      .from("jobs")
      .select("id, title, description, budget, job_date, job_time, location, workspace_id, created_by_user_id")
      .eq("id", booking.job_id)
      .maybeSingle()
    : { data: null };

  const workspaceId = pickValue(
    overrides.workspace_id,
    (job as { workspace_id?: string | null } | null)?.workspace_id,
    existing?.workspace_id,
  );
  const createdByUserId = pickValue(
    overrides.created_by_user_id,
    (job as { created_by_user_id?: string | null } | null)?.created_by_user_id,
    existing?.created_by_user_id,
  );

  const { data: agencyProfile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", booking.agency_id)
    .maybeSingle();

  const effectivePlan: Plan = workspaceId ? "premium" : parsePlan((agencyProfile as { plan?: string | null } | null)?.plan);
  const liveSetting = await getLivePlanSetting(effectivePlan);

  const resolvedPaymentAmount = Number(
    pickValue(
      existing?.payment_amount,
      overrides.payment_amount,
      booking.price,
      (job as { budget?: number | null } | null)?.budget,
      0,
    ) ?? 0,
  );
  const commissionAmount =
    existing?.commission_amount != null
      ? Number(existing.commission_amount)
      : roundMoney(resolvedPaymentAmount * liveSetting.commission_rate);
  const netAmount =
    existing?.net_amount != null
      ? Number(existing.net_amount)
      : roundMoney(resolvedPaymentAmount - commissionAmount);

  const columns = await getContractColumnsCached();
  const basePayload: Record<string, unknown> = {
    booking_id: booking.id,
    agency_id: existing?.agency_id ?? booking.agency_id,
    talent_id: existing?.talent_id ?? booking.talent_user_id,
    talent_user_id: existing?.talent_user_id ?? booking.talent_user_id,
    job_id: existing?.job_id ?? booking.job_id,
    payment_amount: resolvedPaymentAmount,
    commission_amount: commissionAmount,
    net_amount: netAmount,
    contract_file_url: pickValue(existing?.contract_file_url, overrides.contract_file_url),
    job_date: pickValue(existing?.job_date, overrides.job_date, (job as { job_date?: string | null } | null)?.job_date),
    job_time: pickValue(existing?.job_time, overrides.job_time, (job as { job_time?: string | null } | null)?.job_time),
    location: pickValue(existing?.location, overrides.location, (job as { location?: string | null } | null)?.location),
    job_description: pickValue(
      existing?.job_description,
      overrides.job_description,
      (job as { description?: string | null } | null)?.description,
      booking.job_title,
      (job as { title?: string | null } | null)?.title,
    ),
    payment_method: pickValue(existing?.payment_method, overrides.payment_method),
    additional_notes: pickValue(existing?.additional_notes, overrides.additional_notes),
    status: existing?.status ?? overrides.status ?? "sent",
    created_at: existing?.id ? undefined : booking.created_at ?? undefined,
  };

  if (columns.hasWorkspaceId) {
    basePayload.workspace_id = workspaceId;
  }
  if (columns.hasCreatedByUserId) {
    basePayload.created_by_user_id = createdByUserId;
  }

  if (existing) {
    const updatePayload: Record<string, unknown> = {
      talent_id: existing.talent_id ?? booking.talent_user_id,
      talent_user_id: existing.talent_user_id ?? booking.talent_user_id,
      agency_id: existing.agency_id ?? booking.agency_id,
      job_id: existing.job_id ?? booking.job_id,
    };

    const fillIfMissing = <T,>(column: keyof ExistingContractRow, value: T | null | undefined) => {
      if ((existing[column] === null || existing[column] === undefined || existing[column] === "") && value != null) {
        updatePayload[column] = value;
      }
    };

    fillIfMissing("contract_file_url", basePayload.contract_file_url as string | null | undefined);
    fillIfMissing("job_date", basePayload.job_date as string | null | undefined);
    fillIfMissing("job_time", basePayload.job_time as string | null | undefined);
    fillIfMissing("location", basePayload.location as string | null | undefined);
    fillIfMissing("job_description", basePayload.job_description as string | null | undefined);
    fillIfMissing("payment_method", basePayload.payment_method as string | null | undefined);
    fillIfMissing("additional_notes", basePayload.additional_notes as string | null | undefined);

    if ((existing.payment_amount == null || Number(existing.payment_amount) === 0) && resolvedPaymentAmount > 0) {
      updatePayload.payment_amount = resolvedPaymentAmount;
    }
    if (existing.commission_amount == null && commissionAmount >= 0) {
      updatePayload.commission_amount = commissionAmount;
    }
    if (existing.net_amount == null && netAmount >= 0) {
      updatePayload.net_amount = netAmount;
    }
    if (columns.hasWorkspaceId && (existing.workspace_id == null || existing.workspace_id === "") && workspaceId) {
      updatePayload.workspace_id = workspaceId;
    }
    if (columns.hasCreatedByUserId && (existing.created_by_user_id == null || existing.created_by_user_id === "") && createdByUserId) {
      updatePayload.created_by_user_id = createdByUserId;
    }

    const hasUpdates = Object.keys(updatePayload).length > 4;
    if (!hasUpdates) return existing;

    const { data: updatedContract, error: updateError } = await supabase
      .from("contracts")
      .update(updatePayload)
      .eq("id", existing.id)
      .select()
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    console.info("[ensureContractForBooking] reused_contract", {
      bookingId: booking.id,
      contractId: updatedContract.id,
      contractStatus: updatedContract.status ?? null,
    });

    return updatedContract;
  }

  const insertPayload = Object.fromEntries(
    Object.entries(basePayload).filter(([, value]) => value !== undefined),
  );

  const { data: createdContract, error: insertError } = await supabase
    .from("contracts")
    .insert(insertPayload)
    .select()
    .single();

  if (insertError) {
    console.error("[ensureContractForBooking] insert_failed", {
      bookingId: booking.id,
      agencyId: booking.agency_id,
      talentUserId: booking.talent_user_id,
      error: insertError.message,
      code: insertError.code,
      details: insertError.details,
      payloadKeys: Object.keys(insertPayload),
    });
    throw new Error(insertError.message);
  }

  console.info("[ensureContractForBooking] created_contract", {
    bookingId: booking.id,
    contractId: createdContract.id,
    contractTalentUserId: (createdContract as Record<string, unknown>).talent_user_id ?? null,
    contractAgencyId: (createdContract as Record<string, unknown>).agency_id ?? null,
    contractStatus: createdContract.status ?? null,
  });

  return createdContract;
}
