import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";
import { getCompany } from "@/lib/documents/common";

interface HeaderRow {
  [key: string]: unknown;
  DOC_NUMBER: string; DOC_DATE: Date | string | null;
  WAREHOUSE_NAME: string | null; SUPPLIER_NAME: string | null;
  CONTACT_PHONE: string | null; CONTACT_EMAIL: string | null;
  VEHICLE_PLATE: string | null; CREATED_BY: string | null;
  NOTES: string | null; DISCOUNT_PCT: number | null;
}
interface LineRow {
  [key: string]: unknown;
  ID: number; ITEM_NAME_RO: string | null; ITEM_NAME_RU: string | null;
  GROSS_WEIGHT_KG: number | null; TARE_WEIGHT_KG: number | null; CRATES_COUNT: number | null;
  PKG_TYPE_NAME_RO: string | null; PKG_TYPE_NAME_RU: string | null;
}
interface PalletRow {
  [key: string]: unknown;
  PURCHASE_LINE_ID: number; PALLET_NO: number;
  GROSS_WEIGHT_KG: number | null; CRATES_COUNT: number | null;
  TARE_WEIGHT_KG: number | null; NET_WEIGHT_KG: number | null;
  REJECTED: string | null; NOTES: string | null;
}

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

function f(v: unknown) { return v == null ? 0 : Number(v); }
function fmtDate(v: Date | string | null) {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(String(v));
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function round3(n: number) { return Math.round(n * 1000) / 1000; }

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAuth()))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const docId = Number(id);
  if (!docId) return NextResponse.json({ error: "Неверный ID" }, { status: 400 });

  const [headerRows, lineRows, palletRows] = await Promise.all([
    query<HeaderRow>(`
      SELECT pd.DOC_NUMBER, pd.DOC_DATE, pd.NOTES, pd.CREATED_BY, pd.DISCOUNT_PCT,
             w.NAME AS WAREHOUSE_NAME,
             s.NAME AS SUPPLIER_NAME, s.CONTACT_PHONE, s.CONTACT_EMAIL,
             v.PLATE_NUMBER AS VEHICLE_PLATE
      FROM AGRO_PURCHASE_DOCS pd
      LEFT JOIN AGRO_WAREHOUSES w ON w.ID = pd.WAREHOUSE_ID
      LEFT JOIN AGRO_SUPPLIERS  s ON s.ID = pd.SUPPLIER_ID
      LEFT JOIN AGRO_VEHICLES   v ON v.ID = pd.VEHICLE_ID
      WHERE pd.ID = :1
    `, [docId]),

    query<LineRow>(`
      SELECT pl.ID, i.NAME_RO AS ITEM_NAME_RO, i.NAME_RU AS ITEM_NAME_RU,
             pl.GROSS_WEIGHT_KG, pl.TARE_WEIGHT_KG, pl.CRATES_COUNT,
             pt.NAME_RO AS PKG_TYPE_NAME_RO, pt.NAME_RU AS PKG_TYPE_NAME_RU
      FROM AGRO_PURCHASE_LINES pl
      JOIN AGRO_ITEMS i ON i.ID = pl.ITEM_ID
      LEFT JOIN AGRO_PACKAGING_TYPES pt ON pt.ID = pl.PACKAGING_TYPE_ID
      WHERE pl.PURCHASE_DOC_ID = :1
      ORDER BY pl.ID
    `, [docId]),

    query<PalletRow>(`
      SELECT plp.PURCHASE_LINE_ID, plp.PALLET_NO, plp.GROSS_WEIGHT_KG, plp.CRATES_COUNT,
             plp.TARE_WEIGHT_KG, plp.NET_WEIGHT_KG, plp.REJECTED, plp.NOTES
      FROM AGRO_PURCHASE_LINE_PALLETS plp
      JOIN AGRO_PURCHASE_LINES pl ON pl.ID = plp.PURCHASE_LINE_ID
      WHERE pl.PURCHASE_DOC_ID = :1
      ORDER BY plp.PURCHASE_LINE_ID, plp.PALLET_NO
    `, [docId]),
  ]);

  if (!headerRows.length)
    return NextResponse.json({ error: "Документ не найден" }, { status: 404 });

  const hdr = headerRows[0];
  const company = await getCompany();
  const discountPct    = f(hdr.DISCOUNT_PCT);
  const discountFactor = 1 - discountPct / 100;

  const palletsByLine = new Map<number, PalletRow[]>();
  for (const p of palletRows) {
    const arr = palletsByLine.get(p.PURCHASE_LINE_ID) ?? [];
    arr.push(p);
    palletsByLine.set(p.PURCHASE_LINE_ID, arr);
  }

  let grandGross = 0, grandTare = 0, grandRawNet = 0, grandNet = 0, grandCrates = 0;
  let grandRejectedPallets = 0, grandRejectedCrates = 0;

  const products = lineRows.map(ln => {
    const pallets = palletsByLine.get(ln.ID) ?? [];
    let palletsCtx: { pallet_no: number; gross_kg: number; crates_count: number; net_kg: number; rejected: boolean; notes: string }[];
    let lineGross: number, lineTare: number, lineCrates: number;
    let rejectedPallets: number, rejectedCrates: number;

    if (pallets.length > 0) {
      palletsCtx = pallets.map(p => ({
        pallet_no:    p.PALLET_NO,
        gross_kg:     f(p.GROSS_WEIGHT_KG),
        crates_count: f(p.CRATES_COUNT),
        net_kg:       f(p.NET_WEIGHT_KG),
        rejected:     p.REJECTED === "Y",
        notes:        p.NOTES ?? "",
      }));
      lineGross       = pallets.reduce((s, p) => s + f(p.GROSS_WEIGHT_KG), 0);
      lineTare        = pallets.reduce((s, p) => s + f(p.TARE_WEIGHT_KG), 0);
      lineCrates      = pallets.reduce((s, p) => s + f(p.CRATES_COUNT), 0);
      rejectedPallets = pallets.filter(p => p.REJECTED === "Y").length;
      rejectedCrates  = pallets.filter(p => p.REJECTED === "Y").reduce((s, p) => s + f(p.CRATES_COUNT), 0);
    } else {
      const gross  = f(ln.GROSS_WEIGHT_KG);
      const tare   = f(ln.TARE_WEIGHT_KG);
      const crates = f(ln.CRATES_COUNT);
      const rawNetForPallet = Math.max(0, gross - tare);
      palletsCtx = (gross || crates) ? [{
        pallet_no: 1, gross_kg: gross, crates_count: crates,
        net_kg: rawNetForPallet, rejected: false, notes: "",
      }] : [];
      lineGross = gross; lineTare = tare; lineCrates = crates;
      rejectedPallets = 0; rejectedCrates = 0;
    }

    const lineRawNet = Math.max(0, lineGross - lineTare);
    const lineNet    = round3(lineRawNet * discountFactor);

    grandGross += lineGross;
    grandTare  += lineTare;
    grandRawNet += lineRawNet;
    grandNet   += lineNet;
    grandCrates += lineCrates;
    grandRejectedPallets += rejectedPallets;
    grandRejectedCrates  += rejectedCrates;

    return {
      item_name:            ln.ITEM_NAME_RO || ln.ITEM_NAME_RU || "",
      pallets:              palletsCtx,
      total_gross_kg:       lineGross,
      total_crates:         lineCrates,
      total_tare_kg:        lineTare,
      total_raw_net_kg:     lineRawNet,
      total_net_kg:         lineNet,
      rejected_pallets:     rejectedPallets,
      rejected_crates:      rejectedCrates,
      tare_per_unit_kg:     lineCrates ? round3(lineTare / lineCrates) : 0,
      packaging_kind_label: ln.PKG_TYPE_NAME_RO || ln.PKG_TYPE_NAME_RU || "",
    };
  });

  return NextResponse.json({
    company_name:      company.name,
    doc_number:        hdr.DOC_NUMBER ?? "",
    doc_date:          fmtDate(hdr.DOC_DATE as Date | string | null),
    warehouse_name:    hdr.WAREHOUSE_NAME ?? "",
    supplier_name:     hdr.SUPPLIER_NAME ?? "",
    supplier_contact:  [hdr.CONTACT_PHONE, hdr.CONTACT_EMAIL].filter(Boolean).join(" / "),
    responsible_person: hdr.CREATED_BY ?? "",
    vehicle_plate:     hdr.VEHICLE_PLATE ?? "",
    notes:             hdr.NOTES ?? "",
    products,
    total_gross_kg:    grandGross,
    total_crates:      grandCrates,
    total_tare_kg:     grandTare,
    total_raw_net_kg:  grandRawNet,
    total_net_kg:      grandNet,
    discount_pct:      discountPct,
    rejected_pallets:  grandRejectedPallets,
    rejected_crates:   grandRejectedCrates,
    tare_per_unit_kg:  grandCrates ? round3(grandTare / grandCrates) : 0,
  });
}
