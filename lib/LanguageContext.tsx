"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { en } from "@/lib/translations/en";
import { pt } from "@/lib/translations/pt";

export type Lang = "en" | "pt";

const dictionaries = { en, pt } as const;

type TranslationKey = keyof typeof en;

interface LanguageContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: "pt",
  setLang: () => {},
  t: (key) => pt[key] ?? en[key] ?? key,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("pt");

  useEffect(() => {
    const stored = localStorage.getItem("ucaslang") as Lang | null;
    if (stored === "en" || stored === "pt") setLangState(stored);
  }, []);

  function setLang(l: Lang) {
    setLangState(l);
    localStorage.setItem("ucaslang", l);
  }

  function t(key: TranslationKey): string {
    return (dictionaries[lang] as Record<string, string>)[key] ?? (dictionaries.en as Record<string, string>)[key] ?? key;
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useT() {
  return useContext(LanguageContext);
}
