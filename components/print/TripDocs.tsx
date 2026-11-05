"use client";

import type { tripSheet } from "@/lib/documents/trips";
import { Lang, f1, f2, dash, Header, Signatures } from "./PrintShell";

// ── Foaie de parcurs (trip sheet) ────────────────────────────────────────
type Sheet = Awaited<ReturnType<typeof tripSheet>>;

const TRIP_T = {
  ro: { title: "FOAIE DE PARCURS", nr: "Nr.", data: "Data", anulat: "ANULAT", auto: "Automobil", carrier: "Transportator", sofer: "Șofer",
        tel: "Tel.", dest: "Destinația", plecare: "Plecare", col_client: "Destinatar / adresa", col_doc: "Document", col_kg: "Net, kg",
        col_suma: "Suma", col_semn: "Primit (nume, semnătura, ora)", total: "Total", note: "Observații", expeditor: "Expeditor", sofer_s: "Șofer" },
  ru: { title: "МАРШРУТНЫЙ ЛИСТ", nr: "№", data: "Дата", anulat: "ОТМЕНЁН", auto: "Автомобиль", carrier: "Перевозчик", sofer: "Водитель",
        tel: "Тел.", dest: "Направление", plecare: "Выезд", col_client: "Получатель / адрес", col_doc: "Документ", col_kg: "Нетто, кг",
        col_suma: "Сумма", col_semn: "Принял (ФИО, подпись, время)", total: "Итого", note: "Примечание", expeditor: "Отправитель", sofer_s: "Водитель" },
  en: { title: "TRIP SHEET", nr: "No.", data: "Date", anulat: "CANCELLED", auto: "Vehicle", carrier: "Carrier", sofer: "Driver",
        tel: "Phone", dest: "Destination", plecare: "Departure", col_client: "Consignee / address", col_doc: "Document", col_kg: "Net, kg",
        col_suma: "Amount", col_semn: "Received (name, signature, time)", total: "Total", note: "Notes", expeditor: "Shipper", sofer_s: "Driver" },
};

export function TripSheet({ d, lang }: { d: Sheet; lang: Lang }) {
  const L = TRIP_T[lang];
  return (
    <div className="doc">
      <Header company={d.company_name} title={L.title} />
      {d.status === "cancelled" && <div className="verdict bad"><div className="result fail">{L.anulat}</div></div>}
      <div className="doc-row">
        <div>{L.nr}: <strong>{dash(d.doc_number)}</strong></div>
        <div>{L.data}: <strong>{dash(d.doc_date)}</strong></div>
      </div>
      <div className="parties">
        <div className="party">
          <div className="title">{L.auto}</div>
          <div><strong>{dash(d.plate)}</strong></div>
          {d.carrier && <div>{L.carrier}: {d.carrier}</div>}
          <div>{L.sofer}: <strong>{dash(d.driver)}</strong></div>
          {d.driver_phone && <div>{L.tel}: {d.driver_phone}</div>}
        </div>
        <div className="party">
          <div className="title">{L.dest}</div>
          <div><strong>{dash(d.destination)}</strong></div>
          {d.departed_at && <div>{L.plecare}: {d.departed_at}</div>}
        </div>
      </div>
      <table>
        <thead><tr><th>#</th><th>{L.col_client}</th><th>{L.col_doc}</th><th className="num">{L.col_kg}</th><th className="num">{L.col_suma}</th><th>{L.col_semn}</th></tr></thead>
        <tbody>
          {d.stops.map((x, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td><strong>{dash(x.customer_name)}</strong><div>{x.address}</div>{x.phone && <div>{L.tel}: {x.phone}</div>}</td>
              <td>{dash(x.sale_number)}<div>{x.sale_date}</div></td>
              <td className="num">{f1(x.net_kg)}</td>
              <td className="num">{f2(x.amount)} {x.currency}</td>
              <td style={{ minWidth: "45mm" }} />
            </tr>
          ))}
          {d.stops.length === 0 && <tr><td colSpan={6} className="empty">—</td></tr>}
        </tbody>
        <tfoot>
          <tr className="total-row"><td colSpan={3}>{L.total}</td><td className="num">{f1(d.total_kg)}</td><td colSpan={2} /></tr>
        </tfoot>
      </table>
      {d.notes && <div className="boxed"><strong>{L.note}:</strong> {d.notes}</div>}
      <Signatures labels={[L.expeditor, L.sofer_s]} />
    </div>
  );
}
