/**
 * Validates and sanitizes a job/contract location string before display.
 *
 * Returns null when the value is:
 *   - null / undefined / blank
 *   - 3 characters or fewer (too short to be meaningful)
 *   - a keyboard-mash sequence (asd, sdf, qwe, zxc, dqd, etc.)
 *   - 3+ repeated characters (aaa, sss, zzz)
 *   - entirely numeric (an ID or internal ref)
 *   - a known test/placeholder keyword
 *
 * This is the single source of truth for location display across the platform.
 * Import and use formatJobLocation() at every JSX render site and data-mapping
 * layer that touches jobs.location or contracts.location.
 */

const UGLY_SUBSTRINGS = [
  "asd", "sdf", "dfg", "fgh", "ghj", "hjk", "jkl",
  "qwe", "wer", "ert", "rty", "tyu", "yui", "uio",
  "zxc", "xcv", "cvb", "vbn", "bnm",
  "qwert", "asdfg", "zxcvb", "qwerty", "asdfgh", "zxcvbn",
];

const UGLY_EXACT = new Set([
  "test", "demo", "fake", "seed", "lorem", "dummy",
  "placeholder", "n/a", "na", "null", "none", "tbd", "todo",
]);

const REPEATED_CHAR = /(.)\1{2}/;
const ALL_DIGITS    = /^\d+$/;

export function formatJobLocation(location: string | null | undefined): string | null {
  if (!location) return null;

  const trimmed = location.trim();
  if (trimmed.length <= 3) return null;
  if (ALL_DIGITS.test(trimmed)) return null;
  if (REPEATED_CHAR.test(trimmed)) return null;
  if (UGLY_EXACT.has(trimmed.toLowerCase())) return null;

  const lower = trimmed.toLowerCase();
  for (const pat of UGLY_SUBSTRINGS) {
    if (lower.includes(pat)) return null;
  }

  return trimmed;
}
