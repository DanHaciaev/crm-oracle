"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, BellOff, Info, OctagonAlert, RefreshCw } from "lucide-react";
import { useT } from "@/lib/locale";

interface Item { id: string; title: string; subtitle: string; date: string | null; href: string }
interface Section { key: string; severity: "critical" | "warning" | "info"; items: Item[] }

const SEV = {
  critical: { Icon: OctagonAlert,  cls: "text-red-600",   ring: "border-red-200" },
  warning:  { Icon: AlertTriangle, cls: "text-amber-600", ring: "border-amber-200" },
  info:     { Icon: Info,          cls: "text-blue-600",  ring: "border-[#c8d3e8]" },
};

// Everything that needs attention now, grouped; the header bell shows the
// first few of the same signals.
export default function NotificationsPage() {
  const t = useT();
  const [sections, setSections] = useState<Section[] | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    fetch("/api/notifications/all", { cache: "no-store" })
      .then(r => r.json()).then(d => setSections(d.sections ?? [])).catch(() => setSections([]));
  }, [tick]);

  const filled = (sections ?? []).filter(s => s.items.length);
  const total = filled.reduce((a, s) => a + s.items.length, 0);

  return (
    <div className="p-4 sm:p-8 max-w-4xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t("notifications.title")}</h1>
          <p className="text-sm text-gray-500 mt-1">{t("notifications.subtitle")}</p>
        </div>
        <button onClick={() => { setSections(null); setTick(x => x + 1); }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#dde3ef] text-sm hover:bg-gray-50">
          <RefreshCw className="w-4 h-4" />{t("notifications.refresh")}
        </button>
      </div>

      {!sections ? (
        <div className="text-sm text-gray-400">{t("common.loading")}</div>
      ) : total === 0 ? (
        <div className="border border-dashed border-[#c8d3e8] rounded-xl p-10 text-center">
          <BellOff className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <div className="text-sm text-gray-500">{t("notifications.allClear")}</div>
        </div>
      ) : (
        <div className="space-y-4">
          {filled.map(s => {
            const S = SEV[s.severity];
            return (
              <section key={s.key} className={`border rounded-xl ${S.ring}`}>
                <div className="flex items-center gap-2 px-4 py-3 border-b border-[#dde3ef]">
                  <S.Icon className={`w-4 h-4 ${S.cls}`} />
                  <h2 className="font-semibold text-sm">{t(`notifications.section_${s.key}`)}</h2>
                  <span className="text-xs text-gray-400">{s.items.length}</span>
                </div>
                <ul className="divide-y divide-[#eef1f7]">
                  {s.items.map(it => (
                    <li key={it.id}>
                      <Link href={it.href} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-gray-50">
                        <div className="min-w-0">
                          <div className="text-sm text-gray-900 truncate">{it.title || "—"}</div>
                          {it.subtitle && <div className="text-xs text-gray-400 truncate">{it.subtitle}</div>}
                        </div>
                        {it.date && <div className="text-xs text-gray-500 whitespace-nowrap">{new Date(it.date).toLocaleDateString("ru-RU")}</div>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
