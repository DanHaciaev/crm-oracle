// Batch profitability: what each batch was bought for vs what it was sold
// for. Revenue = shipped kg (AGRO_BATCH_ALLOCATIONS of shipped/delivered/
// closed sales) × that sales line's MDL price; cost = the same kg × the
// purchase line's MDL cost per kg (LINE_TOTAL_MDL / NET_WEIGHT_KG).
//
// Many purchases have no price entered yet (DIPP FRUICT lets the price be set
// later). Those batches get no cost and are NOT treated as free: margin is
// only computed where the cost is known, and `coverage` says how much of the
// revenue that is. No estimated / averaged costs are substituted.
import { query } from "@/lib/oracle";
import { pickName, type Lang } from "@/lib/documents/common";

type Row = Record<string, unknown>;
const n = (v: unknown) => (v == null ? 0 : Number(v));
const s = (v: unknown) => (v == null ? "" : String(v));

export interface ProfitFilters {
  date_from: string | null; date_to: string | null;
  warehouse_id: number | null; item_id: number | null;
  supplier_id: number | null; customer_id: number | null;
}

export function parseProfitFilters(sp: URLSearchParams): ProfitFilters {
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const d = (k: string) => { const v = sp.get(k) ?? ""; return ISO.test(v) ? v : null; };
  const id = (k: string) => { const v = Number(sp.get(k)); return v > 0 ? v : null; };
  return {
    date_from: d("date_from"), date_to: d("date_to"),
    warehouse_id: id("warehouse_id"), item_id: id("item_id"),
    supplier_id: id("supplier_id"), customer_id: id("customer_id"),
  };
}

// One row per (batch, customer) — everything else is aggregated from it.
async function rawRows(f: ProfitFilters, lang: Lang) {
  // 'returned' sales are included and their returns subtracted below: a full
  // return nets to zero, a partial one leaves what the customer kept.
  const where: string[] = ["sd.STATUS IN ('shipped','delivered','closed','returned')"];
  const binds: Record<string, string | number> = {};
  if (f.date_from)    { where.push("sd.DOC_DATE >= TO_DATE(:dfrom, 'YYYY-MM-DD')"); binds.dfrom = f.date_from; }
  if (f.date_to)      { where.push("sd.DOC_DATE < TO_DATE(:dto, 'YYYY-MM-DD') + 1"); binds.dto = f.date_to; }
  if (f.warehouse_id) { where.push("b.WAREHOUSE_ID = :wh");  binds.wh = f.warehouse_id; }
  if (f.item_id)      { where.push("b.ITEM_ID = :item");     binds.item = f.item_id; }
  if (f.supplier_id)  { where.push("pd.SUPPLIER_ID = :sup"); binds.sup = f.supplier_id; }
  if (f.customer_id)  { where.push("sd.CUSTOMER_ID = :cust"); binds.cust = f.customer_id; }

  const rows = await query<Row>(`
    SELECT b.ID AS BATCH_ID, b.BATCH_NUMBER, b.SOURCE_TYPE,
           i.ID AS ITEM_ID, i.NAME_RO AS ITEM_NAME_RO, i.NAME_RU AS ITEM_NAME_RU,
           w.NAME AS WAREHOUSE_NAME,
           pd.ID AS PURCHASE_ID, pd.DOC_NUMBER AS PURCHASE_DOC, pd.DOC_DATE AS PURCHASE_DATE, pd.IS_OWN_PRODUCTION,
           s.ID AS SUPPLIER_ID, s.NAME AS SUPPLIER_NAME,
           CASE WHEN pl.NET_WEIGHT_KG > 0 AND pl.LINE_TOTAL_MDL > 0 THEN pl.LINE_TOTAL_MDL / pl.NET_WEIGHT_KG END AS COST_PER_KG,
           c.ID AS CUSTOMER_ID, c.NAME AS CUSTOMER_NAME,
           SUM(a.ALLOCATED_QTY_KG) AS SOLD_KG,
           SUM(a.ALLOCATED_QTY_KG * NVL(sl.AMOUNT_MDL, 0) / NULLIF(sl.NET_WEIGHT_KG, 0)) AS REVENUE,
           COUNT(DISTINCT sd.ID) AS SALES_COUNT
    FROM AGRO_BATCH_ALLOCATIONS a
    JOIN AGRO_SALES_LINES sl ON sl.ID = a.SALES_LINE_ID
    JOIN AGRO_SALES_DOCS  sd ON sd.ID = sl.SALES_DOC_ID
    JOIN AGRO_BATCHES     b  ON b.ID  = a.BATCH_ID
    LEFT JOIN AGRO_ITEMS          i  ON i.ID  = b.ITEM_ID
    LEFT JOIN AGRO_WAREHOUSES     w  ON w.ID  = b.WAREHOUSE_ID
    LEFT JOIN AGRO_PURCHASE_LINES pl ON pl.ID = b.PURCHASE_LINE_ID
    LEFT JOIN AGRO_PURCHASE_DOCS  pd ON pd.ID = pl.PURCHASE_DOC_ID
    LEFT JOIN AGRO_SUPPLIERS      s  ON s.ID  = pd.SUPPLIER_ID
    LEFT JOIN AGRO_CUSTOMERS      c  ON c.ID  = sd.CUSTOMER_ID
    WHERE ${where.join(" AND ")}
    GROUP BY b.ID, b.BATCH_NUMBER, b.SOURCE_TYPE, i.ID, i.NAME_RO, i.NAME_RU, w.NAME,
             pd.ID, pd.DOC_NUMBER, pd.DOC_DATE, pd.IS_OWN_PRODUCTION, s.ID, s.NAME,
             pl.NET_WEIGHT_KG, pl.LINE_TOTAL_MDL, c.ID, c.NAME
  `, binds);

  // Returns of shipped goods leave AGRO_BATCH_ALLOCATIONS untouched (it's the
  // shipment's historical record), so the returned kg / revenue is taken off
  // here — same filters, active (not cancelled) returns only.
  const returned = await query<Row>(`
    SELECT rl.BATCH_ID, sd.CUSTOMER_ID,
           SUM(rl.QTY_KG) AS RET_KG,
           SUM(rl.QTY_KG * NVL(sl.AMOUNT_MDL, 0) / NULLIF(sl.NET_WEIGHT_KG, 0)) AS RET_REVENUE
    FROM AGRO_SALES_RETURN_LINES rl
    JOIN AGRO_SALES_RETURNS r ON r.ID = rl.RETURN_ID AND NVL(r.STATUS, 'active') <> 'cancelled'
    JOIN AGRO_SALES_LINES sl ON sl.ID = rl.SALES_LINE_ID
    JOIN AGRO_SALES_DOCS  sd ON sd.ID = sl.SALES_DOC_ID
    JOIN AGRO_BATCHES     b  ON b.ID  = rl.BATCH_ID
    LEFT JOIN AGRO_PURCHASE_LINES pl ON pl.ID = b.PURCHASE_LINE_ID
    LEFT JOIN AGRO_PURCHASE_DOCS  pd ON pd.ID = pl.PURCHASE_DOC_ID
    WHERE ${where.join(" AND ")}
    GROUP BY rl.BATCH_ID, sd.CUSTOMER_ID
  `, binds);
  const retKey = (batch: unknown, cust: unknown) => `${n(batch)}|${n(cust)}`;
  const ret = new Map(returned.map(r => [retKey(r.BATCH_ID, r.CUSTOMER_ID), { kg: n(r.RET_KG), revenue: n(r.RET_REVENUE) }]));

  return rows.map(r => {
    const costPerKg = r.COST_PER_KG != null ? n(r.COST_PER_KG) : null;
    const back = ret.get(retKey(r.BATCH_ID, r.CUSTOMER_ID));
    const sold = Math.max(0, n(r.SOLD_KG) - (back?.kg ?? 0));
    const revenue = Math.max(0, n(r.REVENUE) - (back?.revenue ?? 0));
    return {
      batch_id: n(r.BATCH_ID), batch_number: s(r.BATCH_NUMBER),
      // A batch not created from a purchase (inventory surplus, return).
      origin: r.PURCHASE_ID ? (r.IS_OWN_PRODUCTION === "Y" ? "own" : "purchase") : "other",
      item_id: n(r.ITEM_ID), item_name: pickName(lang, r.ITEM_NAME_RO, r.ITEM_NAME_RU),
      warehouse_name: s(r.WAREHOUSE_NAME),
      purchase_id: r.PURCHASE_ID ? n(r.PURCHASE_ID) : null, purchase_doc: s(r.PURCHASE_DOC),
      purchase_date: r.PURCHASE_DATE instanceof Date ? r.PURCHASE_DATE.toISOString() : null,
      supplier_id: r.SUPPLIER_ID ? n(r.SUPPLIER_ID) : null, supplier_name: s(r.SUPPLIER_NAME),
      customer_id: r.CUSTOMER_ID ? n(r.CUSTOMER_ID) : null, customer_name: s(r.CUSTOMER_NAME),
      cost_per_kg: costPerKg, sold_kg: sold, revenue, sales_count: n(r.SALES_COUNT),
      cost: costPerKg != null ? sold * costPerKg : null,
    };
  });
}

export interface Agg {
  key: string; label: string; sub?: string;
  sold_kg: number; revenue: number;
  costed_kg: number; costed_revenue: number; cost: number;
  margin: number | null; margin_pct: number | null; coverage: number | null;
  sales_count?: number; cost_per_kg?: number | null; avg_price?: number | null; origin?: string;
  href?: string;
}

function aggregate<T extends Awaited<ReturnType<typeof rawRows>>[number]>(
  rows: T[], keyOf: (r: T) => string, labelOf: (r: T) => { label: string; sub?: string; href?: string },
): Agg[] {
  const map = new Map<string, Agg>();
  for (const r of rows) {
    const k = keyOf(r);
    let a = map.get(k);
    if (!a) {
      a = { key: k, ...labelOf(r), sold_kg: 0, revenue: 0, costed_kg: 0, costed_revenue: 0, cost: 0,
            margin: null, margin_pct: null, coverage: null, sales_count: 0 };
      map.set(k, a);
    }
    a.sold_kg += r.sold_kg; a.revenue += r.revenue; a.sales_count! += r.sales_count;
    if (r.cost != null) { a.costed_kg += r.sold_kg; a.costed_revenue += r.revenue; a.cost += r.cost; }
  }
  return [...map.values()].map(finish).sort((x, y) => y.revenue - x.revenue);
}

function finish(a: Agg): Agg {
  const has = a.costed_revenue > 0 || a.cost > 0;
  a.margin = has ? a.costed_revenue - a.cost : null;
  a.margin_pct = has && a.costed_revenue > 0 ? ((a.costed_revenue - a.cost) / a.costed_revenue) * 100 : null;
  a.coverage = a.revenue > 0 ? (a.costed_revenue / a.revenue) * 100 : null;
  a.avg_price = a.sold_kg > 0 ? a.revenue / a.sold_kg : null;
  return a;
}

export async function profitability(f: ProfitFilters, lang: Lang) {
  const rows = await rawRows(f, lang);

  const batches = aggregate(rows, r => String(r.batch_id), r => ({
    label: r.batch_number, sub: [r.item_name, r.supplier_name].filter(Boolean).join(" · "), href: `/warehouse?batch=${r.batch_id}`,
  })).map(a => {
    const r = rows.find(x => String(x.batch_id) === a.key)!;
    return { ...a, cost_per_kg: r.cost_per_kg, origin: r.origin };
  });

  const totals = finish(rows.reduce<Agg>((t, r) => {
    t.sold_kg += r.sold_kg; t.revenue += r.revenue; t.sales_count! += r.sales_count;
    if (r.cost != null) { t.costed_kg += r.sold_kg; t.costed_revenue += r.revenue; t.cost += r.cost; }
    return t;
  }, { key: "total", label: "", sold_kg: 0, revenue: 0, costed_kg: 0, costed_revenue: 0, cost: 0,
       margin: null, margin_pct: null, coverage: null, sales_count: 0 }));

  // Sold purchases still without a price — what to fill in (in DIPP FRUICT)
  // to make the report complete. Own production is listed separately.
  const unpricedMap = new Map<number, { purchase_id: number; purchase_doc: string; purchase_date: string | null;
                                        supplier_name: string; origin: string; sold_kg: number; revenue: number; batches: number }>();
  for (const r of rows) {
    if (r.cost != null || !r.purchase_id) continue;
    const u = unpricedMap.get(r.purchase_id) ?? { purchase_id: r.purchase_id, purchase_doc: r.purchase_doc, purchase_date: r.purchase_date,
                                                  supplier_name: r.supplier_name, origin: r.origin, sold_kg: 0, revenue: 0, batches: 0 };
    u.sold_kg += r.sold_kg; u.revenue += r.revenue; u.batches += 1;
    unpricedMap.set(r.purchase_id, u);
  }
  const otherOrigin = rows.filter(r => r.origin === "other").reduce((a, r) => a + r.revenue, 0);

  return {
    totals,
    by_item:     aggregate(rows, r => String(r.item_id), r => ({ label: r.item_name })),
    by_supplier: aggregate(rows, r => String(r.supplier_id ?? 0), r => ({
      label: r.supplier_name || "—", href: r.supplier_id ? `/suppliers/${r.supplier_id}` : undefined })),
    by_customer: aggregate(rows, r => String(r.customer_id ?? 0), r => ({
      label: r.customer_name || "—", href: r.customer_id ? `/customers/${r.customer_id}` : undefined })),
    by_batch: batches,
    unpriced: [...unpricedMap.values()].sort((a, b) => b.revenue - a.revenue),
    other_origin_revenue: otherOrigin,
  };
}

// Flat per-batch rows for the Excel export (reports registry).
export async function profitabilityRows(f: ProfitFilters, lang: Lang) {
  const { by_batch } = await profitability(f, lang);
  return by_batch.map(b => ({
    batch_number: b.label, item_supplier: b.sub ?? "", origin: b.origin ?? "",
    sold_kg: b.sold_kg, revenue: b.revenue, cost_per_kg: b.cost_per_kg ?? null,
    cost: b.cost_per_kg != null ? b.cost : null, margin: b.margin, margin_pct: b.margin_pct,
  }));
}
