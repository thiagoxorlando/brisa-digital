// Thin Asaas API client — uses the same env vars as send-pix route.
// All requests use access_token header (not Bearer).

export class AsaasApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`Asaas ${status}: ${JSON.stringify(body)}`);
    this.name = "AsaasApiError";
  }
}

export async function asaas<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const baseUrl = process.env.ASAAS_API_URL ?? "https://api.asaas.com/v3";
  const apiKey  = process.env.ASAAS_API_KEY  ?? "";

  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "User-Agent":   "BrisaHub/1.0",
      "access_token": apiKey,
      ...(init?.headers ?? {}),
    },
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!res.ok) throw new AsaasApiError(res.status, data);
  return data as T;
}
