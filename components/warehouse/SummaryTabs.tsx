"use client";

import { AlertTriangle, CheckCircle2, OctagonAlert, Info } from "lucide-react";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useT } from "@/lib/locale";
import { Bar, BatchStatus, StatTile, fmtDate, fmtKg, useFetch, type Lang } from "./shared";

// ── Overview ─────────────────────────────────────────────────────────────
interface Overview {
  stock_kg: number; reserved_kg: number; blocked_kg: number; free_kg: number;
  active_batches: number; blocked_batches: number; expired_batches: number; expiring_7d: number;
  warehouses: { id: number; name: string; capacity_kg: number | null; stock_kg: number; batches: number }[];
  items: { id: number; name: string; stock_kg: number; batches: number; avg_age_days: number | null }[];
}

export function OverviewTab({ lang, onOpenBatches }: { lang: Lang; onOpenBatches: (f: Record<string, string>) => void }) {
  const t = useT();
  const { data, error } = useFetch<Overview>(`/api/warehouse/overview?lang=${lang}`);
  if (error) return <div className="text-sm text-red-600">{error}</div>;
  if (!data) return <div className="text-sm text-gray-400">{t("common.loading")}</div>;

  const t1 = (kg: number) => fmtKg(kg / 1000, 1);
  const maxWh = Math.max(...data.warehouses.map(w => w.stock_kg), 1);
  const maxItem = Math.max(...data.items.map(i => i.stock_kg), 1);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatTile label={t("warehouse.stockTotal")} value={t1(data.stock_kg)} unit={t("warehouse.ton")} hint={`${data.active_batches} ${t("warehouse.batchesShort")}`} />
        <StatTile label={t("warehouse.free")} value={t1(data.free_kg)} unit={t("warehouse.ton")} hint={`${t("warehouse.reserved")}: ${t1(data.reserved_kg)} ${t("warehouse.ton")}`} />
        <StatTile label={t("warehouse.blocked")} value={String(data.blocked_batches)} hint={`${t1(data.blocked_kg)} ${t("warehouse.ton")}`} tone={data.blocked_batches ? "bad" : undefined} />
        <StatTile label={t("warehouse.expired")} value={String(data.expired_batches)} hint={`${t("warehouse.expiring7d")}: ${data.expiring_7d}`} tone={data.expired_batches ? "warn" : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="border border-[#c8d3e8] rounded-xl p-4">
          <h3 className="font-semibold mb-1">{t("warehouse.byWarehouse")}</h3>
          <p className="text-xs text-gray-400 mb-3">{t("warehouse.byWarehouseHint")}</p>
          {data.warehouses.map(w => {
            const pct = w.capacity_kg ? Math.round((w.stock_kg / w.capacity_kg) * 100) : null;
            return (
              <button key={w.id} className="w-full text-left hover:bg-gray-50 rounded" onClick={() => onOpenBatches({ warehouse_id: String(w.id) })}>
                <Bar
                  label={w.name}
                  sub={pct != null ? `${t("warehouse.capacity")} ${fmtKg(w.capacity_kg! / 1000, 0)} ${t("warehouse.ton")} · ${pct}%` : undefined}
                  value={w.stock_kg} max={maxWh}
                  valueLabel={`${t1(w.stock_kg)} ${t("warehouse.ton")}`}
                  title={`${w.name}: ${fmtKg(w.stock_kg)} ${t("warehouse.kg")}, ${w.batches} ${t("warehouse.batchesShort")}`}
                />
              </button>
            );
          })}
        </section>

        <section className="border border-[#c8d3e8] rounded-xl p-4">
          <h3 className="font-semibold mb-1">{t("warehouse.byItem")}</h3>
          <p className="text-xs text-gray-400 mb-3">{t("warehouse.byItemHint")}</p>
          {data.items.map(i => (
            <button key={i.id} className="w-full text-left hover:bg-gray-50 rounded" onClick={() => onOpenBatches({ item_id: String(i.id) })}>
              <Bar
                label={i.name}
                sub={i.avg_age_days != null ? `${t("warehouse.avgAge")} ${i.avg_age_days} ${t("warehouse.days")}` : undefined}
                value={i.stock_kg} max={maxItem}
                valueLabel={`${t1(i.stock_kg)} ${t("warehouse.ton")}`}
                title={`${i.name}: ${fmtKg(i.stock_kg)} ${t("warehouse.kg")}, ${i.batches} ${t("warehouse.batchesShort")}`}
              />
            </button>
          ))}
        </section>
      </div>
    </div>
  );
}

// ── Rotation ─────────────────────────────────────────────────────────────
interface Rotation {
  buckets: { key: string; kg: number; batches: number }[];
  items: { id: number; name: string; total_kg: number; max_age: number; kg_by_bucket: Record<string, number> }[];
}

export function RotationTab({ lang }: { lang: Lang }) {
  const t = useT();
  const { data, error } = useFetch<Rotation>(`/api/warehouse/rotation?lang=${lang}`);
  if (error) return <div className="text-sm text-red-600">{error}</div>;
  if (!data) return <div className="text-sm text-gray-400">{t("common.loading")}</div>;
  const max = Math.max(...data.buckets.map(b => b.kg), 1);
  const keys = data.buckets.map(b => b.key);

  return (
    <div className="space-y-6">
      <section className="border border-[#c8d3e8] rounded-xl p-4">
        <h3 className="font-semibold mb-1">{t("warehouse.ageBuckets")}</h3>
        <p className="text-xs text-gray-400 mb-3">{t("warehouse.ageBucketsHint")}</p>
        {data.buckets.map(b => (
          <Bar key={b.key} label={t(`warehouse.bucket_${b.key}`)} value={b.kg} max={max}
               valueLabel={`${fmtKg(b.kg / 1000, 1)} ${t("warehouse.ton")} · ${b.batches}`}
               title={`${fmtKg(b.kg)} ${t("warehouse.kg")}, ${b.batches} ${t("warehouse.batchesShort")}`} />
        ))}
      </section>

      <div className="border border-[#c8d3e8] rounded-xl overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("warehouse.colItem")}</TableHead>
              <TableHead className="text-right">{t("warehouse.maxAge")}</TableHead>
              {keys.map(k => <TableHead key={k} className="text-right whitespace-nowrap">{t(`warehouse.bucket_${k}`)}</TableHead>)}
              <TableHead className="text-right">{t("warehouse.colTotal")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map(i => (
              <TableRow key={i.id}>
                <TableCell className="font-medium">{i.name}</TableCell>
                <TableCell className={`text-right tabular-nums ${i.max_age > 90 ? "text-red-600 font-semibold" : i.max_age > 60 ? "text-amber-600" : ""}`}>
                  {i.max_age} {t("warehouse.days")}
                </TableCell>
                {keys.map(k => <TableCell key={k} className="text-right tabular-nums">{i.kg_by_bucket[k] ? fmtKg(i.kg_by_bucket[k]) : "—"}</TableCell>)}
                <TableCell className="text-right tabular-nums font-medium">{fmtKg(i.total_kg)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ── Control ──────────────────────────────────────────────────────────────
interface Check {
  key: string; severity: "warning" | "serious" | "critical";
  rows: { id: number; batch_number: string; status: string; item_name: string; warehouse_name: string;
          initial_kg: number; current_kg: number; expected_kg: number | null; expiry_date: string | null }[];
}

const SEVERITY = {
  warning:  { Icon: AlertTriangle, cls: "text-amber-600" },
  serious:  { Icon: OctagonAlert,  cls: "text-orange-600" },
  critical: { Icon: OctagonAlert,  cls: "text-red-600" },
};

export function ControlTab({ lang, onOpenBatch }: { lang: Lang; onOpenBatch: (id: number) => void }) {
  const t = useT();
  const { data, error } = useFetch<Check[]>(`/api/warehouse/control?lang=${lang}`);
  if (error) return <div className="text-sm text-red-600">{error}</div>;
  if (!data) return <div className="text-sm text-gray-400">{t("common.loading")}</div>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 flex items-start gap-2"><Info className="w-4 h-4 mt-0.5 shrink-0" />{t("warehouse.controlHint")}</p>
      {data.map(c => {
        const ok = c.rows.length === 0;
        const S = SEVERITY[c.severity];
        return (
          <section key={c.key} className="border border-[#c8d3e8] rounded-xl">
            <div className="flex items-start gap-3 p-4">
              {ok ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> : <S.Icon className={`w-5 h-5 shrink-0 ${S.cls}`} />}
              <div className="flex-1">
                <div className="font-semibold">
                  {t(`warehouse.check_${c.key}`)}
                  <span className={`ml-2 text-sm font-normal ${ok ? "text-emerald-600" : S.cls}`}>
                    {ok ? t("warehouse.checkOk") : `${c.rows.length} ${t("warehouse.batchesShort")}`}
                  </span>
                </div>
                <div className="text-sm text-gray-500">{t(`warehouse.check_${c.key}_desc`)}</div>
              </div>
            </div>
            {!ok && (
              <div className="border-t border-[#dde3ef] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("warehouse.colBatch")}</TableHead>
                      <TableHead>{t("warehouse.colItem")}</TableHead>
                      <TableHead className="hidden md:table-cell">{t("warehouse.colWarehouse")}</TableHead>
                      <TableHead>{t("warehouse.colStatus")}</TableHead>
                      <TableHead className="text-right">{t("warehouse.colCurrent")}</TableHead>
                      {c.key === "mismatch" && <TableHead className="text-right">{t("warehouse.colExpected")}</TableHead>}
                      {c.key === "mismatch" && <TableHead className="text-right">{t("warehouse.colDiff")}</TableHead>}
                      {c.key === "expired" && <TableHead>{t("warehouse.colExpiry")}</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {c.rows.map(r => (
                      <TableRow key={r.id} className="cursor-pointer" onClick={() => onOpenBatch(r.id)}>
                        <TableCell className="font-mono text-sm text-brand">{r.batch_number}</TableCell>
                        <TableCell>{r.item_name}</TableCell>
                        <TableCell className="hidden md:table-cell">{r.warehouse_name || "—"}</TableCell>
                        <TableCell><BatchStatus status={r.status} /></TableCell>
                        <TableCell className="text-right tabular-nums">{fmtKg(r.current_kg, 1)}</TableCell>
                        {c.key === "mismatch" && <TableCell className="text-right tabular-nums">{fmtKg(r.expected_kg, 1)}</TableCell>}
                        {c.key === "mismatch" && (
                          <TableCell className="text-right tabular-nums font-semibold">
                            {fmtKg((r.current_kg ?? 0) - (r.expected_kg ?? 0), 1)}
                          </TableCell>
                        )}
                        {c.key === "expired" && <TableCell>{fmtDate(r.expiry_date)}</TableCell>}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
