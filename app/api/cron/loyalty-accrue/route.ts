import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/oracle";
import { sendText } from "@/lib/tg";

const CRON_SECRET = process.env.CRON_SECRET;

// 1 point per 10 MDL, rounded down
const POINTS_PER_MDL = 1 / 10;

interface DocRow {
  [key: string]: unknown;
  DOC_ID:        number;
  DOC_NUMBER:    string;
  CUSTOMER_ID:   number;
  CUSTOMER_NAME: string;
  AMOUNT_MDL:    number;
  MEMBER_ID:     number;
  TOTAL_POINTS:  number;
}

interface TierRow {
  [key: string]: unknown;
  ID:         number;
  MIN_POINTS: number;
}

async function recalcTier(memberId: number, totalPoints: number) {
  const tiers = await query<TierRow>(
    `SELECT ID, MIN_POINTS FROM AGRO_CRM_LOYALTY_TIERS ORDER BY MIN_POINTS DESC`
  );
  const tier = tiers.find(t => totalPoints >= Number(t.MIN_POINTS));
  if (!tier) return;
  await execute(
    `UPDATE AGRO_CRM_LOYALTY_MEMBERS SET TIER_ID = :1 WHERE ID = :2`,
    [Number(tier.ID), memberId]
  );
}

export async function GET(req: NextRequest) {
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Find closed/delivered sales docs for loyalty members not yet accrued
  const docs = await query<DocRow>(`
    SELECT sd.ID           AS DOC_ID,
           sd.DOC_NUMBER,
           sd.CUSTOMER_ID,
           c.NAME          AS CUSTOMER_NAME,
           sd.TOTAL_AMOUNT_MDL AS AMOUNT_MDL,
           m.ID            AS MEMBER_ID,
           m.TOTAL_POINTS
    FROM AGRO_SALES_DOCS sd
    JOIN AGRO_CUSTOMERS c ON c.ID = sd.CUSTOMER_ID
    JOIN AGRO_CRM_LOYALTY_MEMBERS m ON m.CUSTOMER_ID = sd.CUSTOMER_ID
    WHERE sd.STATUS IN ('closed', 'delivered')
      AND sd.TOTAL_AMOUNT_MDL > 0
      AND NOT EXISTS (
        SELECT 1 FROM AGRO_CRM_LOYALTY_TX tx
        WHERE tx.MEMBER_ID = m.ID
          AND tx.TX_TYPE   = 'purchase'
          AND tx.REF_ID    = sd.ID
      )
    ORDER BY sd.ID
  `);

  if (docs.length === 0)
    return NextResponse.json({ accrued: 0, reason: "No new closed docs to process" });

  let totalAccrued = 0;
  const summary: string[] = [];

  for (const doc of docs) {
    const points = Math.floor(Number(doc.AMOUNT_MDL) * POINTS_PER_MDL);
    if (points <= 0) continue;

    const newTotal = Number(doc.TOTAL_POINTS) + points;

    await execute(
      `UPDATE AGRO_CRM_LOYALTY_MEMBERS SET TOTAL_POINTS = :1 WHERE ID = :2`,
      [newTotal, doc.MEMBER_ID]
    );

    await execute(
      `INSERT INTO AGRO_CRM_LOYALTY_TX (MEMBER_ID, POINTS, TX_TYPE, DESCRIPTION, REF_ID)
       VALUES (:1, :2, 'purchase', :3, :4)`,
      [
        doc.MEMBER_ID,
        points,
        `Заказ ${doc.DOC_NUMBER} — ${Number(doc.AMOUNT_MDL).toLocaleString("ru-RU", { maximumFractionDigits: 0 })} MDL`,
        doc.DOC_ID,
      ]
    );

    await recalcTier(doc.MEMBER_ID, newTotal);

    totalAccrued += points;
    summary.push(`  • ${doc.CUSTOMER_NAME}: +${points} б. (заказ ${doc.DOC_NUMBER})`);
  }

  const adminChatId = process.env.TG_ADMIN_CHAT_ID
    ? Number(process.env.TG_ADMIN_CHAT_ID)
    : null;

  if (adminChatId && summary.length > 0) {
    const msg = `🎯 Начислено баллов лояльности (${docs.length} заказов, +${totalAccrued} б.):\n` + summary.join("\n");
    await sendText(adminChatId, msg);
  }

  return NextResponse.json({ accrued: totalAccrued, docs: docs.length });
}
