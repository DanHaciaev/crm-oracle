import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query, execute } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

interface PipelineRow { [key: string]: unknown;
  ID: number;
  NAME: string;
  DESCRIPTION: string | null;
  IS_DEFAULT: number;
  CREATED_AT: Date | string | null;
  CREATED_BY: string | null;
  LEAD_COUNT: number;
}

let tablesReady = false;

async function ensureTables() {
  if (tablesReady) return;
  const rows = await query<{ CNT: number }>(
    `SELECT COUNT(*) AS CNT FROM USER_TABLES WHERE TABLE_NAME = 'AGRO_CRM_PIPELINES'`,
    []
  );
  if (Number(rows[0]?.CNT ?? 0) === 0) {
    throw new Error("Таблицы воронок не созданы. Запусти: node scripts/run-sql.mjs sql/loyalty_tables.sql");
  }
  tablesReady = true;
}

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  await ensureTables();

  const rows = await query<PipelineRow>(`
    SELECT
      p.ID, p.NAME, p.DESCRIPTION, p.IS_DEFAULT, p.CREATED_AT, p.CREATED_BY,
      (SELECT COUNT(*) FROM AGRO_CRM_LEADS l WHERE l.PIPELINE_ID = p.ID) AS LEAD_COUNT
    FROM AGRO_CRM_PIPELINES p
    ORDER BY p.IS_DEFAULT DESC, p.CREATED_AT ASC
  `);

  return NextResponse.json(rows.map(r => ({
    id:          Number(r.ID),
    name:        String(r.NAME),
    description: r.DESCRIPTION ? String(r.DESCRIPTION) : null,
    is_default:  Number(r.IS_DEFAULT) === 1,
    created_by:  r.CREATED_BY ? String(r.CREATED_BY) : null,
    lead_count:  Number(r.LEAD_COUNT),
  })));
}

export async function POST(req: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Только для администратора" }, { status: 403 });

  await ensureTables();

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { name, description } = body;

  if (!name || typeof name !== "string" || !name.trim())
    return NextResponse.json({ error: "name обязателен" }, { status: 400 });

  await execute(`
    INSERT INTO AGRO_CRM_PIPELINES (NAME, DESCRIPTION, IS_DEFAULT, CREATED_BY)
    VALUES (:1, :2, 0, :3)
  `, [name.trim(), description ? String(description).trim() : null, user.username]);

  return NextResponse.json({ success: true }, { status: 201 });
}
