import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/oracle";
import { sendText } from "@/lib/tg";
import { sendEmail } from "@/lib/gmail";

// ── Types ─────────────────────────────────────────────────────

interface RuleRow {
  [key: string]: unknown;
  ID: number;
  NAME: string;
  TRIGGER_TYPE: string;
  CONDITION_DAYS: number;
  ACTION_TYPE: string;
  MESSAGE_TEMPLATE: string | null;
  TASK_TITLE: string | null;
  COOLDOWN_DAYS: number;
  SEGMENT: string;
}

interface CandidateRow {
  [key: string]: unknown;
  CUSTOMER_ID: number;
  NAME: string;
  TELEGRAM_CHAT_ID: number | null;
  APP_USER_ID: number | null;
  CONTACT_EMAIL: string | null;
  DAYS_SINCE: number;
}

interface CooldownRow {
  [key: string]: unknown;
  CUSTOMER_ID: number;
}

// ── Helpers ───────────────────────────────────────────────────

function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? `{{${k}}}`);
}

function checkSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev mode: no secret required
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

// ── Segment SQL helpers ───────────────────────────────────────

function buildSegmentJoin(segment: string): { join: string; where: string } {
  if (segment === "all") return { join: "", where: "" };

  const join = `
    LEFT JOIN (
      SELECT CUSTOMER_ID,
             SUM(NVL(TOTAL_AMOUNT_MDL, TOTAL_AMOUNT))  TOTAL_REV,
             MAX(DOC_DATE)                              LAST_DATE,
             MIN(DOC_DATE)                              FIRST_DATE,
             COUNT(*)                                   ORD_CNT
      FROM AGRO_SALES_DOCS
      WHERE STATUS NOT IN ('draft','cancelled')
      GROUP BY CUSTOMER_ID
    ) seg_s ON seg_s.CUSTOMER_ID = c.ID
    LEFT JOIN (
      SELECT CUSTOMER_ID,
             SUM(NVL(TOTAL_AMOUNT_MDL, TOTAL_AMOUNT)) REV90
      FROM AGRO_SALES_DOCS
      WHERE STATUS NOT IN ('draft','cancelled')
        AND DOC_DATE >= SYSDATE - 90
      GROUP BY CUSTOMER_ID
    ) seg_s90 ON seg_s90.CUSTOMER_ID = c.ID`;

  const whereMap: Record<string, string> = {
    vip:      `AND NVL(seg_s90.REV90, 0) >= 50000`,
    active:   `AND seg_s.LAST_DATE >= SYSDATE - 60 AND NVL(seg_s90.REV90,0) < 50000`,
    sleeping: `AND seg_s.LAST_DATE < SYSDATE - 60 AND seg_s.LAST_DATE >= SYSDATE - 180`,
    churned:  `AND (seg_s.LAST_DATE < SYSDATE - 180 OR seg_s.LAST_DATE IS NULL)`,
  };

  return { join, where: whereMap[segment] ?? "" };
}

// Returns customers matching the rule trigger + segment.
// For tg_message rules, only customers with a linked TG user are returned.
async function getCandidates(rule: RuleRow): Promise<CandidateRow[]> {
  const { join: segJoin, where: segWhere } = buildSegmentJoin(rule.SEGMENT);
  const needsTg    = rule.ACTION_TYPE === "tg_message";
  const needsEmail = rule.ACTION_TYPE === "email_send";

  const tgJoin = needsTg
    ? `JOIN AGRO_CRM_APP_USERS au ON au.CUSTOMER_ID = c.ID AND au.STATUS = 'linked'`
    : `LEFT JOIN AGRO_CRM_APP_USERS au ON au.CUSTOMER_ID = c.ID AND au.STATUS = 'linked'`;

  const emailWhere = needsEmail ? `AND c.CONTACT_EMAIL IS NOT NULL` : "";

  return query<CandidateRow>(`
    SELECT c.ID                                    AS CUSTOMER_ID,
           c.NAME,
           c.CONTACT_EMAIL,
           au.TELEGRAM_CHAT_ID,
           au.ID                                   AS APP_USER_ID,
           ROUND(SYSDATE - s.LAST_DATE)            AS DAYS_SINCE
    FROM AGRO_CUSTOMERS c
    ${tgJoin}
    ${segJoin}
    JOIN (
      SELECT CUSTOMER_ID, MAX(DOC_DATE) LAST_DATE
      FROM AGRO_SALES_DOCS
      WHERE STATUS NOT IN ('draft','cancelled')
      GROUP BY CUSTOMER_ID
    ) s ON s.CUSTOMER_ID = c.ID
    WHERE c.ACTIVE = 'Y'
      AND s.LAST_DATE < SYSDATE - :1
      ${segWhere}
      ${emailWhere}
  `, [rule.CONDITION_DAYS]);
}

// Returns set of customer IDs already notified within the cooldown window.
async function getCooldownSet(ruleId: number, cooldownDays: number): Promise<Set<number>> {
  const rows = await query<CooldownRow>(`
    SELECT CUSTOMER_ID
    FROM AGRO_CRM_AUTOMATION_LOG
    WHERE RULE_ID = :1
      AND FIRED_AT > SYSDATE - :2
      AND RESULT != 'error'
  `, [ruleId, cooldownDays]);
  return new Set(rows.map((r) => Number(r.CUSTOMER_ID)));
}

// ── Action handlers ───────────────────────────────────────────

async function doTgMessage(
  rule: RuleRow,
  candidate: CandidateRow
): Promise<void> {
  if (!candidate.TELEGRAM_CHAT_ID || !candidate.APP_USER_ID) {
    throw new Error("no linked TG user");
  }

  const text = render(rule.MESSAGE_TEMPLATE ?? "", {
    customer_name: String(candidate.NAME ?? ""),
    days_since:    String(candidate.DAYS_SINCE ?? ""),
  });

  const msgId = await sendText(Number(candidate.TELEGRAM_CHAT_ID), text);

  await execute(`
    INSERT INTO AGRO_CRM_CHAT_MESSAGES
      (APP_USER_ID, DIRECTION, BODY, TG_MESSAGE_ID, STATUS)
    VALUES (:1, 'out', :2, :3, 'sent')
  `, [candidate.APP_USER_ID, text, msgId]);

  await execute(`
    UPDATE AGRO_CRM_APP_USERS
    SET LAST_MESSAGE_AT = SYSTIMESTAMP
    WHERE ID = :1
  `, [candidate.APP_USER_ID]);
}

async function doManagerTask(
  rule: RuleRow,
  candidate: CandidateRow
): Promise<void> {
  const title = render(rule.TASK_TITLE ?? "Связаться с клиентом", {
    customer_name: String(candidate.NAME ?? ""),
    days_since:    String(candidate.DAYS_SINCE ?? ""),
  });

  await execute(`
    INSERT INTO AGRO_CRM_TASKS
      (TITLE, CUSTOMER_ID, PRIORITY, STATUS, CREATED_BY, NOTES)
    VALUES (:1, :2, 'high', 'open', 'automation', :3)
  `, [
    title,
    candidate.CUSTOMER_ID,
    `Автоматически создано правилом «${rule.NAME}»`,
  ]);
}

async function doEmailSend(
  rule: RuleRow,
  candidate: CandidateRow
): Promise<void> {
  if (!candidate.CONTACT_EMAIL) throw new Error("no contact email");

  const subject = render(rule.TASK_TITLE ?? "Сообщение от нашей компании", {
    customer_name: String(candidate.NAME ?? ""),
    days_since:    String(candidate.DAYS_SINCE ?? ""),
  });

  const text = render(rule.MESSAGE_TEMPLATE ?? "", {
    customer_name: String(candidate.NAME ?? ""),
    days_since:    String(candidate.DAYS_SINCE ?? ""),
  });

  await sendEmail({ to: String(candidate.CONTACT_EMAIL), subject, text });
}

// ── Main handler ──────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!checkSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rules = await query<RuleRow>(`
    SELECT ID, NAME, TRIGGER_TYPE, CONDITION_DAYS, ACTION_TYPE,
           MESSAGE_TEMPLATE, TASK_TITLE, COOLDOWN_DAYS, SEGMENT
    FROM AGRO_CRM_AUTOMATION_RULES
    WHERE ACTIVE = 'Y'
    ORDER BY ID
  `, []);

  let totalFired = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  const summary: { rule: string; fired: number; skipped: number; errors: number }[] = [];

  for (const rule of rules) {
    let fired = 0; let skipped = 0; let errors = 0;

    try {
      const [candidates, cooldown] = await Promise.all([
        getCandidates(rule),
        getCooldownSet(Number(rule.ID), Number(rule.COOLDOWN_DAYS)),
      ]);

      for (const c of candidates) {
        const custId = Number(c.CUSTOMER_ID);

        if (cooldown.has(custId)) {
          skipped++;
          continue;
        }

        let result: "success" | "error" = "success";
        let details: string | null = null;

        try {
          if (rule.ACTION_TYPE === "tg_message") {
            await doTgMessage(rule, c);
          } else if (rule.ACTION_TYPE === "manager_task") {
            await doManagerTask(rule, c);
          } else if (rule.ACTION_TYPE === "email_send") {
            await doEmailSend(rule, c);
          }
          fired++;
        } catch (err) {
          result = "error";
          details = err instanceof Error ? err.message : String(err);
          errors++;
        }

        await execute(`
          INSERT INTO AGRO_CRM_AUTOMATION_LOG
            (RULE_ID, CUSTOMER_ID, ACTION_TYPE, RESULT, DETAILS)
          VALUES (:1, :2, :3, :4, :5)
        `, [rule.ID, custId, rule.ACTION_TYPE, result, details]);
      }
    } catch (err) {
      errors++;
      console.error(`[automations] rule ${rule.ID} failed:`, err);
    }

    summary.push({ rule: String(rule.NAME), fired, skipped, errors });
    totalFired   += fired;
    totalSkipped += skipped;
    totalErrors  += errors;
  }

  return NextResponse.json({
    success: true,
    rules_checked: rules.length,
    total_fired:   totalFired,
    total_skipped: totalSkipped,
    total_errors:  totalErrors,
    summary,
  });
}

// Also support GET for easy manual testing in browser
export async function GET(req: NextRequest) {
  return POST(req);
}
