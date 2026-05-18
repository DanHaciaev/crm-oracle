import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

interface ExportRow {
  [key: string]: unknown;
  ID: number; CODE: string; NAME: string;
  COUNTRY: string | null; CUSTOMER_TYPE: string | null;
  CONTACT_PHONE: string | null; CONTACT_EMAIL: string | null;
  SEGMENT: string;
  TOTAL_REVENUE: number | null;
  LAST_ORDER_DATE: Date | string | null;
  ORDER_COUNT: number | null;
  DAYS_SINCE: number | null;
  TG_LINKED: number;
}

const SEGMENT_RU: Record<string, string> = {
  vip: "VIP", new: "Новый", active: "Активный",
  sleeping: "Спящий", churned: "Ушедший", no_orders: "Нет заказов",
};

async function requireAuth() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? verifyToken(token) : null;
}

function csvCell(v: unknown): string {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

export async function GET() {
  if (!(await requireAuth()))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const rows = await query<ExportRow>(`
    SELECT
      c.ID, c.CODE, c.NAME, c.COUNTRY, c.CUSTOMER_TYPE,
      c.CONTACT_PHONE, c.CONTACT_EMAIL,
      CASE WHEN au.ID IS NOT NULL THEN 1 ELSE 0 END AS TG_LINKED,
      NVL(s.TOTAL_REV, 0)  AS TOTAL_REVENUE,
      s.LAST_DATE          AS LAST_ORDER_DATE,
      NVL(s.ORD_CNT, 0)   AS ORDER_COUNT,
      CASE WHEN s.LAST_DATE IS NOT NULL
           THEN ROUND(SYSDATE - s.LAST_DATE) END     AS DAYS_SINCE,
      CASE
        WHEN s.FIRST_DATE >= SYSDATE - 30 AND NVL(s.ORD_CNT,0) <= 3 THEN 'new'
        WHEN NVL(s90.REV90, 0) >= 50000                              THEN 'vip'
        WHEN s.LAST_DATE >= SYSDATE - 60                             THEN 'active'
        WHEN s.LAST_DATE >= SYSDATE - 180                            THEN 'sleeping'
        WHEN s.ORD_CNT > 0                                           THEN 'churned'
        ELSE 'no_orders'
      END AS SEGMENT
    FROM AGRO_CUSTOMERS c
    LEFT JOIN (
      SELECT CUSTOMER_ID,
             SUM(NVL(TOTAL_AMOUNT, 0)) TOTAL_REV,
             COUNT(*)                  ORD_CNT,
             MAX(DOC_DATE)             LAST_DATE,
             MIN(DOC_DATE)             FIRST_DATE
      FROM AGRO_SALES_DOCS
      WHERE STATUS NOT IN ('draft','cancelled')
      GROUP BY CUSTOMER_ID
    ) s ON s.CUSTOMER_ID = c.ID
    LEFT JOIN (
      SELECT CUSTOMER_ID, SUM(NVL(TOTAL_AMOUNT, 0)) REV90
      FROM AGRO_SALES_DOCS
      WHERE STATUS NOT IN ('draft','cancelled') AND DOC_DATE >= SYSDATE - 90
      GROUP BY CUSTOMER_ID
    ) s90 ON s90.CUSTOMER_ID = c.ID
    LEFT JOIN AGRO_CRM_APP_USERS au ON au.CUSTOMER_ID = c.ID AND au.STATUS = 'linked'
    WHERE c.ACTIVE = 'Y'
    ORDER BY c.NAME
  `, []);

  const headers = [
    "Код", "Название", "Страна", "Тип", "Телефон", "Email",
    "Сегмент", "Выручка (MDL)", "Последний заказ", "Заказов всего",
    "Дней без покупки", "Telegram",
  ];

  const dataRows = rows.map((r) => {
    const lastDate = r.LAST_ORDER_DATE
      ? new Date(r.LAST_ORDER_DATE as string).toLocaleDateString("ru-RU")
      : "";
    return [
      r.CODE, r.NAME,
      r.COUNTRY ?? "",
      r.CUSTOMER_TYPE === "export" ? "Экспорт" : "Внутренний",
      r.CONTACT_PHONE ?? "",
      r.CONTACT_EMAIL ?? "",
      SEGMENT_RU[r.SEGMENT] ?? r.SEGMENT,
      r.TOTAL_REVENUE !== null ? String(Math.round(Number(r.TOTAL_REVENUE))) : "0",
      lastDate,
      String(r.ORDER_COUNT ?? 0),
      r.DAYS_SINCE !== null ? String(r.DAYS_SINCE) : "",
      r.TG_LINKED ? "да" : "",
    ];
  });

  const csv = [headers, ...dataRows]
    .map((row) => row.map(csvCell).join(";"))
    .join("\n");

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type":        "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="customers-${date}.csv"`,
    },
  });
}
