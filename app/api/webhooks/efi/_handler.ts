import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { notifyAdmins } from "@/lib/notify";

// Shared handler for:
//   POST /api/webhooks/efi
//   POST /api/webhooks/efi/pix   ← Efí appends /pix on some configurations

type LogLevel = "info" | "warn" | "error";
function log(level: LogLevel, msg: string, ctx?: Record<string, unknown>) {
  const entry = { ts: new Date().toISOString(), level, source: "webhook/efi", msg, ...ctx };
  console[level === "info" ? "log" : level](JSON.stringify(entry));
}

// PIX IN entry (deposit received by the platform)
interface EfiPixInEntry {
  txid:         string;
  valor:        string;
  horario:      string;
  endToEndId?:  string;
  infoPagador?: string;
}

// PIX OUT entry (withdrawal sent by the platform, confirmed by Efí)
interface EfiPixOutEntry {
  idEnvio:      string;
  tipo:         string; // "envio"
  valor:        string;
  horario:      string;
  endToEndId?:  string;
  status?:      string;
}

// Union shape for the raw pix[] entries before we classify them
interface EfiPixRawEntry {
  txid?:        string;
  idEnvio?:     string;
  tipo?:        string;
  valor?:       string;
  horario?:     string;
  endToEndId?:  string;
  infoPagador?: string;
  status?:      string;
  [key: string]: unknown;
}

interface EfiWebhookBody {
  evento?: string;
  pix?:    EfiPixRawEntry[];
}

const OK = () => new Response("OK", { status: 200 });

export async function handleEfiWebhook(req: NextRequest): Promise<Response> {
  // ── Parse body ────────────────────────────────────────────────────────────────
  let body: EfiWebhookBody;
  try {
    body = await req.json();
  } catch {
    log("info", "Empty or malformed body — treating as validation probe");
    return OK();
  }

  console.log("[EFI WEBHOOK RECEIVED]", {
    headers: Object.fromEntries(req.headers.entries()),
    body,
  });

  // Log full body for debugging PIX IN vs PIX OUT shape differences
  console.log("[EFI WEBHOOK FULL BODY]", JSON.stringify(body, null, 2));

  // ── No pix entries → validation probe ────────────────────────────────────────
  const pixEntries = body.pix ?? [];

  if (pixEntries.length === 0) {
    log("info", "No pix entries in payload — treating as validation probe");
    return OK();
  }

  // ── Token validation ──────────────────────────────────────────────────────────
  // Efí may send the token via pix-token header, x-pix-token header, or ?token
  // query param — check all three. Only reject when a token IS received and does
  // NOT match; a missing token is allowed (endpoint URL acts as the secret).
  const expectedToken = process.env.EFI_WEBHOOK_TOKEN;
  const receivedToken =
    req.headers.get("pix-token") ??
    req.headers.get("x-pix-token") ??
    new URL(req.url).searchParams.get("token");

  console.log("[EFI WEBHOOK HEADERS]", Object.fromEntries(req.headers.entries()));

  if (expectedToken && receivedToken && receivedToken !== expectedToken) {
    log("warn", "Efí webhook token mismatch — rejecting", { tokenPrefix: receivedToken.slice(0, 6) });
    return new Response("Unauthorized", { status: 401 });
  }

  if (!receivedToken) {
    log("info", "Efí webhook — no token received; relying on endpoint secrecy");
  }

  const supabase = createServerClient({ useServiceRole: true });

  for (const raw of pixEntries) {
    // ── Classify entry: PIX IN (deposit) vs PIX OUT (withdrawal) ───────────────
    const isPixOut = !raw.txid && (!!raw.idEnvio || raw.tipo === "envio");

    if (isPixOut) {
      await handlePixOut(raw as EfiPixOutEntry, supabase);
    } else {
      await handlePixIn(raw as EfiPixInEntry, supabase);
    }
  }

  return OK();
}

// ── PIX OUT handler — withdrawal confirmed by Efí ─────────────────────────────

async function handlePixOut(
  entry: EfiPixOutEntry,
  supabase: ReturnType<typeof createServerClient>,
): Promise<void> {
  const { idEnvio, valor, endToEndId } = entry;
  const eventId = endToEndId ?? idEnvio ?? "unknown";

  console.log("[EFI WEBHOOK WITHDRAW DETECTED]", { idEnvio, valor, eventId, tipo: entry.tipo });

  // ── Deduplication gate ────────────────────────────────────────────────────────
  const { error: weErr } = await supabase
    .from("webhook_events")
    .insert({
      provider:          "efi",
      event_id:          eventId,
      provider_event_id: eventId,
      topic:             "pix.enviado",
      raw_payload:       entry as unknown as Record<string, unknown>,
      processed:         false,
    })
    .select("id")
    .single();

  if (weErr) {
    if (weErr.code === "23505") {
      log("info", "Duplicate PIX OUT entry — skipping", { idEnvio, eventId });
      return;
    }
    log("warn", "webhook_events insert failed for PIX OUT (non-fatal)", { idEnvio, err: weErr.message });
  }

  // ── Find withdrawal by provider_transfer_id = idEnvio ────────────────────────
  const { data: tx, error: txErr } = await supabase
    .from("wallet_transactions")
    .select("id, user_id, net_amount, status, provider_transfer_id")
    .eq("provider_transfer_id", idEnvio)
    .eq("type", "withdrawal")
    .maybeSingle();

  console.log("[EFI WEBHOOK WITHDRAW MATCHED]", {
    idEnvio,
    found:  Boolean(tx),
    status: tx?.status ?? null,
    txErr:  txErr?.message ?? null,
  });

  if (!tx) {
    log("warn", "No withdrawal matched PIX OUT idEnvio — ignoring", { idEnvio, eventId });
    return;
  }

  // ── Already paid — skip ───────────────────────────────────────────────────────
  if (tx.status === "paid") {
    log("info", "Withdrawal already paid — skipping PIX OUT webhook", { idEnvio, txId: tx.id });
    return;
  }

  // ── Mark withdrawal as paid ───────────────────────────────────────────────────
  const { error: updateErr } = await supabase
    .from("wallet_transactions")
    .update({
      status:          "paid",
      processed_at:    new Date().toISOString(),
      provider_status: "completed",
      admin_note:      `PIX confirmado via webhook Efí — ref: ${idEnvio}`,
    })
    .eq("id", tx.id)
    .neq("status", "paid"); // extra guard: skip if already paid between fetch and update

  if (updateErr) {
    log("error", "Failed to mark withdrawal paid via PIX OUT webhook", {
      txId:    tx.id,
      idEnvio,
      code:    updateErr.code,
      message: updateErr.message,
    });
    return;
  }

  console.log("[EFI WEBHOOK WITHDRAW UPDATED]", {
    txId:   tx.id,
    idEnvio,
    userId: tx.user_id,
    valor,
  });

  log("info", "Withdrawal confirmed as paid via Efí PIX OUT webhook", {
    txId:   tx.id,
    userId: tx.user_id,
    valor,
    idEnvio,
  });

  const brl = new Intl.NumberFormat("pt-BR", {
    style:                 "currency",
    currency:              "BRL",
    maximumFractionDigits: 0,
  }).format(Number(tx.net_amount ?? valor));

  await notifyAdmins(
    "payment",
    `Saque confirmado (Efí PIX): ${brl}`,
    "/admin/finances",
    `admin-withdrawal-confirmed-efi:${idEnvio}`,
  );
}

// ── PIX IN handler — deposit received by the platform ─────────────────────────
// This function is the original logic, unchanged.

async function handlePixIn(
  entry: EfiPixInEntry,
  supabase: ReturnType<typeof createServerClient>,
): Promise<void> {
  const { txid, endToEndId } = entry;
  const eventId = endToEndId ?? txid;

  console.log("[EFI WEBHOOK TXID]", txid);
  console.log("[EFI WEBHOOK LOOKUP]", { column: "payment_id", txid });

  // ── Deduplication gate ────────────────────────────────────────────────────────
  const { error: weErr } = await supabase
    .from("webhook_events")
    .insert({
      provider:          "efi",
      event_id:          eventId,
      provider_event_id: eventId,
      topic:             "pix.recebido",
      raw_payload:       entry as unknown as Record<string, unknown>,
      processed:         false,
    })
    .select("id")
    .single();

  if (weErr) {
    if (weErr.code === "23505") {
      log("info", "Duplicate pix entry — skipping", { txid, eventId });
      return;
    }
    log("warn", "webhook_events insert failed (non-fatal)", { txid, err: weErr.message });
  }

  // ── Find wallet_transaction by txid ──────────────────────────────────────────
  const { data: tx, error: txErr } = await supabase
    .from("wallet_transactions")
    .select("id, user_id, amount, description, status, payment_id, provider")
    .eq("payment_id", txid)
    .eq("provider", "efi")
    .maybeSingle();

  console.log("[EFI WEBHOOK MATCHED DEPOSIT]", { txid, tx, txErr: txErr?.message ?? null });

  if (!tx) {
    log("warn", "No wallet_transaction matched — returning 200 anyway", { txid });
    return;
  }

  const creditAmount = Number(tx.amount);

  // ── Credit wallet (atomic + idempotent via RPC) ───────────────────────────────
  const { data: creditResult, error: rpcErr } = await supabase.rpc("credit_wallet_deposit", {
    p_user_id:    tx.user_id,
    p_payment_id: txid,
    p_amount:     creditAmount,
  });

  console.log("[EFI WEBHOOK CREDIT RESULT]", { txid, creditResult, rpcErr: rpcErr?.message ?? null });

  if (rpcErr) {
    log("error", "credit_wallet_deposit failed", {
      userId: tx.user_id,
      txid,
      err:    rpcErr.message,
    });
    return;
  }

  if (creditResult) {
    log("info", "Wallet deposit credited via Efí PIX", {
      userId: tx.user_id,
      amount: creditAmount,
      txid,
    });
    const brl = new Intl.NumberFormat("pt-BR", {
      style:                 "currency",
      currency:              "BRL",
      maximumFractionDigits: 0,
    }).format(creditAmount);
    await notifyAdmins(
      "payment",
      `Depósito de carteira confirmado (Efí PIX): ${brl}`,
      "/admin/finances",
      `admin-wallet-deposit-efi:${txid}`,
    );
  } else {
    log("info", "Wallet deposit already credited — skipping", { txid, userId: tx.user_id });
  }
}
