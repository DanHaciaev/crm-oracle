"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, ShieldCheck, ShieldOff, History } from "lucide-react";
import { useT } from "@/lib/locale";
import { LoginHistoryTable, type LoginRow } from "@/components/LoginHistoryTable";

interface Account {
  id: number; username: string; first_name: string | null; last_name: string | null; role: string;
  two_factor: boolean; logins: LoginRow[];
}

const inputCls = "w-full border border-[#c8d3e8] bg-white rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand transition";

export default function AccountPage() {
  const t = useT();
  const [acc, setAcc] = useState<Account | null>(null);
  const load = useCallback(() => {
    fetch("/api/account").then(r => r.json()).then(setAcc).catch(() => toast.error(t("common.error")));
  }, [t]);
  useEffect(() => { load(); }, [load]);

  if (!acc) return <div className="p-8 text-sm text-gray-400">{t("common.loading")}</div>;
  const fullName = [acc.first_name, acc.last_name].filter(Boolean).join(" ");

  return (
    <div className="p-4 sm:p-8 max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t("account.title")}</h1>
        <p className="text-sm text-gray-500 mt-1">{acc.username}{fullName && ` · ${fullName}`} · {t(`roles.${acc.role}`)}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <PasswordCard />
        <TwoFactorCard enabled={acc.two_factor} onChanged={load} />
      </div>
      <section className="border border-[#c8d3e8] rounded-xl p-4">
        <h2 className="font-semibold mb-1 flex items-center gap-2"><History className="w-4 h-4" />{t("account.loginsTitle")}</h2>
        <p className="text-xs text-gray-400 mb-3">{t("account.loginsHint")}</p>
        <LoginHistoryTable rows={acc.logins} showUser={false} />
      </section>
    </div>
  );
}

function PasswordCard() {
  const t = useT();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [rep, setRep] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== rep) { toast.error(t("account.mismatch")); return; }
    setBusy(true);
    const res = await fetch("/api/account", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_password: cur, new_password: next }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { toast.error(json.error ?? t("common.error")); return; }
    setCur(""); setNext(""); setRep("");
    toast.success(t("account.passwordChanged"));
  }

  return (
    <form onSubmit={submit} className="border border-[#c8d3e8] rounded-xl p-4 space-y-3">
      <h2 className="font-semibold flex items-center gap-2"><KeyRound className="w-4 h-4" />{t("account.passwordTitle")}</h2>
      <input type="password" autoComplete="current-password" required value={cur} onChange={e => setCur(e.target.value)} placeholder={t("account.currentPassword")} className={inputCls} />
      <input type="password" autoComplete="new-password" required value={next} onChange={e => setNext(e.target.value)} placeholder={t("account.newPassword")} className={inputCls} />
      <input type="password" autoComplete="new-password" required value={rep} onChange={e => setRep(e.target.value)} placeholder={t("account.repeatPassword")} className={inputCls} />
      <p className="text-xs text-gray-400">{t("account.passwordRules")}</p>
      <button disabled={busy} className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium disabled:opacity-50">{busy ? t("common.saving") : t("account.changePassword")}</button>
    </form>
  );
}

function TwoFactorCard({ enabled, onChanged }: { enabled: boolean; onChanged: () => void }) {
  const t = useT();
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function call(method: string, body?: unknown) {
    setBusy(true);
    const res = await fetch("/api/account/2fa", {
      method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { toast.error(json.error ?? t("common.error")); return null; }
    return json;
  }

  return (
    <div className="border border-[#c8d3e8] rounded-xl p-4 space-y-3">
      <h2 className="font-semibold flex items-center gap-2">
        {enabled ? <ShieldCheck className="w-4 h-4 text-emerald-600" /> : <ShieldOff className="w-4 h-4 text-gray-400" />}
        {t("account.twoFactorTitle")}
        <span className={`text-xs font-normal px-2 py-0.5 rounded-full border ${enabled ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}>
          {enabled ? t("account.on") : t("account.off")}
        </span>
      </h2>
      <p className="text-xs text-gray-500">{t("account.twoFactorHint")}</p>

      {enabled ? (
        <form className="space-y-2" onSubmit={async e => { e.preventDefault(); if (await call("DELETE", { password })) { setPassword(""); toast.success(t("account.twoFactorOff")); onChanged(); } }}>
          <input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder={t("account.confirmWithPassword")} className={inputCls} />
          <button disabled={busy} className="px-4 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 disabled:opacity-50">{t("account.disable2fa")}</button>
        </form>
      ) : setup ? (
        <form className="space-y-2" onSubmit={async e => { e.preventDefault(); if (await call("PUT", { code })) { setSetup(null); setCode(""); toast.success(t("account.twoFactorOn")); onChanged(); } }}>
          <ol className="text-xs text-gray-600 list-decimal ml-4 space-y-0.5">
            <li>{t("account.step1")}</li><li>{t("account.step2")}</li><li>{t("account.step3")}</li>
          </ol>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qr} alt="QR" className="w-44 h-44 border rounded-lg" />
          <div className="text-[11px] text-gray-400 break-all">{t("account.manualKey")}: <span className="font-mono text-gray-600">{setup.secret}</span></div>
          <input required inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={e => setCode(e.target.value)}
                 placeholder="123 456" className={`${inputCls} tracking-[0.3em] text-center`} />
          <div className="flex gap-2">
            <button disabled={busy} className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium disabled:opacity-50">{t("account.confirm")}</button>
            <button type="button" onClick={() => setSetup(null)} className="px-4 py-2 rounded-lg border border-[#dde3ef] text-sm">{t("common.cancel")}</button>
          </div>
        </form>
      ) : (
        <button disabled={busy} onClick={async () => { const r = await call("POST"); if (r) setSetup(r); }}
                className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium disabled:opacity-50">{t("account.enable2fa")}</button>
      )}
    </div>
  );
}
