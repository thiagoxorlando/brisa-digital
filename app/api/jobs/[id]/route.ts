import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";

const PATCH_ALLOWED = ["title", "description", "category", "budget", "deadline", "job_date", "status", "location", "gender", "age_min", "age_max", "number_of_talents_required", "visibility"];

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
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  const { data, error } = await supabase
    .from("jobs")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
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
    // no body — soft delete
  }

  const supabase = createServerClient({ useServiceRole: true });
  const session  = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hard) {
    // Soft delete: set status = 'inactive'
    const { error } = await supabase
      .from("jobs")
      .update({ status: "inactive" })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, deleted: false });
  }

  // Hard delete: allowed for admin OR the agency that owns the job
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role === "admin";

  if (!isAdmin) {
    // Check the agency owns this job
    const { data: job } = await supabase
      .from("jobs")
      .select("agency_id")
      .eq("id", id)
      .single();

    if (!job || job.agency_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Cascade: delete submissions first, then the job
  await supabase.from("submissions").delete().eq("job_id", id);

  const { error } = await supabase.from("jobs").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, deleted: true });
}
