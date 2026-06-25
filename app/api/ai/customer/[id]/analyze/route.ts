import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { query, execute } from "@/lib/oracle";
import { groqAnalysis } from "@/lib/groq";
import { getActiveModel, getActiveProvider } from "@/lib/ai";
import oracledb from "oracledb";

interface CustomerRow extends Record<string, unknown> {
  ID: number; NAME: string; CUSTOMER_TYPE: string | null;
  COUNTRY: string | null; CONTACT_PHONE: string | null;
  CONTACT_EMAIL: string | null; ADDRESS: string | null; TAX_ID: string | null;
}
interface SalesRow extends Record<string, unknown> {
  DOC_NUMBER: string; DOC_DATE: Date | string | null;
  STATUS: string; SALE_TYPE: string | null;
  TOTAL_AMOUNT_MDL: number | null; CURRENCY_CODE: string | null;
  TOTAL_NET_KG: number | null;
}
interface StatsRow extends Record<string, unknown> {
  TOTAL_REVENUE: number; ORDER_COUNT: number; AVG_CHECK: number;
  DAYS_SINCE_LAST: number | null; FIRST_ORDER: Date | string | null;
  LAST_ORDER: Date | string | null;
}
interface ActivityRow extends Record<string, unknown> {
  ACT_TYPE: string | null; SUBJECT: string | null;
  CREATED_AT: Date | string | null; MANAGER: string | null;
}

const SYSTEM_PROMPT_FULL = `Ты — опытный аналитик отдела продаж. Тебе дают данные по одному клиенту из CRM. Сделай развёрнутый, содержательный и практичный анализ для менеджера по продажам.

ТРЕБОВАНИЯ К ОТВЕТУ:
- Отвечай ОБЯЗАТЕЛЬНО на русском языке.
- Используй формат Markdown: заголовки ##, списки -, выделение **жирным**.
- Объём — несколько содержательных абзацев со списками, а НЕ пара предложений.
- Опирайся только на приведённые данные, не выдумывай факты.

СТРУКТУРА ОТВЕТА (используй именно эти заголовки):
## 1. Профиль клиента
## 2. Ценность и динамика
(суммы заказов, средний чек, тренд)
## 3. Риски и сигналы
## 4. Рекомендации
(3–5 конкретных следующих шагов)

Если данных мало — отметь это кратко, но всё равно дай выводы и рекомендации.`;

const SYSTEM_PROMPT_ANON = SYSTEM_PROMPT_FULL +
  "\n\nВАЖНО: данные намеренно ОБЕЗЛИЧЕНЫ (без имени, телефонов, e-mail и реквизитов) — это нормально. НЕ упоминай отсутствие персональных данных как проблему — просто анализируй цифры.";

function fmtDate(d: Date | string | null): string {
  if (!d) return "неизвестно";
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function buildDossier(
  customer: CustomerRow,
  sales: SalesRow[],
  stats: StatsRow,
  activities: ActivityRow[],
  anonymized: boolean,
): string {
  const lines: string[] = [];

  if (!anonymized) {
    lines.push(`Клиент: ${customer.NAME}`);
    if (customer.CUSTOMER_TYPE) lines.push(`Тип: ${customer.CUSTOMER_TYPE}`);
    if (customer.COUNTRY)       lines.push(`Страна: ${customer.COUNTRY}`);
    if (customer.TAX_ID)        lines.push(`Tax ID: ${customer.TAX_ID}`);
    if (customer.CONTACT_PHONE) lines.push(`Телефон: ${customer.CONTACT_PHONE}`);
    if (customer.CONTACT_EMAIL) lines.push(`E-mail: ${customer.CONTACT_EMAIL}`);
    if (customer.ADDRESS)       lines.push(`Адрес: ${customer.ADDRESS}`);
  } else {
    lines.push(`Тип клиента: ${customer.CUSTOMER_TYPE ?? "не указан"}`);
    if (customer.COUNTRY) lines.push(`Страна: ${customer.COUNTRY}`);
  }

  lines.push("");
  lines.push("=== СТАТИСТИКА ===");
  lines.push(`Заказов: ${Number(stats.ORDER_COUNT)}`);
  lines.push(`Общая выручка: ${Math.round(Number(stats.TOTAL_REVENUE))} MDL`);
  lines.push(`Средний чек: ${Math.round(Number(stats.AVG_CHECK))} MDL`);
  if (stats.FIRST_ORDER) lines.push(`Первый заказ: ${fmtDate(stats.FIRST_ORDER as Date)}`);
  if (stats.LAST_ORDER)  lines.push(`Последний заказ: ${fmtDate(stats.LAST_ORDER as Date)}`);
  if (stats.DAYS_SINCE_LAST !== null) lines.push(`Дней с последнего заказа: ${Number(stats.DAYS_SINCE_LAST)}`);

  if (sales.length > 0) {
    lines.push("");
    lines.push("=== ЗАКАЗЫ (последние 20) ===");
    for (const s of sales.slice(0, 20)) {
      const amount = s.TOTAL_AMOUNT_MDL ? `${Math.round(Number(s.TOTAL_AMOUNT_MDL))} MDL` : "—";
      const kg     = s.TOTAL_NET_KG     ? `${Number(s.TOTAL_NET_KG).toFixed(0)} кг` : "";
      lines.push(
        `${fmtDate(s.DOC_DATE as Date)} | ${s.DOC_NUMBER} | ${s.STATUS} | ${amount}${kg ? " | " + kg : ""}`
      );
    }
  }

  if (activities.length > 0) {
    lines.push("");
    lines.push("=== АКТИВНОСТИ (последние 10) ===");
    for (const a of activities.slice(0, 10)) {
      lines.push(`${fmtDate(a.CREATED_AT as Date)} | ${a.ACT_TYPE ?? "—"} | ${a.SUBJECT ?? "—"}`);
    }
  }

  return lines.join("\n");
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const store = await cookies();
  const token = store.get("token")?.value;
  if (!token || !verifyToken(token))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const customerId = Number(id);
  if (!customerId) return NextResponse.json({ error: "Неверный ID" }, { status: 400 });

  const body = await req.json().catch(() => ({})) as { anonymized?: boolean; wish?: string; provider?: string; model?: string };
  const anonymized    = body.anonymized !== false;
  const wish          = (body.wish ?? "").trim();
  const aiProvider    = body.provider;
  const aiModel       = body.model;

  const [customers, salesRows, statsRows, actRows] = await Promise.all([
    query<CustomerRow>(`
      SELECT ID, NAME, CUSTOMER_TYPE, COUNTRY, CONTACT_PHONE, CONTACT_EMAIL, ADDRESS, TAX_ID
      FROM AGRO_CUSTOMERS WHERE ID = :1
    `, [customerId]),

    query<SalesRow>(`
      SELECT * FROM (
        SELECT DOC_NUMBER, DOC_DATE, STATUS, SALE_TYPE,
               NVL(TOTAL_AMOUNT_MDL, TOTAL_AMOUNT) AS TOTAL_AMOUNT_MDL,
               NVL(CURRENCY_CODE, 'MDL') AS CURRENCY_CODE,
               TOTAL_NET_KG
        FROM AGRO_SALES_DOCS
        WHERE CUSTOMER_ID = :1 AND STATUS NOT IN ('draft', 'cancelled')
        ORDER BY DOC_DATE DESC
      ) WHERE ROWNUM <= 20
    `, [customerId]),

    query<StatsRow>(`
      SELECT
        NVL(SUM(NVL(TOTAL_AMOUNT_MDL, TOTAL_AMOUNT)), 0) AS TOTAL_REVENUE,
        COUNT(*)                                          AS ORDER_COUNT,
        NVL(AVG(NVL(TOTAL_AMOUNT_MDL, TOTAL_AMOUNT)), 0) AS AVG_CHECK,
        ROUND(SYSDATE - MAX(DOC_DATE))                    AS DAYS_SINCE_LAST,
        MIN(DOC_DATE) AS FIRST_ORDER, MAX(DOC_DATE) AS LAST_ORDER
      FROM AGRO_SALES_DOCS
      WHERE CUSTOMER_ID = :1 AND STATUS NOT IN ('draft', 'cancelled')
    `, [customerId]),

    query<ActivityRow>(`
      SELECT * FROM (
        SELECT act_type, body AS subject, created_at, created_by AS manager
        FROM AGRO_CRM_ACTIVITIES
        WHERE customer_id = :1
        ORDER BY created_at DESC
      ) WHERE ROWNUM <= 10
    `, [customerId]).catch(() => [] as ActivityRow[]),
  ]);

  if (!customers.length)
    return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });

  const customer = customers[0];
  const stats    = statsRows[0];
  const dossier  = buildDossier(customer, salesRows, stats, actRows, anonymized);

  const systemPrompt = anonymized ? SYSTEM_PROMPT_ANON : SYSTEM_PROMPT_FULL;
  const userPrompt   = `Данные по клиенту:\n\n${dossier}${wish ? `\n\nДополнительное пожелание: ${wish}` : ""}`;

  let analysis: string;
  try {
    analysis = await groqAnalysis(systemPrompt, userPrompt, aiProvider, aiModel);
  } catch {
    return NextResponse.json({ error: "Ошибка AI анализа" }, { status: 500 });
  }

  // Persist to DB (best-effort — don't fail if tables don't exist yet)
  let analysisId: number | null = null;
  try {
    const { getConnection } = await import("@/lib/oracle");
    const conn = await getConnection();
    try {
      const ins = await conn.execute(
        `INSERT INTO AGRO_AI_ANALYSES
           (ID, CUSTOMER_ID, ANONYMIZED, WISH, MODEL, DOSSIER, RESPONSE)
         VALUES (AGRO_AI_ANALYSES_SEQ.NEXTVAL, :1, :2, :3, :4, :5, :6)
         RETURNING ID INTO :out`,
        [
          customerId, anonymized ? 1 : 0, wish || null,
          "llama-3.3-70b-versatile",
          { val: dossier,  type: oracledb.CLOB },
          { val: analysis, type: oracledb.CLOB },
          { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        ],
        { autoCommit: true }
      );
      analysisId = (ins.outBinds as number[][])[0]?.[0] ?? null;
    } finally {
      await conn.close();
    }
  } catch {
    // Tables may not exist yet — analysis still returned
  }

  return NextResponse.json({
    analysis, id: analysisId, anonymized,
    model: aiModel ?? getActiveModel(),
    provider: aiProvider ?? getActiveProvider(),
  });
}
