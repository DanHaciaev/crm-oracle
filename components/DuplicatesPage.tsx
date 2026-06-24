"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface DupGroup {
  type:  "lead_phone" | "lead_email" | "customer_phone";
  value: string;
  count: number;
  ids:   number[];
  names: string;
}

interface DupData {
  leads_by_phone:     DupGroup[];
  leads_by_email:     DupGroup[];
  customers_by_phone: DupGroup[];
}

const TYPE_LABELS: Record<string, string> = {
  lead_phone:     "Лиды — одинаковый телефон",
  lead_email:     "Лиды — одинаковый email",
  customer_phone: "Клиенты — одинаковый телефон",
};

const TYPE_ICONS: Record<string, string> = {
  lead_phone:     "📞",
  lead_email:     "✉️",
  customer_phone: "📞",
};

function hrefFor(type: string, id: number) {
  if (type === "customer_phone") return `/customers/${id}`;
  return `/leads`;
}

export default function DuplicatesPage() {
  const [data,    setData]    = useState<DupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const res = await fetch("/api/duplicates");
    if (!res.ok) { setError("Ошибка загрузки"); setLoading(false); return; }
    setData(await res.json() as DupData);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const groups: DupGroup[] = data
    ? [...data.leads_by_phone, ...data.leads_by_email, ...data.customers_by_phone]
    : [];

  const total = groups.reduce((s, g) => s + (g.count - 1), 0);

  if (loading) return <div className="p-8 text-gray-400">Загрузка...</div>;
  if (error)   return <div className="p-8 text-red-500">{error}</div>;

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Дубликаты</h1>
          <p className="text-sm text-gray-500 mt-1">Лиды и клиенты с совпадающими данными</p>
        </div>
        <button
          onClick={load}
          className="px-4 py-2 text-sm border border-[#c8d3e8] rounded-xl text-gray-600 hover:bg-gray-50 transition"
        >
          ↻ Обновить
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="border border-[#c8d3e8] rounded-xl p-4">
          <div className="text-2xl font-bold text-red-400">{total}</div>
          <div className="text-sm text-gray-400 mt-1">Потенциальных дублей</div>
        </div>
        <div className="border border-[#c8d3e8] rounded-xl p-4">
          <div className="text-2xl font-bold text-amber-400">
            {data!.leads_by_phone.length + data!.leads_by_email.length}
          </div>
          <div className="text-sm text-gray-400 mt-1">Групп дублей лидов</div>
        </div>
        <div className="border border-[#c8d3e8] rounded-xl p-4">
          <div className="text-2xl font-bold text-violet-400">{data!.customers_by_phone.length}</div>
          <div className="text-sm text-gray-400 mt-1">Групп дублей клиентов</div>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="border border-[#c8d3e8] rounded-xl p-16 text-center">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-gray-500 font-medium">Дубликатов не найдено</p>
          <p className="text-sm text-gray-400 mt-1">Все лиды и клиенты уникальны</p>
        </div>
      ) : (
        <div className="space-y-6">
          {(["lead_phone", "lead_email", "customer_phone"] as const).map(type => {
            const list = type === "lead_phone"     ? data!.leads_by_phone
                       : type === "lead_email"     ? data!.leads_by_email
                       : data!.customers_by_phone;
            if (list.length === 0) return null;
            return (
              <div key={type}>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  {TYPE_ICONS[type]} {TYPE_LABELS[type]} ({list.length})
                </h2>
                <div className="border border-[#c8d3e8] rounded-xl overflow-hidden">
                  {list.map((g, i) => (
                    <div key={g.value} className={`px-4 py-3 flex items-start gap-4 ${i > 0 ? "border-t border-[#c8d3e8]" : ""}`}>
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-sm text-gray-700 mb-1">{g.value}</div>
                        <div className="text-sm text-gray-500 truncate">{g.names}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-600">
                          {g.count} записи
                        </span>
                        <Link
                          href={hrefFor(type, g.ids[0])}
                          className="text-xs px-3 py-1 rounded-lg border border-[#c8d3e8] text-[#516895] hover:bg-gray-50 transition"
                        >
                          Открыть →
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
