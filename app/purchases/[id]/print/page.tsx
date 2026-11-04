"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface Pallet {
  pallet_no: number; gross_kg: number; crates_count: number;
  net_kg: number; rejected: boolean; notes: string;
}
interface Product {
  item_name: string; pallets: Pallet[];
  total_gross_kg: number; total_crates: number; total_tare_kg: number;
  total_raw_net_kg: number; total_net_kg: number;
  rejected_pallets: number; rejected_crates: number;
  tare_per_unit_kg: number; packaging_kind_label: string;
}
interface Bon {
  company_name: string; doc_number: string; doc_date: string; warehouse_name: string;
  supplier_name: string; supplier_contact: string; responsible_person: string;
  vehicle_plate: string; notes: string; products: Product[];
  total_gross_kg: number; total_crates: number; total_tare_kg: number;
  total_raw_net_kg: number; total_net_kg: number; discount_pct: number;
  rejected_pallets: number; rejected_crates: number; tare_per_unit_kg: number;
}

type Lang = "ro" | "ru" | "en";

const T: Record<Lang, Record<string, string>> = {
  ro: {
    bon_title: "BON DE ACHIZITIE", cumparator: "Cumparator", depozit: "Depozit/Camera Frigorifica",
    furnizor: "Furnizor:", contact_furnizor: "Date de contact Furnizor:", data: "Data",
    responsabil: "Persoana responsabile", camion: "Nr camionul", observatii: "Observatii:",
    produs: "Produs:", tip_ambalaj: "Tip ambalaj:",
    col_palete: "Nr Palete", col_brut: "Q Brut, kg", col_lazi: "Nr Lazi", col_net: "Neto", col_note: "Note",
    total: "Total", kg_brut: "kg brut", lazi: "lazi", net: "net", rebut: "REBUT",
    rebut_lazi_palete: "Rebut (lazi/palete)", total_bon: "TOTAL BON",
    tara_unitate: "Tara/unitate", tara_kg: "Tara kg", reducere: "Reducere", la_cantitate: "la cantitate",
    neto_kg: "Neto, kg", print: "Tipareste",
  },
  ru: {
    bon_title: "НАКЛАДНАЯ ЗАКУПКИ", cumparator: "Покупатель", depozit: "Склад/Холодильная камера",
    furnizor: "Поставщик:", contact_furnizor: "Контакты поставщика:", data: "Дата",
    responsabil: "Ответственное лицо", camion: "№ автомобиля", observatii: "Примечания:",
    produs: "Продукт:", tip_ambalaj: "Тип упаковки:",
    col_palete: "Кол-во палет", col_brut: "Брутто, кг", col_lazi: "Кол-во ящиков", col_net: "Нетто", col_note: "Примечание",
    total: "Итого", kg_brut: "кг брутто", lazi: "ящиков", net: "нетто", rebut: "БРАК",
    rebut_lazi_palete: "Брак (ящики/палеты)", total_bon: "ИТОГО ПО НАКЛАДНОЙ",
    tara_unitate: "Тара/ед.", tara_kg: "Тара кг", reducere: "Скидка", la_cantitate: "от количества",
    neto_kg: "Нетто, кг", print: "Печать",
  },
  en: {
    bon_title: "PURCHASE RECEIPT", cumparator: "Buyer", depozit: "Warehouse/Cold Room",
    furnizor: "Supplier:", contact_furnizor: "Supplier contact:", data: "Date",
    responsabil: "Responsible person", camion: "Vehicle no.", observatii: "Notes:",
    produs: "Product:", tip_ambalaj: "Packaging type:",
    col_palete: "Pallets", col_brut: "Gross, kg", col_lazi: "Crates", col_net: "Net", col_note: "Note",
    total: "Total", kg_brut: "kg gross", lazi: "crates", net: "net", rebut: "REJECTED",
    rebut_lazi_palete: "Rejected (crates/pallets)", total_bon: "RECEIPT TOTAL",
    tara_unitate: "Tare/unit", tara_kg: "Tare kg", reducere: "Discount", la_cantitate: "on quantity",
    neto_kg: "Net, kg", print: "Print",
  },
};

function n1(v: number) { return v ? v.toFixed(1) : "—"; }
function n3(v: number) { return v ? v.toFixed(3) : "—"; }
function pct(v: number) { return Number.isInteger(v) ? String(v) : v.toFixed(1); }

export default function PrintPurchasePage() {
  const params            = useParams<{ id: string }>();
  const id                = params.id;
  const [data, setData]   = useState<Bon | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang]   = useState<Lang>("ro");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res  = await fetch(`/api/purchases/${id}`);
      const json = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) setError(json.error ?? "Ошибка");
      else         setData(json as Bon);
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (error) return <div className="p-8 text-red-600">Ошибка: {error}</div>;
  if (!data)  return <div className="p-8 text-gray-500">Загрузка...</div>;

  const L = T[lang];
  const hasDiscount = data.discount_pct > 0;

  return (
    <div className="min-h-screen bg-white text-black py-8 px-4 print:p-0" style={{ fontFamily: "Calibri, Arial, sans-serif", fontSize: "11pt" }}>
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-center items-center gap-2.5 mb-4 print:hidden">
          <button
            onClick={() => window.print()}
            className="px-7 py-2.5 text-sm font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition"
          >
            {L.print}
          </button>
          <div className="flex gap-1">
            {(["ro", "ru", "en"] as Lang[]).map(lg => (
              <button
                key={lg}
                onClick={() => setLang(lg)}
                className={`px-3.5 py-2 text-xs font-semibold rounded-md border transition ${
                  lang === lg ? "bg-emerald-600 text-white border-emerald-600" : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {lg.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <table className="w-full border-collapse mb-3">
          <tbody>
            <tr>
              <td colSpan={2} className="border border-black text-center font-bold text-[13pt] p-2" style={{ background: "#a9d18e" }}>
                {L.bon_title}{data.doc_number ? ` Nr. ${data.doc_number}` : ""}
              </td>
            </tr>
            {[
              [L.cumparator, data.company_name || "—"],
              [L.depozit, data.warehouse_name || "—"],
              [L.furnizor, data.supplier_name || "—"],
              [L.contact_furnizor, data.supplier_contact || "—"],
              [L.data, data.doc_date || "—"],
              [L.responsabil, data.responsible_person || "—"],
              [L.camion, data.vehicle_plate || "—"],
              [L.observatii, data.notes || "—"],
            ].map(([label, value]) => (
              <tr key={label}>
                <td className="border border-black px-2 py-1.5 font-bold w-[30%]" style={{ background: "#f2f2f2" }}>{label}</td>
                <td className="border border-black px-2 py-1.5">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {data.products.length === 0 ? (
          <p>—</p>
        ) : data.products.map((prod, idx) => (
          <div key={idx} className="mb-4" style={{ breakInside: "avoid" }}>
            <div className="font-bold text-[12pt] border border-black px-2 py-1.5" style={{ background: "#dcecd6" }}>
              {L.produs} {prod.item_name || "—"}
              {prod.packaging_kind_label && <> &middot; {L.tip_ambalaj} {prod.packaging_kind_label}</>}
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {[L.col_palete, L.col_brut, L.col_lazi, L.col_net, L.col_note].map(h => (
                    <th key={h} className="border border-black px-2 py-1 font-bold text-center" style={{ background: "#f2f2f2" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {prod.pallets.length === 0 ? (
                  <tr><td colSpan={5} className="border border-black px-2 py-1 text-center">—</td></tr>
                ) : prod.pallets.map(p => (
                  <tr key={p.pallet_no}>
                    <td className="border border-black px-2 py-1 text-center">{p.pallet_no}</td>
                    <td className="border border-black px-2 py-1 text-center">{n1(p.gross_kg)}</td>
                    <td className="border border-black px-2 py-1 text-center">{p.crates_count || "—"}</td>
                    <td className="border border-black px-2 py-1 text-center">{n1(p.net_kg)}</td>
                    <td className={`border border-black px-2 py-1 text-center ${p.rejected ? "text-red-600 font-bold" : ""}`}>
                      {p.rejected ? `${L.rebut}${p.notes ? " " + p.notes : ""}` : (p.notes || "")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="w-full border-collapse">
              <tbody>
                <tr>
                  <td className="border border-black px-2 py-1 font-bold text-[10pt] w-[30%]" style={{ background: "#f8f8f8" }}>{L.total}</td>
                  <td className="border border-black px-2 py-1 text-[10pt]">
                    {n1(prod.total_gross_kg)} {L.kg_brut} &middot; {Math.trunc(prod.total_crates)} {L.lazi} &middot; {L.net}{" "}
                    {hasDiscount
                      ? <>{n1(prod.total_raw_net_kg)} kg &minus; {pct(data.discount_pct)}% = <strong>{n1(prod.total_net_kg)} kg</strong></>
                      : <strong>{n1(prod.total_net_kg)} kg</strong>}
                  </td>
                </tr>
                {(prod.rejected_pallets > 0 || prod.rejected_crates > 0) && (
                  <tr>
                    <td className="border border-black px-2 py-1 font-bold text-[10pt]" style={{ background: "#f8f8f8" }}>{L.rebut_lazi_palete}</td>
                    <td className="border border-black px-2 py-1 text-[10pt]">{Math.trunc(prod.rejected_crates)} {L.lazi} / {Math.trunc(prod.rejected_pallets)} {L.col_palete}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ))}

        <table className="w-full border-collapse mt-3">
          <tbody>
            <tr>
              <td colSpan={2} className="border border-black text-center font-bold text-[13pt] p-2" style={{ background: "#a9d18e" }}>
                {L.total_bon}
              </td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1.5 font-bold w-[30%]" style={{ background: "#f2f2f2" }}>{L.total}</td>
              <td className="border border-black px-2 py-1.5">{n1(data.total_gross_kg)} {L.kg_brut} &middot; {Math.trunc(data.total_crates)} {L.lazi}</td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1.5 font-bold" style={{ background: "#f2f2f2" }}>{L.rebut_lazi_palete}</td>
              <td className="border border-black px-2 py-1.5">{Math.trunc(data.rejected_crates)} {L.lazi} / {Math.trunc(data.rejected_pallets)} {L.col_palete}</td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1.5 font-bold" style={{ background: "#f2f2f2" }}>{L.tara_unitate}</td>
              <td className="border border-black px-2 py-1.5">{data.tare_per_unit_kg ? `${n3(data.tare_per_unit_kg)} kg` : "—"}</td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1.5 font-bold" style={{ background: "#f2f2f2" }}>{L.tara_kg}</td>
              <td className="border border-black px-2 py-1.5">{n1(data.total_tare_kg)}</td>
            </tr>
            {hasDiscount && (
              <tr>
                <td className="border border-black px-2 py-1.5 font-bold" style={{ background: "#f2f2f2" }}>{L.reducere}</td>
                <td className="border border-black px-2 py-1.5">{pct(data.discount_pct)}% {L.la_cantitate}</td>
              </tr>
            )}
            <tr>
              <td className="border border-black px-2 py-1.5 font-bold" style={{ background: "#f2f2f2" }}>{L.neto_kg}</td>
              <td className="border border-black px-2 py-1.5">
                {hasDiscount
                  ? <>{n1(data.total_raw_net_kg)} kg &minus; {pct(data.discount_pct)}% = <strong>{n1(data.total_net_kg)} kg</strong></>
                  : <strong>{n1(data.total_net_kg)}</strong>}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <style jsx global>{`
        @media print {
          body { margin: 0; }
          @page { size: A4; margin: 12mm 15mm; }
        }
      `}</style>
    </div>
  );
}
