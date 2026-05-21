/**
 * Canonical contract signing policy.
 *
 * Two valid paths to a signed contract:
 *   - "pdf"     → agency uploaded a PDF (`contract_file_url` is set); the
 *                 talent MUST upload a counter-signed `signed_contract_url`
 *                 before status moves from `sent` → `signed`.
 *   - "digital" → agency did NOT attach a PDF (`contract_file_url` is null);
 *                 the talent accepts the terms digitally and
 *                 `signed_contract_url` is OPTIONAL.
 *
 * Used by:
 *   - app/api/contracts/[id]/sign/route.ts (server validation)
 *   - features/talent/* contract signing UI (toggle between flows)
 *
 * IMPORTANT: this helper is read-only. It does not mutate contracts. It
 * only classifies what mode a contract is in based on stored fields.
 */

export type ContractSigningMode = "pdf" | "digital";

/**
 * Classify a contract by the presence of an agency-provided PDF.
 * Empty string is treated as "no PDF".
 */
export function getContractSigningMode(
  contract: { contract_file_url?: string | null },
): ContractSigningMode {
  const url = (contract.contract_file_url ?? "").trim();
  return url.length > 0 ? "pdf" : "digital";
}

/**
 * Returns true if `signed_contract_url` MUST be present when the talent
 * transitions the contract from `sent` → `signed`.
 *
 * Mirrored in app/api/contracts/[id]/sign/route.ts:
 *   if (isSignedContractUrlRequired(contract) && !signedContractUrl) -> 400
 */
export function isSignedContractUrlRequired(
  contract: { contract_file_url?: string | null },
): boolean {
  return getContractSigningMode(contract) === "pdf";
}
