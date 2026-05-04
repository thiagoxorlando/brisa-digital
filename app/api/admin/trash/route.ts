import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/requireAdmin";
import { deleteUserDeep } from "@/lib/admin/deleteUserDeep";

const TABLES = ["jobs", "bookings", "contracts", "talent_profiles", "agencies"] as const;
type TrashTable = (typeof TABLES)[number];

function isValidTable(value: unknown): value is TrashTable {
  return typeof value === "string" && TABLES.includes(value as TrashTable);
}

// GET — list all soft-deleted items
export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = createServerClient({ useServiceRole: true });

  const [jobs, bookings, contracts, talent, agencies] = await Promise.all([
    supabase.from("jobs").select("id, title, deleted_at, created_at").not("deleted_at", "is", null),
    supabase.from("bookings").select("id, job_title, status, deleted_at, created_at").not("deleted_at", "is", null),
    supabase.from("contracts").select("id, status, payment_amount, deleted_at, created_at").not("deleted_at", "is", null),
    supabase.from("talent_profiles").select("id, full_name, deleted_at, created_at").not("deleted_at", "is", null),
    supabase.from("agencies").select("id, company_name, deleted_at, created_at").not("deleted_at", "is", null),
  ]);

  return NextResponse.json({
    jobs:      jobs.data      ?? [],
    bookings:  bookings.data  ?? [],
    contracts: contracts.data ?? [],
    talent:    talent.data    ?? [],
    agencies:  agencies.data  ?? [],
  });
}

// DELETE — permanently delete item(s) from trash
//
// For agencies and talent_profiles, calls deleteUserDeep() which removes
// the auth account, all linked records, and frees up the email for reuse.
// For other types (jobs, bookings, contracts), performs a direct hard-delete.
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({})) as {
    table?: unknown;
    id?: unknown;
    items?: Array<{ table?: unknown; id?: unknown }>;
  };

  const items = Array.isArray(body.items)
    ? body.items
    : body.table && body.id
      ? [{ table: body.table, id: body.id }]
      : [];

  if (items.length === 0) {
    return NextResponse.json({ error: "items required" }, { status: 400 });
  }

  for (const item of items) {
    if (!isValidTable(item.table)) {
      return NextResponse.json({ error: "Invalid table" }, { status: 400 });
    }
    if (typeof item.id !== "string" || !item.id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
  }

  const supabase = createServerClient({ useServiceRole: true });
  const grouped = new Map<TrashTable, string[]>();
  for (const item of items) {
    const table = item.table as TrashTable;
    const ids = grouped.get(table) ?? [];
    ids.push(item.id as string);
    grouped.set(table, ids);
  }

  for (const [table, ids] of grouped) {
    if (table === "agencies") {
      // Permanent delete of an agency must go through deleteUserDeep so the
      // auth account is removed and the email can be reused.
      for (const id of ids) {
        const { data: agency } = await supabase
          .from("agencies")
          .select("user_id")
          .eq("id", id)
          .maybeSingle();

        const userId = (agency as Record<string, unknown> | null)?.user_id as string | undefined;
        if (userId) {
          try {
            await deleteUserDeep(userId);
          } catch (err) {
            return NextResponse.json(
              { error: err instanceof Error ? err.message : "Falha ao excluir agência." },
              { status: 500 },
            );
          }
        } else {
          // Orphan row with no linked user — just hard-delete the row
          await supabase.from("agencies").delete().eq("id", id);
        }
      }
    } else if (table === "talent_profiles") {
      // talent_profiles.id === Supabase Auth user id
      for (const id of ids) {
        try {
          await deleteUserDeep(id);
        } catch (err) {
          return NextResponse.json(
            { error: err instanceof Error ? err.message : "Falha ao excluir talento." },
            { status: 500 },
          );
        }
      }
    } else {
      // jobs, bookings, contracts — simple hard-delete
      const { error } = await supabase.from(table).delete().in("id", ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true, count: items.length });
}

// POST — restore an item (clear deleted_at)
//
// For agencies and talent_profiles, also unfreezes the user account so
// the user can log in again after being restored from trash.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { table, id } = await req.json();

  if (!TABLES.includes(table)) {
    return NextResponse.json({ error: "Invalid table" }, { status: 400 });
  }
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  const { error } = await supabase
    .from(table as TrashTable)
    .update({ deleted_at: null })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Unfreeze the linked user account so they can log in again
  if (table === "agencies") {
    const { data: agency } = await supabase
      .from("agencies")
      .select("user_id")
      .eq("id", id)
      .maybeSingle();

    const userId = (agency as Record<string, unknown> | null)?.user_id as string | undefined;
    if (userId) {
      await supabase.from("profiles").update({ is_frozen: false }).eq("id", userId);
    }
  } else if (table === "talent_profiles") {
    await supabase.from("profiles").update({ is_frozen: false }).eq("id", id);
  }

  return NextResponse.json({ ok: true });
}
