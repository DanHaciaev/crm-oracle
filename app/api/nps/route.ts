import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query, execute } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

interface NpsRow {
  [key: string]: unknown;
  ID: number; CUSTOMER_ID: number; SCORE: number;
  NOTES: string | null; CREATED_BY: string | null;
  CREATED_AT: Date | string | null;
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

export async function GET(req: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const customerId = req.nextUrl.searchParams.get("customer_id");
  if (!customerId) return NextResponse.json({ error: "customer_id обязателен" }, { status: 400 });

  try {
    const rows = await query<NpsRow>(`
      SELECT ID, CUSTOMER_ID, SCORE, NOTES, CREATED_BY, CREATED_AT
      FROM AGRO_CRM_NPS
      WHERE CUSTOMER_ID = :1
      ORDER BY CREATED_AT DESC
    `, [Number(customerId)]);

    const avg = rows.length
      ? rows.reduce((s, r) => s + Number(r.SCORE), 0) / rows.length
      : null;

    return NextResponse.json({
      avg: avg !== null ? Math.round(avg * 10) / 10 : null,
      count: rows.length,
      ratings: rows.map(r => ({
        id:          r.ID,
        score:       Number(r.SCORE),
        comment:     r.NOTES ?? null,
        created_by:  r.CREATED_BY ?? null,
        created_at:  iso(r.CREATED_AT as Date | string | null),
      })),
    });
  } catch {
    // Table doesn't exist yet — return empty state
    return NextResponse.json({ avg: null, count: 0, ratings: [] });
  }
}

export async function POST(req: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { customer_id, score, comment } = body;

  if (!customer_id || !score)
    return NextResponse.json({ error: "customer_id и score обязательны" }, { status: 400 });

  const safeScore = Math.max(1, Math.min(10, Number(score)));

  await execute(`
    INSERT INTO AGRO_CRM_NPS (CUSTOMER_ID, SCORE, NOTES, CREATED_BY)
    VALUES (:1, :2, :3, :4)
  `, [
    Number(customer_id),
    safeScore,
    comment ? String(comment) : null,
    user.username ?? null,
  ]);

  return NextResponse.json({ success: true }, { status: 201 });
}
