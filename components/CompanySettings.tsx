"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Building2, ImageUp, Trash2 } from "lucide-react";
import { useT } from "@/lib/locale";
import { useAuth } from "@/hooks/useAuth";
import { can } from "@/lib/permissions";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type Company = Record<string, string>;

// Field order on screen; each label comes from settings.field_<key>.
const SECTIONS: { title: string; fields: { key: string; wide?: boolean; placeholder?: string }[] }[] = [
  { title: "sectionMain", fields: [
    { key: "name", wide: true }, { key: "address", wide: true },
    { key: "fiscal_code", placeholder: "1003600000000" }, { key: "vat_code" },
  ] },
  { title: "sectionBank", fields: [
    { key: "iban", wide: true, placeholder: "MD00AG000000000000000000" }, { key: "bank" }, { key: "bank_code", placeholder: "AGRNMD2X" },
  ] },
  { title: "sectionContacts", fields: [
    { key: "phone" }, { key: "email" }, { key: "director" }, { key: "accountant" },
  ] },
];

export default function CompanySettings() {
  const t = useT();
  const { user } = useAuth();
  const canEdit = can(user?.permissions, "settings", "edit");
  const [form, setForm]       = useState<Company | null>(null);
  const [saved, setSaved]     = useState<Company | null>(null);
  const [saving, setSaving]   = useState(false);
  const [logoVer, setLogoVer] = useState(0);
  const [hasLogo, setHasLogo] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/settings/company")
      .then(r => r.json())
      .then((d: Company) => { setForm(d); setSaved(d); })
      .catch(() => toast.error(t("common.error")));
  }, [t]);

  if (!form) return <div className="p-8 text-sm text-gray-400">{t("common.loading")}</div>;
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/settings/company", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? t("common.error")); return; }
    setForm(json); setSaved(json);
    toast.success(t("settings.saved"));
  }

  async function upload(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/settings/logo", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(json.error ?? t("common.error")); return; }
    setHasLogo(true); setLogoVer(v => v + 1);
    toast.success(t("settings.logoSaved"));
  }

  async function removeLogo() {
    const res = await fetch("/api/settings/logo", { method: "DELETE" });
    if (!res.ok) { toast.error(t("common.error")); return; }
    setHasLogo(false); setLogoVer(v => v + 1);
  }

  const inputCls = "w-full border border-[#c8d3e8] bg-white rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand transition disabled:bg-gray-50";

  return (
    <div className="p-4 sm:p-8 max-w-4xl">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Building2 className="w-6 h-6 text-brand" />{t("settings.title")}</h1>
      <p className="text-sm text-gray-500 mt-1 mb-6">{t("settings.subtitle")}</p>

      <section className="border border-[#c8d3e8] rounded-xl p-4 mb-4 flex items-center gap-4 flex-wrap">
        <div className="w-40 h-20 border border-dashed border-[#c8d3e8] rounded-lg flex items-center justify-center bg-gray-50 overflow-hidden">
          {hasLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={logoVer} src={`${BASE}/api/settings/logo?v=${logoVer}`} alt="" className="max-w-full max-h-full object-contain"
                 onError={() => setHasLogo(false)} />
          ) : <span className="text-xs text-gray-400">{t("settings.noLogo")}</span>}
        </div>
        <div className="flex-1 min-w-[12rem]">
          <div className="font-medium text-sm">{t("settings.logo")}</div>
          <div className="text-xs text-gray-400">{t("settings.logoHint")}</div>
        </div>
        {canEdit && <>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden"
                 onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
          <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#dde3ef] text-sm hover:bg-gray-50">
            <ImageUp className="w-4 h-4" />{t("settings.uploadLogo")}
          </button>
          {hasLogo && (
            <button onClick={removeLogo} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#dde3ef] text-sm text-red-600 hover:bg-red-50">
              <Trash2 className="w-4 h-4" />{t("common.delete")}
            </button>
          )}
        </>}
      </section>

      {SECTIONS.map(sec => (
        <section key={sec.title} className="border border-[#c8d3e8] rounded-xl p-4 mb-4">
          <h2 className="font-semibold mb-3">{t(`settings.${sec.title}`)}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {sec.fields.map(f => (
              <label key={f.key} className={`text-sm ${f.wide ? "sm:col-span-2" : ""}`}>
                <div className="text-gray-500 mb-1">{t(`settings.field_${f.key}`)}</div>
                <input
                  value={form[f.key] ?? ""} disabled={!canEdit} placeholder={f.placeholder}
                  onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                  className={inputCls}
                />
              </label>
            ))}
          </div>
        </section>
      ))}

      <div className="flex items-center gap-3">
        {canEdit && (
          <button onClick={save} disabled={!dirty || saving}
                  className="px-5 py-2.5 rounded-lg bg-brand text-white text-sm font-medium disabled:opacity-40 transition">
            {saving ? t("common.saving") : t("common.save")}
          </button>
        )}
        <span className="text-xs text-gray-400">{t("settings.sharedNote")}</span>
      </div>
    </div>
  );
}
