"use client";

import type { salesPalletBon, shippingNote, exportDecl } from "@/lib/documents/sales";
import type { returnAct } from "@/lib/documents/returns";
import { Lang, f1, f2, f3, dash, Header, Signatures } from "./PrintShell";

type Bon      = Awaited<ReturnType<typeof salesPalletBon>>;
type Aviz     = Awaited<ReturnType<typeof shippingNote>>;
type ExportD  = Awaited<ReturnType<typeof exportDecl>>;

// ── Bon vânzare ──────────────────────────────────────────────────────────
const BON_T = {
  ro: {
    bon_title: "BON VANZARE", centru: "Centru Logistic", client: "Client", data: "Data",
    produs: "Produs", camion: "Camion", observatii: "Observatii:", tip_ambalaj: "Tip ambalaj:",
    col_palete: "Nr Palete", col_brut: "Q Brut, kg", col_lazi: "Nr Lazi", col_net: "Neto", col_note: "Note",
    total: "Total", kg_brut: "kg brut", lazi: "lazi", net: "net", rebut: "REBUT",
    tara_kg: "Tara kg", rebut_kg: "Rebut, kg", rebut_lazi_palete: "Rebut (lazi/palete)",
    total_bon: "TOTAL BON", neto_kg: "Neto, kg", total_palete: "Total palete",
    paleti_comuni: "Paleți comuni", furnizor: "Furnizor",
    col_containere: "Nr Containere", col_palete_mixed: "Nr Palete/Containere", col_saci: "Nr Saci", col_lazi_mixed: "Nr Lazi/Saci",
    saci: "saci", lazi_mixed: "lazi/saci",
    tu_pallet: "Tara/palet", tu_container: "Tara/container", tu_crate: "Tara/lada", tu_sack: "Tara/sac", tu_mixed: "Tara/unitate",
  },
  ru: {
    bon_title: "НАКЛАДНАЯ ПРОДАЖИ", centru: "Логистический центр", client: "Клиент", data: "Дата",
    produs: "Продукт", camion: "Автомобиль", observatii: "Примечания:", tip_ambalaj: "Тип упаковки:",
    col_palete: "Кол-во палет", col_brut: "Брутто, кг", col_lazi: "Кол-во ящиков", col_net: "Нетто", col_note: "Примечание",
    total: "Итого", kg_brut: "кг брутто", lazi: "ящиков", net: "нетто", rebut: "БРАК",
    tara_kg: "Тара кг", rebut_kg: "Брак, кг", rebut_lazi_palete: "Брак (ящики/палеты)",
    total_bon: "ИТОГО ПО НАКЛАДНОЙ", neto_kg: "Нетто, кг", total_palete: "Всего палет",
    paleti_comuni: "Общие паллеты", furnizor: "Поставщик",
    col_containere: "Кол-во контейнеров", col_palete_mixed: "Кол-во палет/контейнеров", col_saci: "Кол-во мешков", col_lazi_mixed: "Кол-во ящиков/мешков",
    saci: "мешков", lazi_mixed: "ящиков/мешков",
    tu_pallet: "Тара/палета", tu_container: "Тара/контейнер", tu_crate: "Тара/ящик", tu_sack: "Тара/мешок", tu_mixed: "Тара/ед.",
  },
  en: {
    bon_title: "SALES RECEIPT", centru: "Logistics Center", client: "Customer", data: "Date",
    produs: "Product", camion: "Vehicle", observatii: "Notes:", tip_ambalaj: "Packaging type:",
    col_palete: "Pallets", col_brut: "Gross, kg", col_lazi: "Crates", col_net: "Net", col_note: "Note",
    total: "Total", kg_brut: "kg gross", lazi: "crates", net: "net", rebut: "REJECTED",
    tara_kg: "Tare kg", rebut_kg: "Rejected, kg", rebut_lazi_palete: "Rejected (crates/pallets)",
    total_bon: "RECEIPT TOTAL", neto_kg: "Net, kg", total_palete: "Total pallets",
    paleti_comuni: "Shared pallets", furnizor: "Supplier",
    col_containere: "Containers", col_palete_mixed: "Pallets/Containers", col_saci: "Sacks", col_lazi_mixed: "Crates/Sacks",
    saci: "sacks", lazi_mixed: "crates/sacks",
    tu_pallet: "Tare/pallet", tu_container: "Tare/container", tu_crate: "Tare/crate", tu_sack: "Tare/sack", tu_mixed: "Tare/unit",
  },
};

export function SalesPalletBon({ d, lang }: { d: Bon; lang: Lang }) {
  const L = BON_T[lang];
  const COLP = { pallet: L.col_palete, container: L.col_containere, mixed: L.col_palete_mixed };
  const COLC = { crate: L.col_lazi, sack: L.col_saci, mixed: L.col_lazi_mixed };
  const UNC  = { crate: L.lazi, sack: L.saci, mixed: L.lazi_mixed };
  const TARE = { pallet: L.tu_pallet, container: L.tu_container, crate: L.tu_crate, sack: L.tu_sack, mixed: L.tu_mixed };
  const units = (v: number) => (v ? Math.round(v) : "—");

  return (
    <div className="bon">
      <table className="info-table">
        <tbody>
          <tr className="title-row"><td colSpan={2}>{L.bon_title}{d.doc_number ? ` Nr. ${d.doc_number}` : ""}</td></tr>
          {[
            [L.centru, d.warehouse_name], [L.client, d.customer_name], [L.data, d.doc_date],
            [L.produs, d.product_names], [L.camion, d.vehicle_plate], [L.observatii, d.notes],
          ].map(([k, v]) => <tr key={k}><td className="label">{k}</td><td>{dash(v)}</td></tr>)}
        </tbody>
      </table>

      {d.groups.map((g, gi) => (
        <div key={gi} className="group-block">
          <div className="group-title">
            {dash(g.item_name)}{g.variety_name && ` (${g.variety_name})`} — {dash(g.supplier_name)}
            {g.packaging_kind_label && <> &middot; {L.tip_ambalaj} {g.packaging_kind_label}</>}
          </div>
          <table className="pallet-table">
            <thead><tr><th>{COLP[g.pallet_kind]}</th><th>{L.col_brut}</th><th>{COLC[g.crate_kind]}</th><th>{L.col_net}</th><th>{L.col_note}</th></tr></thead>
            <tbody>
              {g.pallets.length === 0 && <tr><td colSpan={5}>—</td></tr>}
              {g.pallets.map((p, pi) => (
                <tr key={pi}>
                  <td>{p.pallet_no || "—"}</td>
                  <td>{f1(p.gross_kg)}</td>
                  <td>{p.crates_count || "—"}</td>
                  <td>{p.net_kg ? (p.net_kg - p.rejected_kg).toFixed(1) : "—"}</td>
                  <td className={p.rejected ? "rejected" : ""}>
                    {p.rejected ? `${L.rebut} ${p.rejected_kg.toFixed(1)} kg${p.notes ? " — " + p.notes : ""}` : p.notes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="group-summary-table">
            <tbody>
              <tr>
                <td className="label">{L.total}</td>
                <td>
                  {g.total_gross_kg.toFixed(1)} {L.kg_brut}
                  {Math.trunc(g.total_crates) > 0 && <> &middot; {Math.trunc(g.total_crates)} {UNC[g.crate_kind]}</>}
                  {" "}&middot; {L.net} <strong>{g.total_net_kg.toFixed(1)} kg</strong>
                </td>
              </tr>
              <tr><td className="label">{L.total_palete}</td><td>{units(g.total_pallet_count)}</td></tr>
              <tr><td className="label">{TARE[g.tare_unit_kind ?? "mixed"]}</td><td>{f3(g.tare_per_unit_kg)} kg</td></tr>
              <tr><td className="label">{L.tara_kg}</td><td>{g.total_tare_kg.toFixed(1)}</td></tr>
              {g.rejected_kg > 0 && <tr><td className="label">{L.rebut_kg}</td><td className="red">{g.rejected_kg.toFixed(1)} kg</td></tr>}
              {(g.rejected_pallets > 0 || g.rejected_crates > 0) && (
                <tr><td className="label">{L.rebut_lazi_palete}</td><td>{Math.trunc(g.rejected_crates)} {UNC[g.crate_kind]} / {g.rejected_pallets} {COLP[g.pallet_kind]}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ))}
      {d.groups.length === 0 && d.shared_groups.length === 0 && <p>—</p>}

      {d.shared_groups.map((sg, si) => (
        <div key={si} className="group-block">
          <div className="group-title">
            {dash(sg.item_name)}{sg.variety_name && ` (${sg.variety_name})`} — {L.paleti_comuni}
            {sg.packaging_kind_label && <> &middot; {L.tip_ambalaj} {sg.packaging_kind_label}</>}
          </div>
          <table className="pallet-table">
            <thead><tr><th>{L.furnizor}</th><th>{L.col_brut}</th><th>{COLC[sg.crate_kind]}</th><th>{L.col_net}</th></tr></thead>
            <tbody>
              {sg.participants.map((p, pi) => (
                <tr key={pi}><td>{dash(p.supplier_name)}</td><td>{f1(p.gross_kg)}</td><td>{p.crates_count || "—"}</td><td>{f1(p.net_kg)}</td></tr>
              ))}
            </tbody>
          </table>
          <table className="group-summary-table">
            <tbody>
              <tr>
                <td className="label">{L.total}</td>
                <td>
                  {sg.total_gross_kg.toFixed(1)} {L.kg_brut}
                  {Math.trunc(sg.total_crates) > 0 && <> &middot; {Math.trunc(sg.total_crates)} {UNC[sg.crate_kind]}</>}
                  {" "}&middot; {L.net} <strong>{sg.total_net_kg.toFixed(1)} kg</strong>
                </td>
              </tr>
              <tr><td className="label">{L.total_palete}</td><td>1</td></tr>
              <tr><td className="label">{TARE[sg.tare_unit_kind ?? "mixed"]}</td><td>{f3(sg.tare_per_unit_kg)} kg</td></tr>
              <tr><td className="label">{L.tara_kg}</td><td>{sg.total_tare_kg.toFixed(1)}</td></tr>
            </tbody>
          </table>
        </div>
      ))}

      <table className="summary-table">
        <tbody>
          <tr className="title-row"><td colSpan={2}>{L.total_bon}</td></tr>
          <tr>
            <td className="label">{L.total}</td>
            <td>{d.total_gross_kg.toFixed(1)} {L.kg_brut}{Math.trunc(d.total_crates) > 0 && <> &middot; {Math.trunc(d.total_crates)} {UNC[d.crate_kind]}</>}</td>
          </tr>
          {d.rejected_kg > 0 && <tr><td className="label">{L.rebut_kg}</td><td className="red">{d.rejected_kg.toFixed(1)} kg</td></tr>}
          <tr><td className="label">{L.rebut_lazi_palete}</td><td>{Math.trunc(d.rejected_crates)} {UNC[d.crate_kind]} / {d.rejected_pallets} {COLP[d.pallet_kind]}</td></tr>
          <tr><td className="label">{L.total_palete}</td><td>{units(d.total_pallet_count)}</td></tr>
          <tr><td className="label">{TARE[d.tare_unit_kind ?? "mixed"]}</td><td>{f3(d.tare_per_unit_kg)} kg</td></tr>
          <tr><td className="label">{L.tara_kg}</td><td>{d.total_tare_kg.toFixed(1)}</td></tr>
          <tr><td className="label">{L.neto_kg}</td><td><strong>{d.total_net_kg.toFixed(1)}</strong></td></tr>
        </tbody>
      </table>
    </div>
  );
}

// ── Aviz de însoțire a mărfii ────────────────────────────────────────────
const AVIZ_T = {
  ro: { title: "AVIZ DE INSOTIRE A MARFII", nr: "Nr.", data: "Data", expeditor: "Expeditor", destinatar: "Destinatar",
        col_denumire: "Denumire", col_um: "UM", col_cant: "Cant.", col_pret: "Pret", col_suma: "Suma",
        total: "TOTAL", transport: "Transport", sofer: "Sofer", depozit: "Depozit", eliberat: "Eliberat de", primit: "Primit de" },
  ru: { title: "ТОВАРНАЯ НАКЛАДНАЯ", nr: "№", data: "Дата", expeditor: "Отправитель", destinatar: "Получатель",
        col_denumire: "Наименование", col_um: "Ед.", col_cant: "Кол-во", col_pret: "Цена", col_suma: "Сумма",
        total: "ИТОГО", transport: "Транспорт", sofer: "Водитель", depozit: "Склад", eliberat: "Отпустил", primit: "Принял" },
  en: { title: "DELIVERY NOTE", nr: "No.", data: "Date", expeditor: "Sender", destinatar: "Recipient",
        col_denumire: "Description", col_um: "Unit", col_cant: "Qty", col_pret: "Price", col_suma: "Amount",
        total: "TOTAL", transport: "Transport", sofer: "Driver", depozit: "Warehouse", eliberat: "Released by", primit: "Received by" },
};

export function ShippingNote({ d, lang }: { d: Aviz; lang: Lang }) {
  const L = AVIZ_T[lang];
  return (
    <div className="doc">
      <Header company={d.company_name} title={L.title} />
      <div className="doc-row">
        <div>{L.nr}: <strong>{dash(d.doc_number)}</strong></div>
        <div>{L.data}: <strong>{dash(d.doc_date)}</strong></div>
      </div>
      <div className="parties">
        <div className="party">
          <div className="title">{L.expeditor}</div>
          <div><strong>{dash(d.company_name)}</strong></div>
          <div>{d.company_address}</div>
          <div>IDNO: {d.company_idno}</div>
        </div>
        <div className="party">
          <div className="title">{L.destinatar}</div>
          <div><strong>{dash(d.customer_name)}</strong></div>
          <div>{d.customer_address}</div>
          <div>IDNO: {d.customer_idno}</div>
        </div>
      </div>
      <table>
        <thead><tr><th>#</th><th>{L.col_denumire}</th><th>{L.col_um}</th><th className="num">{L.col_cant}</th><th className="num">{L.col_pret}</th><th className="num">{L.col_suma}</th></tr></thead>
        <tbody>
          {d.lines.map((l, i) => (
            <tr key={i}><td>{i + 1}</td><td>{dash(l.item_name)}</td><td>kg</td><td className="num">{f1(l.qty_kg)}</td><td className="num">{f2(l.price_per_kg)}</td><td className="num">{f2(l.line_total)}</td></tr>
          ))}
          {d.lines.length === 0 && <tr><td colSpan={6} className="empty">—</td></tr>}
        </tbody>
        <tfoot>
          <tr className="total-row"><td colSpan={3}>{L.total}</td><td className="num">{f1(d.total_qty_kg)}</td><td /><td className="num">{f2(d.total_amount)} {d.currency_code}</td></tr>
        </tfoot>
      </table>
      <div className="boxed">
        <strong>{L.transport}:</strong> {dash(d.vehicle_number)} | {L.sofer}: {dash(d.driver_name)} | {L.depozit}: {dash(d.warehouse_name)}
      </div>
      <Signatures labels={[L.eliberat, L.primit, L.sofer]} />
    </div>
  );
}

// ── Declarație de export ─────────────────────────────────────────────────
const DECL_T = {
  ro: { title: "DECLARATIE DE EXPORT", s1: "1. Date generale", nr: "Nr.", data: "Data", doc_vanzare: "Documentul de vanzare", status: "Status",
        s2: "2. Exportator", denumire: "Denumire", adresa: "Adresa", s3: "3. Destinatar", tara: "Tara",
        s4: "4. Marfuri", col_denumire: "Denumire", col_cant: "Cant. kg", col_valoare: "Valoare", total: "TOTAL",
        s5: "5. Transport", mod: "Mod", port: "Port iesire", s6: "6. Certificat fitosanitar", data_eliberarii: "Data eliberarii",
        s7: "7. Furnizori (GlobalGAP)", furnizor: "Furnizor", nr_cert: "Nr. certificat", da: "Da", nu: "Nu", valabil: "Valabil pana la",
        observatii: "Observatii", exportator: "Exportator", vama: "Vama", fitoinspector: "Fitoinspector", stamp: "Ștampilă" },
  ru: { title: "ЭКСПОРТНАЯ ДЕКЛАРАЦИЯ", s1: "1. Общие сведения", nr: "№", data: "Дата", doc_vanzare: "Документ продажи", status: "Статус",
        s2: "2. Экспортёр", denumire: "Наименование", adresa: "Адрес", s3: "3. Получатель", tara: "Страна",
        s4: "4. Товары", col_denumire: "Наименование", col_cant: "Кол-во кг", col_valoare: "Стоимость", total: "ИТОГО",
        s5: "5. Транспорт", mod: "Вид", port: "Порт выхода", s6: "6. Фитосанитарный сертификат", data_eliberarii: "Дата выдачи",
        s7: "7. Поставщики (GlobalGAP)", furnizor: "Поставщик", nr_cert: "№ сертификата", da: "Да", nu: "Нет", valabil: "Действителен до",
        observatii: "Примечания", exportator: "Экспортёр", vama: "Таможня", fitoinspector: "Фитоинспектор", stamp: "М.П." },
  en: { title: "EXPORT DECLARATION", s1: "1. General information", nr: "No.", data: "Date", doc_vanzare: "Sales document", status: "Status",
        s2: "2. Exporter", denumire: "Name", adresa: "Address", s3: "3. Consignee", tara: "Country",
        s4: "4. Goods", col_denumire: "Description", col_cant: "Qty kg", col_valoare: "Value", total: "TOTAL",
        s5: "5. Transport", mod: "Mode", port: "Exit port", s6: "6. Phytosanitary certificate", data_eliberarii: "Issue date",
        s7: "7. Suppliers (GlobalGAP)", furnizor: "Supplier", nr_cert: "Certificate no.", da: "Yes", nu: "No", valabil: "Valid until",
        observatii: "Notes", exportator: "Exporter", vama: "Customs", fitoinspector: "Phyto inspector", stamp: "Seal" },
};

export function ExportDecl({ d, lang }: { d: ExportD; lang: Lang }) {
  const L = DECL_T[lang];
  const kv = (label: string, value: string) => (
    <div><span className="label">{label}:</span> <span className="value">{dash(value)}</span></div>
  );
  return (
    <div className="doc">
      <Header company={d.company_name} title={L.title} />
      <div className="section">
        <div className="section-title">{L.s1}</div>
        <div className="info-grid">
          {kv(L.nr, d.decl_number)}{kv(L.data, d.decl_date)}{kv(L.doc_vanzare, d.doc_number)}{kv(L.status, d.status)}
        </div>
      </div>
      <div className="section">
        <div className="section-title">{L.s2}</div>
        <div className="info-grid">{kv(L.denumire, d.company_name)}{kv(L.adresa, d.company_address)}</div>
      </div>
      <div className="section">
        <div className="section-title">{L.s3}</div>
        <div className="info-grid">{kv(L.denumire, d.customer_name)}{kv(L.tara, d.destination_country)}</div>
      </div>
      <div className="section">
        <div className="section-title">{L.s4}</div>
        <table>
          <thead><tr><th>#</th><th>{L.col_denumire}</th><th className="num">{L.col_cant}</th><th className="num">{L.col_valoare}</th></tr></thead>
          <tbody>
            {d.lines.map((l, i) => (
              <tr key={i}><td>{i + 1}</td><td>{dash(l.item_name)}</td><td className="num">{f1(l.qty_kg)}</td><td className="num">{f2(l.line_total)}</td></tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="total-row"><td colSpan={2}>{L.total}</td><td className="num">{f1(d.total_qty_kg)}</td><td className="num">{f2(d.total_amount)} {d.currency_code}</td></tr>
          </tfoot>
        </table>
      </div>
      <div className="section">
        <div className="section-title">{L.s5}</div>
        <div className="info-grid">{kv(L.mod, d.transport_mode)}{kv(L.port, d.port_of_exit)}</div>
      </div>
      <div className="cert-box">
        <div className="title">{L.s6}</div>
        <div className="info-grid">{kv(L.nr, d.phytosanitary_cert)}{kv(L.data_eliberarii, d.phyto_date)}</div>
      </div>
      {d.suppliers.length > 0 && (
        <div className="section">
          <div className="section-title">{L.s7}</div>
          <table>
            <thead><tr><th>{L.furnizor}</th><th>GlobalGAP</th><th>{L.nr_cert}</th><th>{L.valabil}</th></tr></thead>
            <tbody>
              {d.suppliers.map((s, i) => (
                <tr key={i}>
                  <td>{dash(s.name)}</td>
                  <td className={s.globalgap_certified ? "pass" : "fail"}>{s.globalgap_certified ? L.da : L.nu}</td>
                  <td>{dash(s.globalgap_cert_no)}</td>
                  <td>{dash(s.globalgap_expiry)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {d.notes && <div className="section"><strong>{L.observatii}:</strong> {d.notes}</div>}
      <Signatures labels={[L.exportator, L.vama, L.fitoinspector]} />
      <div className="stamp-area">{L.stamp}</div>
    </div>
  );
}

// ── Act de restituire (return act) ───────────────────────────────────────
type RetAct = Awaited<ReturnType<typeof returnAct>>;

const RET_T = {
  ro: { title: "ACT DE RESTITUIRE A MARFII", nr: "Nr.", data: "Data", furnizor: "Furnizor", client: "Client (returnează)",
        vanzare: "Documentul de vânzare", depozit: "Depozit", col_denumire: "Denumire", col_lot: "Lot", col_cant: "Cant., kg",
        col_pret: "Preț", col_suma: "Suma", total: "TOTAL", motiv: "Motivul returului", anulat: "RETUR ANULAT",
        predat: "Predat (client)", primit: "Primit (depozit)", stamp: "Ștampilă" },
  ru: { title: "АКТ ВОЗВРАТА ТОВАРА", nr: "№", data: "Дата", furnizor: "Поставщик", client: "Клиент (возвращает)",
        vanzare: "Документ продажи", depozit: "Склад", col_denumire: "Наименование", col_lot: "Партия", col_cant: "Кол-во, кг",
        col_pret: "Цена", col_suma: "Сумма", total: "ИТОГО", motiv: "Причина возврата", anulat: "ВОЗВРАТ ОТМЕНЁН",
        predat: "Сдал (клиент)", primit: "Принял (склад)", stamp: "М.П." },
  en: { title: "GOODS RETURN ACT", nr: "No.", data: "Date", furnizor: "Supplier", client: "Customer (returning)",
        vanzare: "Sales document", depozit: "Warehouse", col_denumire: "Description", col_lot: "Batch", col_cant: "Qty, kg",
        col_pret: "Price", col_suma: "Amount", total: "TOTAL", motiv: "Reason for return", anulat: "RETURN CANCELLED",
        predat: "Handed over (customer)", primit: "Received (warehouse)", stamp: "Seal" },
};

export function ReturnAct({ d, lang }: { d: RetAct; lang: Lang }) {
  const L = RET_T[lang];
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
          <div className="title">{L.furnizor}</div>
          <div><strong>{dash(d.company_name)}</strong></div>
          <div>{d.company_address}</div>
          <div>IDNO: {d.company_idno}</div>
        </div>
        <div className="party">
          <div className="title">{L.client}</div>
          <div><strong>{dash(d.customer_name)}</strong></div>
          <div>{d.customer_address}</div>
          <div>IDNO: {d.customer_idno}</div>
        </div>
      </div>
      <div className="doc-row">
        <div>{L.vanzare}: <strong>{dash(d.sale_number)}</strong> {d.sale_date && `(${d.sale_date})`}</div>
        <div>{L.depozit}: <strong>{dash(d.warehouse_name)}</strong></div>
      </div>
      <table>
        <thead><tr><th>#</th><th>{L.col_denumire}</th><th>{L.col_lot}</th><th className="num">{L.col_cant}</th><th className="num">{L.col_pret}</th><th className="num">{L.col_suma}</th></tr></thead>
        <tbody>
          {d.lines.map((l, i) => (
            <tr key={i}><td>{i + 1}</td><td>{dash(l.item_name)}</td><td>{dash(l.batch_number)}</td>
              <td className="num">{f1(l.qty_kg)}</td><td className="num">{f2(l.price_per_kg)}</td><td className="num">{f2(l.amount)}</td></tr>
          ))}
          {d.lines.length === 0 && <tr><td colSpan={6} className="empty">—</td></tr>}
        </tbody>
        <tfoot>
          <tr className="total-row"><td colSpan={3}>{L.total}</td><td className="num">{f1(d.total_qty_kg)}</td><td /><td className="num">{f2(d.total_amount)} {d.currency_code}</td></tr>
        </tfoot>
      </table>
      <div className="boxed"><strong>{L.motiv}:</strong> {dash(d.reason)}</div>
      <Signatures labels={[L.predat, L.primit]} />
      <div className="stamp-area">{L.stamp}</div>
    </div>
  );
}
