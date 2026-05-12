"use client";

import { useEffect, useState } from "react";

interface AppUserSeed {
  id:                number;
  telegram_username: string | null;
  first_name:        string | null;
  last_name:         string | null;
}

export default function CreateCustomerModal({ appUser, onClose, onCreated }: {
  appUser: AppUserSeed;
  onClose: () => void;
  onCreated: () => void;
}) {
  const initialName = [appUser.first_name, appUser.last_name].filter(Boolean).join(" ")
                    || (appUser.telegram_username ? `@${appUser.telegram_username}` : "");

  const [form, setForm] = useState({
    code:          "",
    name:          initialName,
    customer_type: "domestic" as "domestic" | "export",
    country:       "",
    contact_phone: "",
    contact_email: "",
    address:       "",
    tax_id:        "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    if (!form.name.trim()) { setError("Имя обязательно"); return; }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code:             form.code.trim() || undefined,
        name:             form.name.trim(),
        customer_type:    form.customer_type,
        country:          form.country.trim()       || null,
        contact_phone:    form.contact_phone.trim() || null,
        contact_email:    form.contact_email.trim() || null,
        address:          form.address.trim()       || null,
        tax_id:           form.tax_id.trim()        || null,
        link_app_user_id: appUser.id,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError((j as { error?: string }).error ?? "Ошибка");
      return;
    }
    onCreated();
  }

  function update<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-zinc-950 border border-zinc-800 text-zinc-100 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-auto">
        <div className="p-6 border-b border-zinc-800 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Создать клиента</h2>
            <p className="text-sm text-gray-400 mt-0.5">
              Привязка к собеседнику{appUser.telegram_username ? ` @${appUser.telegram_username}` : ""} произойдёт автоматически.
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 text-xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-3">
          <Field label="Имя клиента *">
            <input value={form.name} onChange={(e) => update("name", e.target.value)} className={inputCls} />
          </Field>

          <Field label="Код (необязательно — сгенерируется автоматически)">
            <input value={form.code} onChange={(e) => update("code", e.target.value)} placeholder="например CUST-001 или оставь пусто" className={inputCls} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Тип">
              <select
                value={form.customer_type}
                onChange={(e) => update("customer_type", e.target.value as "domestic" | "export")}
                className={`${inputCls} bg-transparent`}
              >
                <option className="text-black" value="domestic">domestic</option>
                <option className="text-black" value="export">export</option>
              </select>
            </Field>
            <Field label="Страна">
              <input value={form.country} onChange={(e) => update("country", e.target.value)} className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Телефон">
              <input value={form.contact_phone} onChange={(e) => update("contact_phone", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Email">
              <input value={form.contact_email} onChange={(e) => update("contact_email", e.target.value)} className={inputCls} />
            </Field>
          </div>

          <Field label="Tax ID">
            <input value={form.tax_id} onChange={(e) => update("tax_id", e.target.value)} className={inputCls} />
          </Field>

          <Field label="Адрес">
            <input value={form.address} onChange={(e) => update("address", e.target.value)} className={inputCls} />
          </Field>

          {error && (
            <div className="px-3 py-2 border border-red-500/30 bg-red-500/10 rounded-lg text-xs text-red-300">{error}</div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-zinc-800">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-zinc-700 hover:bg-zinc-800 transition">
            Отмена
          </button>
          <button
            onClick={submit}
            disabled={saving || !form.name.trim()}
            className="px-4 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white transition"
          >
            {saving ? "Создаём..." : "Создать и привязать"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls = "w-full border border-zinc-700 bg-transparent rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-400 transition";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-gray-400 block mb-1">{label}</span>
      {children}
    </label>
  );
}
