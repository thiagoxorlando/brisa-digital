import { NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import { cancelSubscription } from "@/lib/asaas";
import { notify } from "@/lib/notify";
import { renderNotificationTemplate } from "@/lib/notificationTemplates";

export async function POST() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerClient({ useServiceRole: true });

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, asaas_subscription_id")
    .eq("id", user.id)
    .single();

  const profileRow = profile as Record<string, unknown> | null;
  const subscriptionId = (profileRow?.asaas_subscription_id as string | null) ?? null;

  if (subscriptionId) {
    try {
      await cancelSubscription(subscriptionId);
    } catch (err) {
      console.warn("[subscription/cancel] Asaas cancel failed (continuing):", String(err));
    }
  }

  await supabase
    .from("profiles")
    .update({
      plan:         "free",
      plan_status:  "canceled",
      trial_ends_at: null,
    } as Record<string, unknown>)
    .eq("id", user.id);

  try {
    const { title, body, link } = renderNotificationTemplate("subscription_canceled", {});
    await notify([user.id], "billing", `${title}: ${body}`, link, `subscription_canceled:${user.id}`);
  } catch (err) {
    console.warn("[subscription/cancel] subscription_canceled notify failed (non-fatal):", String(err));
  }

  console.log("[subscription/cancel] agency canceled subscription", {
    userId: user.id,
    subscriptionId,
  });

  return NextResponse.json({ ok: true });
}
