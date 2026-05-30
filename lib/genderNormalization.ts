/**
 * Gender normalization utilities.
 *
 * Raw values stored in talent_profiles.gender and jobs.gender vary by
 * locale, casing, and historical entry method. Always normalize before
 * comparing or displaying.
 *
 * Canonical output values: "female" | "male" | "other" | "any"
 * "any" means no gender restriction — never block an applicant on "any".
 */

export type NormalizedGender = "female" | "male" | "other" | "any";

const FEMALE_VALUES = new Set([
  "female", "feminino", "feminina", "mulher", "woman", "f",
  "Female", "Feminino", "Feminina", "Mulher", "Woman",
]);

const MALE_VALUES = new Set([
  "male", "masculino", "masculina", "homem", "man", "m",
  "Male", "Masculino", "Masculina", "Homem", "Man",
]);

const OTHER_VALUES = new Set([
  "other", "outro", "outra", "nonbinary", "non-binary",
  "nao-binario", "não-binário", "nao binario",
  "Other", "Outro", "Outra",
]);

/**
 * Normalizes any raw gender string from the DB or UI into a canonical value.
 * Returns "any" for null, empty string, or "any/all/todos" — meaning no restriction.
 */
export function normalizeGender(raw: string | null | undefined): NormalizedGender {
  if (!raw || raw.trim() === "") return "any";
  const v = raw.trim();
  if (FEMALE_VALUES.has(v)) return "female";
  if (MALE_VALUES.has(v))   return "male";
  if (OTHER_VALUES.has(v))  return "other";
  // Handle "any/todos/all" explicitly
  const lower = v.toLowerCase();
  if (lower === "any" || lower === "all" || lower === "todos" || lower === "qualquer") return "any";
  // Unknown value — treat as no restriction to avoid false blocks
  return "any";
}

/** PT-BR display labels for normalized gender values. */
export const GENDER_LABEL_PT: Record<NormalizedGender, string> = {
  female: "Feminino",
  male:   "Masculino",
  other:  "Outro",
  any:    "Qualquer gênero",
};

/** EN display labels for normalized gender values. */
export const GENDER_LABEL_EN: Record<NormalizedGender, string> = {
  female: "Female",
  male:   "Male",
  other:  "Other",
  any:    "Any gender",
};

/**
 * Returns the display label for a raw gender value.
 * Falls back to the raw string if it can't be normalized to a known label.
 */
export function genderLabel(raw: string | null | undefined, lang: "pt" | "en" = "en"): string {
  const normalized = normalizeGender(raw);
  const map = lang === "en" ? GENDER_LABEL_EN : GENDER_LABEL_PT;
  return map[normalized];
}

/**
 * Returns true if a talent with the given gender is eligible for a job
 * that requires the given gender. "any" on either side means no restriction.
 */
export function isGenderEligible(
  jobGenderRaw: string | null | undefined,
  talentGenderRaw: string | null | undefined,
): boolean {
  const jobGender    = normalizeGender(jobGenderRaw);
  const talentGender = normalizeGender(talentGenderRaw);
  if (jobGender === "any" || talentGender === "any") return true;
  return jobGender === talentGender;
}
