import { NextRequest, NextResponse } from "next/server";
import { execute } from "@/lib/oracle";

let columnsReady = false;
async function ensureColumns() {
  if (columnsReady) return;
  await execute(`BEGIN EXECUTE IMMEDIATE 'ALTER TABLE AGRO_CRM_LEADS ADD (LOSS_REASON VARCHAR2(500))'; EXCEPTION WHEN OTHERS THEN NULL; END;`, []);
  await execute(`BEGIN EXECUTE IMMEDIATE 'ALTER TABLE AGRO_CRM_LEADS ADD (EXPECTED_CLOSE DATE)'; EXCEPTION WHEN OTHERS THEN NULL; END;`, []);
  columnsReady = true;
}

export async function POST(req: NextRequest) {
  await ensureColumns();

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { name, phone, email, company, notes } = body;

  if (!name || typeof name !== "string" || !name.trim())
    return NextResponse.json({ error: "Имя обязательно" }, { status: 400 });

  await execute(`
    INSERT INTO AGRO_CRM_LEADS
      (NAME, COMPANY, PHONE, EMAIL, SOURCE, NOTES, CREATED_BY)
    VALUES (:1, :2, :3, :4, 'web', :5, 'capture_form')
  `, [
    String(name).trim().slice(0, 200),
    company ? String(company).trim().slice(0, 200) : null,
    phone   ? String(phone).trim().slice(0, 50)    : null,
    email   ? String(email).trim().slice(0, 200)   : null,
    notes   ? String(notes).trim().slice(0, 1000)  : null,
  ]);

  return NextResponse.json({ success: true }, { status: 201 });
}
