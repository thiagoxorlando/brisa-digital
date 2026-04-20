import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { notify } from "@/lib/notify";
import { requireHireLimit } from "@/lib/requireActiveSubscription";
import { calculateCommission, calculateNetAmount, resolvePlanInfo } from "@/lib/plans";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    job_id,
    talent_id,
    agency_id,
    job_date,
    job_time,
    location,
    job_description,
    payment_amount,
    payment_method,
    additional_notes,
    is_rehire,
  } = body;

  if (!talent_id || !agency_id) {
    return NextResponse.json({ error: "talent_id and agency_id are required" }, { status: 400 });
  }
  if (payment_amount === undefined || payment_amount === null || isNaN(Number(payment_amount)) || Number(payment_amount) < 0) {
    return NextResponse.json({ error: "payment_amount must be 0 or greater" }, { status: 400 });
  }

  const limited = await requireHireLimit(agency_id, job_id ?? null);
  if (limited) return limited;

  const supabase = createServerClient({ useServiceRole: true });
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", agency_id)
    .single();
  const planInfo = resolvePlanInfo(profile);

  const amount            = Number(payment_amount);
  const commission_amount = calculateCommission(amount, planInfo.plan);
  const net_amount        = calculateNetAmount(amount, planInfo.plan);

  console.log("[plan] create_contract", {
    agencyId: agency_id,
    jobId: job_id ?? null,
    plan: planInfo.plan,
    amount,
    commissionAmount: commission_amount,
    netAmount: net_amount,
  });

  // Resolve job title before creating records
  let jobTitle = job_description?.slice(0, 100) ?? "Contract Job";
  if (job_id) {
    const { data: jobRow } = await supabase
      .from("jobs")
      .select("title")
      .eq("id", job_id)
      .single();
    if (jobRow?.title) jobTitle = jobRow.title;
  }

  // Create booking first so we can link it to the contract via booking_id
  const { data: booking, error: bookingErr } = await supabase
    .from("bookings")
    .insert({
      job_id:         job_id    ?? null,
      agency_id:      agency_id ?? null,
      talent_user_id: talent_id,
      job_title:      jobTitle,
      price:          amount,
      status:         "pending",
    })
    .select("id")
    .single();

  if (bookingErr) {
    console.error("[POST /api/contracts] booking insert", bookingErr);
    return NextResponse.json({ error: bookingErr.message }, { status: 400 });
  }

  // Insert the contract, linked to the booking
  const { data: contract, error } = await supabase
    .from("contracts")
    .insert({
      booking_id:       booking.id,
      job_id:           job_id          ?? null,
      talent_id,
      agency_id,
      job_date:         job_date        ?? null,
      job_time:         job_time        ?? null,
      location:         location        ?? null,
      job_description:  job_description ?? null,
      payment_amount:   amount,
      commission_amount,
      net_amount,
      payment_method:   payment_method  ?? null,
      additional_notes: additional_notes ?? null,
      status:           "sent",
    })
    .select()
    .single();

  if (error) {
    console.error("[POST /api/contracts]", error);
    // Clean up the booking we just created — no contract means no booking
    await supabase.from("bookings").delete().eq("id", booking.id);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Notify talent — contract received (or rehire)
  if (is_rehire) {
    const { data: agencyProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", agency_id)
      .single();
    const agencyName = agencyProfile?.full_name ?? "a agência";
    await notify(talent_id, "rehire", `Você foi contratado novamente por ${agencyName}`, "/talent/contracts");
  } else {
    await notify(talent_id, "contract", "Você recebeu um novo contrato", "/talent/contracts");
  }

  return NextResponse.json({ contract }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agencyId = searchParams.get("agency_id");
  const talentId = searchParams.get("talent_id");

  const supabase = createServerClient({ useServiceRole: true });

  let query = supabase
    .from("contracts")
    .select("*")
    .order("created_at", { ascending: false });

  if (agencyId) query = query.eq("agency_id", agencyId);
  if (talentId) query = query.eq("talent_id", talentId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ contracts: data });
}
