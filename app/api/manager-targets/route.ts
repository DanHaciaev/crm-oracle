import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query, execute } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

async function ensureTable() {
  const ddls = [
    `BEGIN EXECUTE IMMEDIATE 'CREATE TABLE AGRO_CRM_MANAGER_TARGETS (
      ID            NUMBER PRIMARY KEY,
      USERNAME      VARCHAR2(100) NOT NULL,
      YEAR_NUM      NUMBER(4)     NOT NULL,
      MONTH_NUM     NUMBER(2)     NOT NULL,
      TARGET_AMOUNT NUMBER(14,2)  DEFAULT 0 NOT NULL,
      CREATED_AT    TIMESTAMP     DEFAULT SYSTIMESTAMP,
      CONSTRAINT uq_mgr_target UNIQUE (USERNAME, YEAR_NUM, MONTH_NUM)
    )'; EXCEPTION WHEN OTHERS THEN NULL; END;`,
    `BEGIN EXECUTE IMMEDIATE 'CREATE SEQUENCE AGRO_CRM_MANAGER_TARGETS_SEQ START WITH 1 INCREMENT BY 1';
     EXCEPTION WHEN OTHERS THEN NULL; END;`,
    `BEGIN EXECUTE IMMEDIATE 'CREATE OR REPLACE TRIGGER AGRO_CRM_MANAGER_TARGETS_TRG
      BEFORE INSERT ON AGRO_CRM_MANAGER_TARGETS FOR EACH ROW
    BEGIN IF :NEW.ID IS NULL THEN SELECT AGRO_CRM_MANAGER_TARGETS_SEQ.NEXTVAL INTO :NEW.ID FROM DUAL; END IF; END;';
     EXCEPTION WHEN OTHERS THEN NULL; END;`,
  ];
  for (const ddl of ddls) await execute(ddl, []);
}

let ready = false;
async function maybeInit() {
  if (!ready) { await ensureTable(); ready = true; }
}

interface TargetRow {
  [key: string]: unknown;
  USERNAME:      string;
  YEAR_NUM:      number;
  MONTH_NUM:     number;
  TARGET_AMOUNT: number;
}

export async function GET(req: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  await maybeInit();

  const year = Number(req.nextUrl.searchParams.get("year") ?? new Date().getFullYear());

  const rows = await query<TargetRow>(`
    SELECT USERNAME, YEAR_NUM, MONTH_NUM, TARGET_AMOUNT
    FROM AGRO_CRM_MANAGER_TARGETS
    WHERE YEAR_NUM = :1
    ORDER BY USERNAME, MONTH_NUM
  `, [year]);

  return NextResponse.json(rows.map(r => ({
    username:      String(r.USERNAME),
    year:          Number(r.YEAR_NUM),
    month:         Number(r.MONTH_NUM),
    target_amount: Number(r.TARGET_AMOUNT),
  })));
}

export async function POST(req: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (user.role !== "admin")
    return NextResponse.json({ error: "Только для администраторов" }, { status: 403 });

  await maybeInit();

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { username, year, month, target_amount } = body;

  if (!username || typeof username !== "string")
    return NextResponse.json({ error: "username обязателен" }, { status: 400 });

  const y = Number(year) || new Date().getFullYear();
  const m = Number(month);
  if (m < 1 || m > 12)
    return NextResponse.json({ error: "month должен быть от 1 до 12" }, { status: 400 });

  const amount = Math.max(0, Number(target_amount) || 0);

  await execute(`
    MERGE INTO AGRO_CRM_MANAGER_TARGETS dst
    USING (SELECT :1 AS USERNAME, :2 AS YEAR_NUM, :3 AS MONTH_NUM FROM DUAL) src
      ON (dst.USERNAME = src.USERNAME AND dst.YEAR_NUM = src.YEAR_NUM AND dst.MONTH_NUM = src.MONTH_NUM)
    WHEN MATCHED THEN
      UPDATE SET dst.TARGET_AMOUNT = :4
    WHEN NOT MATCHED THEN
      INSERT (USERNAME, YEAR_NUM, MONTH_NUM, TARGET_AMOUNT)
      VALUES (:5, :6, :7, :8)
  `, [username, y, m, amount, username, y, m, amount]);

  return NextResponse.json({ success: true });
}
