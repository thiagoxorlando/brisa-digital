import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { enforce } from "@/lib/bookingStatus";

type Params = { params: Promise<{ id: string }> };

async function fetchContract(id: string) {
  const supabase = createServerClient({ useServiceRole: true });
  const { data } = await supabase
    .from("contracts")
    .select("status")
    .eq("id", id)
    .single();
  return { supabase, contract: data };
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const { supabase, contract } = await fetchContract(id);

  if (!contract) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }
  if (contract.status === "paid") {
    return NextResponse.json(
      { error: "Contract is paid and cannot be edited" },
      { status: 409 }
    );
  }

  const body    = await req.json();
  const allowed = ["status", "payment_amount", "job_date", "location", "additional_notes"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // Enforce valid state machine transitions when changing status
  if (updates.status) {
    const err = enforce(contract.status, String(updates.status));
    if (err) return NextResponse.json({ error: err }, { status: 422 });

    // Set canonical timestamps alongside admin status overrides
    const newStatus = String(updates.status);
    if (newStatus === "signed")    updates.signed_at     = new Date().toISOString();
    if (newStatus === "confirmed") updates.confirmed_at  = new Date().toISOString();
    if (newStatus === "paid")      updates.paid_at       = new Date().toISOString();
  }

  const { error } = await supabase.from("contracts").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const { supabase, contract } = await fetchContract(id);

  if (!contract) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }
  if (contract.status === "paid") {
    return NextResponse.json(
      { error: "Contract is paid and cannot be deleted" },
      { status: 409 }
    );
  }

  const { error } = await supabase
    .from("contracts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
