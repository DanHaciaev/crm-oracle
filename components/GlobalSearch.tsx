"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useT, useLocale } from "@/lib/locale";

interface Hit { id: number; title: string; subtitle: string; href: string }
interface Group { key: string; hits: Hit[] }

// Header search across customers, suppliers, sales, purchases, batches,
// leads and products — only the sections the user's role can see (the API
// filters). Ctrl/⌘+K focuses it; arrows + Enter pick a result.
export default function GlobalSearch() {
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  const flat = useMemo(() => groups.flatMap(g => g.hits), [groups]);
  // Position of each hit in `flat`, for keyboard highlighting.
  const indexed = useMemo(() => {
    let i = 0;
    return groups.map(g => ({ ...g, hits: g.hits.map(h => ({ hit: h, index: i++ })) }));
  }, [groups]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); inputRef.current?.focus(); setOpen(true); }
    }
    function onClick(e: MouseEvent) { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousedown", onClick); };
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const h = setTimeout(() => {
      setLoading(true);
      fetch(`/api/search?q=${encodeURIComponent(term)}&lang=${locale}`, { signal: ctrl.signal })
        .then(r => r.json())
        .then(d => { setGroups(d.groups ?? []); setActive(0); })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 250);
    return () => { clearTimeout(h); ctrl.abort(); };
  }, [q, locale]);

  function go(hit: Hit) {
    setOpen(false); setQ(""); setGroups([]);
    router.push(hit.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); return; }
    if (!flat.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => (a + 1) % flat.length); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActive(a => (a - 1 + flat.length) % flat.length); }
    if (e.key === "Enter")     { e.preventDefault(); go(flat[active]); }
  }

  const term = q.trim();
  const showPanel = open && term.length >= 2;

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <div className="flex items-center gap-2 border border-[#c8d3e8] rounded-lg px-3 py-1.5 bg-white focus-within:border-brand transition">
        <Search className="w-4 h-4 text-gray-400 shrink-0" />
        <input
          ref={inputRef}
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true); if (e.target.value.trim().length < 2) setGroups([]); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={t("search.placeholder")}
          className="flex-1 min-w-0 text-sm outline-none bg-transparent"
        />
        <kbd className="hidden md:inline text-[10px] text-gray-400 border border-gray-200 rounded px-1">Ctrl K</kbd>
      </div>

      {showPanel && (
        <div className="absolute z-50 mt-1 w-full min-w-[20rem] bg-white border border-[#c8d3e8] rounded-xl shadow-lg max-h-[70vh] overflow-auto py-1">
          {loading && !groups.length && <div className="px-3 py-2 text-sm text-gray-400">{t("common.loading")}</div>}
          {!loading && !groups.length && <div className="px-3 py-2 text-sm text-gray-400">{t("search.nothing")}</div>}
          {indexed.map(g => (
            <div key={g.key} className="py-1">
              <div className="px-3 pt-1 pb-0.5 text-[10px] uppercase tracking-widest text-gray-400 font-semibold">{t(`search.group_${g.key}`)}</div>
              {g.hits.map(({ hit: h, index: i }) => {
                return (
                  <button
                    key={`${g.key}-${h.id}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(h)}
                    className={`w-full text-left px-3 py-1.5 ${i === active ? "bg-gray-100" : ""}`}
                  >
                    <div className="text-sm text-gray-900 truncate">{h.title || "—"}</div>
                    {h.subtitle && <div className="text-xs text-gray-400 truncate">{h.subtitle}</div>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
