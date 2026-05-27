import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { notify, notifyAdmins } from "@/lib/notify";
import { getUnifiedBookingStatus, validateBookingStatus } from "@/lib/bookingStatus";
import { resolveWorkspaceLifecycleByJobId, talentWorkspaceContractsHref } from "@/lib/workspaceLifecycle";
import { ensureContractForBooking } from "@/lib/ensureContractForBooking.server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { job_id, agency_id, talent_id, job_title, price, status } = body;

  if (!job_id || !talent_id) {
    return NextResponse.json({ error: "job_id and talent_id are required" }, { status: 400 });
  }

  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerClient({ useServiceRole: true });
  const { data: caller } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (caller?.role !== "talent" || talent_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (status && status !== "pending") {
    return NextResponse.json({ error: "Bookings created by talents must start as pending" }, { status: 403 });
  }

  const safeStatus = "pending";
  const statusErr = validateBookingStatus(safeStatus);
  if (statusErr) return NextResponse.json({ error: statusErr }, { status: 422 });

  const { data: job } = await supabase
    .from("jobs")
    .select("id, title, agency_id, budget")
    .eq("id", job_id)
    .single();

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (agency_id && agency_id !== job.agency_id) {
    return NextResponse.json({ error: "Job does not belong to this agency" }, { status: 403 });
  }

  const { data: submission } = await supabase
    .from("submissions")
    .select("id")
    .eq("job_id", job_id)
    .eq("talent_user_id", user.id)
    .eq("status", "approved")
    .maybeSingle();

  if (!submission) {
    return NextResponse.json({ error: "Approved submission required" }, { status: 403 });
  }

  const { data: existingBooking } = await supabase
    .from("bookings")
    .select("id, job_id, agency_id, talent_user_id, job_title, price, status, created_at")
    .eq("job_id", job_id)
    .eq("talent_user_id", user.id)
    .maybeSingle();

  if (existingBooking) {
    let contract;
    try {
      contract = await ensureContractForBooking({
        supabase,
        booking: {
          id: existingBooking.id,
          job_id: existingBooking.job_id ?? null,
          agency_id: existingBooking.agency_id ?? job.agency_id,
          talent_user_id: existingBooking.talent_user_id ?? user.id,
          job_title: existingBooking.job_title ?? job.title ?? job_title ?? null,
          price: existingBooking.price ?? job.budget ?? price ?? 0,
          created_at: existingBooking.created_at ?? null,
        },
        overrides: {
          job_description: job.title ?? job_title ?? null,
          payment_amount: job.budget ?? price ?? 0,
          status: "sent",
        },
      });
    } catch (contractError) {
      const message = contractError instanceof Error ? contractError.message : "Contract creation failed";
      console.error("[POST /api/bookings] ensureContractForBooking existing", message);
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({
      booking: {
        ...existingBooking,
        derived_status: getUnifiedBookingStatus(existingBooking.status ?? "pending", contract.status ?? null),
      },
      contract,
    }, { status: 200 });
  }

  const { data, error } = await supabase
    .from("bookings")
    .insert({
      job_id,
      agency_id: job.agency_id,
      talent_user_id: user.id,
      job_title: job.title ?? job_title ?? null,
      price: job.budget ?? price ?? 0,
      status: safeStatus,
    })
    .select()
    .single();

  if (error) {
    console.error("[POST /api/bookings]", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  let contract;
  try {
    contract = await ensureContractForBooking({
      supabase,
      booking: {
        id: data.id,
        job_id: data.job_id ?? job_id,
        agency_id: data.agency_id ?? job.agency_id,
        talent_user_id: data.talent_user_id ?? user.id,
        job_title: data.job_title ?? job.title ?? job_title ?? null,
        price: data.price ?? job.budget ?? price ?? 0,
        created_at: data.created_at ?? null,
      },
      overrides: {
        job_description: job.title ?? job_title ?? null,
        payment_amount: job.budget ?? price ?? 0,
        status: "sent",
      },
    });
  } catch (contractError) {
    await supabase.from("bookings").delete().eq("id", data.id);
    const message = contractError instanceof Error ? contractError.message : "Contract creation failed";
    console.error("[POST /api/bookings] ensureContractForBooking", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const workspaceLifecycle = await resolveWorkspaceLifecycleByJobId(supabase, job_id);

  await notify(
    user.id,
    "booking",
    "Voce foi reservado!",
    talentWorkspaceContractsHref(workspaceLifecycle?.workspaceSlug),
  );
  await notifyAdmins(
    "booking",
    `Nova reserva criada: ${data.job_title ?? "sem titulo"}`,
    "/admin/bookings",
    `admin-booking-created:${data.id}`,
  );

  return NextResponse.json({
    booking: {
      ...data,
      derived_status: getUnifiedBookingStatus(data.status ?? "pending", contract.status ?? null),
    },
    contract,
  }, { status: 201 });
}
