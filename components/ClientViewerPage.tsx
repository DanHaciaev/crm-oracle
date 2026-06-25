"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CustomerAiPanel from "@/components/CustomerAiPanel";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Client {
  id: number; code: string; name: string;
  country: string | null; customer_type: string | null;
  contact_phone: string | null; contact_email: string | null;
  active: boolean;
  deal_count: number; won_sum: number; in_production: number;
  last_activity: string | null;
}

interface Deal {
  id: number; doc_number: string; doc_date: string | null;
  customer_name: string; customer_id: number | null;
  sale_type: string; status: string;
  total_amount: number; total_amount_mdl: number;
  currency_code: string; total_net_kg: number;
}

interface CustomerFull {
  id: number; code: string; name: string;
  country: string | null; tax_id: string | null;
  contact_phone: string | null; contact_email: string | null;
  address: string | null; customer_type: string | null;
  active: boolean; created_at: string | null;
}

interface Activity {
  id: number; customer_id: number; act_type: string;
  body: string | null; outcome: string | null;
  created_by: string | null; created_at: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtDateTime(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtMoney(n: number) {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}
function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Черновик", confirmed: "Подтверждён",
  shipped: "Отгружен", closed: "Закрыт", cancelled: "Отменён",
};
const STATUS_CLS: Record<string, string> = {
  draft:     "bg-gray-100 text-gray-500",
  confirmed: "bg-blue-50 text-blue-600",
  shipped:   "bg-amber-50 text-amber-600",
  closed:    "bg-emerald-50 text-emerald-600",
  cancelled: "bg-red-50 text-red-400",
};
const TYPE_LABEL: Record<string, string> = {
  domestic: "Внутренний",
  export:   "Экспорт",
};
const TYPE_CLS: Record<string, string> = {
  domestic: "bg-[#516895]/10 text-[#516895]",
  export:   "bg-emerald-50 text-emerald-700",
};

// Avatar color by name hash
function avatarColor(name: string) {
  const colors = [
    "bg-[#516895]", "bg-emerald-500", "bg-amber-500",
    "bg-rose-500",  "bg-violet-500",  "bg-cyan-500",
  ];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return colors[h % colors.length];
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4 text-[#516895]" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
    </svg>
  );
}

// ─── Search panel ─────────────────────────────────────────────────────────────

function SearchPanel({
  q, setQ, type, setType, onlyDeals, setOnlyDeals,
  inProd, setInProd, onSearch, onReset, count, loading,
}: {
  q: string; setQ: (v: string) => void;
  type: string; setType: (v: string) => void;
  onlyDeals: boolean; setOnlyDeals: (v: boolean) => void;
  inProd: boolean; setInProd: (v: boolean) => void;
  onSearch: () => void; onReset: () => void;
  count: number; loading: boolean;
}) {
  return (
    <div className="shrink-0 bg-white border-b border-[#c8d3e8] px-4 py-3">
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Search input */}
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === "Enter" && onSearch()}
            placeholder="Поиск по имени, телефону, email..."
            className="pl-8 pr-3 py-1.5 text-sm border border-[#c8d3e8] rounded-lg outline-none focus:border-[#516895] focus:ring-2 focus:ring-[#516895]/10 w-56 transition"
          />
        </div>

        {/* Type */}
        <select
          value={type}
          onChange={e => setType(e.target.value)}
          className="py-1.5 px-2.5 text-sm border border-[#c8d3e8] rounded-lg outline-none bg-white focus:border-[#516895] transition"
        >
          <option value="all">Все типы</option>
          <option value="domestic">Внутренний</option>
          <option value="export">Экспорт</option>
        </select>

        {/* Checkboxes as toggle pills */}
        <button
          onClick={() => setOnlyDeals(!onlyDeals)}
          className={`px-3 py-1.5 text-xs rounded-full border transition font-medium ${
            onlyDeals
              ? "bg-[#516895] text-white border-[#516895]"
              : "bg-white text-gray-500 border-[#c8d3e8] hover:border-[#516895] hover:text-[#516895]"
          }`}
        >
          Со сделками
        </button>
        <button
          onClick={() => setInProd(!inProd)}
          className={`px-3 py-1.5 text-xs rounded-full border transition font-medium ${
            inProd
              ? "bg-amber-500 text-white border-amber-500"
              : "bg-white text-gray-500 border-[#c8d3e8] hover:border-amber-400 hover:text-amber-600"
          }`}
        >
          В производстве
        </button>

        <div className="flex gap-2 ml-auto">
          <button onClick={onReset}
            className="px-3 py-1.5 text-sm border border-[#c8d3e8] rounded-lg text-gray-500 hover:bg-gray-50 transition">
            Сброс
          </button>
          <button onClick={onSearch} disabled={loading}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-[#516895] text-white rounded-lg hover:bg-[#3f5278] disabled:opacity-60 transition">
            {loading ? <Spinner /> : null}
            Найти
          </button>
        </div>
      </div>

      {/* Result count */}
      {count > 0 && !loading && (
        <div className="mt-2 text-xs text-gray-400">
          Найдено: <span className="font-semibold text-gray-600">{count}</span> клиентов
          {count >= 500 && " (показаны первые 500)"}
        </div>
      )}
    </div>
  );
}

// ─── Client list ──────────────────────────────────────────────────────────────

function ClientList({ clients, selected, onSelect, loading }: {
  clients: Client[]; selected: Client | null;
  onSelect: (c: Client) => void; loading: boolean;
}) {
  return (
    <div className="overflow-auto border-b border-[#c8d3e8]" style={{ maxHeight: 240 }}>
      {loading && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400">
          <Spinner /> Поиск...
        </div>
      )}
      {!loading && clients.length === 0 && (
        <div className="py-10 text-center text-sm text-gray-400">Нет результатов</div>
      )}
      {!loading && clients.length > 0 && (
        <table className="w-full text-sm border-collapse min-w-160">
          <thead className="sticky top-0 z-10 bg-gray-50 border-b border-[#c8d3e8]">
            <tr>
              <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-8"></th>
              <th className="text-left px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Клиент</th>
              <th className="text-left px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-36">Телефон</th>
              <th className="text-left px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-44 hidden xl:table-cell">Email</th>
              <th className="text-center px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-16">Сделки</th>
              <th className="text-right px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-28">Выиграно</th>
              <th className="text-right px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-28">Посл. активность</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {clients.map(c => {
              const isSelected = selected?.id === c.id;
              return (
                <tr key={c.id} onClick={() => onSelect(c)}
                  className={`cursor-pointer transition-colors group ${
                    isSelected
                      ? "bg-[#516895]/8 border-l-[3px] border-l-[#516895]"
                      : "hover:bg-gray-50 border-l-[3px] border-l-transparent"
                  }`}
                >
                  {/* Avatar */}
                  <td className="px-2 py-2">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white text-[10px] font-bold shrink-0 ${avatarColor(c.name)}`}>
                      {initials(c.name)}
                    </div>
                  </td>
                  {/* Name + type */}
                  <td className="px-3 py-2">
                    <div className={`font-medium text-sm ${isSelected ? "text-[#516895]" : "text-gray-800"}`}>
                      {c.name}
                    </div>
                    {c.customer_type && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${TYPE_CLS[c.customer_type] ?? "bg-gray-100 text-gray-500"}`}>
                        {TYPE_LABEL[c.customer_type] ?? c.customer_type}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 font-mono">{c.contact_phone ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-gray-400 truncate hidden xl:table-cell">{c.contact_email ?? "—"}</td>
                  <td className="px-3 py-2 text-center">
                    {c.deal_count > 0 ? (
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#516895]/10 text-[#516895] text-xs font-semibold">
                        {c.deal_count}
                      </span>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">
                    {c.won_sum > 0
                      ? <span className="text-emerald-600 font-medium">{fmtMoney(c.won_sum)}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2 text-right text-xs text-gray-400 tabular-nums">{fmtDate(c.last_activity)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Deals grid ───────────────────────────────────────────────────────────────

function DealsGrid({ client, deals, loading }: {
  client: Client; deals: Deal[]; loading: boolean;
}) {
  return (
    <div className="border-b border-[#c8d3e8] shrink-0">
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-[#c8d3e8]">
        <span className="text-xs font-semibold text-gray-600">Сделки</span>
        <span className="text-xs text-gray-400">· {client.name}</span>
        {!loading && (
          <span className="ml-auto text-[11px] text-gray-400">{deals.length} шт.</span>
        )}
      </div>
      <div className="overflow-auto" style={{ maxHeight: 148 }}>
        {loading && (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-gray-400">
            <Spinner />
          </div>
        )}
        {!loading && deals.length === 0 && (
          <div className="py-5 text-center text-sm text-gray-400">Сделок нет</div>
        )}
        {!loading && deals.length > 0 && (
          <table className="w-full text-sm border-collapse min-w-130">
            <thead className="sticky top-0 bg-white border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-28">Документ</th>
                <th className="text-left px-3 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Тип</th>
                <th className="text-right px-3 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-32">Сумма</th>
                <th className="text-left px-3 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-32">Стадия</th>
                <th className="text-right px-4 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-24">Дата</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {deals.map(d => (
                <tr key={d.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-1.5 font-mono text-xs text-gray-500">{d.doc_number}</td>
                  <td className="px-3 py-1.5 text-xs text-gray-400">{TYPE_LABEL[d.sale_type] ?? d.sale_type}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-sm">
                    {d.total_amount_mdl > 0
                      ? <span className="font-medium text-gray-700">{fmtMoney(d.total_amount_mdl)} <span className="text-xs font-normal text-gray-400">MDL</span></span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-1.5">
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_CLS[d.status] ?? "bg-gray-100 text-gray-500"}`}>
                      {STATUS_LABEL[d.status] ?? d.status}
                    </span>
                  </td>
                  <td className="px-4 py-1.5 text-right text-xs text-gray-400 tabular-nums">{fmtDate(d.doc_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Client card ──────────────────────────────────────────────────────────────

const ACT_ICON: Record<string, string> = {
  call: "📞", meeting: "🤝", note: "📝", email: "✉️", other: "○",
};
const ACT_LABEL: Record<string, string> = {
  call: "Звонок", meeting: "Встреча", note: "Заметка", email: "Email", other: "Прочее",
};
const OUTCOME_LABEL: Record<string, string> = {
  reached: "Дозвонился", no_answer: "Не ответил", voicemail: "Автоответчик",
  busy: "Занято", completed: "Выполнено", cancelled: "Отменено",
};

type CardTab = "main" | "contacts" | "activities";

function ClientCard({ client, detail, detailLoading, activities, activitiesLoading }: {
  client: Client; detail: CustomerFull | null; detailLoading: boolean;
  activities: Activity[]; activitiesLoading: boolean;
}) {
  const [tab, setTab] = useState<CardTab>("main");
  const d = detail;

  return (
    <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
      {/* Hero header */}
      <div className="shrink-0 px-4 py-3 bg-white border-b border-[#c8d3e8] flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0 ${avatarColor(client.name)}`}>
          {initials(client.name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-800 text-sm">{client.name}</span>
            {!client.active && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">Неактивен</span>}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {client.contact_phone && (
              <a href={`tel:${client.contact_phone}`} className="text-xs text-[#516895] hover:underline font-mono">
                {client.contact_phone}
              </a>
            )}
            {client.contact_email && (
              <span className="text-xs text-gray-400">{client.contact_email}</span>
            )}
          </div>
        </div>
        <a href={`/customers/${client.id}`} target="_blank"
          className="shrink-0 text-xs text-gray-400 hover:text-[#516895] transition px-2 py-1 rounded-lg hover:bg-[#516895]/5 border border-transparent hover:border-[#c8d3e8]">
          ↗ Карточка
        </a>
      </div>

      {/* Stats row */}
      <div className="shrink-0 grid grid-cols-4 border-b border-[#c8d3e8] bg-gray-50">
        {[
          { label: "Сделок",       value: client.deal_count,    cls: "" },
          { label: "Выиграно",     value: client.won_sum > 0 ? `${fmtMoney(client.won_sum)} MDL` : "—", cls: "text-emerald-600" },
          { label: "В произв.",    value: client.in_production || "—", cls: "text-amber-500" },
          { label: "Активность",   value: fmtDate(client.last_activity), cls: "" },
        ].map(s => (
          <div key={s.label} className="px-3 py-2 text-center border-r border-[#c8d3e8] last:border-r-0">
            <div className={`text-sm font-semibold tabular-nums ${s.cls || "text-gray-700"}`}>{s.value}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex border-b border-[#c8d3e8] bg-white">
        {([
          ["main",       "Основное"],
          ["contacts",   "Реквизиты"],
          ["activities", `Активности${activities.length ? ` (${activities.length})` : ""}`],
        ] as [CardTab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-medium transition border-b-2 -mb-px whitespace-nowrap ${
              tab === t ? "border-[#516895] text-[#516895]" : "border-transparent text-gray-400 hover:text-gray-600"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {(detailLoading && tab !== "activities") && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400">
            <Spinner />
          </div>
        )}

        {!detailLoading && tab === "main" && (
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
            {([
              ["Тип",      TYPE_LABEL[client.customer_type ?? ""] ?? client.customer_type ?? "—"],
              ["Страна",   d?.country ?? client.country ?? "—"],
              ["Создан",   d?.created_at ? fmtDateTime(d.created_at) : "—"],
              ["Код",      client.code],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label}>
                <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">{label}</div>
                <div className="text-gray-700">{value || "—"}</div>
              </div>
            ))}
            {d?.address && (
              <div className="col-span-2">
                <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">Адрес</div>
                <div className="text-gray-700">{d.address}</div>
              </div>
            )}
          </div>
        )}

        {!detailLoading && tab === "contacts" && (
          <div className="space-y-3 text-sm">
            {([
              ["Телефон", client.contact_phone],
              ["E-mail",  d?.contact_email ?? client.contact_email],
              ["Tax ID",  d?.tax_id],
              ["Адрес",   d?.address],
            ] as [string, string | null | undefined][]).map(([label, value]) => value ? (
              <div key={label}>
                <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">{label}</div>
                <div className="text-gray-700">{value}</div>
              </div>
            ) : null)}
          </div>
        )}

        {tab === "activities" && (
          activitiesLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400">
              <Spinner />
            </div>
          ) : activities.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">Активностей нет</div>
          ) : (
            <div className="space-y-2">
              {activities.map(a => (
                <div key={a.id} className="flex gap-3 p-3 rounded-xl border border-gray-100 hover:border-[#c8d3e8] transition bg-white">
                  <div className="text-lg shrink-0 mt-0.5">{ACT_ICON[a.act_type] ?? "○"}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-gray-700">{ACT_LABEL[a.act_type] ?? a.act_type}</span>
                      {a.outcome && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                          {OUTCOME_LABEL[a.outcome] ?? a.outcome}
                        </span>
                      )}
                      <span className="ml-auto text-[10px] text-gray-400 tabular-nums shrink-0">{fmtDate(a.created_at)}</span>
                    </div>
                    {a.body && <div className="text-xs text-gray-600 mt-1 leading-relaxed">{a.body}</div>}
                    {a.created_by && <div className="text-[10px] text-gray-400 mt-1">{a.created_by}</div>}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ClientViewerPage() {
  const [q, setQ]                   = useState("");
  const [type, setType]             = useState("all");
  const [onlyDeals, setOnlyDeals]   = useState(false);
  const [inProd, setInProd]         = useState(false);

  const [clients, setClients]       = useState<Client[]>([]);
  const [loading, setLoading]       = useState(false);

  const [selected, setSelected]                   = useState<Client | null>(null);
  const [deals, setDeals]                         = useState<Deal[]>([]);
  const [dealsLoading, setDealsLoading]           = useState(false);
  const [detail, setDetail]                       = useState<CustomerFull | null>(null);
  const [detailLoading, setDetailLoading]         = useState(false);
  const [activities, setActivities]               = useState<Activity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const runSearch = useCallback(async (
    qv = q, tv = type, od = onlyDeals, ip = inProd
  ) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    try {
      const p = new URLSearchParams({ q: qv, type: tv, only_deals: od ? "1" : "0", in_prod: ip ? "1" : "0" });
      const res  = await fetch(`/api/client-viewer?${p}`, { signal: abortRef.current.signal });
      const data = await res.json() as Client[];
      setClients(data);
    } catch (e: unknown) {
      if ((e as { name?: string }).name !== "AbortError") setClients([]);
    } finally {
      setLoading(false);
    }
  }, [q, type, onlyDeals, inProd]);

  useEffect(() => { runSearch("", "all", false, false); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function reset() {
    setQ(""); setType("all"); setOnlyDeals(false); setInProd(false);
    runSearch("", "all", false, false);
  }

  async function selectClient(c: Client) {
    setSelected(c); setDeals([]); setDetail(null); setActivities([]);

    setDealsLoading(true);
    const dr = await fetch(`/api/sales?customer_id=${c.id}&page=1`);
    if (dr.ok) { const dj = await dr.json() as { docs: Deal[] }; setDeals(dj.docs ?? []); }
    setDealsLoading(false);

    setDetailLoading(true);
    const cr = await fetch(`/api/customers/${c.id}`);
    if (cr.ok) setDetail(await cr.json() as CustomerFull);
    setDetailLoading(false);

    setActivitiesLoading(true);
    const ar = await fetch(`/api/activities?customer_id=${c.id}`);
    if (ar.ok) setActivities(await ar.json() as Activity[]);
    setActivitiesLoading(false);
  }

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden bg-[#f8fafc]">

      {/* ── LEFT ── */}
      <div className={`flex flex-col min-w-0 min-h-0 overflow-hidden ${selected ? "flex-1" : "w-full"} bg-white border-r border-[#c8d3e8]`}>
        <SearchPanel
          q={q} setQ={setQ} type={type} setType={setType}
          onlyDeals={onlyDeals} setOnlyDeals={setOnlyDeals}
          inProd={inProd} setInProd={setInProd}
          onSearch={() => runSearch()} onReset={reset}
          count={clients.length} loading={loading}
        />

        <ClientList clients={clients} selected={selected} onSelect={selectClient} loading={loading} />

        {selected ? (
          <>
            <DealsGrid client={selected} deals={deals} loading={dealsLoading} />
            <ClientCard client={selected} detail={detail} detailLoading={detailLoading}
              activities={activities} activitiesLoading={activitiesLoading} />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
            <div className="w-16 h-16 rounded-2xl bg-[#516895]/8 flex items-center justify-center text-3xl">👤</div>
            <div className="text-sm font-medium text-gray-500">Выберите клиента из списка</div>
            <div className="text-xs text-gray-400">Откроются сделки, карточка и ИИ-анализ</div>
          </div>
        )}
      </div>

      {/* ── RIGHT: AI ── */}
      {selected && (
        <div className="w-100 shrink-0 flex flex-col min-h-0 overflow-auto border-l border-[#c8d3e8] bg-white">
          <CustomerAiPanel customerId={selected.id} customerName={selected.name} />
        </div>
      )}
    </div>
  );
}
