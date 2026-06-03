import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { query } from "@/lib/oracle";
import { groqChat } from "@/lib/groq";

interface CustomerRow extends Record<string, unknown> {
  NAME: string; CUSTOMER_TYPE: string | null; COUNTRY: string | null;
}
interface StatsRow extends Record<string, unknown> {
  TOTAL_REVENUE: number; ORDER_COUNT: number; AVG_CHECK: number;
  DAYS_SINCE_LAST: number | null;
}

export async function POST(req: NextRequest) {
  const store = await cookies();
  const token = store.get("token")?.value;
  if (!token || !verifyToken(token))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { customerId } = await req.json().catch(() => ({})) as { customerId?: number };
  if (!customerId) return NextResponse.json({ error: "customerId required" }, { status: 400 });

  const [customers, statsRows, avgRows] = await Promise.all([
    query<CustomerRow>(`SELECT NAME, CUSTOMER_TYPE, COUNTRY FROM AGRO_CUSTOMERS WHERE ID = :1`, [customerId]),
    query<StatsRow>(`
      SELECT
        NVL(SUM(NVL(TOTAL_AMOUNT_MDL, TOTAL_AMOUNT)), 0)  AS TOTAL_REVENUE,
        COUNT(*)                                           AS ORDER_COUNT,
        NVL(AVG(NVL(TOTAL_AMOUNT_MDL, TOTAL_AMOUNT)), 0)  AS AVG_CHECK,
        ROUND(SYSDATE - MAX(DOC_DATE))                     AS DAYS_SINCE_LAST
      FROM AGRO_SALES_DOCS
      WHERE CUSTOMER_ID = :1 AND STATUS NOT IN ('draft','cancelled')
    `, [customerId]),
    query<{ [key: string]: unknown; AVG_DAYS: number | null }>(`
      SELECT ROUND(AVG(diff), 0) AS AVG_DAYS FROM (
        SELECT DOC_DATE - LAG(DOC_DATE) OVER (ORDER BY DOC_DATE) AS diff
        FROM AGRO_SALES_DOCS
        WHERE CUSTOMER_ID = :1 AND STATUS NOT IN ('draft','cancelled')
      ) WHERE diff IS NOT NULL
    `, [customerId]),
  ]);

  if (!customers.length) return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });

  const c   = customers[0];
  const s   = statsRows[0];
  const avg = avgRows[0]?.AVG_DAYS ?? null;

  const lines = [
    `Клиент: ${c.NAME}`,
    c.CUSTOMER_TYPE ? `Тип: ${c.CUSTOMER_TYPE}` : null,
    c.COUNTRY       ? `Страна: ${c.COUNTRY}` : null,
    Number(s.ORDER_COUNT) > 0
      ? `Заказов: ${Number(s.ORDER_COUNT)}, LTV: ${Math.round(Number(s.TOTAL_REVENUE))} MDL, средний чек: ${Math.round(Number(s.AVG_CHECK))} MDL`
      : "Заказов пока нет",
    s.DAYS_SINCE_LAST !== null ? `Дней с последней покупки: ${Number(s.DAYS_SINCE_LAST)}` : null,
    avg !== null ? `Средний цикл покупки: ${Number(avg)} дней` : null,
  ].filter(Boolean).join("\n");

  const system = `Ты — аналитик CRM агро-компании. Делаешь короткий анализ клиента для менеджера по продажам.
Ответ строго на русском языке, 2-3 предложения. Только факты и рекомендация что делать с этим клиентом.`;

  const user = `Вот данные по клиенту:\n${lines}\n\nДай краткий анализ и рекомендацию менеджеру.`;

  try {
    const summary = await groqChat(system, user);
    return NextResponse.json({ summary });
  } catch {
    return NextResponse.json({ error: "Ошибка AI анализа" }, { status: 500 });
  }
}
