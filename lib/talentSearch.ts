/**
 * Talent search and matching foundation.
 *
 * Architecture preparation — pure functions with no external AI dependencies.
 * The scoring heuristic is intentionally simple (token overlap) so it can be
 * replaced with an embedding-based score later without changing call sites.
 */

export type TalentSearchFilters = {
  query?: string;
  skills?: string[];
  city?: string;
  state?: string;
  minDailyRate?: number;
  maxDailyRate?: number;
  availableOn?: string; // ISO date
  workspaceId?: string | null; // null = Open Space
  marketplaceOnly?: boolean;
};

export type TalentSearchResult = {
  id: string;
  fullName: string;
  city?: string | null;
  state?: string | null;
  skills?: string[];
  dailyRate?: number | null;
  relevanceScore: number; // 0–100
};

/**
 * Trim, lowercase, strip accents, collapse whitespace.
 */
export function normalizeSearchQuery(query: string): string {
  return (query ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function tokenize(text: string): string[] {
  const normalized = normalizeSearchQuery(text);
  if (!normalized) return [];
  return normalized.split(/[^a-z0-9]+/).filter((t) => t.length > 1);
}

/**
 * Simple token overlap relevance score (0–100).
 * Score = (matched tokens / query tokens) * 100.
 *
 * TODO: Replace with embedding-based scoring (pgvector) when AI is available.
 */
export function scoreTextRelevance(text: string, query: string): number {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return 0;

  const textTokens = new Set(tokenize(text));
  if (textTokens.size === 0) return 0;

  let matched = 0;
  for (const qt of queryTokens) {
    if (textTokens.has(qt)) matched++;
  }
  return Math.round((matched / queryTokens.length) * 100);
}

/**
 * Pure filter — apply server-side or client-side.
 * Does NOT mutate the input array; returns a new sorted/filtered array.
 */
export function applyTalentFilters(
  talents: TalentSearchResult[],
  filters: TalentSearchFilters,
): TalentSearchResult[] {
  return talents
    .filter((t) => {
      if (filters.city) {
        const want = normalizeSearchQuery(filters.city);
        const have = normalizeSearchQuery(t.city ?? "");
        if (have !== want) return false;
      }
      if (filters.state) {
        const want = normalizeSearchQuery(filters.state);
        const have = normalizeSearchQuery(t.state ?? "");
        if (have !== want) return false;
      }
      if (typeof filters.minDailyRate === "number") {
        if ((t.dailyRate ?? 0) < filters.minDailyRate) return false;
      }
      if (typeof filters.maxDailyRate === "number") {
        if ((t.dailyRate ?? Infinity) > filters.maxDailyRate) return false;
      }
      if (filters.skills && filters.skills.length > 0) {
        const wantSet = new Set(filters.skills.map(normalizeSearchQuery));
        const have = new Set((t.skills ?? []).map(normalizeSearchQuery));
        for (const s of wantSet) {
          if (!have.has(s)) return false;
        }
      }
      return true;
    })
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}

// TODO: Replace scoreTextRelevance with embedding-based scoring when AI integration is ready
// TODO: Add pgvector queries when vector DB is available
