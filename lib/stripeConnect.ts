import type Stripe from "stripe";
import { createServerClient } from "@/lib/supabase";

type Supabase = ReturnType<typeof createServerClient>;

type SupabaseLikeError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

export type StripeConnectRole = "agency" | "talent";

export type StripeConnectStatus = {
  role: StripeConnectRole;
  connected: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  transfers_active: boolean;
  stripe_account_id: string | null;
  pix_key_type: string | null;
  pix_key_value: string | null;
  pix_holder_name: string | null;
  display_name: string;
  finances_path: "/agency/finances" | "/talent/finances";
};

export type StripePayoutAvailabilityState =
  | "unconnected"
  | "connected"
  | "review"
  | "blocked"
  | "ready";

export class StripeConnectSchemaError extends Error {
  table: string;
  column: string | null;
  code: string | null;
  details: string | null;
  hint: string | null;

  constructor(message: string, options: {
    table: string;
    column?: string | null;
    code?: string | null;
    details?: string | null;
    hint?: string | null;
  }) {
    super(message);
    this.name = "StripeConnectSchemaError";
    this.table = options.table;
    this.column = options.column ?? null;
    this.code = options.code ?? null;
    this.details = options.details ?? null;
    this.hint = options.hint ?? null;
  }
}

type StoredStripeConnectFields = {
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean | null;
  stripe_payouts_enabled: boolean | null;
  stripe_details_submitted: boolean | null;
  stripe_transfers_active: boolean | null;
  pix_key_type: string | null;
  pix_key_value: string | null;
  pix_holder_name: string | null;
  company_name?: string | null;
  full_name?: string | null;
};

export function isStripeConnectReady(status: Pick<StripeConnectStatus, "connected" | "payouts_enabled" | "details_submitted" | "transfers_active">) {
  return Boolean(status.connected && status.payouts_enabled && status.details_submitted && status.transfers_active);
}

export function getStripePayoutAvailabilityState(status: Pick<StripeConnectStatus, "connected" | "payouts_enabled" | "details_submitted" | "transfers_active"> & {
  lastWithdrawalProviderStatus?: string | null;
}) {
  const lastProviderStatus = status.lastWithdrawalProviderStatus?.trim().toLowerCase() ?? null;

  if (!status.connected) return "unconnected" satisfies StripePayoutAvailabilityState;
  if (lastProviderStatus === "failed") return "blocked" satisfies StripePayoutAvailabilityState;
  if (!status.details_submitted) return "review" satisfies StripePayoutAvailabilityState;
  if (!status.payouts_enabled || !status.transfers_active) return "connected" satisfies StripePayoutAvailabilityState;
  return "ready" satisfies StripePayoutAvailabilityState;
}

export function hasManualPixFallback(status: Pick<StripeConnectStatus, "pix_key_value">) {
  return Boolean(status.pix_key_value?.trim());
}

function missingColumnFromError(error: SupabaseLikeError | null | undefined) {
  const message = error?.message ?? "";
  const match = message.match(/column\s+([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\s+does not exist/i);
  if (!match) return { table: null, column: null };
  return { table: match[1] ?? null, column: match[2] ?? null };
}

function throwIfSchemaError(error: SupabaseLikeError | null | undefined, fallbackTable: string) {
  if (!error) return;
  const parsed = missingColumnFromError(error);
  throw new StripeConnectSchemaError(
    error.message ?? `Schema error on ${fallbackTable}`,
    {
      table: parsed.table ?? fallbackTable,
      column: parsed.column,
      code: error.code ?? null,
      details: error.details ?? null,
      hint: error.hint ?? null,
    },
  );
}

export async function getStripeConnectStatusForUser(supabase: Supabase, userId: string): Promise<StripeConnectStatus | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const role = profile?.role;
  if (role !== "agency" && role !== "talent") return null;

  if (role === "agency") {
    const { data: agency, error } = await supabase
      .from("agencies")
      .select("stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted, stripe_transfers_active, pix_key_type, pix_key_value, pix_holder_name, company_name")
      .eq("id", userId)
      .maybeSingle();
    throwIfSchemaError(error, "agencies");

    const row = (agency ?? null) as StoredStripeConnectFields | null;
    return {
      role,
      connected: Boolean(row?.stripe_account_id),
      charges_enabled: Boolean(row?.stripe_charges_enabled),
      payouts_enabled: Boolean(row?.stripe_payouts_enabled),
      details_submitted: Boolean(row?.stripe_details_submitted),
      transfers_active: Boolean(row?.stripe_transfers_active),
      stripe_account_id: row?.stripe_account_id ?? null,
      pix_key_type: row?.pix_key_type ?? null,
      pix_key_value: row?.pix_key_value ?? null,
      pix_holder_name: row?.pix_holder_name ?? null,
      display_name: row?.company_name ?? "Agencia",
      finances_path: "/agency/finances",
    };
  }

  const { data: talent, error } = await supabase
    .from("talent_profiles")
    .select("stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted, stripe_transfers_active, pix_key_type, pix_key_value, pix_holder_name, full_name")
    .eq("id", userId)
    .maybeSingle();
  throwIfSchemaError(error, "talent_profiles");

  const row = (talent ?? null) as StoredStripeConnectFields | null;
  return {
    role,
    connected: Boolean(row?.stripe_account_id),
    charges_enabled: Boolean(row?.stripe_charges_enabled),
    payouts_enabled: Boolean(row?.stripe_payouts_enabled),
    details_submitted: Boolean(row?.stripe_details_submitted),
    transfers_active: Boolean(row?.stripe_transfers_active),
    stripe_account_id: row?.stripe_account_id ?? null,
    pix_key_type: row?.pix_key_type ?? null,
    pix_key_value: row?.pix_key_value ?? null,
    pix_holder_name: row?.pix_holder_name ?? null,
    display_name: row?.full_name ?? "Talento",
    finances_path: "/talent/finances",
  };
}

export async function syncStripeConnectAccountStatus(supabase: Supabase, account: Stripe.Account) {
  const payload = {
    stripe_charges_enabled: account.charges_enabled ?? false,
    stripe_payouts_enabled: account.payouts_enabled ?? false,
    stripe_details_submitted: account.details_submitted ?? false,
    stripe_transfers_active: account.capabilities?.transfers === "active",
    stripe_connect_updated_at: new Date().toISOString(),
  };

  const [agencyResult, talentResult] = await Promise.all([
    supabase.from("agencies").update(payload).eq("stripe_account_id", account.id),
    supabase.from("talent_profiles").update(payload).eq("stripe_account_id", account.id),
  ]);

  if (agencyResult.error) {
    console.error("[stripe connect] failed to sync agency account status", {
      accountId: account.id,
      error: agencyResult.error.message,
      details: agencyResult.error.details,
      hint: agencyResult.error.hint,
      code: agencyResult.error.code,
    });
  }

  if (talentResult.error) {
    console.error("[stripe connect] failed to sync talent account status", {
      accountId: account.id,
      error: talentResult.error.message,
      details: talentResult.error.details,
      hint: talentResult.error.hint,
      code: talentResult.error.code,
    });
  }
}
