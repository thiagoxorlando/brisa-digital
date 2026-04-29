import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe";

export async function getOrCreateStripeCustomer(
  supabase: SupabaseClient,
  userId: string,
  email: string | null | undefined,
) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();

  const existingCustomerId = (profile?.stripe_customer_id as string | null | undefined) ?? null;
  if (existingCustomerId) return existingCustomerId;

  const customer = await getStripe().customers.create({
    ...(email ? { email } : {}),
    metadata: { user_id: userId },
  });

  const { error } = await supabase
    .from("profiles")
    .update({ stripe_customer_id: customer.id })
    .eq("id", userId);

  if (error) {
    console.error("[stripe customer] failed to save customer id", {
      userId,
      customerId: customer.id,
      error: error.message,
    });
    throw new Error("Could not save Stripe customer.");
  }

  return customer.id;
}
