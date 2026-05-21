/**
 * Canonical talent visibility rules for the Premium portal / Open Space.
 *
 * Policy:
 *   - Talents are visible in the public Open Space (and in agency talent
 *     discovery) only when `talent_profiles.marketplace_visible = true`.
 *   - Premium portal-only talents (private rosters, exclusivity flows) MUST
 *     have `marketplace_visible = false` so they cannot be discovered or
 *     contacted from the public marketplace.
 *   - Soft-deleted talents (`deleted_at IS NOT NULL`) are always hidden
 *     regardless of `marketplace_visible`.
 *
 * Where this filter is currently applied (do not remove these filters):
 *   - app/agency/talent/page.tsx          → agency Open Space talent browse
 *   - lib/talentPortalLanding.ts          → public landing
 *   - lib/talentMarketplace.ts            → marketplace shortcut helpers
 *   - lib/getJobSuggestions.ts            → suggestion engine
 *   - app/talent/profile/[username]/...   → public profile resolver
 *
 * If you add a new discovery surface that lists talents to non-owners,
 * apply OPEN_SPACE_TALENT_FILTER (or call isVisibleInOpenSpace) so the
 * exclusivity guarantee is preserved.
 */

/**
 * Canonical Supabase `.match()` filter for Open Space talent queries.
 * Example:
 *   supabase.from("talent_profiles")
 *     .select("*")
 *     .match(OPEN_SPACE_TALENT_FILTER)
 *     .is("deleted_at", null);
 */
export const OPEN_SPACE_TALENT_FILTER = { marketplace_visible: true } as const;

/**
 * Pure predicate: is this talent visible in the public Open Space?
 *
 * Caller must already have filtered soft-deletes separately — this only
 * checks the visibility flag.
 */
export function isVisibleInOpenSpace(
  profile: { marketplace_visible?: boolean | null },
): boolean {
  return profile.marketplace_visible === true;
}
