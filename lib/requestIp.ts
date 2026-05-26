import type { NextRequest } from "next/server";

const IPV4_SEGMENT = "(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const IPV4_REGEX = new RegExp(`^${IPV4_SEGMENT}(\\.${IPV4_SEGMENT}){3}$`);
const ASAAS_SANDBOX_REMOTE_IP_FALLBACK = "203.0.113.10";

function stripIpDecorators(value: string) {
  const trimmed = value.trim().replace(/^for=/i, "").replace(/^"|"$/g, "");
  const withoutIpv6Prefix = trimmed.replace(/^::ffff:/i, "");

  if (withoutIpv6Prefix.startsWith("[") && withoutIpv6Prefix.includes("]")) {
    return withoutIpv6Prefix.slice(1, withoutIpv6Prefix.indexOf("]"));
  }

  const colonCount = (withoutIpv6Prefix.match(/:/g) ?? []).length;
  if (colonCount === 1 && withoutIpv6Prefix.includes(".")) {
    return withoutIpv6Prefix.split(":")[0] ?? withoutIpv6Prefix;
  }

  return withoutIpv6Prefix;
}

function isValidIpv4(value: string) {
  return IPV4_REGEX.test(value);
}

function isPrivateIpv4(value: string) {
  const [a, b] = value.split(".").map((segment) => Number(segment));
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

export function getRequestIpCandidates(req: Pick<NextRequest, "headers">): string[] {
  const rawValues = [
    req.headers.get("x-forwarded-for"),
    req.headers.get("x-vercel-forwarded-for"),
    req.headers.get("cf-connecting-ip"),
    req.headers.get("x-real-ip"),
    req.headers.get("x-client-ip"),
    req.headers.get("forwarded"),
  ].filter((value): value is string => Boolean(value));

  return rawValues
    .flatMap((value) => value.split(","))
    .map(stripIpDecorators)
    .filter(Boolean);
}

export function resolveClientIpv4(req: Pick<NextRequest, "headers">): string | null {
  const candidates = getRequestIpCandidates(req);
  const publicCandidate = candidates.find((candidate) => isValidIpv4(candidate) && !isPrivateIpv4(candidate));
  if (publicCandidate) return publicCandidate;

  const fallbackCandidate = candidates.find((candidate) => isValidIpv4(candidate));
  return fallbackCandidate ?? null;
}

export function resolveAsaasRemoteIp(req: Pick<NextRequest, "headers">, usingSandbox: boolean) {
  const clientIp = resolveClientIpv4(req);
  if (clientIp) {
    return { remoteIp: clientIp, source: "request" as const };
  }

  if (usingSandbox) {
    return { remoteIp: ASAAS_SANDBOX_REMOTE_IP_FALLBACK, source: "sandbox-fallback" as const };
  }

  return { remoteIp: null, source: "missing" as const };
}
