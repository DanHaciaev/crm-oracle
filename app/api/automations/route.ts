import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query, execute } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

interface RuleRow {
  [key: string]: unknown;
  ID: number; NAME: string; TRIGGER_TYPE: string;
  CONDITION_DAYS: number; ACTION_TYPE: string;
  MESSAGE_TEMPLATE: string | null; TASK_TITLE: string | null;
  COOLDOWN_DAYS: number; SEGMENT: string; ACTIVE: string;
  CREATED_AT: Date | string | null;
  LAST_FIRED: Date | string | null;
  FIRED_30D: number;
}

interface LogRow {
  [key: string]: unknown;
  ID: number; RULE_ID: number; RULE_NAME: string;
  CUSTOMER_ID: number; CUSTOMER_NAME: string | null;
  ACTION_TYPE: string | null; RESULT: string; DETAILS: string | null;
  FIRED_AT: Date | string | null;
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

const VALID_ACTIONS   = new Set(["tg_message", "manager_task"]);
const VALID_SEGMENTS  = new Set(["all", "vip", "active", "sleeping", "churned"]);

export async function POST(req: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Только admin" }, { status: 403 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { name, condition_days, action_type, message_template, task_title, cooldown_days, segment, active } = body;

  if (!name) return NextResponse.json({ error: "name обязателен" }, { status: 400 });
  if (!VALID_ACTIONS.has(String(action_type)))
    return NextResponse.json({ error: "action_type: tg_message или manager_task" }, { status: 400 });
  if (!VALID_SEGMENTS.has(String(segment)))
    return NextResponse.json({ error: "Неверный segment" }, { status: 400 });

  await execute(`
    INSERT INTO AGRO_CRM_AUTOMATION_RULES
      (NAME, TRIGGER_TYPE, CONDITION_DAYS, ACTION_TYPE, MESSAGE_TEMPLATE, TASK_TITLE, COOLDOWN_DAYS, SEGMENT, ACTIVE)
    VALUES (:1, 'no_order_days', :2, :3, :4, :5, :6, :7, :8)
  `, [
    String(name),
    Number(condition_days ?? 30),
    String(action_type),
    action_type === "tg_message" && message_template ? String(message_template) : null,
    action_type === "manager_task" && task_title     ? String(task_title)       : null,
    Number(cooldown_days ?? 14),
    String(segment ?? "all"),
    active === false ? "N" : "Y",
  ]);

  return NextResponse.json({ success: true }, { status: 201 });
}

export async function GET() {
  if (!(await requireAuth()))
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const [rules, log] = await Promise.all([
    query<RuleRow>(`
      SELECT r.ID, r.NAME, r.TRIGGER_TYPE, r.CONDITION_DAYS,
             r.ACTION_TYPE, r.MESSAGE_TEMPLATE, r.TASK_TITLE,
             r.COOLDOWN_DAYS, r.SEGMENT, r.ACTIVE, r.CREATED_AT,
             (SELECT MAX(FIRED_AT)
                FROM AGRO_CRM_AUTOMATION_LOG
               WHERE RULE_ID = r.ID)                                 AS LAST_FIRED,
             (SELECT COUNT(*)
                FROM AGRO_CRM_AUTOMATION_LOG
               WHERE RULE_ID = r.ID AND FIRED_AT > SYSDATE - 30)    AS FIRED_30D
      FROM AGRO_CRM_AUTOMATION_RULES r
      ORDER BY r.ID
    `, []),

    query<LogRow>(`
      SELECT * FROM (
        SELECT l.ID, l.RULE_ID, r.NAME AS RULE_NAME,
               l.CUSTOMER_ID, c.NAME AS CUSTOMER_NAME,
               l.ACTION_TYPE, l.RESULT, l.DETAILS, l.FIRED_AT
        FROM AGRO_CRM_AUTOMATION_LOG l
        JOIN AGRO_CRM_AUTOMATION_RULES r ON r.ID = l.RULE_ID
        JOIN AGRO_CUSTOMERS c ON c.ID = l.CUSTOMER_ID
        ORDER BY l.FIRED_AT DESC
      ) WHERE ROWNUM <= 30
    `, []),
  ]);

  return NextResponse.json({
    rules: rules.map((r) => ({
      id:               Number(r.ID),
      name:             String(r.NAME),
      trigger_type:     String(r.TRIGGER_TYPE),
      condition_days:   Number(r.CONDITION_DAYS),
      action_type:      String(r.ACTION_TYPE),
      message_template: r.MESSAGE_TEMPLATE ? String(r.MESSAGE_TEMPLATE) : null,
      task_title:       r.TASK_TITLE ? String(r.TASK_TITLE) : null,
      cooldown_days:    Number(r.COOLDOWN_DAYS),
      segment:          String(r.SEGMENT),
      active:           r.ACTIVE === "Y",
      created_at:       iso(r.CREATED_AT as Date | string | null),
      last_fired:       iso(r.LAST_FIRED as Date | string | null),
      fired_30d:        Number(r.FIRED_30D ?? 0),
    })),
    log: log.map((l) => ({
      id:            Number(l.ID),
      rule_id:       Number(l.RULE_ID),
      rule_name:     String(l.RULE_NAME ?? ""),
      customer_id:   Number(l.CUSTOMER_ID),
      customer_name: l.CUSTOMER_NAME ? String(l.CUSTOMER_NAME) : null,
      action_type:   l.ACTION_TYPE ? String(l.ACTION_TYPE) : null,
      result:        String(l.RESULT),
      details:       l.DETAILS ? String(l.DETAILS) : null,
      fired_at:      iso(l.FIRED_AT as Date | string | null),
    })),
  });
}
