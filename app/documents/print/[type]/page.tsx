"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { PrintShell, type Lang } from "@/components/print/PrintShell";
import { SalesPalletBon, ShippingNote, ExportDecl, ReturnAct, ReconciliationAct } from "@/components/print/SalesDocs";
import { PurchaseAct, CustodyReleaseAct, MassBalance } from "@/components/print/StockDocs";
import { QaProtocol, GmpChecklist, HaccpReport } from "@/components/print/QualityDocs";

/* eslint-disable @typescript-eslint/no-explicit-any -- each renderer is typed against its own builder's return type */
const RENDERERS: Record<string, { render: (d: any, lang: Lang) => ReactNode; landscape?: boolean }> = {
  sales_pallet_bon:    { render: (d, l) => <SalesPalletBon d={d} lang={l} /> },
  shipping_note:       { render: (d, l) => <ShippingNote d={d} lang={l} /> },
  export_decl:         { render: (d, l) => <ExportDecl d={d} lang={l} /> },
  return_act:          { render: (d, l) => <ReturnAct d={d} lang={l} /> },
  reconciliation_act:  { render: (d, l) => <ReconciliationAct d={d} lang={l} /> },
  purchase_act:        { render: (d, l) => <PurchaseAct d={d} lang={l} /> },
  custody_release_act: { render: (d, l) => <CustodyReleaseAct d={d} lang={l} /> },
  mass_balance:        { render: (d, l) => <MassBalance d={d} lang={l} />, landscape: true },
  qa_protocol:         { render: (d, l) => <QaProtocol d={d} lang={l} /> },
  gmp_checklist:       { render: (d, l) => <GmpChecklist d={d} lang={l} /> },
  haccp_report:        { render: (d, l) => <HaccpReport d={d} lang={l} /> },
};
/* eslint-enable @typescript-eslint/no-explicit-any */

function PrintDocument() {
  const { type }     = useParams<{ type: string }>();
  const searchParams = useSearchParams();
  const initialLang  = searchParams.get("lang");
  const [lang, setLang]   = useState<Lang>(initialLang === "ru" || initialLang === "en" ? initialLang : "ro");
  const [data, setData]   = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const qs = searchParams.toString();
  const renderer = RENDERERS[type];

  useEffect(() => {
    if (!renderer) return;
    let cancelled = false;
    (async () => {
      const sp = new URLSearchParams(qs);
      sp.set("lang", lang);
      const res  = await fetch(`/api/documents/${type}?${sp.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) { setError(json.error ?? "Ошибка"); setData(null); }
      else         { setError(null); setData(json); }
    })();
    return () => { cancelled = true; };
  }, [type, qs, lang, renderer]);

  if (!renderer) return <div className="p-8 text-red-600">Неизвестный тип документа: {type}</div>;
  if (error)     return <div className="p-8 text-red-600">Ошибка: {error}</div>;
  if (!data)     return <div className="p-8 text-gray-500">Загрузка...</div>;

  const note = type === "export_decl" && data.has_decl === false
    ? "Декларация по этой продаже ещё не оформлена — печатается бланк, заполненный данными продажи. Номер, транспорт и фитосертификат впишите от руки."
    : undefined;

  return (
    <PrintShell lang={lang} onLang={setLang} landscape={renderer.landscape} note={note}>
      {renderer.render(data, lang)}
    </PrintShell>
  );
}

export default function PrintDocumentPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-500">Загрузка...</div>}>
      <PrintDocument />
    </Suspense>
  );
}
