"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, Info, Printer, ShieldCheck, XCircle } from "lucide-react";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useT } from "@/lib/locale";
import { useUrlParam } from "@/hooks/useUrlParam";
import { Select, StatTile, fmtDate, fmtKg, inputCls, useFetch, useLang } from "@/components/warehouse/shared";

const TABS = ["checks", "haccp", "blocks"] as const;
type Tab = (typeof TABS)[number];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function ResultBadge({ result }: { result: string }) {
  const t = useT();
  const cfg: Record<string, { cls: string; Icon: typeof Clock }> = {
    pass:        { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
    conditional: { cls: "bg-amber-50 text-amber-700 border-amber-200", Icon: AlertTriangle },
    fail:        { cls: "bg-red-50 text-red-700 border-red-200", Icon: XCircle },
  };
  const c = cfg[result] ?? cfg.conditional;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs whitespace-nowrap ${c.cls}`}>
      <c.Icon className="w-3 h-3" />{t(`qual.res_${result}`)}
    </span>
  );
}

const kv = (label: string, value: React.ReactNode) => (
  <div className="flex justify-between gap-3 py-1 border-b border-gray-100 text-sm">
    <span className="text-gray-500">{label}</span><span className="text-right font-medium">{value}</span>
  </div>
);

// Quality: QA checks, HACCP measurements and batch blocks from DIPP FRUICT —
// read-only, the CRM lists, inspects and prints them.
export default function QualityPage() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("checks");
  useUrlParam("tab", v => { if ((TABS as readonly string[]).includes(v)) setTab(v as Tab); });

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck className="w-6 h-6 text-brand" />{t("qual.title")}</h1>
        <p className="text-sm text-gray-500 mt-1 flex items-start gap-1.5"><Info className="w-4 h-4 mt-0.5 shrink-0" />{t("qual.subtitle")}</p>
      </div>
      <div className="flex gap-1 mb-4 border-b border-[#dde3ef] overflow-x-auto">
        {TABS.map(k => (
          <button key={k} onClick={() => setTab(k)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition whitespace-nowrap ${tab === k ? "border-brand text-brand" : "border-transparent text-gray-500 hover:text-gray-800"}`}>
            {t(`qual.tab_${k}`)}
          </button>
        ))}
      </div>
      {tab === "checks" && <ChecksTab />}
      {tab === "haccp" && <HaccpTab />}
      {tab === "blocks" && <BlocksTab />}
    </div>
  );
}

// ── QA checks (DIPP FRUICT, read-only) ───────────────────────────────────

interface Check { id: number; date: string | null; result: string; inspector: string; notes: string; checklist: string; checklist_type: string; batch_id: number | null; batch_number: string; item: string; fails: number }
interface CheckDetail extends Omit<Check, "fails"> { batch_status: string; values: { id: number; name: string; value: string; ok: boolean; critical: boolean; min: number | null; max: number | null }[] }

function ChecksTab() {
  const t = useT();
  const lang = useLang();
  const today = new Date();
  const [dateFrom, setDateFrom] = useState(iso(new Date(today.getFullYear(), 0, 1)));
  const [dateTo, setDateTo] = useState(iso(today));
  const [result, setResult] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const sp = new URLSearchParams({ lang });
  if (dateFrom) sp.set("date_from", dateFrom);
  if (dateTo) sp.set("date_to", dateTo);
  if (result) sp.set("result", result);
  if (q.trim()) sp.set("q", q.trim());
  const { data, error } = useFetch<{ rows: Check[]; totals: { count: number; pass: number; conditional: number; fail: number } }>(`/api/quality/checks?${sp.toString()}`);

  return (
    <div className="space-y-4">
      <ReadOnlyNote text={t("qual.checksNote")} />
      {data && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <StatTile label={t("qual.checksCount")} value={String(data.totals.count)} />
          <StatTile label={t("qual.res_pass")} value={String(data.totals.pass)} />
          <StatTile label={t("qual.res_conditional")} value={String(data.totals.conditional)} tone={data.totals.conditional ? "warn" : undefined} />
          <StatTile label={t("qual.res_fail")} value={String(data.totals.fail)} tone={data.totals.fail ? "bad" : undefined} />
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} />
        <Select value={result} onChange={setResult} all={t("qual.allResults")}
                options={["pass", "conditional", "fail"].map(r => ({ value: r, label: t(`qual.res_${r}`) }))} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={t("qual.searchChecks")} className={`${inputCls} w-full sm:w-56`} />
      </div>
      <div className="border border-[#c8d3e8] rounded-xl overflow-auto max-h-[60vh]">
        <Table>
          <TableHeader className="sticky top-0 bg-white z-10">
            <TableRow>
              <TableHead>{t("qual.colDate")}</TableHead>
              <TableHead>{t("qual.batch")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("qual.checklist")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("qual.inspector")}</TableHead>
              <TableHead className="hidden sm:table-cell text-right">{t("qual.fails")}</TableHead>
              <TableHead>{t("qual.result")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow><TableCell colSpan={6} className="text-center text-red-500 py-6">{error}</TableCell></TableRow>
            ) : !data ? (
              <TableRow><TableCell colSpan={6} className="text-center text-gray-400 py-6">{t("common.loading")}</TableCell></TableRow>
            ) : data.rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-gray-400 py-6">{t("qual.emptyChecks")}</TableCell></TableRow>
            ) : data.rows.map(c => (
              <TableRow key={c.id} className="cursor-pointer" onClick={() => setOpen(c.id)}>
                <TableCell className="text-sm whitespace-nowrap">{fmtDate(c.date)}</TableCell>
                <TableCell className="text-sm"><span className="font-mono">{c.batch_number || "—"}</span><div className="text-xs text-gray-500">{c.item}</div></TableCell>
                <TableCell className="hidden md:table-cell text-sm">{c.checklist}</TableCell>
                <TableCell className="hidden lg:table-cell text-sm">{c.inspector || "—"}</TableCell>
                <TableCell className="hidden sm:table-cell text-right tabular-nums">{c.fails}</TableCell>
                <TableCell><ResultBadge result={c.result} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <CheckSheet id={open} lang={lang} onClose={() => setOpen(null)} />
    </div>
  );
}

function CheckSheet({ id, lang, onClose }: { id: number | null; lang: string; onClose: () => void }) {
  const t = useT();
  const { data, error } = useFetch<CheckDetail>(id ? `/api/quality/checks/${id}?lang=${lang}` : null);
  const d = data && data.id === id ? data : null;
  const limits = (v: { min: number | null; max: number | null }) =>
    v.min != null && v.max != null ? `${v.min} … ${v.max}` : v.min != null ? `≥ ${v.min}` : v.max != null ? `≤ ${v.max}` : "";
  return (
    <Sheet open={id != null} onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader><SheetTitle>{d ? `${d.checklist} · ${fmtDate(d.date)}` : "…"}</SheetTitle></SheetHeader>
        <div className="px-4 pb-6 space-y-5">
          {error && <div className="text-sm text-red-600">{error}</div>}
          {!d && !error && <div className="text-sm text-gray-400">{t("common.loading")}</div>}
          {d && <>
            <div className="flex items-center gap-2 flex-wrap">
              <ResultBadge result={d.result} />
              <Link href={`/documents/print/${d.checklist_type === "gmp" ? "gmp_checklist" : "qa_protocol"}?id=${d.id}`} target="_blank"
                    className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#dde3ef] text-sm hover:bg-gray-50">
                <Printer className="w-4 h-4" />{t("qual.printProtocol")}
              </Link>
            </div>
            <div>
              {kv(t("qual.batch"), d.batch_id ? <Link href={`/warehouse?batch=${d.batch_id}`} className="text-brand hover:underline font-mono">{d.batch_number}</Link> : "—")}
              {kv(t("qual.item"), d.item || "—")}
              {kv(t("qual.inspector"), d.inspector || "—")}
              {d.notes && kv(t("common.notes"), d.notes)}
            </div>
            <section>
              <h4 className="font-semibold text-sm mb-2">{t("qual.parameters")}</h4>
              {d.values.map(v => (
                <div key={v.id} className="flex justify-between gap-2 text-sm border-b border-gray-100 py-1.5">
                  <span>{v.name}{v.critical && <span className="ml-1 text-xs text-red-600">{t("qual.critical")}</span>}
                    {limits(v) && <div className="text-xs text-gray-400">{t("qual.norm")}: {limits(v)}</div>}</span>
                  <span className={`text-right tabular-nums inline-flex items-center gap-1 ${v.ok ? "" : "text-red-700 font-medium"}`}>
                    {v.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <XCircle className="w-3.5 h-3.5" />}{v.value || "—"}
                  </span>
                </div>
              ))}
            </section>
          </>}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── HACCP (DIPP FRUICT, read-only) ───────────────────────────────────────

interface HaccpRecord { id: number; ccp_id: number; ccp_number: string; hazard: string; value: number | null; min: number | null; max: number | null; ok: boolean; deviation: string; action: string; by: string; at: string | null; batch_id: number | null; batch_number: string }
interface Haccp {
  plans: { id: number; code: string; name: string; stage: string; active: boolean; ccps: { id: number; number: string; hazard_type: string; hazard: string; min: number | null; max: number | null; frequency: string; corrective: string; last: HaccpRecord | null }[] }[];
  records: HaccpRecord[]; totals: { records: number; deviations: number };
}

function HaccpTab() {
  const t = useT();
  const lang = useLang();
  const today = new Date();
  const [dateFrom, setDateFrom] = useState(iso(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [dateTo, setDateTo] = useState(iso(today));
  const [onlyDev, setOnlyDev] = useState(false);
  const sp = new URLSearchParams({ lang });
  if (dateFrom) sp.set("date_from", dateFrom);
  if (dateTo) sp.set("date_to", dateTo);
  if (onlyDev) sp.set("deviations", "1");
  const { data, error } = useFetch<Haccp>(`/api/quality/haccp?${sp.toString()}`);
  const range = (min: number | null, max: number | null) => `${min ?? "—"} … ${max ?? "—"}`;
  const report = new URLSearchParams({ lang });
  if (dateFrom) report.set("date_from", dateFrom);
  if (dateTo) report.set("date_to", dateTo);

  return (
    <div className="space-y-4">
      <ReadOnlyNote text={t("qual.haccpNote")} />
      {error && <div className="text-sm text-red-600">{error}</div>}
      {!data && !error && <div className="text-sm text-gray-400">{t("common.loading")}</div>}
      {data?.plans.map(p => (
        <section key={p.id} className="border border-[#c8d3e8] rounded-xl p-4">
          <h3 className="font-semibold">{p.name} <span className="text-xs font-mono text-gray-400">{p.code}</span>{!p.active && <span className="ml-2 text-xs text-gray-400">({t("qual.inactive")})</span>}</h3>
          {p.ccps.length === 0 ? <p className="text-sm text-gray-400 mt-2">{t("qual.noCcps")}</p> : (
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {p.ccps.map(c => (
                <div key={c.id} className="rounded-lg border border-[#dde3ef] p-3 text-sm">
                  <div className="flex justify-between gap-2"><span className="font-mono font-medium">{c.number}</span><span className="text-xs text-gray-500">{t(`qual.hz_${c.hazard_type}`)}</span></div>
                  <div className="mt-1">{c.hazard}</div>
                  <div className="text-xs text-gray-500 mt-1">{t("qual.limits")}: <span className="tabular-nums">{range(c.min, c.max)}</span> · {c.frequency}</div>
                  <div className="text-xs mt-1">
                    {c.last ? (
                      <span className={c.last.ok ? "text-emerald-700" : "text-red-700 font-medium"}>
                        {t("qual.lastMeasure")}: {c.last.value ?? "—"} · {fmtDate(c.last.at, true)}
                      </span>
                    ) : <span className="text-gray-400">{t("qual.noMeasures")}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} />
        <label className="flex items-center gap-2 text-sm text-gray-600 px-2">
          <input type="checkbox" checked={onlyDev} onChange={e => setOnlyDev(e.target.checked)} />{t("qual.onlyDeviations")}
        </label>
        {data && <span className="text-sm text-gray-500">{t("qual.measures")}: {data.totals.records} · {t("qual.deviations")}: <b className={data.totals.deviations ? "text-red-700" : ""}>{data.totals.deviations}</b></span>}
        <Link href={`/documents/print/haccp_report?${report.toString()}`} target="_blank"
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#dde3ef] text-sm hover:bg-gray-50">
          <Printer className="w-4 h-4" />{t("qual.printHaccp")}
        </Link>
      </div>
      <div className="border border-[#c8d3e8] rounded-xl overflow-auto max-h-[60vh]">
        <Table>
          <TableHeader className="sticky top-0 bg-white z-10">
            <TableRow>
              <TableHead>{t("qual.colDate")}</TableHead>
              <TableHead>CCP</TableHead>
              <TableHead className="text-right">{t("qual.value")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("qual.limits")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("qual.batch")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("qual.actionTaken")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("qual.recordedBy")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!data ? null : data.records.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-gray-400 py-6">{t("qual.emptyHaccp")}</TableCell></TableRow>
            ) : data.records.map(r => (
              <TableRow key={r.id} className={r.ok ? "" : "bg-red-50/60"}>
                <TableCell className="text-sm whitespace-nowrap">{fmtDate(r.at, true)}</TableCell>
                <TableCell className="text-sm"><span className="font-mono">{r.ccp_number}</span><div className="text-xs text-gray-500">{r.hazard}</div></TableCell>
                <TableCell className={`text-right tabular-nums ${r.ok ? "" : "text-red-700 font-medium"}`}>
                  <span className="inline-flex items-center gap-1">{!r.ok && <AlertTriangle className="w-3.5 h-3.5" />}{r.value ?? "—"}</span>
                </TableCell>
                <TableCell className="hidden md:table-cell text-sm tabular-nums">{range(r.min, r.max)}</TableCell>
                <TableCell className="hidden md:table-cell text-sm font-mono">{r.batch_id ? <Link href={`/warehouse?batch=${r.batch_id}`} className="text-brand hover:underline">{r.batch_number}</Link> : "—"}</TableCell>
                <TableCell className="hidden lg:table-cell text-sm text-gray-600">{[r.deviation, r.action].filter(Boolean).join(" → ") || "—"}</TableCell>
                <TableCell className="hidden sm:table-cell text-sm">{r.by || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ── Blocked batches ──────────────────────────────────────────────────────

function BlocksTab() {
  const t = useT();
  const lang = useLang();
  const { data, error } = useFetch<{ id: number; batch_number: string; qty_kg: number; item: string; warehouse: string; blocked_by: string; reason: string; blocked_at: string | null }[]>(`/api/quality/blocks?lang=${lang}`);
  return (
    <div className="space-y-4">
      <ReadOnlyNote text={t("qual.blocksNote")} />
      <div className="border border-[#c8d3e8] rounded-xl overflow-auto max-h-[60vh]">
        <Table>
          <TableHeader className="sticky top-0 bg-white z-10">
            <TableRow>
              <TableHead>{t("qual.batch")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("warehouse.colWarehouse")}</TableHead>
              <TableHead className="text-right">{t("qual.qtyKg")}</TableHead>
              <TableHead>{t("qual.blockReason")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("qual.blockedBy")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow><TableCell colSpan={5} className="text-center text-red-500 py-6">{error}</TableCell></TableRow>
            ) : !data ? (
              <TableRow><TableCell colSpan={5} className="text-center text-gray-400 py-6">{t("common.loading")}</TableCell></TableRow>
            ) : data.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-gray-400 py-6">{t("qual.emptyBlocks")}</TableCell></TableRow>
            ) : data.map(b => (
              <TableRow key={b.id}>
                <TableCell className="text-sm"><Link href={`/warehouse?batch=${b.id}`} className="font-mono text-brand hover:underline">{b.batch_number}</Link><div className="text-xs text-gray-500">{b.item}</div></TableCell>
                <TableCell className="hidden md:table-cell text-sm">{b.warehouse || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtKg(b.qty_kg, 1)}</TableCell>
                <TableCell className="text-sm text-gray-700">{b.reason || "—"}</TableCell>
                <TableCell className="hidden lg:table-cell text-sm">{b.blocked_by || "—"}{b.blocked_at && <div className="text-xs text-gray-400">{fmtDate(b.blocked_at, true)}</div>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ReadOnlyNote({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-[#dde3ef] bg-gray-50 p-3 text-sm text-gray-600">
      <Info className="w-4 h-4 mt-0.5 shrink-0" /><span>{text}</span>
    </div>
  );
}
