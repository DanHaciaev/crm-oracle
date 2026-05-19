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
    <div className="flex items-center gap-1">
      {LANGS.map((l) => (
        <button
          key={l.code}
          onClick={() => setLocale(l.code)}
          className={`px-2 py-0.5 rounded text-sm font-medium transition ${
            locale === l.code
              ? "bg-gray-800 text-white"
              : "text-gray-500 hover:bg-gray-100"
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
