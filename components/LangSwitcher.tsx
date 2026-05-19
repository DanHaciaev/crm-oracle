"use client";

import { useLocale, type Locale } from "@/lib/locale";

const LANGS: { code: Locale; label: string }[] = [
  { code: "ro", label: "RO" },
  { code: "ru", label: "RU" },
  { code: "en", label: "EN" },
];

export default function LangSwitcher() {
  const { locale, setLocale } = useLocale();
  return (
    <div className="flex items-center gap-0.5 border border-zinc-700 rounded-lg p-0.5">
      {LANGS.map((l) => (
        <button
          key={l.code}
          onClick={() => setLocale(l.code)}
          className={`px-2 py-0.5 rounded text-xs font-medium transition ${
            locale === l.code
              ? "bg-zinc-700 text-white"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
