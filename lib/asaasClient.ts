type AsaasJson =
  | string
  | number
  | boolean
  | null
  | AsaasJson[]
  | { [key: string]: AsaasJson };

type AsaasRequestOptions = {
  method?: string;
  body?: unknown;
  headers?: HeadersInit;
};

const OFFICIAL_ASAAS_PROD_URL = "https://api.asaas.com/v3";

export class AsaasApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`Asaas ${status}: ${JSON.stringify(body)}`);
    this.name = "AsaasApiError";
  }
}

function normalizeAsaasBaseUrl(rawBaseUrl: string | undefined) {
  const trimmed = (rawBaseUrl ?? "").trim().replace(/\/+$/, "");
  const fallback = OFFICIAL_ASAAS_PROD_URL;

  if (!trimmed) {
    return { baseUrl: fallback, normalizedFrom: null as string | null };
  }

  if (trimmed === "https://api.asaas.com") {
    return { baseUrl: OFFICIAL_ASAAS_PROD_URL, normalizedFrom: trimmed };
  }

  return { baseUrl: trimmed, normalizedFrom: null as string | null };
}

export function getAsaasConfigSummary() {
  const env = "production";
  const { baseUrl, normalizedFrom } = normalizeAsaasBaseUrl(process.env.ASAAS_API_URL);
  return {
    env,
    baseUrl,
    normalizedFrom,
  };
}

function parseRequestBody(body: unknown): AsaasJson | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as AsaasJson;
    } catch {
      return body;
    }
  }
  return body as AsaasJson;
}

function redactAsaasPayload(value: AsaasJson | undefined): AsaasJson | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) return value.map((item) => redactAsaasPayload(item)) as AsaasJson[];
  if (typeof value !== "object") return value;

  const redacted: Record<string, AsaasJson> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) continue;
    if (/^(number|cardnumber|ccv|cvv|access_token|apikey|api_key)$/i.test(key)) {
      redacted[key] = "[REDACTED]";
      continue;
    }
    redacted[key] = redactAsaasPayload(entry as AsaasJson) ?? null;
  }
  return redacted;
}

function summarizeAsaasError(data: unknown) {
  const value = redactAsaasPayload(data as AsaasJson);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, AsaasJson>;
  return {
    message: typeof record.message === "string" ? record.message : null,
    errors: Array.isArray(record.errors) ? record.errors : null,
  };
}

export async function asaas<T = unknown>(
  path: string,
  init?: AsaasRequestOptions,
): Promise<T> {
  const { env, baseUrl, normalizedFrom } = getAsaasConfigSummary();
  const apiKey = process.env.ASAAS_API_KEY?.trim() ?? "";

  if (!apiKey) {
    throw new Error("[asaas] Missing ASAAS_API_KEY");
  }

  if (normalizedFrom) {
    console.warn("[asaas] normalized deprecated base URL", {
      from: normalizedFrom,
      to: baseUrl,
      env,
    });
  }

  const parsedBody = parseRequestBody(init?.body);
  const endpoint = path.startsWith("/") ? path : `/${path}`;
  const method = (init?.method ?? (parsedBody === undefined ? "GET" : "POST")).toUpperCase();

  const res = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "BrisaHub/1.0",
      access_token: apiKey,
      ...(init?.headers ?? {}),
    },
    ...(parsedBody !== undefined ? { body: JSON.stringify(parsedBody) } : {}),
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!res.ok) {
    console.error("[asaas] response error", {
      env,
      baseUrl,
      endpoint,
      method,
      status: res.status,
      body: summarizeAsaasError(data),
    });
    throw new AsaasApiError(res.status, data);
  }

  return data as T;
}
