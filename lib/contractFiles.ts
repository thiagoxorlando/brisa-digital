export type ContractFileKind = "original" | "signed" | "receipt";
export const CONTRACTS_BUCKET = "contracts";
export const LEGACY_CONTRACTS_BUCKET = "talent-media";

function isAbsoluteUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function tryExtractStorageRef(fileRef: string) {
  const patterns = [
    /\/storage\/v1\/object\/public\/([^/]+)\/([^?#]+)/i,
    /\/storage\/v1\/object\/sign\/([^/]+)\/([^?#]+)/i,
    /\/storage\/v1\/object\/authenticated\/([^/]+)\/([^?#]+)/i,
  ];

  for (const pattern of patterns) {
    const match = fileRef.match(pattern);
    if (match?.[1] && match?.[2]) {
      return {
        bucket: decodeURIComponent(match[1]),
        path: decodeURIComponent(match[2]),
      };
    }
  }

  return null;
}

export function sanitizeContractFileName(fileName: string) {
  const normalized = fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const safeBase = normalized
    .replace(/\.pdf$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return `${safeBase || "contrato"}.pdf`;
}

export function getContractBucket(kind: ContractFileKind, fileRef?: string | null) {
  const extracted = fileRef ? tryExtractStorageRef(fileRef) : null;
  if (extracted?.bucket) return extracted.bucket;
  // Storage paths starting with "contracts/" always belong to the contracts bucket —
  // both original (contracts/{agencyId}/...) and signed (contracts/signed/{talentId}/...).
  if (fileRef && !isAbsoluteUrl(fileRef) && fileRef.startsWith("contracts/")) return CONTRACTS_BUCKET;
  // Receipts are always in the contracts bucket.
  if (kind === "receipt") return CONTRACTS_BUCKET;
  // Legacy signed contracts were stored in talent-media before the signed-URL upload refactor.
  return kind === "original" ? CONTRACTS_BUCKET : LEGACY_CONTRACTS_BUCKET;
}

export function getStoredContractPath(fileRef: string | null | undefined) {
  if (!fileRef) return null;
  if (!isAbsoluteUrl(fileRef)) return fileRef;
  return tryExtractStorageRef(fileRef)?.path ?? null;
}

export async function resolveContractFileUrl(
  supabase: {
    storage: {
      from: (bucket: string) => {
        createSignedUrl: (path: string, expiresIn: number) => Promise<{ data: { signedUrl?: string | null } | null; error: { message: string } | null }>;
      };
    };
  },
  kind: ContractFileKind,
  fileRef: string | null | undefined,
  expiresInSeconds = 60 * 15,
) {
  if (!fileRef) return null;

  const storagePath = getStoredContractPath(fileRef);
  if (!storagePath) return isAbsoluteUrl(fileRef) ? fileRef : null;
  const bucket = getContractBucket(kind, fileRef);

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error) {
    console.error("[resolveContractFileUrl] createSignedUrl error", { bucket, storagePath, message: error.message });
    return isAbsoluteUrl(fileRef) ? fileRef : null;
  }

  return data?.signedUrl ?? null;
}

export function buildContractFileAccessUrl(contractId: string, kind: ContractFileKind) {
  return `/api/contracts/${contractId}/file?type=${kind}`;
}
