import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/oracle";
import { parseLang } from "@/lib/documents/common";
import { options } from "@/lib/warehouse";

// Filter lists for the Profitability page, under its own grant (proxy.ts) —
// a role may see profitability without the Warehouse or Reports sections.
export async function GET(req: NextRequest) {
  const [base, customers] = await Promise.all([
    options(parseLang(req.nextUrl.searchParams.get("lang"))),
    query<{ ID: number; NAME: string }>(`SELECT ID, NAME FROM AGRO_CUSTOMERS WHERE ACTIVE = 'Y' ORDER BY NAME`),
  ]);
  return NextResponse.json({ ...base, customers: customers.map(c => ({ id: Number(c.ID), name: String(c.NAME) })) });
}
