const BASE_URL = process.env.ASAAS_API_URL!;
const API_KEY  = process.env.ASAAS_API_KEY!;

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "access_token": API_KEY,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = data?.errors?.[0]?.description ?? data?.message ?? `Asaas error ${res.status}`;
    throw new Error(message);
  }

  return data as T;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type AsaasCustomerInput = {
  name: string;
  email: string;
  cpfCnpj: string;
};

export type AsaasPaymentInput = {
  customer: string;
  billingType: "PIX" | "CREDIT_CARD";
  value: number;
  dueDate: string;
  description?: string;
  externalReference?: string;
};

export type AsaasSubscriptionInput = {
  customer: string;
  billingType: "CREDIT_CARD";
  value: number;
  nextDueDate: string;
  cycle: "MONTHLY";
  description?: string;
  externalReference?: string;
};

export type AsaasSubscriptionResponse = {
  id: string;
  status: string;
  value: number;
  nextDueDate?: string;
  billingType: string;
};

export type AsaasSubscriptionPayment = {
  id: string;
  status: string;
  value: number;
  dueDate?: string;
  invoiceUrl?: string;
};

export type AsaasPixTransferInput = {
  value: number;
  pixAddressKey: string;
  pixAddressKeyType: "CPF" | "EMAIL" | "PHONE" | "EVP";
  description?: string;
};

// ── Functions ─────────────────────────────────────────────────────────────────

export function createCustomer(data: AsaasCustomerInput) {
  return request<{ id: string; name: string; email: string; cpfCnpj: string }>(
    "POST", "/customers", data,
  );
}

export function createPayment(data: AsaasPaymentInput) {
  return request<{ id: string; status: string; value: number; billingType: string; invoiceUrl?: string }>(
    "POST", "/payments", data,
  );
}

export function getPayment(id: string) {
  return request<{ id: string; status: string; value: number; billingType: string; paymentDate?: string }>(
    "GET", `/payments/${id}`,
  );
}

export function createSubscription(data: AsaasSubscriptionInput) {
  return request<AsaasSubscriptionResponse>("POST", "/subscriptions", data);
}

export function getSubscriptionPayments(subscriptionId: string) {
  return request<{ data: AsaasSubscriptionPayment[]; totalCount?: number }>(
    "GET", `/subscriptions/${subscriptionId}/payments?status=PENDING`,
  );
}

export function updateSubscription(subscriptionId: string, data: { value: number }) {
  return request<AsaasSubscriptionResponse>("PUT", `/subscriptions/${subscriptionId}`, data);
}

export function createPixTransfer(data: AsaasPixTransferInput) {
  return request<{ id: string; status: string; value: number; transferFee?: number }>(
    "POST", "/transfers", data,
  );
}

export function getPixQrCode(paymentId: string) {
  return request<{ success: boolean; encodedImage: string; payload: string; expirationDate: string }>(
    "GET", `/payments/${paymentId}/pixQrCode`,
  );
}

export function cancelSubscription(subscriptionId: string) {
  return request<{ id: string; status: string }>(
    "DELETE", `/subscriptions/${subscriptionId}`,
  );
}
