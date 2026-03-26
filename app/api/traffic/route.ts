import { NextResponse } from "next/server";
import { query, execute } from "@/lib/oracle";

interface TrafficRow extends Record<string, unknown> {
  ID: number;
  NAME: string;
  VALUE: number;
}

export async function GET() {
  const rows = await query<TrafficRow>(
    `SELECT id, name, value FROM crm_user.traffic_sources ORDER BY id ASC`
  );
  return NextResponse.json(rows.map((r) => ({
    id:    r.ID,
    name:  r.NAME,
    value: r.VALUE,
  })));
}

export async function POST(request: Request) {
  const { name, value } = await request.json();
  await execute(
    `INSERT INTO crm_user.traffic_sources (name, value) VALUES (:1, :2)`,
    [name, value]
  );
  const rows = await query<TrafficRow>(
    `SELECT id, name, value FROM crm_user.traffic_sources WHERE name = :1 ORDER BY id DESC FETCH FIRST 1 ROWS ONLY`,
    [name]
  );
  return NextResponse.json({ id: rows[0].ID, name, value });
}

export async function PUT(request: Request) {
  const { id, name, value } = await request.json();
  await execute(
    `UPDATE crm_user.traffic_sources SET name = :1, value = :2 WHERE id = :3`,
    [name, value, id]
  );
  return NextResponse.json({ success: true });
}