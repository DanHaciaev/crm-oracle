"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/locale";

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
  const t = useT();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/customers")
      .then((r) => r.json())
      .then((data: Customer[]) => { setCustomers(data); setLoading(false); })
      .catch(() => { setError(t("appUsers.loadError")); setLoading(false); });
  }, [t]);

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
      setError((j as { error?: string }).error ?? t("common.error"));
      return;
    }
    onLinked();
  }

  const userLabel =
    (appUser.telegram_username && `@${appUser.telegram_username}`) ||
    [appUser.first_name, appUser.last_name].filter(Boolean).join(" ") ||
    `chat ${appUser.telegram_chat_id}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white border border-[#c8d3e8] text-gray-900 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-start justify-between p-6 border-b border-[#c8d3e8]">
          <div>
            <h2 className="text-lg font-semibold">{t("appUsers.linkTitle")}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{userLabel}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-4 overflow-auto">
          <input
            type="text"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("customers.searchPlaceholder")}
            className="w-full border border-[#c8d3e8] bg-white rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#c8d3e8] transition"
          />

          {error && (
            <div className="px-3 py-2 border border-red-300 bg-red-50 rounded-lg text-sm text-red-600">{error}</div>
          )}

          {loading ? (
            <div className="text-sm text-gray-400 py-6 text-center">{t("appUsers.loadingCustomers")}</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-gray-400 py-6 text-center">{t("common.noResults")}</div>
          ) : (
            <div className="border border-[#c8d3e8] rounded-lg divide-y divide-gray-100">
              {filtered.slice(0, 50).map((c) => (
                <button
                  key={c.id}
                  disabled={saving}
                  onClick={() => link(c.id)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 disabled:opacity-50 transition flex items-center justify-between"
                >
                  <div>
                    <div className="font-medium text-gray-900">{c.name}</div>
                    <div className="text-sm text-gray-500 font-mono mt-0.5">
                      {c.code}{c.country ? ` · ${c.country}` : ""}
                    </div>
                  </div>
                  {c.tg_linked && (
                    <span className="text-sm text-emerald-600 border border-emerald-200 bg-emerald-50 rounded-full px-2 py-0.5">
                      {t("appUsers.alreadyLinked")}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-[#c8d3e8]">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-[#c8d3e8] hover:bg-gray-100 transition text-gray-700">
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
