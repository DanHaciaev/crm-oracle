"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface AppUser {
  id:                number;
  telegram_chat_id:  number;
  telegram_username: string | null;
  first_name:        string | null;
  last_name:         string | null;
  status:            string;
  first_seen:        string | null;
  last_seen:         string | null;
}

interface Binding {
  id:           number;
  invite_token: string;
  status:       string;
  created_at:   string | null;
  expires_at:   string | null;
  bound_at:     string | null;
}

interface CustomerDetail {
  id:            number;
  code:          string;
  name:          string;
  country:       string | null;
  tax_id:        string | null;
  contact_phone: string | null;
  contact_email: string | null;
  address:       string | null;
  customer_type: string | null;
  active:        boolean;
  created_at:    string | null;
  app_users:     AppUser[];
  bindings:      Binding[];
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function shortToken(t: string) { return `${t.slice(0, 8)}…${t.slice(-4)}`; }

export default function CustomerDetail({ id }: { id: string }) {
  const [data, setData]           = useState<CustomerDetail | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [newLink, setNewLink]     = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res  = await fetch(`/api/customers/${id}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setError((json as { error?: string }).error ?? "Ошибка");
    else         setData(json as CustomerDetail);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function generateLink() {
    setGenerating(true);
    setNewLink(null);
    const res  = await fetch(`/api/customers/${id}/invite-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ttl_days: 7 }),
    });
    const json = await res.json().catch(() => ({}));
    setGenerating(false);
    if (!res.ok) { alert((json as { error?: string }).error ?? "Ошибка"); return; }
    setNewLink((json as { url: string }).url);
    fetchData();
  }

  async function revokeBinding(bindingId: number) {
    if (!confirm("Отозвать эту invite-ссылку?")) return;
    const res = await fetch(`/api/customers/${id}/invite-link`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ binding_id: bindingId }),
    });
    if (!res.ok) { alert("Ошибка"); return; }
    fetchData();
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(
      () => { /* ok */ },
      () => alert("Не удалось скопировать")
    );
  }

  if (loading) return <div className="p-8 text-sm text-gray-400">Загрузка...</div>;
  if (error)   return <div className="p-8 text-sm text-red-500">{error}</div>;
  if (!data)   return null;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/customers" className="text-sm text-zinc-500 hover:text-zinc-300 transition">← Клиенты</Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold">{data.name}</h1>
        <p className="text-sm text-gray-500 mt-1 font-mono">{data.code}</p>
      </div>

      {/* Customer info */}
      <section className="border border-zinc-800 rounded-xl p-5 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
        <Field label="Тип"      value={data.customer_type} />
        <Field label="Страна"   value={data.country} />
        <Field label="Tax ID"   value={data.tax_id} />
        <Field label="Телефон"  value={data.contact_phone} />
        <Field label="Email"    value={data.contact_email} />
        <Field label="Активен"  value={data.active ? "Y" : "N"} />
        <div className="md:col-span-2">
          <Field label="Адрес" value={data.address} />
        </div>
      </section>

      {/* Telegram block */}
      <section className="border border-zinc-800 rounded-xl p-5">
        <h2 className="text-base font-semibold mb-4">Telegram</h2>

        {data.app_users.length > 0 ? (
          <div className="space-y-3">
            {data.app_users.map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-4 border border-emerald-500/20 bg-emerald-500/5 rounded-lg px-4 py-3">
                <div className="text-sm">
                  <div>
                    <span className="text-emerald-300 mr-2">✓ Привязан</span>
                    {u.telegram_username ? <span className="font-mono">@{u.telegram_username}</span> : null}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    chat_id: <span className="font-mono">{u.telegram_chat_id}</span>
                    {" · "}первое сообщение: {fmtDate(u.first_seen)}
                    {" · "}последнее: {fmtDate(u.last_seen)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">Не привязан к Telegram. Создайте invite-ссылку и пришлите её клиенту.</p>
        )}

        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={generateLink}
            disabled={generating}
            className="px-4 py-2 text-sm rounded-lg border border-zinc-300 bg-zinc-100 text-black hover:bg-white disabled:opacity-50 transition"
          >
            {generating ? "Создаём..." : "+ Создать invite-ссылку"}
          </button>
          <span className="text-xs text-gray-500">Срок жизни — 7 дней</span>
        </div>

        {newLink && (
          <div className="mt-4 border border-emerald-500/30 bg-emerald-500/10 rounded-lg p-3 text-sm flex items-center justify-between gap-3">
            <code className="break-all text-emerald-200">{newLink}</code>
            <button
              onClick={() => copy(newLink)}
              className="px-3 py-1 text-xs rounded-md border border-emerald-400/40 hover:bg-emerald-500/20 shrink-0"
            >
              Скопировать
            </button>
          </div>
        )}

        {/* Bindings history */}
        {data.bindings.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-gray-300 mb-2">История invite-ссылок</h3>
            <div className="border border-zinc-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900/60 text-xs text-gray-400">
                  <tr>
                    <th className="text-left px-3 py-2">Токен</th>
                    <th className="text-left px-3 py-2">Статус</th>
                    <th className="text-left px-3 py-2">Создан</th>
                    <th className="text-left px-3 py-2">Истекает</th>
                    <th className="text-left px-3 py-2">Привязан</th>
                    <th className="text-right px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.bindings.map((b) => (
                    <tr key={b.id} className="border-t border-zinc-800">
                      <td className="px-3 py-2 font-mono text-xs">{shortToken(b.invite_token)}</td>
                      <td className="px-3 py-2 text-xs">
                        <BindingStatus s={b.status} />
                      </td>
                      <td className="px-3 py-2 text-xs">{fmtDate(b.created_at)}</td>
                      <td className="px-3 py-2 text-xs">{fmtDate(b.expires_at)}</td>
                      <td className="px-3 py-2 text-xs">{fmtDate(b.bound_at)}</td>
                      <td className="px-3 py-2 text-right">
                        {b.status === "pending" && (
                          <button
                            onClick={() => revokeBinding(b.id)}
                            className="px-2 py-1 text-xs rounded-md border border-red-500/30 text-red-400 hover:bg-red-500/10 transition"
                          >
                            Отозвать
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-0.5">{value && String(value).trim() !== "" ? value : "—"}</div>
    </div>
  );
}

function BindingStatus({ s }: { s: string }) {
  const map: Record<string, string> = {
    pending:  "border-zinc-600 text-zinc-300",
    bound:    "border-emerald-500/40 text-emerald-300",
    revoked:  "border-red-500/40 text-red-300",
    expired:  "border-orange-500/40 text-orange-300",
  };
  const cls = map[s] ?? "border-zinc-600 text-zinc-300";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${cls}`}>
      {s}
    </span>
  );
}
