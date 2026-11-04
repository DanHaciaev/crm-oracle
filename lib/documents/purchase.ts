import { query } from "@/lib/oracle";
import { Row, Lang, DocNotFound, s, n, nOrNull, fmtDate, pickName, getCompany } from "./common";

// ── Act de recepție materie primă (purchase act) ─────────────────────────
// Artgranit only had the template for this one (no data builder) — fields
// are filled from AGRO_PURCHASE_DOCS/LINES directly.
export async function purchaseAct(docId: number, lang: Lang) {
  const [hdrRows, lineRows, company] = await Promise.all([
    query<Row>(`
      SELECT pd.DOC_NUMBER, pd.DOC_DATE, pd.STATUS, pd.NOTES, pd.DISCOUNT_PCT,
             NVL(pd.CURRENCY_CODE, 'MDL') AS CURRENCY_CODE, pd.TOTAL_AMOUNT,
             w.NAME AS WAREHOUSE_NAME, s.NAME AS SUPPLIER_NAME, s.TAX_ID AS SUPPLIER_TAX_ID,
             v.PLATE_NUMBER AS VEHICLE_PLATE, v.DRIVER_NAME
      FROM AGRO_PURCHASE_DOCS pd
      LEFT JOIN AGRO_WAREHOUSES w ON w.ID = pd.WAREHOUSE_ID
      LEFT JOIN AGRO_SUPPLIERS  s ON s.ID = pd.SUPPLIER_ID
      LEFT JOIN AGRO_VEHICLES   v ON v.ID = pd.VEHICLE_ID
      WHERE pd.ID = :1
    `, [docId]),
    query<Row>(`
      SELECT i.NAME_RO AS ITEM_NAME_RO, i.NAME_RU AS ITEM_NAME_RU,
             vr.NAME_RO AS VARIETY_NAME_RO, vr.NAME_RU AS VARIETY_NAME_RU,
             pl.CRATES_COUNT, pl.GROSS_WEIGHT_KG, pl.TARE_WEIGHT_KG, pl.NET_WEIGHT_KG,
             pl.PRICE_PER_KG, pl.AMOUNT
      FROM AGRO_PURCHASE_LINES pl
      LEFT JOIN AGRO_ITEMS i ON i.ID = pl.ITEM_ID
      LEFT JOIN AGRO_ITEM_VARIETIES vr ON vr.ID = pl.VARIETY_ID
      WHERE pl.PURCHASE_DOC_ID = :1
      ORDER BY pl.ID
    `, [docId]),
    getCompany(),
  ]);
  if (!hdrRows.length) throw new DocNotFound("Документ закупки не найден");
  const hdr = hdrRows[0];

  const lines = lineRows.map(r => {
    const variety = pickName(lang, r.VARIETY_NAME_RO, r.VARIETY_NAME_RU);
    const item    = pickName(lang, r.ITEM_NAME_RO, r.ITEM_NAME_RU);
    return {
      item_name:       variety ? `${item} (${variety})` : item,
      crate_count:     nOrNull(r.CRATES_COUNT),
      gross_weight_kg: n(r.GROSS_WEIGHT_KG),
      tare_weight_kg:  n(r.TARE_WEIGHT_KG),
      net_weight_kg:   n(r.NET_WEIGHT_KG),
      price_per_kg:    n(r.PRICE_PER_KG),
      total_amount:    n(r.AMOUNT),
    };
  });

  return {
    company_name:    company.name,
    doc_number:      s(hdr.DOC_NUMBER),
    doc_date:        fmtDate(hdr.DOC_DATE),
    status:          s(hdr.STATUS),
    supplier_name:   s(hdr.SUPPLIER_NAME),
    supplier_tax_id: s(hdr.SUPPLIER_TAX_ID),
    warehouse_name:  s(hdr.WAREHOUSE_NAME),
    currency_code:   s(hdr.CURRENCY_CODE),
    discount_pct:    n(hdr.DISCOUNT_PCT),
    lines,
    total_crates:    lines.reduce((a, l) => a + (l.crate_count ?? 0), 0),
    total_gross_kg:  lines.reduce((a, l) => a + l.gross_weight_kg, 0),
    total_tare_kg:   lines.reduce((a, l) => a + l.tare_weight_kg, 0),
    total_net_kg:    lines.reduce((a, l) => a + l.net_weight_kg, 0),
    // Header total already has the supplier discount applied.
    total_amount:    hdr.TOTAL_AMOUNT != null ? n(hdr.TOTAL_AMOUNT) : lines.reduce((a, l) => a + l.total_amount, 0),
    vehicle_number:  s(hdr.VEHICLE_PLATE),
    driver_name:     s(hdr.DRIVER_NAME),
    notes:           s(hdr.NOTES),
  };
}
