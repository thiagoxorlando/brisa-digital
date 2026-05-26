import { asaas, AsaasApiError } from "./asaasClient";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  try {
    return await asaas<T>(path, { method, body });
  } catch (error) {
    if (error instanceof AsaasApiError) {
      const data = error.body as { errors?: { description?: string }[]; message?: string } | undefined;
      const message = data?.errors?.[0]?.description ?? data?.message ?? `Asaas error ${error.status}`;
      throw new Error(message);
    }
    throw error;
  }
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
  creditCard?: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
  };
  creditCardHolderInfo?: {
    name: string;
    email: string;
    cpfCnpj: string;
    postalCode: string;
    addressNumber: string;
    addressComplement?: string | null;
    phone?: string | null;
    mobilePhone?: string | null;
  };
  creditCardToken?: string;
  remoteIp?: string;
};

export type AsaasSubscriptionResponse = {
  id: string;
  status: string;
  value: number;
  nextDueDate?: string;
  billingType: string;
  creditCardToken?: string;
  externalReference?: string;
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
  return request<{
    id: string;
    status: string;
    value: number;
    billingType: string;
    paymentDate?: string;
    dueDate?: string;
    customer?: string;
    externalReference?: string;
    subscription?: string;
    subscriptionId?: string;
    invoiceUrl?: string;
  }>(
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

export function listCustomerSubscriptions(customerId: string) {
  return request<{ data: AsaasSubscriptionResponse[]; totalCount?: number }>(
    "GET", `/subscriptions?customer=${encodeURIComponent(customerId)}`,
  );
}
