"use client";

import { useEffect, useState } from "react";

interface AppUser {
  id: number;
  telegram_username: string | null;
  first_name:        string | null;
  last_name:         string | null;
  telegram_chat_id:  number;
}

interface Customer {
  id:            number;
  code:          string;
  name:          string;
  country:       string | null;
  tg_linked:     boolean;
}

export default function LinkCustomerModal({ appUser, onClose, onLinked }: {
  appUser: AppUser; onClose: () => void; onLinked: () => void;
}) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/customers")
      .then((r) => r.json())
      .then((data: Customer[]) => { setCustomers(data); setLoading(false); })
      .catch(() => { setError("Не удалось загрузить клиентов"); setLoading(false); });
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filtered = search
    ? customers.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.code.toLowerCase().includes(search.toLowerCase()))
    : customers;

  async function link(customerId: number) {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/app-users/${appUser.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "link", customer_id: customerId }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError((j as { error?: string }).error ?? "Ошибка");
      return;
    }
    onLinked();
  }

  const userLabel =
    (appUser.telegram_username && `@${appUser.telegram_username}`) ||
    [appUser.first_name, appUser.last_name].filter(Boolean).join(" ") ||
    `chat ${appUser.telegram_chat_id}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-zinc-950 border border-zinc-800 text-zinc-100 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-start justify-between p-6 border-b border-zinc-800">
          <div>
            <h2 className="text-lg font-semibold">Привязать бот-юзера к клиенту</h2>
            <p className="text-sm text-gray-400 mt-0.5">{userLabel}</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 text-xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-4 overflow-auto">
          <input
            type="text"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по коду или названию..."
            className="w-full border border-zinc-700 bg-transparent rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-400 transition"
          />

          {error && (
            <div className="px-3 py-2 border border-red-500/30 bg-red-500/10 rounded-lg text-xs text-red-300">{error}</div>
          )}

          {loading ? (
            <div className="text-sm text-gray-400 py-6 text-center">Загрузка клиентов...</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-gray-400 py-6 text-center">Ничего не найдено</div>
          ) : (
            <div className="border border-zinc-800 rounded-lg divide-y divide-zinc-800">
              {filtered.slice(0, 50).map((c) => (
                <button
                  key={c.id}
                  disabled={saving}
                  onClick={() => link(c.id)}
                  className="w-full text-left px-4 py-3 hover:bg-zinc-900/60 disabled:opacity-50 transition flex items-center justify-between"
                >
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-gray-500 font-mono mt-0.5">
                      {c.code}{c.country ? ` · ${c.country}` : ""}
                    </div>
                  </div>
                  {c.tg_linked && (
                    <span className="text-xs text-emerald-400 border border-emerald-500/30 rounded-full px-2 py-0.5">
                      уже привязан
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-zinc-800">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-zinc-700 hover:bg-zinc-800 transition">
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
