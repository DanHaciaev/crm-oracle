"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { ru } from "./ru";
import { en } from "./en";
import { ro } from "./ro";

export type Locale = "ru" | "en" | "ro";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dict = Record<string, any>;

function get(obj: Dict, key: string): string {
  const parts = key.split(".");
  let node: unknown = obj;
  for (const part of parts) {
    if (typeof node === "object" && node !== null) {
      node = (node as Dict)[part];
    } else {
      return key;
    }
  }
  return typeof node === "string" ? node : key;
}

const dicts: Record<Locale, Dict> = { ru, en, ro };

interface LocaleCtx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
}

const Ctx = createContext<LocaleCtx>({
  locale: "ru",
  setLocale: () => {},
  t: (k) => k,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ru");

  useEffect(() => {
    const saved = localStorage.getItem("locale") as Locale | null;
    if (saved && dicts[saved]) setLocaleState(saved);
  }, []);

  function setLocale(l: Locale) {
    setLocaleState(l);
    localStorage.setItem("locale", l);
  }

  const dict = dicts[locale];
  const t = (key: string) => get(dict, key);

  return <Ctx.Provider value={{ locale, setLocale, t }}>{children}</Ctx.Provider>;
}

export function useLocale() { return useContext(Ctx); }
export function useT()      { return useContext(Ctx).t; }
