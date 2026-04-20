import { MercadoPagoConfig, Customer } from "mercadopago";
import { createServerClient } from "@/lib/supabase";

/**
 * Returns the Mercado Pago customer ID for a user.
 * Creates the customer in MP and persists it if not yet stored.
 */
export async function ensureMpCustomer(userId: string, email: string): Promise<string> {
  const supabase = createServerClient({ useServiceRole: true });

  // Check cached customer ID first
  const { data: profile } = await supabase
    .from("profiles")
    .select("mp_customer_id")
    .eq("id", userId)
    .single();

  if (profile?.mp_customer_id) return profile.mp_customer_id;

  // Create MP customer
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN!;
  const client      = new MercadoPagoConfig({ accessToken });
  const mpCustomer  = await new Customer(client).create({ body: { email } });

  const customerId = mpCustomer.id!;

  // Persist
  await supabase
    .from("profiles")
    .update({ mp_customer_id: customerId })
    .eq("id", userId);

  return customerId;
}
