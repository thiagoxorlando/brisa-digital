import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const path = form.get("path") as string | null;

  if (!file || !path) {
    return NextResponse.json({ error: "file and path are required" }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  const { error } = await supabase.storage
    .from("talent-media")
    .upload(path, file, { upsert: true });

  if (error) {
    console.error("[POST /api/upload]", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { data } = supabase.storage.from("talent-media").getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
