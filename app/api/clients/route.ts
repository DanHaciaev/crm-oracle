import { NextResponse } from "next/server";
import { query, execute } from "@/lib/oracle";

interface ClientRow extends Record<string, unknown> {
  ID: number;
  NAME: string;
  COMPANY: string | null;
  PHONE_NUMBER: string | null;
  EMAIL: string | null;
  CREATED_AT: string;
}

export async function GET() {
  const rows = await query<ClientRow>(
    `SELECT id, name, company, phone_number, email, created_at 
     FROM crm_user.clients 
     ORDER BY created_at DESC`
  );
  return NextResponse.json(rows.map((r) => ({
    id:           r.ID,
    name:         r.NAME,
    company:      r.COMPANY,
    phone_number: r.PHONE_NUMBER,
    email:        r.EMAIL,
    created_at:   r.CREATED_AT,
  })));
}

export async function POST(request: Request) {
  const { name, company, phone_number, email } = await request.json();
  await execute(
    `INSERT INTO crm_user.clients (name, company, phone_number, email) 
     VALUES (:1, :2, :3, :4)`,
    [name, company || null, phone_number || null, email || null]
  );
  const rows = await query<ClientRow>(
    `SELECT id, name, company, phone_number, email, created_at 
     FROM crm_user.clients 
     ORDER BY id DESC FETCH FIRST 1 ROWS ONLY`
  );
  return NextResponse.json({
    id:           rows[0].ID,
    name:         rows[0].NAME,
    company:      rows[0].COMPANY,
    phone_number: rows[0].PHONE_NUMBER,
    email:        rows[0].EMAIL,
    created_at:   rows[0].CREATED_AT,
  });
}

export async function PUT(request: Request) {
  const { id, name, company, phone_number, email } = await request.json();
  await execute(
    `UPDATE crm_user.clients 
     SET name = :1, company = :2, phone_number = :3, email = :4 
     WHERE id = :5`,
    [name, company || null, phone_number || null, email || null, id]
  );
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const { id } = await request.json();
  await execute(`DELETE FROM crm_user.clients WHERE id = :1`, [id]);
  return NextResponse.json({ success: true });
}