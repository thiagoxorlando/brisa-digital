import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { notify } from "@/lib/notify";
import { requireJobLimit } from "@/lib/requireActiveSubscription";
import { calculateCommission, calculateNetAmount, resolvePlanInfo } from "@/lib/plans";

export async function POST(req: NextRequest) {
  const { talent_id, agency_id } = await req.json();

  if (!talent_id || !agency_id) {
    return NextResponse.json({ error: "talent_id and agency_id are required" }, { status: 400 });
  }

  const limited = await requireJobLimit(agency_id);
  if (limited) return limited;

  const supabase = createServerClient({ useServiceRole: true });
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", agency_id)
    .single();
  const planInfo = resolvePlanInfo(profile);

  // Fetch talent profile for role + name
  const { data: talent } = await supabase
    .from("talent_profiles")
    .select("full_name, main_role, categories")
    .eq("id", talent_id)
    .single();

  // Fetch last contract between this agency + talent for payment amount
  const { data: lastContract } = await supabase
    .from("contracts")
    .select("payment_amount")
    .eq("agency_id", agency_id)
    .eq("talent_id", talent_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const role        = talent?.main_role ?? talent?.categories?.[0] ?? "Serviço";
  const talentName  = talent?.full_name ?? "Talento";
  const amount      = lastContract?.payment_amount ?? 0;
  const today       = new Date().toISOString().split("T")[0];
  const jobTitle    = `${role} – ${new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`;

  // 1 ─ Create minimal job
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .insert({
      title:       jobTitle,
      description: `Job rápido criado para ${talentName}.`,
      category:    talent?.categories?.[0] ?? "Other",
      budget:      amount,
      deadline:    today,
      job_date:    today,
      job_role:    role,
      agency_id,
      status:      "open",
      number_of_talents_required: 1,
    })
    .select("id, title")
    .single();

  if (jobErr) {
    console.error("[POST /api/agency/quick-hire] job insert", jobErr);
    return NextResponse.json({ error: jobErr.message }, { status: 400 });
  }

  // 2 ─ Create booking
  const { data: booking, error: bookingErr } = await supabase
    .from("bookings")
    .insert({
      job_id:         job.id,
      agency_id,
      talent_user_id: talent_id,
      job_title:      job.title,
      price:          amount,
      status:         "pending",
    })
    .select("id")
    .single();

  if (bookingErr) {
    await supabase.from("jobs").delete().eq("id", job.id);
    console.error("[POST /api/agency/quick-hire] booking insert", bookingErr);
    return NextResponse.json({ error: bookingErr.message }, { status: 400 });
  }

  // 3 ─ Create contract
  const commission_amount = calculateCommission(amount, planInfo.plan);
  const net_amount        = calculateNetAmount(amount, planInfo.plan);

  console.log("[plan] quick_hire_contract", {
    agencyId: agency_id,
    plan: planInfo.plan,
    amount,
    commissionAmount: commission_amount,
    netAmount: net_amount,
  });

  const { data: contract, error: contractErr } = await supabase
    .from("contracts")
    .insert({
      booking_id:       booking.id,
      job_id:           job.id,
      talent_id,
      agency_id,
      job_date:         today,
      job_description:  `Job rápido: ${role}`,
      payment_amount:   amount,
      commission_amount,
      net_amount,
      status:           "sent",
    })
    .select("id")
    .single();

  if (contractErr) {
    await supabase.from("bookings").delete().eq("id", booking.id);
    await supabase.from("jobs").delete().eq("id", job.id);
    console.error("[POST /api/agency/quick-hire] contract insert", contractErr);
    return NextResponse.json({ error: contractErr.message }, { status: 400 });
  }

  // 4 ─ Notify talent with rehire message
  const { data: agencyProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", agency_id)
    .single();

  const agencyName = agencyProfile?.full_name ?? "a agência";
  await notify(
    talent_id,
    "rehire",
    `Você foi contratado novamente por ${agencyName}`,
    "/talent/contracts",
  );

  return NextResponse.json({ contract, booking, job }, { status: 201 });
}
