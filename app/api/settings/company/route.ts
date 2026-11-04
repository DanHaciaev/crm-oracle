import { NextRequest, NextResponse } from "next/server";
import { COMPANY_FIELDS, getCompany, saveCompany, type Company } from "@/lib/documents/common";

// Company requisites printed on every document. Reading is open to any
// signed-in user; saving needs edit on "settings" (enforced in proxy.ts).
export async function GET() {
  return NextResponse.json(await getCompany());
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const values: Partial<Company> = {};
  for (const f of COMPANY_FIELDS) if (typeof body[f] === "string") values[f] = body[f] as string;
  if (values.name !== undefined && !values.name.trim())
    return NextResponse.json({ error: "Название компании не может быть пустым" }, { status: 400 });
  if (values.iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(values.iban.replace(/\s+/g, "").toUpperCase()))
    return NextResponse.json({ error: "IBAN в неверном формате" }, { status: 400 });
  if (values.iban) values.iban = values.iban.replace(/\s+/g, "").toUpperCase();
  await saveCompany(values);
  return NextResponse.json(await getCompany());
}
