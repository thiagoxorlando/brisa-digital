import { MercadoPagoConfig, Customer } from "mercadopago";
import { createServerClient } from "@/lib/supabase";

/**
 * Returns the Mercado Pago customer ID for a user.
 * Order: cached in profile → search MP by email → create new.
 * Persists the ID back to profiles so future calls skip the MP lookup.
 */
export async function ensureMpCustomer(userId: string, email: string): Promise<string> {
  const supabase = createServerClient({ useServiceRole: true });

  // 1. Check profile cache first
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("mp_customer_id")
    .eq("id", userId)
    .single();

  if (profileErr) {
    console.error("[ensureMpCustomer] profile fetch error:", profileErr.message, profileErr.code);
    throw new Error(`Profile fetch failed: ${profileErr.message}`);
  }

  if (profile?.mp_customer_id) {
    console.log("[ensureMpCustomer] reusing cached customer:", profile.mp_customer_id);
    return profile.mp_customer_id;
  }

  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN!;
  const client = new MercadoPagoConfig({ accessToken });
  const customerClient = new Customer(client);

  let customerId: string | undefined;

  // 2. Search MP for existing customer — avoids conflict if created before but not cached
  console.log("[ensureMpCustomer] searching MP for email:", email);
  try {
    const searchResult = await customerClient.search({ options: { email } });
    const existing = searchResult.results?.[0];
    if (existing?.id) {
      console.log("[ensureMpCustomer] found existing MP customer:", existing.id);
      customerId = existing.id;
    } else {
      console.log("[ensureMpCustomer] no existing MP customer found for email");
    }
  } catch (searchErr) {
    // Search failure is non-fatal — fall through to create
    const msg = searchErr instanceof Error ? searchErr.message : String(searchErr);
    console.warn("[ensureMpCustomer] customer search failed, will try create:", msg);
  }

  // 3. Create if still not found
  if (!customerId) {
    console.log("[ensureMpCustomer] creating new MP customer for email:", email);
    let created;
    try {
      created = await customerClient.create({ body: { email } });
    } catch (createErr) {
      const msg = createErr instanceof Error ? createErr.message : String(createErr);
      console.error("[ensureMpCustomer] Customer.create failed:", msg, createErr);
      throw createErr;
    }
    if (!created?.id) {
      console.error("[ensureMpCustomer] Customer.create returned no id. Response:", JSON.stringify(created));
      throw new Error("MP Customer.create returned no id");
    }
    console.log("[ensureMpCustomer] created new MP customer:", created.id);
    customerId = created.id;
  }

  // 4. Persist to profile (non-fatal if update fails — MP customer already exists)
  const { error: updateErr } = await supabase
    .from("profiles")
    .update({ mp_customer_id: customerId })
    .eq("id", userId);

  if (updateErr) {
    console.error("[ensureMpCustomer] failed to cache mp_customer_id in profile:", updateErr.message);
  } else {
    console.log("[ensureMpCustomer] cached mp_customer_id in profile");
  }

  return customerId;
}
