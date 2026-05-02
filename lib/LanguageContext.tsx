"use client";

import { createContext, useContext, type ReactNode } from "react";
import { pt } from "@/lib/translations/pt";

// Platform is Portuguese-only. Lang type kept for TypeScript compatibility with
// existing call sites that still read `lang` — they will always receive "pt".
export type Lang = "en" | "pt";

type TranslationKey = keyof typeof pt;

interface LanguageContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TranslationKey) => string;
}

const ptDict = pt as Record<string, string>;

function translate(key: TranslationKey): string {
  return ptDict[key] ?? key;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: "pt",
  setLang: () => {},
  t: translate,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  return (
    <LanguageContext.Provider value={{ lang: "pt", setLang: () => {}, t: translate }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useT() {
  return useContext(LanguageContext);
}
