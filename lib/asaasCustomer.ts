import { asaas, AsaasApiError } from "./asaasClient";
import { createServerClient } from "./supabase";

interface AsaasCustomerRecord { id: string }
interface AsaasCustomerSearch { data: AsaasCustomerRecord[]; totalCount: number }

export class AsaasCustomerError extends Error {
  constructor(public readonly step: string, message: string) {
    super(message);
    this.name = "AsaasCustomerError";
  }
}

/**
 * Returns the Asaas customer ID for a user.
 * Order: cached in profile → search Asaas by externalReference → create new.
 * Persists the ID back to profiles so future calls skip the Asaas round-trip.
 */
export async function ensureAsaasCustomer(
  userId: string,
  name: string,
  email: string,
  cpfCnpj?: string,
): Promise<string> {
  const supabase = createServerClient({ useServiceRole: true });

  // 1. Check profile cache
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("asaas_customer_id")
    .eq("id", userId)
    .single();

  if (profileErr) throw new AsaasCustomerError("profile_fetch_failed", profileErr.message);

  const cached = (profile as Record<string, unknown> | null)?.asaas_customer_id as string | undefined;
  if (cached) {
    console.log("[ensureAsaasCustomer] reusing cached customer:", cached);
    return cached;
  }

  let customerId: string | undefined;

  // 2. Search Asaas by externalReference (our user ID)
  try {
    const search = await asaas<AsaasCustomerSearch>(
      `/customers?externalReference=${encodeURIComponent(userId)}`,
    );
    if (search.data?.[0]?.id) {
      customerId = search.data[0].id;
      console.log("[ensureAsaasCustomer] found existing customer:", customerId);
    }
  } catch (err) {
    console.warn(
      "[ensureAsaasCustomer] search failed (non-fatal):",
      err instanceof AsaasApiError ? JSON.stringify(err.body) : String(err),
    );
  }

  // 3. Create if not found
  if (!customerId) {
    const body: Record<string, string> = {
      name:              name || "Agência",
      email:             email || "sem-email@brisahub.com.br",
      externalReference: userId,
    };
    if (cpfCnpj) body.cpfCnpj = cpfCnpj.replace(/\D/g, "");

    try {
      const created = await asaas<AsaasCustomerRecord>("/customers", {
        method: "POST",
        body:   JSON.stringify(body),
      });
      customerId = created.id;
      console.log("[ensureAsaasCustomer] created customer:", customerId);
    } catch (err) {
      const msg = err instanceof AsaasApiError ? JSON.stringify(err.body) : String(err);
      console.error("[ensureAsaasCustomer] create failed:", msg);
      throw new AsaasCustomerError("customer_create_failed", msg);
    }
  }

  // 4. Cache in profile (non-fatal — column added by 20260426_asaas_customer.sql migration)
  const { error: updateErr } = await supabase
    .from("profiles")
    .update({ asaas_customer_id: customerId } as Record<string, unknown>)
    .eq("id", userId);
  if (updateErr) {
    console.warn("[ensureAsaasCustomer] cache failed (non-fatal):", updateErr.message);
  }

  return customerId;
}
