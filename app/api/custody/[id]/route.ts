import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

interface ClientRow {
  [key: string]: unknown;
  ID: number; CODE: string | null; NAME: string;
  CONTACT_PHONE: string | null; CONTACT_EMAIL: string | null;
  ADDRESS: string | null; ACTIVE: string;
}
interface BatchRow {
  [key: string]: unknown;
  ID: number; BATCH_NUMBER: string | null; ITEM_NAME: string | null;
  WAREHOUSE_NAME: string | null; CELL_CODE: string | null;
  CURRENT_QTY_KG: number | null; PALLETS_COUNT: number | null; CRATES_COUNT: number | null;
  STATUS: string; RECEIVED_AT: Date | string | null;
}
interface ReleaseRow {
  [key: string]: unknown;
  ID: number; RELEASE_NUMBER: string; RELEASE_DATE: Date | string | null;
  TOTAL_QTY_KG: number | null; STORAGE_AMOUNT: number | null;
  PRECOOLING_AMOUNT: number | null; TOTAL_AMOUNT: number | null;
}

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

function iso(v: Date | string | null) {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : v;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const clientId = Number(id);
  if (!clientId) return NextResponse.json({ error: "Неверный ID" }, { status: 400 });

  const [clients, batches, releases] = await Promise.all([
    query<ClientRow>(`
      SELECT ID, CODE, NAME, CONTACT_PHONE, CONTACT_EMAIL, ADDRESS, ACTIVE
      FROM AGRO_STORAGE_CLIENTS WHERE ID = :1
    `, [clientId]),

    query<BatchRow>(`
      SELECT cb.ID, cb.BATCH_NUMBER,
             it.NAME_RU AS ITEM_NAME,
             w.NAME     AS WAREHOUSE_NAME,
             sc.CODE    AS CELL_CODE,
             cb.CURRENT_QTY_KG, cb.PALLETS_COUNT, cb.CRATES_COUNT,
             cb.STATUS, cb.RECEIVED_AT
      FROM AGRO_CUSTODY_BATCHES cb
      LEFT JOIN AGRO_ITEMS it         ON it.ID = cb.ITEM_ID
      LEFT JOIN AGRO_WAREHOUSES w     ON w.ID  = cb.WAREHOUSE_ID
      LEFT JOIN AGRO_STORAGE_CELLS sc ON sc.ID = cb.CELL_ID
      WHERE cb.STORAGE_CLIENT_ID = :1
      ORDER BY cb.RECEIVED_AT DESC
    `, [clientId]),

    query<ReleaseRow>(`
      SELECT ID, RELEASE_NUMBER, RELEASE_DATE, TOTAL_QTY_KG,
             STORAGE_AMOUNT, PRECOOLING_AMOUNT, TOTAL_AMOUNT
      FROM AGRO_CUSTODY_RELEASES
      WHERE STORAGE_CLIENT_ID = :1
      ORDER BY RELEASE_DATE DESC
    `, [clientId]),
  ]);

  if (!clients.length)
    return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  const c = clients[0];
  return NextResponse.json({
    client: {
      id:            Number(c.ID),
      code:          c.CODE ?? "",
      name:          String(c.NAME),
      contact_phone: c.CONTACT_PHONE ?? null,
      contact_email: c.CONTACT_EMAIL ?? null,
      address:       c.ADDRESS ?? null,
      active:        c.ACTIVE === "Y",
    },
    batches: batches.map(b => ({
      id:             Number(b.ID),
      batch_number:   b.BATCH_NUMBER ?? "",
      item_name:      b.ITEM_NAME ?? "—",
      warehouse_name: b.WAREHOUSE_NAME ?? null,
      cell_code:      b.CELL_CODE ?? null,
      qty_kg:         b.CURRENT_QTY_KG != null ? Number(b.CURRENT_QTY_KG) : null,
      pallets_count:  b.PALLETS_COUNT ?? null,
      crates_count:   b.CRATES_COUNT ?? null,
      status:         String(b.STATUS),
      received_at:    iso(b.RECEIVED_AT as Date | string | null),
    })),
    releases: releases.map(r => ({
      id:                 Number(r.ID),
      release_number:     String(r.RELEASE_NUMBER),
      release_date:       iso(r.RELEASE_DATE as Date | string | null),
      qty_kg:              Number(r.TOTAL_QTY_KG ?? 0),
      storage_amount:      Number(r.STORAGE_AMOUNT ?? 0),
      precooling_amount:   Number(r.PRECOOLING_AMOUNT ?? 0),
      total_amount:        Number(r.TOTAL_AMOUNT ?? 0),
    })),
  });
}
