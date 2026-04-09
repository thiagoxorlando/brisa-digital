import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { notify } from "@/lib/notify";
import { requireActiveSubscription } from "@/lib/requireActiveSubscription";

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
  } = body;

  if (!talent_id || !agency_id) {
    return NextResponse.json({ error: "talent_id and agency_id are required" }, { status: 400 });
  }
  if (!payment_amount || Number(payment_amount) <= 0) {
    return NextResponse.json({ error: "payment_amount must be greater than 0" }, { status: 400 });
  }

  const blocked = await requireActiveSubscription(agency_id);
  if (blocked) return blocked;

  const supabase = createServerClient({ useServiceRole: true });

  // Insert the contract
  const { data: contract, error } = await supabase
    .from("contracts")
    .insert({
      job_id:           job_id          ?? null,
      talent_id,
      agency_id,
      job_date:         job_date        ?? null,
      job_time:         job_time        ?? null,
      location:         location        ?? null,
      job_description:  job_description ?? null,
      payment_amount:   Number(payment_amount),
      payment_method:   payment_method  ?? null,
      additional_notes: additional_notes ?? null,
      status:           "sent",
    })
    .select()
    .single();

  if (error) {
    console.error("[POST /api/contracts]", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Resolve job title for the pending booking
  let jobTitle = job_description?.slice(0, 100) ?? "Contract Job";
  if (job_id) {
    const { data: jobRow } = await supabase
      .from("jobs")
      .select("title")
      .eq("id", job_id)
      .single();
    if (jobRow?.title) jobTitle = jobRow.title;
  }

  // Create a pending booking immediately so agency/talent can track it
  await supabase.from("bookings").insert({
    job_id:         job_id    ?? null,
    agency_id:      agency_id ?? null,
    talent_user_id: talent_id,
    job_title:      jobTitle,
    price:          Number(payment_amount),
    status:         "pending",
  });

  // Notify talent — contract received
  await notify(talent_id, "contract", "You received a new contract", "/talent/contracts");

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
