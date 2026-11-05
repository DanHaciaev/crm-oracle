"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, FileUp, Info, MinusCircle, RotateCcw, Upload, XCircle } from "lucide-react";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useT } from "@/lib/locale";
import { fmtDate, inputCls, useFetch, useLang } from "@/components/warehouse/shared";

type Entity = "customers" | "leads" | "payments";
const ALL: Entity[] = ["customers", "leads", "payments"];

interface Parsed { headers: string[]; sample: string[][]; total: number; mapping: Record<string, number>; fields: { key: string; required: boolean }[] }
interface RowResult { row: number; status: "ok" | "skip" | "error"; message: string; label: string }
interface RunResult { dryRun: boolean; total: number; created: number; skipped: number; errors: number; rows: RowResult[]; log_id: number | null }
interface LogRow { id: number; entity: Entity; filename: string; total: number; created: number; skipped: number; errors: number; created_by: string; created_at: string | null; undone_by: string | null; undone_at: string | null }

const STATUS = {
  ok:    { cls: "text-emerald-700", Icon: CheckCircle2 },
  skip:  { cls: "text-gray-500",    Icon: MinusCircle },
  error: { cls: "text-red-600",     Icon: XCircle },
} as const;

async function post(form: FormData) {
  const res = await fetch("/api/import", { method: "POST", body: form });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? "Error");
  return j;
}

// Bulk import from Excel / CSV: upload → map columns → check (dry run on the
// live DB, nothing saved) → load. Existing records are skipped, not changed.
export default function ImportPage() {
  const t = useT();
  const lang = useLang();
  const { data: meta, reload } = useFetch<{ entities: Entity[]; log: LogRow[] }>("/api/import");
  const [picked, setPicked] = useState<Entity | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [check, setCheck] = useState<RunResult | null>(null);
  const [done, setDone] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"all" | "ok" | "skip" | "error">("all");
  const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  const allowed = meta?.entities ?? [];
  const entity = picked && allowed.includes(picked) ? picked : allowed[0] ?? null;

  function reset() { setFile(null); setParsed(null); setMapping({}); setCheck(null); setDone(null); setFilter("all"); }

  function form(action: string, m?: Record<string, number>) {
    const f = new FormData();
    f.append("file", file!); f.append("entity", entity!); f.append("action", action);
    if (m) f.append("mapping", JSON.stringify(m));
    return f;
  }

  async function onFile(f: File | null) {
    reset();
    if (!f || !entity) return;
    setFile(f); setBusy(true);
    try {
      const fd = new FormData(); fd.append("file", f); fd.append("entity", entity); fd.append("action", "parse");
      const p: Parsed = await post(fd);
      setParsed(p); setMapping(p.mapping);
    } catch (e) { toast.error((e as Error).message); setFile(null); }
    finally { setBusy(false); }
  }

  async function runCheck() {
    setBusy(true); setCheck(null);
    try { const r: RunResult = await post(form("check", mapping)); setCheck(r); setFilter(r.errors ? "error" : "all"); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  async function commit() {
    if (!check || !window.confirm(t("imp.confirm").replace("{n}", String(check.created)))) return;
    setBusy(true);
    try {
      const r: RunResult = await post(form("commit", mapping));
      setDone(r); setCheck(null);
      toast.success(t("imp.loaded").replace("{n}", String(r.created)));
      reload();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  async function undo(id: number) {
    if (!window.confirm(t("imp.undoConfirm"))) return;
    const res = await fetch(`/api/import/${id}/undo`, { method: "POST" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(j.error ?? t("common.error")); return; }
    toast.success(t("imp.undone").replace("{n}", String(j.cancelled))); reload();
  }

  const missing = parsed?.fields.filter(f => f.required && mapping[f.key] === undefined) ?? [];
  const result = done ?? check;
  const shown = result?.rows.filter(r => filter === "all" || r.status === filter) ?? [];

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-5">
        <h1 className="text-2xl font-bold flex items-center gap-2"><FileUp className="w-6 h-6 text-brand" />{t("imp.title")}</h1>
        <p className="text-sm text-gray-500 mt-1 flex items-start gap-1.5"><Info className="w-4 h-4 mt-0.5 shrink-0" />{t("imp.subtitle")}</p>
      </div>

      {meta && !entity ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{t("imp.noRights")}</div>
      ) : entity && (
        <>
          <div className="flex flex-wrap gap-1 mb-4 border-b border-[#dde3ef]">
            {ALL.filter(e => allowed.includes(e)).map(e => (
              <button key={e} onClick={() => { setPicked(e); reset(); }}
                      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${entity === e ? "border-brand text-brand" : "border-transparent text-gray-500 hover:text-gray-800"}`}>
                {t(`imp.e_${e}`)}
              </button>
            ))}
          </div>

          <section className="border border-[#c8d3e8] rounded-xl p-4 mb-4 space-y-3">
            <p className="text-sm text-gray-600">{t(`imp.hint_${entity}`)}</p>
            <div className="flex flex-wrap items-center gap-2">
              <label className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium cursor-pointer ${busy ? "opacity-50 pointer-events-none" : ""}`}>
                <Upload className="w-4 h-4" />{file ? t("imp.otherFile") : t("imp.chooseFile")}
                <input type="file" accept=".xlsx,.csv" className="hidden" onChange={e => { onFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
              </label>
              <a href={`${BASE}/api/import/template?entity=${entity}&lang=${lang}`} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-600 text-emerald-700 text-sm font-medium hover:bg-emerald-50">
                <Download className="w-4 h-4" />{t("imp.template")}
              </a>
              {file && <span className="text-sm text-gray-600">{file.name}{parsed && ` · ${parsed.total} ${t("imp.rows")}`}</span>}
              {busy && <span className="text-sm text-gray-400">{t("common.loading")}</span>}
            </div>
          </section>

          {parsed && !done && (
            <section className="border border-[#c8d3e8] rounded-xl p-4 mb-4">
              <h3 className="font-semibold mb-1">{t("imp.mapTitle")}</h3>
              <p className="text-xs text-gray-400 mb-3">{t("imp.mapHint")}</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {parsed.fields.map(f => (
                  <label key={f.key} className="text-sm">
                    <div className="text-gray-600 mb-1">{t(`imp.${entity}_${f.key}`)}{f.required && <span className="text-red-600"> *</span>}</div>
                    <select value={mapping[f.key] ?? ""} className={`${inputCls} w-full py-1.5 ${f.required && mapping[f.key] === undefined ? "border-red-300" : ""}`}
                            onChange={e => { const v = e.target.value; setCheck(null); setMapping(m => { const n = { ...m }; if (v === "") delete n[f.key]; else n[f.key] = Number(v); return n; }); }}>
                      <option value="">— {t("imp.skipColumn")} —</option>
                      {parsed.headers.map((h, i) => <option key={i} value={i}>{h || `${t("imp.column")} ${i + 1}`}</option>)}
                    </select>
                  </label>
                ))}
              </div>

              <div className="mt-4 border border-[#dde3ef] rounded-lg overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>{parsed.headers.map((h, i) => {
                      const f = parsed.fields.find(x => mapping[x.key] === i);
                      return <TableHead key={i} className="whitespace-nowrap">{h}{f && <div className="text-xs font-normal text-brand">→ {t(`imp.${entity}_${f.key}`)}</div>}</TableHead>;
                    })}</TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.sample.map((r, i) => (
                      <TableRow key={i}>{r.map((v, j) => <TableCell key={j} className="text-sm whitespace-nowrap max-w-[220px] truncate">{v}</TableCell>)}</TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button disabled={busy || missing.length > 0} onClick={runCheck} className="px-4 py-2 rounded-lg border border-brand text-brand text-sm font-medium disabled:opacity-50">
                  {t("imp.check")}
                </button>
                {check && check.created > 0 && (
                  <button disabled={busy} onClick={commit} className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium disabled:opacity-50">
                    {t("imp.load").replace("{n}", String(check.created))}
                  </button>
                )}
                {missing.length > 0 && <span className="text-sm text-red-600">{t("imp.mapRequired")}</span>}
              </div>
            </section>
          )}

          {result && (
            <section className="border border-[#c8d3e8] rounded-xl p-4 mb-4">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                {done ? <><CheckCircle2 className="w-5 h-5 text-emerald-600" />{t("imp.doneTitle")}</> : t("imp.checkTitle")}
              </h3>
              {!done && <p className="text-xs text-gray-400 mb-3">{t("imp.checkHint")}</p>}
              <div className="flex flex-wrap gap-2 mb-3 text-sm">
                {(["all", "ok", "skip", "error"] as const).map(k => {
                  const cnt = k === "all" ? result.total : k === "ok" ? result.created : k === "skip" ? result.skipped : result.errors;
                  return (
                    <button key={k} onClick={() => setFilter(k)}
                            className={`px-3 py-1 rounded-full border ${filter === k ? "border-brand bg-brand/10 text-brand" : "border-[#dde3ef] text-gray-600"}`}>
                      {t(`imp.f_${k}${done && k === "ok" ? "_done" : ""}`)}: {cnt}
                    </button>
                  );
                })}
              </div>
              {result.errors > 0 && !done && (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{t("imp.errorsHint")}</span>
                </div>
              )}
              <div className="border border-[#dde3ef] rounded-lg overflow-auto max-h-[50vh]">
                <Table>
                  <TableHeader className="sticky top-0 bg-white z-10">
                    <TableRow><TableHead className="w-16">{t("imp.colRow")}</TableHead><TableHead>{t("imp.colRecord")}</TableHead><TableHead>{t("imp.colResult")}</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {shown.slice(0, 500).map(r => {
                      const c = STATUS[r.status];
                      return (
                        <TableRow key={r.row}>
                          <TableCell className="tabular-nums text-sm text-gray-500">{r.row}</TableCell>
                          <TableCell className="text-sm">{r.label}</TableCell>
                          <TableCell className={`text-sm ${c.cls}`}><span className="inline-flex items-start gap-1.5"><c.Icon className="w-4 h-4 mt-0.5 shrink-0" />{r.message}</span></TableCell>
                        </TableRow>
                      );
                    })}
                    {shown.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-gray-400 py-4">—</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
              {shown.length > 500 && <p className="text-xs text-gray-400 mt-2">{t("imp.first500")}</p>}
              {done && <button onClick={reset} className="mt-3 px-4 py-2 rounded-lg border border-[#dde3ef] text-sm">{t("imp.again")}</button>}
            </section>
          )}

          <section>
            <h3 className="font-semibold mb-2">{t("imp.logTitle")}</h3>
            <div className="border border-[#c8d3e8] rounded-xl overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("imp.colDate")}</TableHead><TableHead>{t("imp.colWhat")}</TableHead><TableHead className="hidden md:table-cell">{t("imp.colFile")}</TableHead>
                    <TableHead className="text-right">{t("imp.f_ok_done")}</TableHead><TableHead className="text-right hidden sm:table-cell">{t("imp.f_skip")}</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">{t("imp.f_error")}</TableHead><TableHead className="hidden lg:table-cell">{t("imp.colWho")}</TableHead><TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(meta?.log ?? []).map(l => (
                    <TableRow key={l.id} className={l.undone_at ? "opacity-50" : ""}>
                      <TableCell className="text-sm whitespace-nowrap">{fmtDate(l.created_at, true)}</TableCell>
                      <TableCell className="text-sm">{t(`imp.e_${l.entity}`)}</TableCell>
                      <TableCell className="text-sm hidden md:table-cell max-w-[240px] truncate">{l.filename}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{l.created}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm hidden sm:table-cell">{l.skipped}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm hidden sm:table-cell">{l.errors}</TableCell>
                      <TableCell className="text-sm hidden lg:table-cell">{l.created_by}</TableCell>
                      <TableCell className="text-sm text-right whitespace-nowrap">
                        {l.undone_at ? <span title={`${l.undone_by} · ${fmtDate(l.undone_at, true)}`}>{t("imp.undoneMark")}</span>
                          : l.entity === "payments" ? <button onClick={() => undo(l.id)} className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-red-600"><RotateCcw className="w-3 h-3" />{t("imp.undo")}</button> : null}
                      </TableCell>
                    </TableRow>
                  ))}
                  {meta && meta.log.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-4">{t("imp.noLog")}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
