"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface Tier {
  name: string;
  color: string;
  count: number;
}

interface Stats {
  total_members: number;
  total_points: number;
  tier_dist: Tier[];
}

interface Member {
  member_id: number;
  customer_id: number;
  customer_name: string;
  total_points: number;
  tier_name: string | null;
  tier_color: string | null;
  enrolled_at: string | null;
}

interface Customer {
  id: number;
  name: string;
}

const TIER_STYLE: Record<string, string> = {
  amber:  "bg-amber-100 text-amber-800 border-amber-300",
  slate:  "bg-slate-100 text-slate-700 border-slate-300",
  yellow: "bg-yellow-100 text-yellow-800 border-yellow-300",
  cyan:   "bg-cyan-100  text-cyan-800  border-cyan-300",
  gray:   "bg-gray-100  text-gray-600  border-gray-300",
};

function TierBadge({ name, color }: { name: string | null; color: string | null }) {
  const cls = TIER_STYLE[color ?? "gray"] ?? TIER_STYLE.gray;
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>
      {name ?? "—"}
    </span>
  );
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function LoyaltyPage() {
  const [stats, setStats]     = useState<Stats | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");

  // Enroll modal
  const [showEnroll, setShowEnroll]           = useState(false);
  const [customers, setCustomers]             = useState<Customer[]>([]);
  const [enrollSearch, setEnrollSearch]       = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<number | null>(null);
  const [enrolling, setEnrolling]             = useState(false);

  // Award modal
  const [awardModal, setAwardModal]           = useState<Member | null>(null);
  const [awardPoints, setAwardPoints]         = useState("");
  const [awardDesc, setAwardDesc]             = useState("");
  const [awarding, setAwarding]               = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [statsRes, membersRes] = await Promise.all([
      fetch("/api/loyalty?view=stats"),
      fetch("/api/loyalty"),
    ]);
    if (statsRes.ok)   setStats(await statsRes.json() as Stats);
    if (membersRes.ok) setMembers(await membersRes.json() as Member[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function openEnroll() {
    setShowEnroll(true);
    const res = await fetch("/api/customers");
    if (res.ok) {
      const all = await res.json() as Customer[];
      const enrolled = new Set(members.map(m => m.customer_id));
      setCustomers(all.filter(c => !enrolled.has(c.id)));
    }
  }

  async function handleEnroll() {
    if (!selectedCustomer) return;
    setEnrolling(true);
    const res = await fetch("/api/loyalty/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_id: selectedCustomer }),
    });
    setEnrolling(false);
    if (res.ok) {
      toast.success("Клиент записан в программу лояльности");
      setShowEnroll(false);
      setSelectedCustomer(null);
      setEnrollSearch("");
      fetchData();
    } else {
      const d = await res.json() as { error?: string };
      toast.error(d.error ?? "Ошибка");
    }
  }

  async function handleAward() {
    if (!awardModal || !awardPoints.trim()) return;
    const pts = Number(awardPoints);
    if (isNaN(pts) || pts === 0) { toast.error("Введите корректное число баллов"); return; }
    setAwarding(true);
    const res = await fetch("/api/loyalty/award", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: awardModal.customer_id,
        points:      pts,
        description: awardDesc.trim() || undefined,
      }),
    });
    setAwarding(false);
    if (res.ok) {
      const d = await res.json() as { new_total: number };
      toast.success(`Баллы обновлены. Итого: ${d.new_total}`);
      setAwardModal(null);
      setAwardPoints("");
      setAwardDesc("");
      fetchData();
    } else {
      const d = await res.json() as { error?: string };
      toast.error(d.error ?? "Ошибка");
    }
  }

  const filtered = members.filter(m =>
    !search || m.customer_name.toLowerCase().includes(search.toLowerCase())
  );

  const filteredCustomers = customers.filter(c =>
    !enrollSearch || c.name.toLowerCase().includes(enrollSearch.toLowerCase())
  );

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Программа лояльности</h1>
          <p className="text-sm text-gray-500 mt-0.5">Уровни, баллы и история начислений</p>
        </div>
        <button
          onClick={openEnroll}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#516895] text-white text-sm font-medium rounded-xl hover:bg-[#3f5278] transition"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
          </svg>
          Записать клиента
        </button>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white border border-[#c8d3e8] rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">Участников</div>
            <div className="text-2xl font-bold text-gray-900">{stats.total_members}</div>
          </div>
          <div className="bg-white border border-[#c8d3e8] rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">Всего баллов</div>
            <div className="text-2xl font-bold text-gray-900">{stats.total_points.toLocaleString("ru-RU")}</div>
          </div>
          {stats.tier_dist.map(t => (
            <div key={t.name} className="bg-white border border-[#c8d3e8] rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">{t.name}</div>
              <div className="text-2xl font-bold text-gray-900">{t.count}</div>
            </div>
          ))}
        </div>
      )}

      {/* Members table */}
      <div className="bg-white border border-[#c8d3e8] rounded-xl overflow-hidden">
        <div className="p-4 border-b border-[#c8d3e8] flex items-center gap-3">
          <input
            type="text"
            placeholder="Поиск по клиенту..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-3 py-1.5 border border-[#c8d3e8] rounded-lg text-sm outline-none focus:border-[#516895] w-56"
          />
        </div>
        {loading ? (
          <div className="py-16 text-center text-gray-400 text-sm">Загрузка...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">Нет участников программы</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-[#c8d3e8]">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Клиент</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Уровень</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Баллы</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">В программе с</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c8d3e8]">
              {filtered.map(m => (
                <tr key={m.member_id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 font-medium text-gray-900">{m.customer_name}</td>
                  <td className="px-4 py-3">
                    <TierBadge name={m.tier_name} color={m.tier_color} />
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-800">
                    {m.total_points.toLocaleString("ru-RU")}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{fmtDate(m.enrolled_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => { setAwardModal(m); setAwardPoints(""); setAwardDesc(""); }}
                      className="px-2.5 py-1 text-xs rounded-lg border border-[#c8d3e8] text-gray-600 hover:bg-gray-100 transition"
                    >
                      Баллы
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Enroll modal */}
      {showEnroll && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Записать в программу лояльности</h3>
            </div>
            <div className="p-6 space-y-4">
              <input
                type="text"
                placeholder="Поиск клиента..."
                value={enrollSearch}
                onChange={e => setEnrollSearch(e.target.value)}
                className="w-full px-3 py-2 border border-[#c8d3e8] rounded-lg text-sm outline-none focus:border-[#516895]"
              />
              <div className="max-h-60 overflow-y-auto border border-[#c8d3e8] rounded-lg divide-y divide-[#c8d3e8]">
                {filteredCustomers.length === 0 ? (
                  <div className="py-8 text-center text-sm text-gray-400">Клиентов не найдено</div>
                ) : filteredCustomers.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCustomer(c.id)}
                    className={`w-full text-left px-3 py-2 text-sm transition hover:bg-gray-50
                      ${selectedCustomer === c.id ? "bg-blue-50 text-[#516895] font-medium" : "text-gray-800"}`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowEnroll(false)}
                className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
                Отмена
              </button>
              <button onClick={handleEnroll} disabled={!selectedCustomer || enrolling}
                className="px-5 py-2 bg-[#516895] text-white text-sm font-medium rounded-lg hover:bg-[#3f5278] disabled:opacity-50">
                {enrolling ? "Записываем..." : "Записать"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Award/deduct modal */}
      {awardModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Изменить баллы</h3>
              <p className="text-sm text-gray-500 mt-0.5">{awardModal.customer_name} · {awardModal.total_points} баллов</p>
            </div>
            <div className="p-6 space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Баллы (+ начислить / − снять)</label>
                <input
                  type="number"
                  placeholder="например: 200 или -50"
                  value={awardPoints}
                  onChange={e => setAwardPoints(e.target.value)}
                  className="w-full px-3 py-2 border border-[#c8d3e8] rounded-lg text-sm outline-none focus:border-[#516895]"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Комментарий (необязательно)</label>
                <input
                  type="text"
                  placeholder="Причина начисления..."
                  value={awardDesc}
                  onChange={e => setAwardDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-[#c8d3e8] rounded-lg text-sm outline-none focus:border-[#516895]"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setAwardModal(null)}
                className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
                Отмена
              </button>
              <button onClick={handleAward} disabled={awarding || !awardPoints.trim()}
                className="px-5 py-2 bg-[#516895] text-white text-sm font-medium rounded-lg hover:bg-[#3f5278] disabled:opacity-50">
                {awarding ? "Сохраняем..." : "Применить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
