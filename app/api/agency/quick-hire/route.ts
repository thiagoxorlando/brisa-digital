import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { notify, notifyAdmins } from "@/lib/notify";
import { requireJobLimit } from "@/lib/requireActiveSubscription";
import { resolvePlanInfo } from "@/lib/plans";
import { getLivePlanSetting } from "@/lib/planSettings.server";
import { ensureContractForBooking } from "@/lib/ensureContractForBooking.server";

export async function POST(req: NextRequest) {
  const { talent_id, agency_id } = await req.json();

  if (!talent_id || !agency_id) {
    return NextResponse.json({ error: "talent_id and agency_id are required" }, { status: 400 });
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

  if (caller?.role !== "agency" || agency_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const agencyId = user.id;
  const limited = await requireJobLimit(agencyId);
  if (limited) return limited;

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", agencyId)
    .single();
  const planInfo = resolvePlanInfo(profile);

  const { data: history } = await supabase
    .from("agency_talent_history")
    .select("talent_id")
    .eq("agency_id", agencyId)
    .eq("talent_id", talent_id)
    .maybeSingle();

  if (!history) {
    return NextResponse.json({ error: "Talent is not in this agency history" }, { status: 403 });
  }

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
    .eq("agency_id", agencyId)
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
      agency_id:   agencyId,
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
      agency_id:      agencyId,
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
  const liveSetting       = await getLivePlanSetting(planInfo.plan);
  const commission_amount = Math.round(amount * liveSetting.commission_rate * 100) / 100;
  const net_amount        = amount - commission_amount;

  console.log("[plan] quick_hire_contract", {
    agencyId,
    plan: planInfo.plan,
    amount,
    commissionAmount: commission_amount,
    netAmount: net_amount,
  });

  let contract;
  try {
    contract = await ensureContractForBooking({
      supabase,
      booking: {
        id: booking.id,
        job_id: job.id,
        agency_id: agencyId,
        talent_user_id: talent_id,
        job_title: job.title,
        price: amount,
      },
      overrides: {
        job_date: today,
        job_description: `Job rápido: ${role}`,
        payment_amount: amount,
        status: "sent",
      },
    });
  } catch (contractError) {
    await supabase.from("bookings").delete().eq("id", booking.id);
    await supabase.from("jobs").delete().eq("id", job.id);
    const message = contractError instanceof Error ? contractError.message : "Contract creation failed";
    console.error("[POST /api/agency/quick-hire] contract insert", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // 4 ─ Notify talent with rehire message
  const { data: agencyProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", agencyId)
    .single();

  const agencyName = agencyProfile?.full_name ?? "a agência";
  await notify(
    talent_id,
    "rehire",
    `Você foi contratado novamente por ${agencyName}`,
    "/talent/contracts",
  );

  await notifyAdmins(
    "booking",
    `Nova reserva criada: ${job.title}`,
    "/admin/bookings",
    `admin-booking-created:${booking.id}`,
  );
  await notifyAdmins(
    "contract",
    `Novo contrato criado: ${job.title}`,
    "/admin/contracts",
    `admin-contract-created:${contract.id}`,
  );

  return NextResponse.json({ contract, booking, job }, { status: 201 });
}
