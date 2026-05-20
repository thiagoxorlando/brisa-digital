/**
 * Shared display helpers for talent avatars and names.
 * Single source of truth for the avatar gradient palette and initials derivation.
 * Import from here — never define local copies in feature files.
 */

export const AVATAR_GRADIENTS = [
  "from-violet-500 to-indigo-600",
  "from-rose-400 to-pink-600",
  "from-amber-400 to-orange-500",
  "from-emerald-400 to-teal-600",
  "from-sky-400 to-blue-600",
  "from-fuchsia-400 to-purple-600",
] as const;

/** Returns a Tailwind `bg-gradient-to-br` class string derived from the first char of name. */
export function avatarGradient(name: string): string {
  return AVATAR_GRADIENTS[(name.charCodeAt(0) || 0) % AVATAR_GRADIENTS.length];
}

/** Returns up to 2 uppercase initials from a full name. */
export function initials(name: string): string {
  return (name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";
}
