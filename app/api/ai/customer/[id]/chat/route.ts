import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { query } from "@/lib/oracle";
import { groqChatTurn } from "@/lib/groq";
import oracledb from "oracledb";

interface CustomerRow extends Record<string, unknown> {
  NAME: string; CUSTOMER_TYPE: string | null; COUNTRY: string | null;
}
interface StatsRow extends Record<string, unknown> {
  TOTAL_REVENUE: number; ORDER_COUNT: number; AVG_CHECK: number;
  DAYS_SINCE_LAST: number | null;
}
interface MsgRow extends Record<string, unknown> {
  ROLE: string; CONTENT: string | null;
}

const CHAT_SYSTEM = (ctx: string) =>
  `Ты — ассистент-аналитик продаж. Менеджер ведёт диалог о клиенте.
Отвечай на русском языке, по делу, в формате Markdown.
Контекст клиента:\n${ctx}\n\nЕсли в контексте нет нужных данных — честно скажи об этом.`;

async function buildContext(customerId: number): Promise<string> {
  const [customers, statsRows] = await Promise.all([
    query<CustomerRow>(
      `SELECT NAME, CUSTOMER_TYPE, COUNTRY FROM AGRO_CUSTOMERS WHERE ID = :1`,
      [customerId]
    ),
    query<StatsRow>(`
      SELECT
        NVL(SUM(NVL(TOTAL_AMOUNT_MDL, TOTAL_AMOUNT)), 0) AS TOTAL_REVENUE,
        COUNT(*)                                          AS ORDER_COUNT,
        NVL(AVG(NVL(TOTAL_AMOUNT_MDL, TOTAL_AMOUNT)), 0) AS AVG_CHECK,
        ROUND(SYSDATE - MAX(DOC_DATE))                    AS DAYS_SINCE_LAST
      FROM AGRO_SALES_DOCS
      WHERE CUSTOMER_ID = :1 AND STATUS NOT IN ('draft','cancelled')
    `, [customerId]),
  ]);

  if (!customers.length) return "Клиент не найден.";
  const c = customers[0];
  const s = statsRows[0];
  return [
    `Клиент: ${c.NAME}`,
    c.CUSTOMER_TYPE ? `Тип: ${c.CUSTOMER_TYPE}` : null,
    c.COUNTRY       ? `Страна: ${c.COUNTRY}` : null,
    Number(s.ORDER_COUNT) > 0
      ? `Заказов: ${s.ORDER_COUNT}, LTV: ${Math.round(Number(s.TOTAL_REVENUE))} MDL, средний чек: ${Math.round(Number(s.AVG_CHECK))} MDL`
      : "Заказов пока нет",
    s.DAYS_SINCE_LAST !== null ? `Дней с последнего заказа: ${Number(s.DAYS_SINCE_LAST)}` : null,
  ].filter(Boolean).join("\n");
}

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

// GET — return chat history
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAuth()))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const customerId = Number(id);
  if (!customerId) return NextResponse.json({ error: "Неверный ID" }, { status: 400 });

  const rows = await query<MsgRow>(`
    SELECT ROLE, CONTENT FROM AGRO_AI_CHAT_MESSAGES
    WHERE CUSTOMER_ID = :1
    ORDER BY ID ASC
  `, [customerId]).catch(() => [] as MsgRow[]);

  return NextResponse.json(rows.map(r => ({ role: r.ROLE, content: r.CONTENT ?? "" })));
}

// POST — send user message, get AI reply
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAuth()))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const customerId = Number(id);
  if (!customerId) return NextResponse.json({ error: "Неверный ID" }, { status: 400 });

  const body = await req.json().catch(() => ({})) as { message?: string; provider?: string; model?: string };
  const userMessage = (body.message ?? "").trim();
  const aiProvider  = body.provider;
  const aiModel     = body.model;
  if (!userMessage)
    return NextResponse.json({ error: "Пустое сообщение" }, { status: 400 });

  const [ctx, histRows] = await Promise.all([
    buildContext(customerId),
    query<MsgRow>(`
      SELECT ROLE, CONTENT FROM AGRO_AI_CHAT_MESSAGES
      WHERE CUSTOMER_ID = :1
      ORDER BY ID ASC
    `, [customerId]).catch(() => [] as MsgRow[]),
  ]);

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: CHAT_SYSTEM(ctx) },
    ...histRows.map(r => ({
      role: r.ROLE as "user" | "assistant",
      content: r.CONTENT ?? "",
    })),
    { role: "user", content: userMessage },
  ];

  let reply: string;
  try {
    reply = await groqChatTurn(messages, aiProvider, aiModel);
  } catch {
    return NextResponse.json({ error: "Ошибка AI" }, { status: 500 });
  }

  // Persist both turns (best-effort)
  try {
    const { getConnection } = await import("@/lib/oracle");
    const conn = await getConnection();
    try {
      await conn.execute(
        `INSERT INTO AGRO_AI_CHAT_MESSAGES (ID, CUSTOMER_ID, ROLE, CONTENT)
         VALUES (AGRO_AI_CHAT_SEQ.NEXTVAL, :1, 'user', :2)`,
        [customerId, { val: userMessage, type: oracledb.CLOB }],
      );
      await conn.execute(
        `INSERT INTO AGRO_AI_CHAT_MESSAGES (ID, CUSTOMER_ID, ROLE, CONTENT)
         VALUES (AGRO_AI_CHAT_SEQ.NEXTVAL, :1, 'assistant', :2)`,
        [customerId, { val: reply, type: oracledb.CLOB }],
        { autoCommit: true }
      );
    } finally {
      await conn.close();
    }
  } catch {
    // Tables may not exist yet
  }

  return NextResponse.json({ reply });
}

// DELETE — clear chat history
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAuth()))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const customerId = Number(id);
  if (!customerId) return NextResponse.json({ error: "Неверный ID" }, { status: 400 });

  await import("@/lib/oracle").then(m =>
    m.execute(
      `DELETE FROM AGRO_AI_CHAT_MESSAGES WHERE CUSTOMER_ID = :1`,
      [customerId]
    )
  ).catch(() => {});

  return NextResponse.json({ ok: true });
}
