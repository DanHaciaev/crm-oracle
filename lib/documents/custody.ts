import { query } from "@/lib/oracle";
import { Row, Lang, DocNotFound, s, n, nOrNull, fmtDate, pickName, getCompany } from "./common";

// ── Act de prestări servicii (custody release act) ───────────────────────
// One printable act per release event, listing the storage + precooling
// charges so it can be signed by the storage client on pickup. Ported from
// Artgranit get_document_data("custody_release_act").
export async function custodyReleaseAct(releaseId: number, lang: Lang) {
  const [hdrRows, lineRows, company] = await Promise.all([
    query<Row>(`
      SELECT cr.RELEASE_NUMBER, cr.RELEASE_DATE, cr.TOTAL_QTY_KG, cr.PRECOOLING_QTY_KG,
             cr.STORAGE_PRICE_PER_KG, cr.PRECOOLING_PRICE_PER_KG,
             cr.STORAGE_AMOUNT, cr.PRECOOLING_AMOUNT, cr.TOTAL_AMOUNT, cr.NOTES,
             sc.NAME AS CLIENT_NAME
      FROM AGRO_CUSTODY_RELEASES cr
      JOIN AGRO_STORAGE_CLIENTS sc ON sc.ID = cr.STORAGE_CLIENT_ID
      WHERE cr.ID = :1
    `, [releaseId]),
    query<Row>(`
      SELECT crl.QTY_KG, crl.GROSS_KG, crl.TARE_KG, cb.BATCH_NUMBER,
             i.NAME_RU AS ITEM_NAME_RU, i.NAME_RO AS ITEM_NAME_RO
      FROM AGRO_CUSTODY_RELEASE_LINES crl
      JOIN AGRO_CUSTODY_BATCHES cb ON cb.ID = crl.CUSTODY_BATCH_ID
      JOIN AGRO_ITEMS i ON i.ID = cb.ITEM_ID
      WHERE crl.RELEASE_ID = :1
      ORDER BY crl.ID
    `, [releaseId]),
    getCompany(),
  ]);
  if (!hdrRows.length) throw new DocNotFound("Выдача не найдена");
  const rel = hdrRows[0];

  const lines = lineRows.map(r => ({
    batch_number: s(r.BATCH_NUMBER),
    item_name:    pickName(lang, r.ITEM_NAME_RO, r.ITEM_NAME_RU),
    qty_kg:       n(r.QTY_KG),
    gross_kg:     nOrNull(r.GROSS_KG),
    tare_kg:      nOrNull(r.TARE_KG),
  }));

  return {
    company_name:            company.name,
    doc_number:              s(rel.RELEASE_NUMBER),
    doc_date:                fmtDate(rel.RELEASE_DATE),
    client_name:             s(rel.CLIENT_NAME),
    lines,
    total_gross_kg:          lines.reduce((a, l) => a + (l.gross_kg ?? 0), 0),
    total_tare_kg:           lines.reduce((a, l) => a + (l.tare_kg ?? 0), 0),
    total_qty_kg:            n(rel.TOTAL_QTY_KG),
    precooling_qty_kg:       n(rel.PRECOOLING_QTY_KG),
    storage_price_per_kg:    n(rel.STORAGE_PRICE_PER_KG),
    precooling_price_per_kg: n(rel.PRECOOLING_PRICE_PER_KG),
    storage_amount:          n(rel.STORAGE_AMOUNT),
    precooling_amount:       n(rel.PRECOOLING_AMOUNT),
    total_amount:            n(rel.TOTAL_AMOUNT),
    notes:                   s(rel.NOTES),
  };
}
