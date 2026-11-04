import { query } from "@/lib/oracle";
import { Row, Lang, s, n, fmtDate, pickName, getCompany } from "./common";

export interface PeriodParams { date_from: string; date_to: string; warehouse_id: number | null }

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// Default period: from the 1st of the current month to today.
export function parsePeriod(sp: URLSearchParams): PeriodParams {
  const today = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const from = sp.get("date_from") ?? "";
  const to   = sp.get("date_to") ?? "";
  const wh   = Number(sp.get("warehouse_id"));
  return {
    date_from:    ISO.test(from) ? from : iso(new Date(today.getFullYear(), today.getMonth(), 1)),
    date_to:      ISO.test(to)   ? to   : iso(today),
    warehouse_id: wh > 0 ? wh : null,
  };
}

// ── Bilanț de masă (mass balance) ────────────────────────────────────────
// DIPP FRUICT only had the template (its report_mass_balance reads the
// all-time AGRO_V_MASS_BALANCE view, no period). Here the balance is built
// from AGRO_STOCK_MOVEMENTS for the chosen period:
//   in    = receipt + return + adjustment (inventory surplus)
//   out   = shipment
//   waste = processing,  loss = loss
// Transfers only count when filtering by warehouse (out of one, into the
// other); company-wide they net to zero.
export async function massBalance(p: PeriodParams, lang: Lang) {
  const binds = { dfrom: p.date_from, dto: p.date_to, wh: p.warehouse_id };
  const [rows, whRows, company] = await Promise.all([
    query<Row>(`
      WITH mv AS (
        SELECT b.ITEM_ID, sm.MOVEMENT_TYPE, NVL(sm.QTY_KG, 0) AS QTY, sm.CREATED_AT,
               NVL(sm.FROM_WAREHOUSE_ID, b.WAREHOUSE_ID) AS FROM_WH,
               NVL(sm.TO_WAREHOUSE_ID,   b.WAREHOUSE_ID) AS TO_WH
        FROM AGRO_STOCK_MOVEMENTS sm
        JOIN AGRO_BATCHES b ON b.ID = sm.BATCH_ID
        WHERE sm.CREATED_AT < TO_DATE(:dto, 'YYYY-MM-DD') + 1
      ),
      sg AS (
        SELECT ITEM_ID, CREATED_AT,
               CASE WHEN MOVEMENT_TYPE IN ('receipt','return','adjustment') AND (:wh IS NULL OR TO_WH = :wh) THEN QTY
                    WHEN MOVEMENT_TYPE = 'transfer' AND :wh IS NOT NULL AND TO_WH = :wh AND FROM_WH <> :wh THEN QTY
                    ELSE 0 END AS IN_KG,
               CASE WHEN MOVEMENT_TYPE = 'shipment' AND (:wh IS NULL OR FROM_WH = :wh) THEN QTY
                    WHEN MOVEMENT_TYPE = 'transfer' AND :wh IS NOT NULL AND FROM_WH = :wh AND TO_WH <> :wh THEN QTY
                    ELSE 0 END AS OUT_KG,
               CASE WHEN MOVEMENT_TYPE = 'processing' AND (:wh IS NULL OR FROM_WH = :wh) THEN QTY ELSE 0 END AS WASTE_KG,
               CASE WHEN MOVEMENT_TYPE = 'loss'       AND (:wh IS NULL OR FROM_WH = :wh) THEN QTY ELSE 0 END AS LOSS_KG
        FROM mv
      )
      SELECT i.ID, i.NAME_RO, i.NAME_RU,
             SUM(CASE WHEN sg.CREATED_AT <  TO_DATE(:dfrom, 'YYYY-MM-DD') THEN sg.IN_KG - sg.OUT_KG - sg.WASTE_KG - sg.LOSS_KG ELSE 0 END) AS OPENING_KG,
             SUM(CASE WHEN sg.CREATED_AT >= TO_DATE(:dfrom, 'YYYY-MM-DD') THEN sg.IN_KG    ELSE 0 END) AS RECEIVED_KG,
             SUM(CASE WHEN sg.CREATED_AT >= TO_DATE(:dfrom, 'YYYY-MM-DD') THEN sg.OUT_KG   ELSE 0 END) AS SHIPPED_KG,
             SUM(CASE WHEN sg.CREATED_AT >= TO_DATE(:dfrom, 'YYYY-MM-DD') THEN sg.WASTE_KG ELSE 0 END) AS WASTE_KG,
             SUM(CASE WHEN sg.CREATED_AT >= TO_DATE(:dfrom, 'YYYY-MM-DD') THEN sg.LOSS_KG  ELSE 0 END) AS LOSS_KG
      FROM sg
      JOIN AGRO_ITEMS i ON i.ID = sg.ITEM_ID
      GROUP BY i.ID, i.NAME_RO, i.NAME_RU
      ORDER BY i.NAME_RO
    `, binds),
    p.warehouse_id
      ? query<Row>(`SELECT NAME FROM AGRO_WAREHOUSES WHERE ID = :1`, [p.warehouse_id])
      : Promise.resolve([] as Row[]),
    getCompany(),
  ]);

  const r1 = (x: number) => Math.round(x * 10) / 10;
  const items = rows.map(r => {
    const opening  = n(r.OPENING_KG), received = n(r.RECEIVED_KG), shipped = n(r.SHIPPED_KG);
    const waste    = n(r.WASTE_KG),   loss     = n(r.LOSS_KG);
    const change   = received - shipped - waste - loss;
    return {
      item_name:       pickName(lang, r.NAME_RO, r.NAME_RU),
      opening_qty_kg:  opening,
      received_qty_kg: received,
      shipped_qty_kg:  shipped,
      waste_qty_kg:    waste,
      loss_qty_kg:     loss,
      closing_qty_kg:  opening + change,
      balance_diff:    change,
    };
  }).filter(it => [it.opening_qty_kg, it.received_qty_kg, it.shipped_qty_kg, it.waste_qty_kg, it.loss_qty_kg]
    .some(v => r1(v) !== 0));

  const sum = (k: keyof (typeof items)[number]) => items.reduce((a, it) => a + (it[k] as number), 0);
  return {
    company_name:      company.name,
    date_from:         fmtDate(new Date(p.date_from + "T00:00:00")),
    date_to:           fmtDate(new Date(p.date_to + "T00:00:00")),
    warehouse_name:    whRows.length ? s(whRows[0].NAME) : "",
    items,
    total_opening:     sum("opening_qty_kg"),
    total_received_kg: sum("received_qty_kg"),
    total_shipped_kg:  sum("shipped_qty_kg"),
    total_waste_kg:    sum("waste_qty_kg"),
    total_loss_kg:     sum("loss_qty_kg"),
    current_stock_kg:  sum("closing_qty_kg"),
    total_balance:     sum("balance_diff"),
  };
}
