import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";

// Keep the Node.js runtime and raise the body size limit so that files uploaded
// through this route (e.g. contract PDFs from agency pages) are not silently
// rejected by the serverless payload gate.
export const runtime = "nodejs";

// 20 MB — matches the largest limit we advertise in the UI.
// Note: talent submission files now bypass this route entirely and upload
// directly to Supabase Storage from the browser.
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

function isSafeStoragePath(path: string) {
  return (
    path.length <= 500 &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !path.includes("..") &&
    !path.includes("//")
  );
}

async function canUploadToPath(
  supabase: ReturnType<typeof createServerClient>,
  path: string,
  userId: string,
  role?: string | null,
) {
  if (path.startsWith(`avatars/${userId}.`)) return true;
  if (path === `agency-avatars/${userId}` || path.startsWith(`agency-avatars/${userId}.`)) return true;
  if (role === "admin" && path.startsWith(`admin-avatars/${userId}.`)) return true;
  if (role === "talent" && path.startsWith(`submissions/${userId}/`)) return true;
  if (role === "agency" && path.startsWith("contracts/") && !path.startsWith("contracts/signed/")) return true;

  if (role === "talent" && path.startsWith("contracts/signed/")) {
    const fileName = path.slice("contracts/signed/".length);
    const contractId = fileName.split("_")[0];
    if (!contractId) return false;

    const { data: contract } = await supabase
      .from("contracts")
      .select("talent_id")
      .eq("id", contractId)
      .single();

    return contract?.talent_id === userId;
  }

  return false;
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const path = form.get("path") as string | null;

  if (!file || !path) {
    return NextResponse.json({ error: "file and path are required" }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024);
    return NextResponse.json({ error: `File is too large. Maximum size is ${mb} MB.` }, { status: 413 });
  }

  if (!isSafeStoragePath(path)) {
    return NextResponse.json({ error: "Invalid upload path" }, { status: 400 });
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

  if (!(await canUploadToPath(supabase, path, user.id, caller?.role))) {
    return NextResponse.json({ error: "Forbidden upload path" }, { status: 403 });
  }

  const { error } = await supabase.storage
    .from("talent-media")
    .upload(path, file, { upsert: true });

  if (error) {
    console.error("[POST /api/upload]", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { data } = supabase.storage.from("talent-media").getPublicUrl(path);
  return NextResponse.json({ path, url: data.publicUrl });
}
