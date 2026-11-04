"use client";

import { useState, type ReactNode } from "react";

export type Lang = "ro" | "ru" | "en";
export const LANGS: Lang[] = ["ro", "ru", "en"];

// Number formats match the DIPP FRUICT Jinja templates ('%.1f' / '%.2f' / '%.3f').
export const f1 = (v: number | null | undefined) => (v ? v.toFixed(1) : "—");
export const f2 = (v: number | null | undefined) => (v ? v.toFixed(2) : "—");
export const f3 = (v: number | null | undefined) => (v != null ? v.toFixed(3) : "—");
export const z1 = (v: number | null | undefined) => (v ?? 0).toFixed(1);
export const z2 = (v: number | null | undefined) => (v ?? 0).toFixed(2);
export const dash = (v: string | null | undefined) => v || "—";

// Styles ported from templates/agro/document_*.html: ".doc" is the formal
// act layout (Times New Roman), ".bon" the green pallet-bon layout (Calibri).
const CSS = `
.print-root { background: #fff; color: #000; min-height: 100vh; }
.print-toolbar { display: flex; justify-content: center; align-items: center; gap: 10px; padding: 16px 0; }
.print-toolbar .print-btn { padding: 10px 30px; font-size: 14px; background: #059669; color: #fff; border-radius: 6px; }
.print-toolbar .print-btn:hover { background: #047857; }
.print-toolbar .lang { padding: 8px 14px; font-size: 13px; font-weight: 600; border-radius: 6px; border: 1px solid #ccc; color: #333; }
.print-toolbar .lang.active { background: #059669; color: #fff; border-color: #059669; }
.print-note { max-width: 210mm; margin: 0 auto 8px; padding: 8px 12px; font-size: 13px; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 6px; color: #92400e; }

.doc, .bon { color: #000; margin: 0 auto; }
.doc *, .bon * { box-sizing: border-box; }
.doc table, .bon table { width: 100%; border-collapse: collapse; }

.doc { font-family: 'Times New Roman', serif; font-size: 12pt; max-width: 210mm; padding: 20mm; }
.doc.landscape { max-width: 297mm; padding: 15mm; font-size: 11pt; }
.doc .header { text-align: center; margin-bottom: 16px; border-bottom: 2px solid #000; padding-bottom: 10px; }
.doc .header h1 { font-size: 15pt; margin-bottom: 4px; font-weight: bold; }
.doc .header .company { font-size: 10pt; color: #555; }
.doc .header .doc-logo { max-height: 18mm; max-width: 60mm; margin: 0 auto 6px; display: block; object-fit: contain; }
.doc .doc-row, .doc .doc-info { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 10px; font-size: 11pt; }
.doc .doc-info > div { flex: 1; }
.doc .section { margin-bottom: 16px; }
.doc .section-title { font-size: 11pt; font-weight: bold; background: #f0f0f0; padding: 6px 10px; border: 1px solid #000; margin-bottom: 8px; }
.doc .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 11pt; }
.doc .info-grid .label { color: #555; }
.doc .info-grid .value { font-weight: bold; }
.doc table { margin: 12px 0; font-size: 11pt; }
.doc th, .doc td { border: 1px solid #000; padding: 5px 8px; text-align: left; vertical-align: top; }
.doc th { background: #f0f0f0; font-weight: bold; font-size: 10pt; }
.doc td.num, .doc th.num { text-align: right; }
.doc .total-row td { font-weight: bold; background: #f8f8f8; }
.doc .parties { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 16px; font-size: 11pt; }
.doc .party { flex: 1; border: 1px solid #ccc; padding: 10px; border-radius: 4px; }
.doc .party .title { font-weight: bold; margin-bottom: 6px; font-size: 10pt; color: #555; text-transform: uppercase; }
.doc .boxed { border: 1px solid #ccc; padding: 10px; margin: 16px 0; font-size: 11pt; }
.doc .cert-box { border: 2px solid #000; padding: 12px; margin: 16px 0; }
.doc .cert-box .title { font-weight: bold; text-align: center; margin-bottom: 8px; }
.doc .charges td.label { font-weight: bold; width: 40%; background: #f8f8f8; }
.doc .charges td.grand { font-weight: bold; font-size: 13pt; background: #eef7ee; }
.doc .pass, .doc .check-yes { color: #065f46; font-weight: bold; }
.doc .fail, .doc .check-no { color: #991b1b; font-weight: bold; }
.doc .warn { color: #92400e; font-weight: bold; }
.doc .check-na { color: #64748b; }
.doc .verdict { border: 2px solid #000; padding: 16px; margin: 20px 0; text-align: center; }
.doc .verdict .result { font-size: 18pt; font-weight: bold; }
.doc .verdict.ok { border-color: #059669; }
.doc .verdict.cond { border-color: #d97706; }
.doc .verdict.bad { border-color: #dc2626; }
.doc .summary { border: 2px solid #000; padding: 14px; margin: 16px 0; font-size: 11pt; }
.doc .summary .score { font-size: 20pt; font-weight: bold; text-align: center; margin: 8px 0; }
.doc .balance-box { display: flex; justify-content: space-around; gap: 12px; margin: 20px 0; }
.doc .balance-item { text-align: center; border: 2px solid #000; padding: 14px 20px; min-width: 150px; }
.doc .balance-item .val { font-size: 20pt; font-weight: bold; }
.doc .balance-item .lbl { font-size: 9pt; color: #555; margin-top: 4px; }
.doc .balance-item.negative .val, .doc .neg { color: #991b1b; }
.doc .balance-item.positive .val, .doc .pos { color: #065f46; }
.doc.mass th, .doc.mass td { text-align: right; padding: 5px 6px; }
.doc.mass th { text-align: center; font-size: 9pt; }
.doc.mass td:first-child, .doc.mass th:first-child { text-align: left; }
.doc.mass table { font-size: 10pt; }
.doc.mass .total-row td { border-top: 2px solid #000; }
.doc.haccp .header { border-bottom-color: #dc2626; }
.doc.haccp .header h1 { color: #991b1b; }
.doc.haccp .header .subtitle { font-size: 10pt; color: #dc2626; }
.doc.haccp .section-title { background: #fef2f2; border-color: #dc2626; color: #991b1b; }
.doc.haccp th { background: #fef2f2; }
.doc .deviation-box { border: 2px solid #dc2626; padding: 14px; margin: 16px 0; }
.doc .deviation-box .title { font-weight: bold; color: #991b1b; margin-bottom: 8px; }
.doc .signatures { display: flex; justify-content: space-between; gap: 24px; margin-top: 40px; }
.doc .sig-block { flex: 1; }
.doc .sig-block .line { border-bottom: 1px solid #000; height: 25px; margin-top: 20px; }
.doc .sig-block .label { font-size: 9pt; color: #555; margin-top: 4px; text-align: center; }
.doc .stamp-area { text-align: center; margin-top: 20px; font-size: 10pt; color: #999; border: 1px dashed #ccc; padding: 15px; }
.doc .empty { text-align: center; color: #64748b; }

.bon { font-family: Calibri, Arial, sans-serif; font-size: 11pt; max-width: 210mm; padding: 15mm; }
.bon .title-row td { background: #a9d18e; font-weight: bold; text-align: center; font-size: 13pt; padding: 8px; border: 1px solid #000; }
.bon .info-table { margin-bottom: 12px; }
.bon .info-table td, .bon .summary-table td { border: 1px solid #000; padding: 5px 8px; }
.bon td.label { font-weight: bold; width: 30%; background: #f2f2f2; }
.bon .group-block { margin-bottom: 18px; break-inside: avoid; }
.bon .group-title { font-weight: bold; font-size: 12pt; background: #dcecd6; border: 1px solid #000; padding: 5px 8px; }
.bon .pallet-table th, .bon .pallet-table td { border: 1px solid #000; padding: 4px 8px; text-align: center; }
.bon .pallet-table th { background: #f2f2f2; font-weight: bold; }
.bon .pallet-table td.rejected { color: #c00; font-weight: bold; }
.bon .group-summary-table td { border: 1px solid #000; padding: 4px 8px; font-size: 10pt; }
.bon .group-summary-table td.label { background: #f8f8f8; }
.bon .summary-table { margin-top: 12px; }
.bon .red { color: #c00; font-weight: bold; }

@media print {
  .no-print { display: none !important; }
  body { margin: 0; }
  .doc, .bon, .doc.landscape { padding: 0; max-width: none; }
}
`;

export function PrintShell({
  lang, onLang, landscape, note, children,
}: {
  lang: Lang; onLang: (l: Lang) => void; landscape?: boolean; note?: ReactNode; children: ReactNode;
}) {
  return (
    <div className="print-root">
      <style>{CSS}</style>
      <style>{`@media print { @page { size: A4${landscape ? " landscape" : ""}; margin: 12mm 15mm; } }`}</style>
      <div className="print-toolbar no-print">
        <button className="print-btn" onClick={() => window.print()}>Печать / Tipărește / Print</button>
        <div className="flex gap-1">
          {LANGS.map(l => (
            <button key={l} className={`lang ${l === lang ? "active" : ""}`} onClick={() => onLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      {note && <div className="print-note no-print">{note}</div>}
      {children}
    </div>
  );
}

// Logo from Settings > Company; the <img> hides itself when none is set (404).
function Logo() {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/settings/logo`} alt="" className="doc-logo" onError={() => setOk(false)} />;
}

export function Header({ company, title, subtitle }: { company: string; title: string; subtitle?: string }) {
  return (
    <div className="header">
      <Logo />
      <div className="company">{company}</div>
      <h1>{title}</h1>
      {subtitle && <div className="company subtitle">{subtitle}</div>}
    </div>
  );
}

export function Signatures({ labels }: { labels: string[] }) {
  return (
    <div className="signatures">
      {labels.map(l => (
        <div key={l} className="sig-block"><div className="line" /><div className="label">{l}</div></div>
      ))}
    </div>
  );
}
