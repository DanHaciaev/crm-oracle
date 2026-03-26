import { NextResponse } from "next/server";
import { query, execute } from "@/lib/oracle";

interface SaleRow extends Record<string, unknown> {
  ID: number;
  MONTH: string;
  REVENUE: number;
  EXPENSES: number;
}

export async function GET() {
  const rows = await query<SaleRow>(
    `SELECT id, month, revenue, expenses FROM crm_user.sales ORDER BY id ASC`
  );
  return NextResponse.json(rows.map((r) => ({
    id:       r.ID,
    month:    r.MONTH,
    revenue:  r.REVENUE,
    expenses: r.EXPENSES,
  })));
}

export async function POST(request: Request) {
  const { month, revenue, expenses } = await request.json();
  await execute(
    `INSERT INTO crm_user.sales (month, revenue, expenses) VALUES (:1, :2, :3)`,
    [month, revenue, expenses]
  );
  const rows = await query<SaleRow>(
    `SELECT id, month, revenue, expenses FROM crm_user.sales WHERE month = :1 ORDER BY id DESC FETCH FIRST 1 ROWS ONLY`,
    [month]
  );
  return NextResponse.json({ id: rows[0].ID, month, revenue, expenses });
}

export async function PUT(request: Request) {
  const { id, month, revenue, expenses } = await request.json();
  await execute(
    `UPDATE crm_user.sales SET month = :1, revenue = :2, expenses = :3 WHERE id = :4`,
    [month, revenue, expenses, id]
  );
  return NextResponse.json({ success: true });
}