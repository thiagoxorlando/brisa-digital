import { MercadoPagoConfig, Customer } from "mercadopago";
import { createServerClient } from "@/lib/supabase";

// MP SDK throws parsed JSON, not Error instances.
// Shape: { message?: string, error?: string, status?: number, cause?: Array<{ code, description }> }
function extractMpError(err: unknown): string {
  if (!err || typeof err !== "object") return String(err);
  const e = err as Record<string, unknown>;
  const causeDesc = Array.isArray(e.cause)
    ? (e.cause[0] as Record<string, unknown> | undefined)?.description
    : undefined;
  return String(e.message ?? causeDesc ?? e.error ?? JSON.stringify(e));
}

export class MpCustomerError extends Error {
  constructor(public readonly step: string, message: string) {
    super(message);
    this.name = "MpCustomerError";
  }
}

/**
 * Returns the Mercado Pago customer ID for a user.
 * Order: cached in profile → search MP by email → create new.
 * Persists the ID back to profiles so future calls skip the MP round-trip.
 */
export async function ensureMpCustomer(userId: string, email: string): Promise<string> {
  const supabase = createServerClient({ useServiceRole: true });

  // 1. Check profile cache
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("mp_customer_id")
    .eq("id", userId)
    .single();

  if (profileErr) {
    console.error("[ensureMpCustomer] profile fetch error:", profileErr.message, profileErr.code);
    throw new MpCustomerError("profile_fetch_failed", profileErr.message);
  }

  if (profile?.mp_customer_id) {
    console.log("[ensureMpCustomer] reusing cached customer:", profile.mp_customer_id);
    return profile.mp_customer_id;
  }

  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN!;
  const client = new MercadoPagoConfig({ accessToken });
  const customerClient = new Customer(client);

  let customerId: string | undefined;

  // 2. Search MP for existing customer — avoids duplicate on retry
  console.log("[ensureMpCustomer] searching MP for email:", email);
  try {
    const searchResult = await customerClient.search({ options: { email } });
    const existing = searchResult.results?.[0];
    if (existing?.id) {
      console.log("[ensureMpCustomer] found existing MP customer:", existing.id);
      customerId = existing.id;
    } else {
      console.log("[ensureMpCustomer] no existing MP customer for this email");
    }
  } catch (searchErr) {
    const msg = extractMpError(searchErr);
    console.warn("[ensureMpCustomer] customer search failed (non-fatal), will try create:", msg);
    // Non-fatal — fall through to create
  }

  // 3. Create if still not found
  if (!customerId) {
    console.log("[ensureMpCustomer] creating MP customer for email:", email);
    let created;
    try {
      created = await customerClient.create({ body: { email } });
    } catch (createErr) {
      const msg = extractMpError(createErr);
      console.error("[ensureMpCustomer] Customer.create failed:", msg, JSON.stringify(createErr));
      throw new MpCustomerError("customer_create_failed", msg);
    }
    if (!created?.id) {
      const raw = JSON.stringify(created);
      console.error("[ensureMpCustomer] Customer.create returned no id. Response:", raw);
      throw new MpCustomerError("customer_create_failed", `MP returned no customer id. Raw: ${raw}`);
    }
    console.log("[ensureMpCustomer] created MP customer:", created.id);
    customerId = created.id;
  }

  // 4. Persist to profile (non-fatal)
  const { error: updateErr } = await supabase
    .from("profiles")
    .update({ mp_customer_id: customerId })
    .eq("id", userId);

  if (updateErr) {
    console.error("[ensureMpCustomer] profile update failed (non-fatal):", updateErr.message);
  } else {
    console.log("[ensureMpCustomer] cached mp_customer_id in profile:", customerId);
  }

  return customerId;
}
