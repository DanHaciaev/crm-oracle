"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/locale";

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
  const t = useT();
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
    if (!form.name.trim()) { setError(t("customers.nameRequired")); return; }
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
      setError((j as { error?: string }).error ?? t("common.error"));
      return;
    }
    onCreated();
  }

  function update<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white border border-gray-800 text-gray-900 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-auto">
        <div className="p-6 border-b border-gray-800 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t("customers.newCustomer")}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {t("customers.bindingTo")}{appUser.telegram_username ? ` @${appUser.telegram_username}` : ""} {t("customers.bindingAuto")}.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-3">
          <Field label={`${t("customers.customerName")} *`}>
            <input value={form.name} onChange={(e) => update("name", e.target.value)} className={inputCls} />
          </Field>

          <Field label={t("customers.codeOptional")}>
            <input value={form.code} onChange={(e) => update("code", e.target.value)} placeholder={t("customers.codePlaceholder")} className={inputCls} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("common.type")}>
              <select
                value={form.customer_type}
                onChange={(e) => update("customer_type", e.target.value as "domestic" | "export")}
                className={inputCls}
              >
                <option value="domestic">{t("sales.types.domestic")}</option>
                <option value="export">{t("sales.types.export")}</option>
              </select>
            </Field>
            <Field label={t("common.country")}>
              <input value={form.country} onChange={(e) => update("country", e.target.value)} className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("common.phone")}>
              <input value={form.contact_phone} onChange={(e) => update("contact_phone", e.target.value)} className={inputCls} />
            </Field>
            <Field label={t("common.email")}>
              <input value={form.contact_email} onChange={(e) => update("contact_email", e.target.value)} className={inputCls} />
            </Field>
          </div>

          <Field label={t("customers.taxId")}>
            <input value={form.tax_id} onChange={(e) => update("tax_id", e.target.value)} className={inputCls} />
          </Field>

          <Field label={t("customers.address")}>
            <input value={form.address} onChange={(e) => update("address", e.target.value)} className={inputCls} />
          </Field>

          {error && (
            <div className="px-3 py-2 border border-red-300 bg-red-50 rounded-lg text-sm text-red-600">{error}</div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-gray-800">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-800 hover:bg-gray-100 transition text-gray-700">
            {t("common.cancel")}
          </button>
          <button
            onClick={submit}
            disabled={saving || !form.name.trim()}
            className="px-4 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white transition"
          >
            {saving ? t("customers.creating") : t("customers.createAndLink")}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls = "w-full border border-gray-800 bg-white rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-800 focus:ring-1 focus:ring-gray-200 transition";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm text-gray-500 block mb-1">{label}</span>
      {children}
    </label>
  );
}
