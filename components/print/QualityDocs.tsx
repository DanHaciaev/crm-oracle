"use client";

import type { qaProtocol, gmpChecklist, haccpReport } from "@/lib/documents/quality";
import { Lang, dash, Header, Signatures } from "./PrintShell";

type QA    = Awaited<ReturnType<typeof qaProtocol>>;
type GMP   = Awaited<ReturnType<typeof gmpChecklist>>;
type HACCP = Awaited<ReturnType<typeof haccpReport>>;

const kv = (label: string, value: string | number | null | undefined) => (
  <div><span className="label">{label}:</span> <span className="value">{value === 0 ? 0 : dash(value as string)}</span></div>
);

// ── Protocol control calitate ────────────────────────────────────────────
const QA_T = {
  ro: { title: "PROTOCOL CONTROL CALITATE", nr: "Nr.", data: "Data", s_obiect: "Obiect control", lot: "Lot", produs: "Produs",
        furnizor: "Furnizor", depozit: "Depozit", tip_control: "Tip control", inspector: "Inspector",
        s_rezultate: "Rezultate control", col_parametru: "Parametru", col_norma: "Norma", col_rezultat: "Rezultat", col_rez2: "Concluzie",
        conform: "CONFORM", neconform: "NECONFORM", conditionat: "CONFORM CONDIȚIONAT", critic: "critic", motiv: "Motiv",
        da: "Da", nu: "Nu", fara: "Nu sunt valori înregistrate",
        observatii: "Observatii", inspector_qc: "Inspector calitate", responsabil: "Responsabil" },
  ru: { title: "ПРОТОКОЛ КОНТРОЛЯ КАЧЕСТВА", nr: "№", data: "Дата", s_obiect: "Объект контроля", lot: "Партия", produs: "Продукция",
        furnizor: "Поставщик", depozit: "Склад", tip_control: "Тип проверки", inspector: "Инспектор",
        s_rezultate: "Результаты проверки", col_parametru: "Параметр", col_norma: "Норма", col_rezultat: "Факт", col_rez2: "Результат",
        conform: "ГОДЕН", neconform: "БРАК", conditionat: "ГОДЕН УСЛОВНО", critic: "критич.", motiv: "Причина",
        da: "Да", nu: "Нет", fara: "Значения не внесены",
        observatii: "Примечания", inspector_qc: "Инспектор QC", responsabil: "Руководитель" },
  en: { title: "QUALITY CONTROL PROTOCOL", nr: "No.", data: "Date", s_obiect: "Control object", lot: "Batch", produs: "Product",
        furnizor: "Supplier", depozit: "Warehouse", tip_control: "Check type", inspector: "Inspector",
        s_rezultate: "Check results", col_parametru: "Parameter", col_norma: "Standard", col_rezultat: "Actual", col_rez2: "Result",
        conform: "PASS", neconform: "FAIL", conditionat: "CONDITIONAL PASS", critic: "critical", motiv: "Reason",
        da: "Yes", nu: "No", fara: "No values recorded",
        observatii: "Notes", inspector_qc: "QC Inspector", responsabil: "Responsible" },
};

export function QaProtocol({ d, lang }: { d: QA; lang: Lang }) {
  const L = QA_T[lang];
  const boolVal = (v: string) => {
    const x = v.trim().toLowerCase();
    if (["y", "yes", "true", "1", "da"].includes(x)) return L.da;
    if (["n", "no", "false", "0", "nu"].includes(x)) return L.nu;
    return v;
  };
  const verdict = d.result === "fail" ? "bad" : d.result === "conditional" ? "cond" : "ok";
  return (
    <div className="doc">
      <Header company={d.company_name} title={L.title} />
      <div className="doc-row">
        <div>{L.nr}: <strong>{d.protocol_number}</strong></div>
        <div>{L.data}: <strong>{dash(d.check_date)}</strong></div>
      </div>
      <div className="section">
        <div className="section-title">{L.s_obiect}</div>
        <div className="info-grid">
          {kv(L.lot, d.batch_number)}{kv(L.produs, d.item_name)}{kv(L.furnizor, d.supplier_name)}
          {kv(L.depozit, d.warehouse_name)}{kv(L.tip_control, d.check_type)}{kv(L.inspector, d.inspector)}
        </div>
      </div>
      <div className="section">
        <div className="section-title">{L.s_rezultate}</div>
        <table>
          <thead><tr><th>#</th><th>{L.col_parametru}</th><th>{L.col_norma}</th><th>{L.col_rezultat}</th><th>{L.col_rez2}</th></tr></thead>
          <tbody>
            {d.checks.map((c, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{dash(c.param_name)}{c.critical && <span className="warn"> ({L.critic})</span>}</td>
                <td>{dash(c.norm_value)}</td>
                <td>{dash(c.value_type === "boolean" ? boolVal(c.actual_value) : c.actual_value)}</td>
                <td className={c.passed ? "pass" : "fail"}>{c.passed ? L.conform : L.neconform}</td>
              </tr>
            ))}
            {d.checks.length === 0 && <tr><td colSpan={5} className="empty">{L.fara}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className={`verdict ${verdict}`}>
        <div className={`result ${verdict === "bad" ? "fail" : verdict === "cond" ? "warn" : "pass"}`}>
          {verdict === "bad" ? L.neconform : verdict === "cond" ? L.conditionat : L.conform}
        </div>
        {!d.overall_pass && d.rejection_reason && <div style={{ marginTop: 8, fontSize: "11pt" }}>{L.motiv}: {d.rejection_reason}</div>}
      </div>
      {d.notes && <div className="section"><strong>{L.observatii}:</strong> {d.notes}</div>}
      <Signatures labels={[L.inspector_qc, L.responsabil]} />
    </div>
  );
}

// ── Listă de verificare GMP ──────────────────────────────────────────────
const GMP_T = {
  ro: { title: "LISTA DE VERIFICARE GMP", nr: "Nr.", data: "Data", lista: "Lista", zona: "Zona", inspector: "Inspector", depozit: "Depozit", lot: "Lot",
        col_punct: "Punct de verificare", col_status: "Status", col_obs: "Observatii", da: "DA", nu: "NU", na: "N/A",
        rezultat: "Rezultat", conformitate: "Conformitate", fara: "Nu sunt puncte înregistrate",
        actiuni_corective: "Actiuni corective", inspector_gmp: "Inspector GMP", responsabil: "Responsabil" },
  ru: { title: "GMP ЧЕК-ЛИСТ", nr: "№", data: "Дата", lista: "Чек-лист", zona: "Зона", inspector: "Инспектор", depozit: "Склад", lot: "Партия",
        col_punct: "Пункт проверки", col_status: "Статус", col_obs: "Примечание", da: "ДА", nu: "НЕТ", na: "Н/П",
        rezultat: "Результат", conformitate: "Соответствие", fara: "Пункты не внесены",
        actiuni_corective: "Корректирующие действия", inspector_gmp: "Инспектор GMP", responsabil: "Ответственный" },
  en: { title: "GMP CHECKLIST", nr: "No.", data: "Date", lista: "Checklist", zona: "Zone", inspector: "Inspector", depozit: "Warehouse", lot: "Batch",
        col_punct: "Checkpoint", col_status: "Status", col_obs: "Notes", da: "YES", nu: "NO", na: "N/A",
        rezultat: "Result", conformitate: "Compliance", fara: "No checkpoints recorded",
        actiuni_corective: "Corrective actions", inspector_gmp: "GMP Inspector", responsabil: "Responsible" },
};

export function GmpChecklist({ d, lang }: { d: GMP; lang: Lang }) {
  const L = GMP_T[lang];
  return (
    <div className="doc">
      <Header company={d.company_name} title={L.title} />
      <div className="doc-row">
        <div>{L.nr}: <strong>{d.checklist_number}</strong></div>
        <div>{L.data}: <strong>{dash(d.check_date)}</strong></div>
      </div>
      <div className="info-grid" style={{ marginBottom: 16 }}>
        {kv(L.lista, d.checklist_name)}{kv(L.zona, d.zone)}{kv(L.inspector, d.inspector)}
        {kv(L.depozit, d.warehouse_name)}{d.batch_number && kv(L.lot, d.batch_number)}
      </div>
      <table>
        <thead><tr><th style={{ width: "5%" }}>#</th><th style={{ width: "45%" }}>{L.col_punct}</th><th style={{ width: "15%" }}>{L.col_status}</th><th style={{ width: "35%" }}>{L.col_obs}</th></tr></thead>
        <tbody>
          {d.items.map((it, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>{dash(it.description)}</td>
              <td className={it.status === "yes" ? "check-yes" : it.status === "no" ? "check-no" : "check-na"}>
                {it.status === "yes" ? L.da : it.status === "no" ? L.nu : L.na}
              </td>
              <td>{it.notes}</td>
            </tr>
          ))}
          {d.items.length === 0 && <tr><td colSpan={4} className="empty">{L.fara}</td></tr>}
        </tbody>
      </table>
      <div className="summary">
        <div style={{ textAlign: "center", fontWeight: "bold" }}>{L.rezultat}</div>
        <div className="score">{d.score} / {d.total_items}</div>
        <div style={{ textAlign: "center", fontSize: "11pt" }}>
          {L.conformitate}: <strong>{d.compliance_pct != null ? `${d.compliance_pct}%` : "—"}</strong>
        </div>
      </div>
      {d.corrective_actions && (
        <div style={{ margin: "16px 0" }}>
          <strong>{L.actiuni_corective}:</strong>
          <div style={{ marginTop: 8, fontSize: "11pt" }}>{d.corrective_actions}</div>
        </div>
      )}
      <Signatures labels={[L.inspector_gmp, L.responsabil]} />
    </div>
  );
}

// ── Raport HACCP devieri ─────────────────────────────────────────────────
const HACCP_T = {
  ro: { title: "RAPORT HACCP DEVIERI", subtitle: "Sistemul de analiza a riscurilor si punctelor critice de control", nr: "Nr.", perioada: "Perioada",
        s1: "1. Sumar", total_inreg: "Total inregistrari", devieri: "Devieri", rezolvate: "Cu acțiune corectivă", deschise: "Fără acțiune corectivă",
        s2: "2. Detalii devieri", col_data: "Data", col_ccp: "CCP / Punct critic", col_descriere: "Descriere", col_pericol: "Tip pericol",
        col_masurat: "Măsurat / Limite", col_actiune: "Actiune corectiva", col_status: "Status", rezolvat: "Rezolvat", deschis: "Deschis",
        s3: "3. Devieri temperatura / umiditate", col_celula: "Celula", col_tip: "Tip alertă", col_limita: "Limita", col_valoare: "Valoare", col_confirmat: "Confirmat",
        fara_devieri: "Nu au fost înregistrate devieri în perioada selectată",
        responsabil_haccp: "Responsabil HACCP", responsabil_prod: "Responsabil productie", director: "Director" },
  ru: { title: "HACCP ОТЧЁТ О НЕСООТВЕТСТВИЯХ", subtitle: "Система анализа рисков и критических контрольных точек", nr: "№", perioada: "Период",
        s1: "1. Сводка", total_inreg: "Всего записей", devieri: "Несоответствий", rezolvate: "С корр. действием", deschise: "Без корр. действия",
        s2: "2. Детали несоответствий", col_data: "Дата", col_ccp: "CCP / Критическая точка", col_descriere: "Описание", col_pericol: "Тип опасности",
        col_masurat: "Замер / Пределы", col_actiune: "Корр. действие", col_status: "Статус", rezolvat: "Устранено", deschis: "Открыто",
        s3: "3. Отклонения температуры / влажности", col_celula: "Ячейка", col_tip: "Тип алерта", col_limita: "Порог", col_valoare: "Факт", col_confirmat: "Подтверждён",
        fara_devieri: "За выбранный период несоответствий не зарегистрировано",
        responsabil_haccp: "Ответственный HACCP", responsabil_prod: "Руководитель производства", director: "Директор" },
  en: { title: "HACCP DEVIATION REPORT", subtitle: "Hazard Analysis and Critical Control Points system", nr: "No.", perioada: "Period",
        s1: "1. Summary", total_inreg: "Total records", devieri: "Deviations", rezolvate: "With corrective action", deschise: "Without corrective action",
        s2: "2. Deviation details", col_data: "Date", col_ccp: "CCP", col_descriere: "Description", col_pericol: "Hazard type",
        col_masurat: "Measured / Limits", col_actiune: "Corrective action", col_status: "Status", rezolvat: "Resolved", deschis: "Open",
        s3: "3. Temperature / humidity deviations", col_celula: "Cell", col_tip: "Alert type", col_limita: "Threshold", col_valoare: "Actual", col_confirmat: "Acknowledged",
        fara_devieri: "No deviations recorded in the selected period",
        responsabil_haccp: "HACCP Responsible", responsabil_prod: "Production Manager", director: "Director" },
};

export function HaccpReport({ d, lang }: { d: HACCP; lang: Lang }) {
  const L = HACCP_T[lang];
  const yes = lang === "ru" ? "Да" : lang === "en" ? "Yes" : "Da";
  const no  = lang === "ru" ? "Нет" : lang === "en" ? "No" : "Nu";
  return (
    <div className="doc haccp">
      <Header company={d.company_name} title={L.title} subtitle={L.subtitle} />
      <div className="doc-row">
        <div>{L.nr}: <strong>{d.report_number}</strong></div>
        <div>{L.perioada}: <strong>{d.date_from}</strong> — <strong>{d.date_to}</strong></div>
      </div>
      <div className="section">
        <div className="section-title">{L.s1}</div>
        <div className="info-grid">
          {kv(L.total_inreg, d.total_records)}
          <div><span className="label">{L.devieri}:</span> <span className="value fail">{d.total_deviations}</span></div>
          <div><span className="label">{L.rezolvate}:</span> <span className="value pass">{d.resolved_count}</span></div>
          <div><span className="label">{L.deschise}:</span> <span className="value warn">{d.open_count}</span></div>
        </div>
      </div>
      <div className="section">
        <div className="section-title">{L.s2}</div>
        <table>
          <thead>
            <tr><th>#</th><th>{L.col_data}</th><th>{L.col_ccp}</th><th>{L.col_descriere}</th><th>{L.col_pericol}</th><th>{L.col_masurat}</th><th>{L.col_actiune}</th><th>{L.col_status}</th></tr>
          </thead>
          <tbody>
            {d.deviations.map((v, i) => (
              <tr key={i}>
                <td>{i + 1}</td><td>{dash(v.recorded_at)}</td><td>{dash(v.ccp_name)}</td>
                <td>{dash(v.description)}{v.batch_number && <div style={{ fontSize: "9pt", color: "#555" }}>{v.batch_number}</div>}</td>
                <td>{dash(v.hazard_type)}</td>
                <td><strong className="fail">{v.measured ?? "—"}</strong>{v.limits && <> / {v.limits}</>}</td>
                <td>{dash(v.corrective_action)}</td>
                <td className={v.resolved ? "pass" : "warn"}>{v.resolved ? L.rezolvat : L.deschis}</td>
              </tr>
            ))}
            {d.deviations.length === 0 && <tr><td colSpan={8} className="empty">{L.fara_devieri}</td></tr>}
          </tbody>
        </table>
      </div>
      {d.temperature_deviations.length > 0 && (
        <div className="section">
          <div className="section-title">{L.s3}</div>
          <table>
            <thead><tr><th>{L.col_data}</th><th>{L.col_celula}</th><th>{L.col_tip}</th><th>{L.col_limita}</th><th>{L.col_valoare}</th><th>{L.col_confirmat}</th></tr></thead>
            <tbody>
              {d.temperature_deviations.map((t, i) => (
                <tr key={i}>
                  <td>{dash(t.date)}</td><td>{dash(t.cell_code)}</td><td>{dash(t.alert_type)}</td><td>{t.threshold ?? "—"}</td>
                  <td className="fail">{t.actual ?? "—"}</td>
                  <td>{t.acknowledged ? `${yes}${t.acknowledged_by ? ` (${t.acknowledged_by})` : ""}` : no}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Signatures labels={[L.responsabil_haccp, L.responsabil_prod, L.director]} />
    </div>
  );
}
