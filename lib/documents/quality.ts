import { query } from "@/lib/oracle";
import { Row, Lang, DocNotFound, s, n, fmtDate, fmtDateTime, pickName, getCompany } from "./common";
import type { PeriodParams } from "./stock";

// DIPP FRUICT only had the templates for the three QA documents below (no data
// builders) — they are filled from the QA/HACCP tables directly.

async function qaCheck(checkId: number) {
  const [hdrRows, valueRows] = await Promise.all([
    query<Row>(`
      SELECT qc.ID, qc.CHECK_DATE, qc.RESULT, qc.INSPECTOR, qc.NOTES,
             cl.CODE AS CHECKLIST_CODE, cl.NAME_RO AS CHECKLIST_NAME_RO, cl.NAME_RU AS CHECKLIST_NAME_RU,
             cl.CHECKLIST_TYPE,
             b.BATCH_NUMBER, b.BLOCK_REASON,
             i.NAME_RO AS ITEM_NAME_RO, i.NAME_RU AS ITEM_NAME_RU,
             w.NAME AS WAREHOUSE_NAME, sc.CODE AS CELL_CODE, sc.NAME AS CELL_NAME,
             s.NAME AS SUPPLIER_NAME
      FROM AGRO_QA_CHECKS qc
      JOIN AGRO_QA_CHECKLISTS cl ON cl.ID = qc.CHECKLIST_ID
      LEFT JOIN AGRO_BATCHES b ON b.ID = qc.BATCH_ID
      LEFT JOIN AGRO_ITEMS i ON i.ID = b.ITEM_ID
      LEFT JOIN AGRO_WAREHOUSES w ON w.ID = b.WAREHOUSE_ID
      LEFT JOIN AGRO_STORAGE_CELLS sc ON sc.ID = b.CELL_ID
      LEFT JOIN AGRO_PURCHASE_LINES pl ON pl.ID = b.PURCHASE_LINE_ID
      LEFT JOIN AGRO_PURCHASE_DOCS pd ON pd.ID = pl.PURCHASE_DOC_ID
      LEFT JOIN AGRO_SUPPLIERS s ON s.ID = pd.SUPPLIER_ID
      WHERE qc.ID = :1
    `, [checkId]),
    query<Row>(`
      SELECT v.VALUE, v.IS_COMPLIANT,
             ci.PARAMETER_NAME_RO, ci.PARAMETER_NAME_RU, ci.VALUE_TYPE,
             ci.MIN_VALUE, ci.MAX_VALUE, ci.CHOICES, ci.IS_CRITICAL
      FROM AGRO_QA_CHECK_VALUES v
      JOIN AGRO_QA_CHECKLIST_ITEMS ci ON ci.ID = v.CHECKLIST_ITEM_ID
      WHERE v.CHECK_ID = :1
      ORDER BY ci.ITEM_ORDER, v.ID
    `, [checkId]),
  ]);
  if (!hdrRows.length) throw new DocNotFound("Проверка качества не найдена");
  return { hdr: hdrRows[0], values: valueRows };
}

function normText(r: Row) {
  if (s(r.VALUE_TYPE) === "numeric") {
    const lo = r.MIN_VALUE != null ? n(r.MIN_VALUE) : null;
    const hi = r.MAX_VALUE != null ? n(r.MAX_VALUE) : null;
    if (lo != null && hi != null) return `${lo} – ${hi}`;
    if (lo != null) return `≥ ${lo}`;
    if (hi != null) return `≤ ${hi}`;
    return "";
  }
  if (s(r.VALUE_TYPE) === "choice") return s(r.CHOICES);
  return "";
}

// ── Protocol control calitate ────────────────────────────────────────────
export async function qaProtocol(checkId: number, lang: Lang) {
  const [{ hdr, values }, company] = await Promise.all([qaCheck(checkId), getCompany()]);
  const result = s(hdr.RESULT);
  return {
    company_name:     company.name,
    protocol_number:  `QC-${checkId}`,
    check_date:       fmtDate(hdr.CHECK_DATE),
    batch_number:     s(hdr.BATCH_NUMBER),
    item_name:        pickName(lang, hdr.ITEM_NAME_RO, hdr.ITEM_NAME_RU),
    supplier_name:    s(hdr.SUPPLIER_NAME),
    warehouse_name:   s(hdr.WAREHOUSE_NAME),
    check_type:       pickName(lang, hdr.CHECKLIST_NAME_RO, hdr.CHECKLIST_NAME_RU) || s(hdr.CHECKLIST_CODE),
    inspector:        s(hdr.INSPECTOR),
    checks: values.map(v => ({
      param_name:   pickName(lang, v.PARAMETER_NAME_RO, v.PARAMETER_NAME_RU),
      norm_value:   normText(v),
      value_type:   s(v.VALUE_TYPE),
      actual_value: s(v.VALUE),
      passed:       v.IS_COMPLIANT !== "N",
      critical:     v.IS_CRITICAL === "Y",
    })),
    // pass / conditional (non-critical fails) / fail (critical fail → batch auto-blocked)
    result,
    overall_pass:     result !== "fail",
    rejection_reason: result === "fail" ? s(hdr.BLOCK_REASON) : "",
    notes:            s(hdr.NOTES),
  };
}

// ── Listă de verificare GMP ──────────────────────────────────────────────
export async function gmpChecklist(checkId: number, lang: Lang) {
  const [{ hdr, values }, company] = await Promise.all([qaCheck(checkId), getCompany()]);
  const items = values.map(v => {
    const val = s(v.VALUE).trim().toLowerCase();
    const na  = val === "" || val === "n/a" || val === "na";
    return {
      description: pickName(lang, v.PARAMETER_NAME_RO, v.PARAMETER_NAME_RU),
      status:      na ? "na" : v.IS_COMPLIANT === "N" ? "no" : "yes",
      // Boolean answers are already shown by the status column.
      notes:       s(v.VALUE_TYPE) === "boolean" ? "" : s(v.VALUE),
    };
  });
  const applicable = items.filter(i => i.status !== "na");
  const score      = applicable.filter(i => i.status === "yes").length;
  const cell       = [s(hdr.CELL_CODE), s(hdr.CELL_NAME)].filter(Boolean).join(" — ");
  return {
    company_name:       company.name,
    checklist_number:   `GMP-${checkId}`,
    check_date:         fmtDate(hdr.CHECK_DATE),
    checklist_name:     pickName(lang, hdr.CHECKLIST_NAME_RO, hdr.CHECKLIST_NAME_RU) || s(hdr.CHECKLIST_CODE),
    zone:               cell,
    inspector:          s(hdr.INSPECTOR),
    warehouse_name:     s(hdr.WAREHOUSE_NAME),
    batch_number:       s(hdr.BATCH_NUMBER),
    items,
    score,
    total_items:        applicable.length,
    compliance_pct:     applicable.length ? Math.round((score / applicable.length) * 100) : null,
    corrective_actions: s(hdr.NOTES),
  };
}

// ── Raport HACCP devieri ─────────────────────────────────────────────────
// AGRO_HACCP_RECORDS has no severity column, so the summary splits
// deviations by whether a corrective action was recorded, and the detail
// table shows the CCP's hazard type instead of a made-up severity.
export async function haccpReport(p: PeriodParams, lang: Lang) {
  const binds = { dfrom: p.date_from, dto: p.date_to };
  const [totals, devRows, tempRows, company] = await Promise.all([
    query<Row>(`
      SELECT COUNT(*) AS TOTAL,
             SUM(CASE WHEN IS_WITHIN_LIMITS = 'N' THEN 1 ELSE 0 END) AS DEVIATIONS,
             SUM(CASE WHEN IS_WITHIN_LIMITS = 'N' AND CORRECTIVE_ACTION_TAKEN IS NOT NULL THEN 1 ELSE 0 END) AS RESOLVED
      FROM AGRO_HACCP_RECORDS
      WHERE RECORDED_AT >= TO_DATE(:dfrom, 'YYYY-MM-DD') AND RECORDED_AT < TO_DATE(:dto, 'YYYY-MM-DD') + 1
    `, binds),
    query<Row>(`
      SELECT r.RECORDED_AT, r.MEASURED_VALUE, r.DEVIATION_NOTES, r.CORRECTIVE_ACTION_TAKEN, r.RECORDED_BY,
             c.CCP_NUMBER, c.HAZARD_TYPE, c.HAZARD_DESCRIPTION, c.CRITICAL_LIMIT_MIN, c.CRITICAL_LIMIT_MAX,
             pl.NAME_RO AS PLAN_NAME_RO, pl.NAME_RU AS PLAN_NAME_RU, b.BATCH_NUMBER
      FROM AGRO_HACCP_RECORDS r
      LEFT JOIN AGRO_HACCP_CCPS  c  ON c.ID  = r.CCP_ID
      LEFT JOIN AGRO_HACCP_PLANS pl ON pl.ID = c.PLAN_ID
      LEFT JOIN AGRO_BATCHES     b  ON b.ID  = r.BATCH_ID
      WHERE r.IS_WITHIN_LIMITS = 'N'
        AND r.RECORDED_AT >= TO_DATE(:dfrom, 'YYYY-MM-DD') AND r.RECORDED_AT < TO_DATE(:dto, 'YYYY-MM-DD') + 1
      ORDER BY r.RECORDED_AT
    `, binds),
    query<Row>(`
      SELECT a.CREATED_AT, a.ALERT_TYPE, a.THRESHOLD_VALUE, a.ACTUAL_VALUE, a.ACKNOWLEDGED, a.ACKNOWLEDGED_BY,
             sc.CODE AS CELL_CODE, sc.NAME AS CELL_NAME
      FROM AGRO_STORAGE_ALERTS a
      LEFT JOIN AGRO_STORAGE_CELLS sc ON sc.ID = a.CELL_ID
      WHERE a.CREATED_AT >= TO_DATE(:dfrom, 'YYYY-MM-DD') AND a.CREATED_AT < TO_DATE(:dto, 'YYYY-MM-DD') + 1
      ORDER BY a.CREATED_AT
    `, binds),
    getCompany(),
  ]);

  const t = totals[0] ?? {};
  const deviations = devRows.map(r => {
    const lo = r.CRITICAL_LIMIT_MIN != null ? n(r.CRITICAL_LIMIT_MIN) : null;
    const hi = r.CRITICAL_LIMIT_MAX != null ? n(r.CRITICAL_LIMIT_MAX) : null;
    return {
      recorded_at:       fmtDateTime(r.RECORDED_AT),
      ccp_name:          [s(r.CCP_NUMBER), pickName(lang, r.PLAN_NAME_RO, r.PLAN_NAME_RU)].filter(Boolean).join(" · "),
      description:       [s(r.HAZARD_DESCRIPTION), s(r.DEVIATION_NOTES)].filter(Boolean).join(" — "),
      hazard_type:       s(r.HAZARD_TYPE),
      measured:          r.MEASURED_VALUE != null ? n(r.MEASURED_VALUE) : null,
      limits:            lo != null && hi != null ? `${lo} – ${hi}` : lo != null ? `≥ ${lo}` : hi != null ? `≤ ${hi}` : "",
      batch_number:      s(r.BATCH_NUMBER),
      corrective_action: s(r.CORRECTIVE_ACTION_TAKEN),
      resolved:          r.CORRECTIVE_ACTION_TAKEN != null,
    };
  });

  return {
    company_name:     company.name,
    report_number:    `HACCP-${p.date_from.replace(/-/g, "")}-${p.date_to.replace(/-/g, "")}`,
    date_from:        fmtDate(new Date(p.date_from + "T00:00:00")),
    date_to:          fmtDate(new Date(p.date_to + "T00:00:00")),
    total_records:    n(t.TOTAL),
    total_deviations: n(t.DEVIATIONS),
    resolved_count:   n(t.RESOLVED),
    open_count:       n(t.DEVIATIONS) - n(t.RESOLVED),
    deviations,
    temperature_deviations: tempRows.map(r => ({
      date:         fmtDateTime(r.CREATED_AT),
      cell_code:    [s(r.CELL_CODE), s(r.CELL_NAME)].filter(Boolean).join(" — "),
      alert_type:   s(r.ALERT_TYPE),
      threshold:    r.THRESHOLD_VALUE != null ? n(r.THRESHOLD_VALUE) : null,
      actual:       r.ACTUAL_VALUE != null ? n(r.ACTUAL_VALUE) : null,
      acknowledged: r.ACKNOWLEDGED === "Y",
      acknowledged_by: s(r.ACKNOWLEDGED_BY),
    })),
  };
}
