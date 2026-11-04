import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";
import { REPORTS } from "@/lib/reports";

type Row = Record<string, unknown>;

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

// Report catalogue (which filters each report takes) + the option lists
// for those filters.
export async function GET() {
  if (!(await requireAuth()))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const [warehouses, items, suppliers, customers] = await Promise.all([
    query<Row>(`SELECT ID, NAME FROM AGRO_WAREHOUSES WHERE ACTIVE = 'Y' ORDER BY NAME`),
    query<Row>(`SELECT ID, NAME_RO, NAME_RU FROM AGRO_ITEMS WHERE ACTIVE = 'Y' ORDER BY NAME_RO`),
    query<Row>(`SELECT ID, NAME FROM AGRO_SUPPLIERS WHERE ACTIVE = 'Y' ORDER BY NAME`),
    query<Row>(`SELECT ID, NAME FROM AGRO_CUSTOMERS WHERE ACTIVE = 'Y' ORDER BY NAME`),
  ]);
  const opt = (r: Row) => ({ id: Number(r.ID), name: String(r.NAME ?? "") });

  return NextResponse.json({
    reports: Object.entries(REPORTS).map(([key, def]) => ({ key, filters: def.filters, statuses: def.statuses ?? [] })),
    warehouses: warehouses.map(opt),
    items:      items.map(r => ({ id: Number(r.ID), name_ro: String(r.NAME_RO ?? ""), name_ru: String(r.NAME_RU ?? "") })),
    suppliers:  suppliers.map(opt),
    customers:  customers.map(opt),
  });
}
