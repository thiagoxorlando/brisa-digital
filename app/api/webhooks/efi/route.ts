import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { notifyAdmins } from "@/lib/notify";

// POST /api/webhooks/efi
//
// Receives PIX payment notifications from Efí (Gerencianet).
// Security: validates pix-token or EFI_WEBHOOK_TOKEN header.
// Deduplication: webhook_events table (provider, provider_event_id).
//
// Handled events:
//   pix.recebido  → credit agency wallet (PIX deposits)

type LogLevel = "info" | "warn" | "error";
function log(level: LogLevel, msg: string, ctx?: Record<string, unknown>) {
  const entry = { ts: new Date().toISOString(), level, source: "webhook/efi", msg, ...ctx };
  console[level === "info" ? "log" : level](JSON.stringify(entry));
}

interface EfiPixEntry {
  txid:        string;
  valor:       string; // decimal string e.g. "100.00"
  horario:     string; // ISO datetime
  endToEndId?: string;
  infoPagador?: string;
}

interface EfiWebhookBody {
  evento?: string;
  pix?:    EfiPixEntry[];
}

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────────
  const webhookToken = process.env.EFI_WEBHOOK_TOKEN;
  if (webhookToken) {
    // Efí sends the configured token in the pix-token header
    const incoming = req.headers.get("pix-token") ?? req.headers.get("authorization") ?? "";
    const tokenToCheck = incoming.startsWith("Bearer ") ? incoming.slice(7) : incoming;
    if (tokenToCheck !== webhookToken) {
      log("warn", "Invalid webhook token");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    log("warn", "EFI_WEBHOOK_TOKEN not configured — accepting without token validation");
  }

  // ── Parse body ────────────────────────────────────────────────────────────────
  let body: EfiWebhookBody;
  try {
    body = await req.json();
  } catch {
    log("warn", "Malformed JSON body");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log("[EFI WEBHOOK RECEIVED]", JSON.stringify(body, null, 2));

  const supabase = createServerClient({ useServiceRole: true });

  // ── pix.recebido — process each PIX entry ────────────────────────────────────
  const pixEntries = body.pix ?? [];

  if (pixEntries.length === 0) {
    log("info", "No pix entries in payload — acking");
    return NextResponse.json({ ok: true });
  }

  for (const entry of pixEntries) {
    const { txid, valor, endToEndId } = entry;
    const eventId = endToEndId ?? txid;

    // Deduplication gate
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
        continue;
      }
      log("warn", "webhook_events insert failed (non-fatal)", { txid, err: weErr.message });
    }

    // Find wallet_transaction by txid (stored as payment_id at charge creation)
    const { data: tx } = await supabase
      .from("wallet_transactions")
      .select("user_id, amount")
      .eq("payment_id", txid)
      .eq("provider", "efi")
      .maybeSingle();

    if (!tx) {
      log("warn", "No wallet_transaction matched — ignoring", { txid });
      continue;
    }

    const creditAmount = Number(tx.amount);

    // credit_wallet_deposit is atomic and idempotent:
    //   - updates description to "Depósito via PIX" (triggers frontend realtime listener)
    //   - credits profiles.wallet_balance atomically
    //   - unique index on payment_id ensures only one call wins
    const { data: credited, error: rpcErr } = await supabase.rpc("credit_wallet_deposit", {
      p_user_id:    tx.user_id,
      p_payment_id: txid,
      p_amount:     creditAmount,
    });

    if (rpcErr) {
      log("error", "credit_wallet_deposit failed", {
        userId: tx.user_id,
        txid,
        err:    rpcErr.message,
      });
      continue;
    }

    if (credited) {
      log("info", "Wallet deposit credited via Efí PIX", {
        userId:  tx.user_id,
        amount:  creditAmount,
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

  return NextResponse.json({ ok: true });
}
