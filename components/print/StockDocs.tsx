"use client";

import type { purchaseAct } from "@/lib/documents/purchase";
import type { custodyReleaseAct } from "@/lib/documents/custody";
import type { massBalance } from "@/lib/documents/stock";
import { Lang, f1, f2, z1, z2, dash, Header, Signatures } from "./PrintShell";

type PAct = Awaited<ReturnType<typeof purchaseAct>>;
type CAct = Awaited<ReturnType<typeof custodyReleaseAct>>;
type MB   = Awaited<ReturnType<typeof massBalance>>;

const STATUS: Record<Lang, Record<string, string>> = {
  ro: { draft: "Ciornă", confirmed: "Confirmat", closed: "Închis", cancelled: "Anulat" },
  ru: { draft: "Черновик", confirmed: "Подтверждён", closed: "Закрыт", cancelled: "Отменён" },
  en: { draft: "Draft", confirmed: "Confirmed", closed: "Closed", cancelled: "Cancelled" },
};

// ── Act de recepție materie primă ────────────────────────────────────────
const PACT_T = {
  ro: { title: "ACT DE RECEPTIE MATERIE PRIMA", nr: "Nr.", data: "Data", status: "Status", furnizor: "Furnizor", depozit: "Depozit",
        col_produs: "Produs", col_lazi: "Lazi", col_brut: "Brut, kg", col_tara: "Tara, kg", col_net: "Net, kg", col_pret: "Pret/kg", col_suma: "Suma",
        total: "TOTAL", reducere: "Reducere", transport: "Transport", sofer: "Sofer", observatii: "Observatii",
        primit: "Primit de", predat: "Predat de", stamp: "Ștampilă" },
  ru: { title: "АКТ ПРИЁМКИ СЫРЬЯ", nr: "№", data: "Дата", status: "Статус", furnizor: "Поставщик", depozit: "Склад",
        col_produs: "Продукция", col_lazi: "Ящиков", col_brut: "Брутто, кг", col_tara: "Тара, кг", col_net: "Нетто, кг", col_pret: "Цена/кг", col_suma: "Сумма",
        total: "ИТОГО", reducere: "Скидка", transport: "Транспорт", sofer: "Водитель", observatii: "Примечания",
        primit: "Принял", predat: "Сдал", stamp: "М.П." },
  en: { title: "RAW MATERIAL RECEIPT ACT", nr: "No.", data: "Date", status: "Status", furnizor: "Supplier", depozit: "Warehouse",
        col_produs: "Product", col_lazi: "Crates", col_brut: "Gross, kg", col_tara: "Tare, kg", col_net: "Net, kg", col_pret: "Price/kg", col_suma: "Amount",
        total: "TOTAL", reducere: "Discount", transport: "Transport", sofer: "Driver", observatii: "Notes",
        primit: "Received by", predat: "Handed over by", stamp: "Seal" },
};

export function PurchaseAct({ d, lang }: { d: PAct; lang: Lang }) {
  const L = PACT_T[lang];
  return (
    <div className="doc">
      <Header company={d.company_name} title={L.title} />
      <div className="doc-info">
        <div>{L.nr}: <strong>{dash(d.doc_number)}</strong></div>
        <div style={{ textAlign: "center" }}>{L.data}: <strong>{dash(d.doc_date)}</strong></div>
        <div style={{ textAlign: "right" }}>{L.status}: <strong>{STATUS[lang][d.status] ?? dash(d.status)}</strong></div>
      </div>
      <div className="doc-info">
        <div>{L.furnizor}: <strong>{dash(d.supplier_name)}</strong>{d.supplier_tax_id && <> (IDNO {d.supplier_tax_id})</>}</div>
        <div style={{ textAlign: "right" }}>{L.depozit}: <strong>{dash(d.warehouse_name)}</strong></div>
      </div>
      <table>
        <thead>
          <tr>
            <th>#</th><th>{L.col_produs}</th><th className="num">{L.col_lazi}</th><th className="num">{L.col_brut}</th>
            <th className="num">{L.col_tara}</th><th className="num">{L.col_net}</th><th className="num">{L.col_pret}</th><th className="num">{L.col_suma}</th>
          </tr>
        </thead>
        <tbody>
          {d.lines.map((l, i) => (
            <tr key={i}>
              <td>{i + 1}</td><td>{dash(l.item_name)}</td><td className="num">{l.crate_count || "—"}</td>
              <td className="num">{f1(l.gross_weight_kg)}</td><td className="num">{f1(l.tare_weight_kg)}</td><td className="num">{f1(l.net_weight_kg)}</td>
              <td className="num">{f2(l.price_per_kg)}</td><td className="num">{f2(l.total_amount)}</td>
            </tr>
          ))}
          {d.lines.length === 0 && <tr><td colSpan={8} className="empty">—</td></tr>}
        </tbody>
        <tfoot>
          <tr className="total-row">
            <td colSpan={2}>{L.total}</td><td className="num">{d.total_crates || "—"}</td><td className="num">{f1(d.total_gross_kg)}</td>
            <td className="num">{f1(d.total_tare_kg)}</td><td className="num">{f1(d.total_net_kg)}</td><td />
            <td className="num">{f2(d.total_amount)} {d.currency_code}</td>
          </tr>
        </tfoot>
      </table>
      {d.discount_pct > 0 && <div className="doc-info"><div>{L.reducere}: <strong>{d.discount_pct}%</strong></div></div>}
      <div className="doc-info">
        <div>{L.transport}: {dash(d.vehicle_number)}</div>
        <div style={{ textAlign: "right" }}>{L.sofer}: {dash(d.driver_name)}</div>
      </div>
      {d.notes && <div className="doc-info"><div>{L.observatii}: {d.notes}</div></div>}
      <Signatures labels={[L.primit, L.predat]} />
      <div className="stamp-area">{L.stamp}</div>
    </div>
  );
}

// ── Act de prestări servicii (custody release) ───────────────────────────
const CACT_T = {
  ro: { title: "ACT DE PRESTARI SERVICII", subtitle: "Servicii de prerăcire și păstrare marfă in depozitare",
        nr_act: "Nr. act", data: "Data", client: "Client",
        col_batch: "Lot", col_produs: "Produs", col_brut: "Brut, kg", col_tara: "Tara, kg", col_net: "Net, kg",
        total: "TOTAL", calcul: "CALCULUL SUMEI", pastrare: "Păstrare", preracire: "Prerăcire", total_achitat: "TOTAL DE ACHITAT",
        note: "Note", prestator: "Prestator", beneficiar: "Beneficiar", stamp: "Ștampilă" },
  ru: { title: "АКТ ВЫПОЛНЕННЫХ РАБОТ", subtitle: "Услуги охлаждения и хранения товара на ответственном хранении",
        nr_act: "№ акта", data: "Дата", client: "Клиент",
        col_batch: "Партия", col_produs: "Продукт", col_brut: "Брутто, кг", col_tara: "Тара, кг", col_net: "Нетто, кг",
        total: "ИТОГО", calcul: "РАСЧЁТ СУММЫ", pastrare: "Хранение", preracire: "Охлаждение", total_achitat: "ИТОГО К ОПЛАТЕ",
        note: "Примечание", prestator: "Исполнитель", beneficiar: "Заказчик", stamp: "М.П." },
  en: { title: "SERVICE ACT", subtitle: "Precooling and storage services",
        nr_act: "Act no.", data: "Date", client: "Client",
        col_batch: "Batch", col_produs: "Product", col_brut: "Gross, kg", col_tara: "Tare, kg", col_net: "Net, kg",
        total: "TOTAL", calcul: "AMOUNT CALCULATION", pastrare: "Storage", preracire: "Precooling", total_achitat: "TOTAL DUE",
        note: "Note", prestator: "Provider", beneficiar: "Client", stamp: "Seal" },
};

export function CustodyReleaseAct({ d, lang }: { d: CAct; lang: Lang }) {
  const L = CACT_T[lang];
  const opt = (v: number | null) => (v != null ? v.toFixed(1) : "—");
  return (
    <div className="doc">
      <Header company={d.company_name} title={L.title} subtitle={L.subtitle} />
      <div className="doc-info">
        <div>{L.nr_act}: <strong>{dash(d.doc_number)}</strong></div>
        <div style={{ textAlign: "right" }}>{L.data}: <strong>{dash(d.doc_date)}</strong></div>
      </div>
      <div className="doc-info"><div>{L.client}: <strong>{dash(d.client_name)}</strong></div></div>
      <table>
        <thead>
          <tr><th>#</th><th>{L.col_batch}</th><th>{L.col_produs}</th><th className="num">{L.col_brut}</th><th className="num">{L.col_tara}</th><th className="num">{L.col_net}</th></tr>
        </thead>
        <tbody>
          {d.lines.map((l, i) => (
            <tr key={i}>
              <td>{i + 1}</td><td>{dash(l.batch_number)}</td><td>{dash(l.item_name)}</td>
              <td className="num">{opt(l.gross_kg)}</td><td className="num">{opt(l.tare_kg)}</td><td className="num">{f1(l.qty_kg)}</td>
            </tr>
          ))}
          {d.lines.length === 0 && <tr><td colSpan={6} className="empty">—</td></tr>}
        </tbody>
        <tfoot>
          <tr className="total-row">
            <td colSpan={3}>{L.total}</td><td className="num">{f1(d.total_gross_kg)}</td>
            <td className="num">{f1(d.total_tare_kg)}</td><td className="num">{f1(d.total_qty_kg)}</td>
          </tr>
        </tfoot>
      </table>
      <table className="charges">
        <tbody>
          <tr className="total-row"><td colSpan={2}>{L.calcul}</td></tr>
          <tr>
            <td className="label">{L.pastrare}</td>
            <td>{z1(d.total_qty_kg)} kg &times; {z2(d.storage_price_per_kg)} MDL/kg = <strong>{z2(d.storage_amount)} MDL</strong></td>
          </tr>
          {d.precooling_qty_kg > 0 && (
            <tr>
              <td className="label">{L.preracire}</td>
              <td>{z1(d.precooling_qty_kg)} kg &times; {z2(d.precooling_price_per_kg)} MDL/kg = <strong>{z2(d.precooling_amount)} MDL</strong></td>
            </tr>
          )}
          <tr><td className="label grand">{L.total_achitat}</td><td className="grand">{z2(d.total_amount)} MDL</td></tr>
        </tbody>
      </table>
      {d.notes && <div className="doc-info"><div>{L.note}: {d.notes}</div></div>}
      <Signatures labels={[`${L.prestator} (${d.company_name})`, `${L.beneficiar} — ${dash(d.client_name)}`]} />
      <div className="stamp-area">{L.stamp}</div>
    </div>
  );
}

// ── Bilanț de masă ───────────────────────────────────────────────────────
const MB_T = {
  ro: { title: "BILANT DE MASA", perioada: "Perioada", depozit: "Depozit", toate: "Toate",
        primit: "Primit kg", livrat: "Livrat kg", deseuri: "Deseuri kg", stoc: "Stoc final kg",
        col_produs: "Produs", col_stoc_init: "Stoc initial", col_intrari: "Intrari", col_iesiri: "Iesiri",
        col_deseuri: "Deseuri", col_pierderi: "Pierderi", col_stoc_final: "Stoc final", col_bilant: "Variatie",
        total: "TOTAL", nimic: "Nu există mișcări în perioada selectată",
        gestionar: "Gestionar", contabil: "Contabil", director: "Director" },
  ru: { title: "БАЛАНС МАССЫ", perioada: "Период", depozit: "Склад", toate: "Все",
        primit: "Принято кг", livrat: "Отгружено кг", deseuri: "Отходы кг", stoc: "Кон. остаток кг",
        col_produs: "Продукция", col_stoc_init: "Нач. остаток", col_intrari: "Поступления", col_iesiri: "Отгрузки",
        col_deseuri: "Отходы", col_pierderi: "Потери", col_stoc_final: "Кон. остаток", col_bilant: "Изменение",
        total: "ИТОГО", nimic: "Нет движений за выбранный период",
        gestionar: "Складской учёт", contabil: "Бухгалтер", director: "Директор" },
  en: { title: "MASS BALANCE", perioada: "Period", depozit: "Warehouse", toate: "All",
        primit: "Received kg", livrat: "Shipped kg", deseuri: "Waste kg", stoc: "Closing stock kg",
        col_produs: "Product", col_stoc_init: "Opening stock", col_intrari: "Receipts", col_iesiri: "Shipments",
        col_deseuri: "Waste", col_pierderi: "Losses", col_stoc_final: "Closing stock", col_bilant: "Change",
        total: "TOTAL", nimic: "No movements in the selected period",
        gestionar: "Warehouse keeper", contabil: "Accountant", director: "Director" },
};

export function MassBalance({ d, lang }: { d: MB; lang: Lang }) {
  const L = MB_T[lang];
  const signed = (v: number) => (v > 0 ? "+" : "") + z1(v);
  return (
    <div className="doc landscape mass">
      <Header company={d.company_name} title={L.title} />
      <div className="doc-row">
        <div>{L.perioada}: <strong>{d.date_from}</strong> — <strong>{d.date_to}</strong></div>
        <div>{L.depozit}: <strong>{d.warehouse_name || L.toate}</strong></div>
      </div>
      <div className="balance-box">
        <div className="balance-item positive"><div className="val">{z1(d.total_received_kg)}</div><div className="lbl">{L.primit}</div></div>
        <div className="balance-item negative"><div className="val">{z1(d.total_shipped_kg)}</div><div className="lbl">{L.livrat}</div></div>
        <div className="balance-item negative"><div className="val">{z1(d.total_waste_kg)}</div><div className="lbl">{L.deseuri}</div></div>
        <div className="balance-item"><div className="val">{z1(d.current_stock_kg)}</div><div className="lbl">{L.stoc}</div></div>
      </div>
      <table>
        <thead>
          <tr>
            <th>{L.col_produs}</th><th>{L.col_stoc_init}</th><th>{L.col_intrari}</th><th>{L.col_iesiri}</th>
            <th>{L.col_deseuri}</th><th>{L.col_pierderi}</th><th>{L.col_stoc_final}</th><th>{L.col_bilant}</th>
          </tr>
        </thead>
        <tbody>
          {d.items.map((r, i) => (
            <tr key={i}>
              <td>{dash(r.item_name)}</td>
              <td>{z1(r.opening_qty_kg)}</td>
              <td className="pos">+{z1(r.received_qty_kg)}</td>
              <td className="neg">-{z1(r.shipped_qty_kg)}</td>
              <td className="neg">-{z1(r.waste_qty_kg)}</td>
              <td className="neg">-{z1(r.loss_qty_kg)}</td>
              <td style={{ fontWeight: "bold" }}>{z1(r.closing_qty_kg)}</td>
              <td style={{ fontWeight: "bold" }}>{signed(r.balance_diff)}</td>
            </tr>
          ))}
          {d.items.length === 0 && <tr><td colSpan={8} className="empty" style={{ textAlign: "center" }}>{L.nimic}</td></tr>}
        </tbody>
        <tfoot>
          <tr className="total-row">
            <td>{L.total}</td><td>{z1(d.total_opening)}</td><td>+{z1(d.total_received_kg)}</td><td>-{z1(d.total_shipped_kg)}</td>
            <td>-{z1(d.total_waste_kg)}</td><td>-{z1(d.total_loss_kg)}</td><td>{z1(d.current_stock_kg)}</td><td>{signed(d.total_balance)}</td>
          </tr>
        </tfoot>
      </table>
      <Signatures labels={[L.gestionar, L.contabil, L.director]} />
    </div>
  );
}
