import { asaas, AsaasApiError } from "./asaasClient";
import { createServerClient } from "./supabase";

interface AsaasCustomerRecord { id: string; cpfCnpj?: string | null }
interface AsaasCustomerSearch { data: AsaasCustomerRecord[]; totalCount: number }

export class AsaasCustomerError extends Error {
  constructor(public readonly step: string, message: string) {
    super(message);
    this.name = "AsaasCustomerError";
  }
}

// Resolve CPF/CNPJ for a user from available DB sources:
//   1. Agency PIX key (when type is "cpf" or "cnpj" the value IS the document)
//   2. Saved cards holder document (most recently added card)
async function resolveDocument(userId: string): Promise<string | null> {
  const supabase = createServerClient({ useServiceRole: true });

  // Source 1: agency PIX key
  const { data: agency } = await supabase
    .from("agencies")
    .select("pix_key_type, pix_key_value")
    .eq("id", userId)
    .maybeSingle();

  if (agency?.pix_key_type === "cpf" || agency?.pix_key_type === "cnpj") {
    const digits = (agency.pix_key_value ?? "").replace(/\D/g, "");
    if (digits) return digits;
  }

  // Source 2: saved card document
  const { data: card } = await supabase
    .from("saved_cards")
    .select("holder_document_number")
    .eq("user_id", userId)
    .not("holder_document_number", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (card?.holder_document_number) {
    return card.holder_document_number.replace(/\D/g, "");
  }

  return null;
}

// Patch an existing Asaas customer with their CPF/CNPJ if it is missing.
async function patchCpfCnpjIfMissing(customerId: string, userId: string): Promise<void> {
  let customer: AsaasCustomerRecord | null = null;
  try {
    customer = await asaas<AsaasCustomerRecord>(`/customers/${customerId}`);
  } catch (err) {
    console.warn(
      "[ensureAsaasCustomer] fetch customer for patch failed (non-fatal):",
      err instanceof AsaasApiError ? JSON.stringify(err.body) : String(err),
    );
    return;
  }

  if (customer?.cpfCnpj) return; // already set

  const document = await resolveDocument(userId);
  if (!document) {
    console.warn("[ensureAsaasCustomer] no CPF/CNPJ found for user — cannot patch:", userId);
    return;
  }

  try {
    await asaas(`/customers/${customerId}`, {
      method: "PUT",
      body:   JSON.stringify({ cpfCnpj: document }),
    });
    console.log("[ensureAsaasCustomer] patched cpfCnpj on customer:", customerId);
  } catch (err) {
    console.warn(
      "[ensureAsaasCustomer] patch cpfCnpj failed (non-fatal):",
      err instanceof AsaasApiError ? JSON.stringify(err.body) : String(err),
    );
  }
}

/**
 * Returns the Asaas customer ID for a user.
 * Order: cached in profile → search Asaas by externalReference → create new.
 * Always ensures the customer has cpfCnpj set (required for PIX charges).
 * Persists the ID back to profiles so future calls skip the Asaas round-trip.
 */
export async function ensureAsaasCustomer(
  userId: string,
  name: string,
  email: string,
  cpfCnpj?: string,
): Promise<string> {
  const supabase = createServerClient({ useServiceRole: true });

  // Resolve document now — needed for both create and patch paths
  const resolvedDoc = cpfCnpj
    ? cpfCnpj.replace(/\D/g, "")
    : await resolveDocument(userId);

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
    // Ensure the existing customer has cpfCnpj — patch silently if missing
    await patchCpfCnpjIfMissing(cached, userId);
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
    if (resolvedDoc) body.cpfCnpj = resolvedDoc;

    console.log("[ensureAsaasCustomer] creating customer", {
      name: body.name,
      hasCpfCnpj: !!resolvedDoc,
    });

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
  } else {
    // Found an existing customer — ensure it has cpfCnpj
    await patchCpfCnpjIfMissing(customerId, userId);
  }

  // 4. Cache in profile (non-fatal)
  const { error: updateErr } = await supabase
    .from("profiles")
    .update({ asaas_customer_id: customerId } as Record<string, unknown>)
    .eq("id", userId);
  if (updateErr) {
    console.warn("[ensureAsaasCustomer] cache failed (non-fatal):", updateErr.message);
  }

  return customerId;
}
