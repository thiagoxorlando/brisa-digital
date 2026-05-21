import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/requireAdmin";

const REQUIRED_TABLES = [
  "profiles", "agencies", "talent_profiles", "jobs", "contracts",
  "wallet_transactions", "plan_settings", "notifications",
  "support_conversations", "support_messages", "asaas_webhook_events",
];

const REQUIRED_BUCKETS = ["contracts", "avatars", "logos", "talent-media"];

const ENV_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_APP_URL",
  "RESEND_API_KEY",
  "ASAAS_API_KEY",
  "ASAAS_API_URL",
  "ASAAS_WEBHOOK_TOKEN",
];

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = createServerClient({ useServiceRole: true });

  const tableChecks: Record<string, boolean> = {};
  await Promise.all(
    REQUIRED_TABLES.map(async (table) => {
      try {
        const { error } = await supabase.from(table).select("id").limit(1);
        tableChecks[table] = !error;
      } catch {
        tableChecks[table] = false;
      }
    }),
  );

  const bucketChecks: Record<string, { exists: boolean; public: boolean | null }> = {};
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketMap = new Map((buckets ?? []).map((b) => [b.name, b]));
    for (const name of REQUIRED_BUCKETS) {
      const bucket = bucketMap.get(name);
      bucketChecks[name] = { exists: !!bucket, public: bucket ? bucket.public : null };
    }
  } catch {
    for (const name of REQUIRED_BUCKETS) {
      bucketChecks[name] = { exists: false, public: null };
    }
  }

  const envChecks: Record<string, boolean> = {};
  for (const key of ENV_VARS) {
    envChecks[key] = !!process.env[key];
  }

  let latestWebhookAt: string | null = null;
  let failedWebhookCount = 0;
  try {
    const { data: webhookEvents } = await supabase
      .from("asaas_webhook_events")
      .select("created_at, processed_at, error")
      .order("created_at", { ascending: false })
      .limit(10);
    latestWebhookAt = (webhookEvents ?? [])[0]?.created_at ?? null;
    failedWebhookCount = (webhookEvents ?? []).filter(
      (e) => !(e as Record<string, unknown>).processed_at || (e as Record<string, unknown>).error,
    ).length;
  } catch {
    // table may not exist yet
  }

  const warnings: string[] = [];
  for (const [table, ok] of Object.entries(tableChecks)) {
    if (!ok) warnings.push(`Tabela "${table}" não encontrada ou inacessível`);
  }
  for (const [name, { exists }] of Object.entries(bucketChecks)) {
    if (!exists) warnings.push(`Bucket "${name}" não encontrado`);
  }
  if (!envChecks["ASAAS_WEBHOOK_TOKEN"]) warnings.push("ASAAS_WEBHOOK_TOKEN ausente");
  if (!latestWebhookAt) warnings.push("Nenhum webhook Asaas processado ainda");
  if (failedWebhookCount > 0) warnings.push(`${failedWebhookCount} webhook(s) com falha ou não processados`);

  try {
    const { data: freePlan } = await supabase
      .from("plan_settings")
      .select("plan_key")
      .eq("plan_key", "free")
      .maybeSingle();
    if (!freePlan) warnings.push("plan_settings sem plano Free configurado");
  } catch {
    warnings.push("plan_settings sem plano Free configurado");
  }

  return NextResponse.json({
    database: { connected: Object.values(tableChecks).some(Boolean), tables: tableChecks },
    storage: { buckets: bucketChecks },
    environment: {
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
      nodeEnv: process.env.NODE_ENV ?? null,
      vars: envChecks,
    },
    asaas: { latestWebhookAt, failedWebhookCount },
    warnings,
  });
}
