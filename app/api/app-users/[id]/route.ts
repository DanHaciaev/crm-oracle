import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query, execute } from "@/lib/oracle";
import { verifyToken } from "@/lib/auth";

async function requireAuth() {
  const cookieStore = await cookies();
  const token       = cookieStore.get("token")?.value;
  return token ? verifyToken(token) : null;
}

async function logEvent(appUserId: number, eventType: string, payload: string | null, actorUserId: number) {
  await execute(
    `INSERT INTO AGRO_CRM_APP_USER_EVENTS (APP_USER_ID, EVENT_TYPE, PAYLOAD, ACTOR_USER)
     VALUES (:1, :2, :3, :4)`,
    [appUserId, eventType, payload, actorUserId]
  );
}

interface AppUserRow {
  [key: string]: unknown;
  ID: number;
  STATUS: string;
  CUSTOMER_ID: number | null;
}

/**
 * PATCH /api/app-users/[id]
 * Body может содержать одно из:
 *   - { action: "link", customer_id: number }
 *   - { action: "unlink" }
 *   - { action: "block" }
 *   - { action: "unblock" }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const appUserId = Number(id);
  if (!Number.isFinite(appUserId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({} as { action?: string; customer_id?: number }));
  const action = body.action;

  const existing = await query<AppUserRow>(
    `SELECT ID, STATUS, CUSTOMER_ID FROM AGRO_CRM_APP_USERS WHERE ID = :1`,
    [appUserId]
  );
  if (existing.length === 0) {
    return NextResponse.json({ error: "Не найден" }, { status: 404 });
  }

  switch (action) {
    case "link": {
      const customerId = Number(body.customer_id);
      if (!Number.isFinite(customerId)) {
        return NextResponse.json({ error: "customer_id обязателен" }, { status: 400 });
      }
      const c = await query<{ ID: number }>(
        `SELECT ID FROM AGRO_CUSTOMERS WHERE ID = :1`, [customerId]
      );
      if (c.length === 0) {
        return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });
      }
      await execute(
        `UPDATE AGRO_CRM_APP_USERS SET CUSTOMER_ID = :1, STATUS = 'linked' WHERE ID = :2`,
        [customerId, appUserId]
      );
      await logEvent(appUserId, "linked", `customer_id=${customerId}`, auth.id);
      return NextResponse.json({ success: true });
    }

    case "unlink": {
      await execute(
        `UPDATE AGRO_CRM_APP_USERS SET CUSTOMER_ID = NULL, STATUS = 'pending' WHERE ID = :1`,
        [appUserId]
      );
      await logEvent(appUserId, "unlinked", null, auth.id);
      return NextResponse.json({ success: true });
    }

    case "block": {
      await execute(
        `UPDATE AGRO_CRM_APP_USERS SET STATUS = 'blocked' WHERE ID = :1`,
        [appUserId]
      );
      await logEvent(appUserId, "blocked", null, auth.id);
      return NextResponse.json({ success: true });
    }

    case "unblock": {
      const newStatus = existing[0].CUSTOMER_ID ? "linked" : "pending";
      await execute(
        `UPDATE AGRO_CRM_APP_USERS SET STATUS = :1 WHERE ID = :2`,
        [newStatus, appUserId]
      );
      await logEvent(appUserId, "unblocked", null, auth.id);
      return NextResponse.json({ success: true });
    }

    case "archive": {
      await execute(
        `UPDATE AGRO_CRM_APP_USERS SET ARCHIVED = 'Y', UNREAD_COUNT = 0 WHERE ID = :1`,
        [appUserId]
      );
      await logEvent(appUserId, "archived", null, auth.id);
      return NextResponse.json({ success: true });
    }

    case "unarchive": {
      await execute(
        `UPDATE AGRO_CRM_APP_USERS SET ARCHIVED = 'N' WHERE ID = :1`,
        [appUserId]
      );
      await logEvent(appUserId, "unarchived", null, auth.id);
      return NextResponse.json({ success: true });
    }

    default:
      return NextResponse.json({ error: "Неизвестное action" }, { status: 400 });
  }
}

/**
 * DELETE /api/app-users/[id] — hard delete.
 * Сносит AGRO_CRM_APP_USERS + все CRM_CHAT_MESSAGES + CRM_APP_USER_EVENTS этого юзера.
 * CRM_TG_BINDINGS — обнуляет APP_USER_ID (сохраняем историю токенов).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const appUserId = Number(id);
  if (!Number.isFinite(appUserId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  await execute(`DELETE FROM AGRO_CRM_CHAT_MESSAGES WHERE APP_USER_ID = :1`, [appUserId]);
  await execute(`DELETE FROM AGRO_CRM_APP_USER_EVENTS WHERE APP_USER_ID = :1`, [appUserId]);
  await execute(`UPDATE AGRO_CRM_TG_BINDINGS SET APP_USER_ID = NULL WHERE APP_USER_ID = :1`, [appUserId]);
  await execute(`DELETE FROM AGRO_CRM_APP_USERS WHERE ID = :1`, [appUserId]);

  return NextResponse.json({ success: true });
}
