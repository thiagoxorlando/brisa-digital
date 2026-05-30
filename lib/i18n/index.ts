export type Lang = "pt-BR" | "en";

export const LANGS: readonly Lang[] = ["pt-BR", "en"] as const;
export const DEFAULT_LANG: Lang = "en";

export const LANG_LABELS: Record<Lang, string> = {
  "pt-BR": "Português",
  "en": "English",
};

export const LANG_SHORT: Record<Lang, string> = {
  "pt-BR": "PT",
  "en": "EN",
};

export const LANG_STORAGE_KEY = "brisahub_lang";
export const LANG_COOKIE = "lang";

export function isValidLang(value: unknown): value is Lang {
  return value === "pt-BR" || value === "en";
}

export function resolveLang(value: unknown): Lang {
  return isValidLang(value) ? value : DEFAULT_LANG;
}
