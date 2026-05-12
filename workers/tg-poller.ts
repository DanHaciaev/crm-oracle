// Telegram bot long-polling worker.
// Run with: npm run poller
//
// Commands:
//   /start           — registers/touches APP_USERS; if user already linked, greets.
//   /start <token>   — links APP_USERS to AGRO_CUSTOMERS via CRM_TG_BINDINGS.
//   /help            — explain what bot does, how to get linked.
//   /status          — show current link state.
// Other messages    — touch LAST_SEEN; ignore (no reply) until Phase 3 chat.

import fs   from "node:fs";
import path from "node:path";

// --- load .env --------------------------------------------------------------
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    if (process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

import oracledb from "oracledb";
import { Bot, type Context } from "grammy";

// --- oracledb (Thick mode) --------------------------------------------------
const libDir = process.env.ORACLE_CLIENT_DIR;
oracledb.initOracleClient(libDir ? { libDir } : undefined);

const dbConfig = {
  user:          process.env.DB_USER!,
  password:      process.env.DB_PASSWORD!,
  connectString: process.env.CONNECT_STRING!,
};

async function query<T>(sql: string, binds: unknown[] = []): Promise<T[]> {
  const conn = await oracledb.getConnection(dbConfig);
  try {
    const r = await conn.execute<T>(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    return (r.rows ?? []) as T[];
  } finally { await conn.close(); }
}
async function execute(sql: string, binds: unknown[] = []): Promise<void> {
  const conn = await oracledb.getConnection(dbConfig);
  try { await conn.execute(sql, binds, { autoCommit: true }); }
  finally { await conn.close(); }
}

// --- helpers ----------------------------------------------------------------
async function logEvent(appUserId: number, eventType: string, payload?: string) {
  try {
    await execute(
      `INSERT INTO CRM_APP_USER_EVENTS (APP_USER_ID, EVENT_TYPE, PAYLOAD)
       VALUES (:1, :2, :3)`,
      [appUserId, eventType, payload ?? null]
    );
  } catch (err) {
    console.error("[tg-poller] logEvent failed:", err);
  }
}

async function touchAppUser(ctx: Context): Promise<{
  id: number;
  status: string;
  customerId: number | null;
  customerName: string | null;
} | null> {
  if (!ctx.chat || !ctx.from) return null;
  const chatId = ctx.chat.id;
  const u      = ctx.from;

  await execute(
    `MERGE INTO APP_USERS au
     USING (SELECT :1 AS CHAT_ID, :2 AS UNAME, :3 AS FNAME, :4 AS LNAME, :5 AS LANG FROM DUAL) src
     ON (au.TELEGRAM_CHAT_ID = src.CHAT_ID)
     WHEN MATCHED THEN
       UPDATE SET TELEGRAM_USERNAME   = src.UNAME,
                  TELEGRAM_FIRST_NAME = src.FNAME,
                  TELEGRAM_LAST_NAME  = src.LNAME,
                  LANGUAGE_CODE       = src.LANG,
                  LAST_SEEN           = SYSTIMESTAMP
     WHEN NOT MATCHED THEN
       INSERT (TELEGRAM_CHAT_ID, TELEGRAM_USERNAME, TELEGRAM_FIRST_NAME, TELEGRAM_LAST_NAME, LANGUAGE_CODE)
       VALUES (src.CHAT_ID, src.UNAME, src.FNAME, src.LNAME, src.LANG)`,
    [chatId, u.username ?? null, u.first_name ?? null, u.last_name ?? null, u.language_code ?? null]
  );

  const rows = await query<{
    ID: number; STATUS: string; CUSTOMER_ID: number | null; CUSTOMER_NAME: string | null;
  }>(
    `SELECT au.ID, au.STATUS, au.CUSTOMER_ID, c.NAME AS CUSTOMER_NAME
       FROM APP_USERS au
       LEFT JOIN AGRO_CUSTOMERS c ON c.ID = au.CUSTOMER_ID
      WHERE au.TELEGRAM_CHAT_ID = :1`,
    [chatId]
  );
  if (rows.length === 0) return null;
  return {
    id:           rows[0].ID,
    status:       rows[0].STATUS,
    customerId:   rows[0].CUSTOMER_ID,
    customerName: rows[0].CUSTOMER_NAME,
  };
}

// --- bot --------------------------------------------------------------------
const token = process.env.TG_BOT_TOKEN;
if (!token) {
  console.error("[tg-poller] TG_BOT_TOKEN is not set in .env");
  process.exit(1);
}

const bot = new Bot(token);

bot.command("start", async (ctx) => {
  try {
    const inviteToken = (ctx.match ?? "").trim();
    const user        = await touchAppUser(ctx);
    if (!user) { await ctx.reply("Что-то пошло не так."); return; }

    // 1) Заблокирован — ничего не делаем кроме фиксации
    if (user.status === "blocked") {
      await ctx.reply("Доступ заблокирован администратором.");
      return;
    }

    // 2) /start без токена
    if (!inviteToken) {
      await logEvent(user.id, "start");

      if (user.status === "linked" && user.customerName) {
        await ctx.reply(
          `👋 С возвращением!\nВы подключены как клиент: <b>${escapeHtml(user.customerName)}</b>.\n\nКоманды:\n/status — текущий статус\n/help — справка`,
          { parse_mode: "HTML" }
        );
      } else {
        await ctx.reply(
          [
            "👋 Здравствуйте!",
            "",
            "Это бот компании <b>AGRO</b>.",
            "Через меня вы будете получать акты взвешивания и общаться с менеджером.",
            "",
            "Чтобы подключиться:",
            "1. Напишите своему менеджеру",
            "2. Попросите invite-ссылку",
            "3. Откройте её — и вы будете привязаны автоматически",
            "",
            "/help — подробнее",
          ].join("\n"),
          { parse_mode: "HTML" }
        );
      }
      return;
    }

    // 3) /start <token>
    await logEvent(user.id, "start_with_token", inviteToken);

    const bindings = await query<{
      ID: number; CUSTOMER_ID: number; STATUS: string; EXPIRES_AT: Date | null;
    }>(
      `SELECT ID, CUSTOMER_ID, STATUS, EXPIRES_AT
         FROM CRM_TG_BINDINGS WHERE INVITE_TOKEN = :1`,
      [inviteToken]
    );
    if (bindings.length === 0) {
      await ctx.reply("⚠️ Ссылка недействительна.");
      return;
    }
    const b = bindings[0];

    if (b.STATUS === "bound")   { await ctx.reply("⚠️ Эта ссылка уже использована.");  return; }
    if (b.STATUS === "revoked") { await ctx.reply("⚠️ Эта ссылка была отозвана.");     return; }
    if (b.STATUS === "expired") { await ctx.reply("⚠️ Срок действия ссылки истёк.");   return; }
    if (b.EXPIRES_AT && new Date(b.EXPIRES_AT).getTime() < Date.now()) {
      await execute(`UPDATE CRM_TG_BINDINGS SET STATUS = 'expired' WHERE ID = :1`, [b.ID]);
      await ctx.reply("⚠️ Срок действия ссылки истёк. Попросите менеджера новую.");
      return;
    }

    await execute(
      `UPDATE APP_USERS
          SET CUSTOMER_ID = :1, STATUS = 'linked', LAST_SEEN = SYSTIMESTAMP
        WHERE ID = :2`,
      [b.CUSTOMER_ID, user.id]
    );
    await execute(
      `UPDATE CRM_TG_BINDINGS
          SET STATUS = 'bound', APP_USER_ID = :1, BOUND_AT = SYSTIMESTAMP
        WHERE ID = :2`,
      [user.id, b.ID]
    );

    const cust = await query<{ NAME: string }>(
      `SELECT NAME FROM AGRO_CUSTOMERS WHERE ID = :1`, [b.CUSTOMER_ID]
    );
    const custName = cust[0]?.NAME ?? "—";

    await logEvent(user.id, "linked", `customer_id=${b.CUSTOMER_ID}`);

    await ctx.reply(
      `✅ Привязка успешна!\nВы подключены как клиент: <b>${escapeHtml(custName)}</b>.\n\nТеперь вы будете получать уведомления.`,
      { parse_mode: "HTML" }
    );
  } catch (err) {
    console.error("[tg-poller] /start error:", err);
    await ctx.reply("Внутренняя ошибка. Попробуйте позже.");
  }
});

bot.command("help", async (ctx) => {
  await touchAppUser(ctx);
  await ctx.reply(
    [
      "ℹ️ <b>Справка</b>",
      "",
      "Этот бот — канал связи с компанией AGRO для её клиентов.",
      "Через бота вы получаете акты взвешивания, отслеживаете отгрузки и общаетесь с менеджером.",
      "",
      "<b>Чтобы подключиться:</b>",
      "1. Свяжитесь со своим менеджером",
      "2. Попросите invite-ссылку",
      "3. Откройте её — бот привяжет вас автоматически",
      "",
      "<b>Команды:</b>",
      "/start — начать / приветствие",
      "/status — мой текущий статус",
      "/help — эта справка",
    ].join("\n"),
    { parse_mode: "HTML" }
  );
});

bot.command("status", async (ctx) => {
  try {
    const user = await touchAppUser(ctx);
    if (!user) { await ctx.reply("Что-то пошло не так."); return; }

    if (user.status === "blocked") {
      await ctx.reply("🚫 Ваш доступ заблокирован администратором.");
      return;
    }
    if (user.status === "linked" && user.customerName) {
      await ctx.reply(
        `✅ Вы привязаны.\nКлиент: <b>${escapeHtml(user.customerName)}</b>.`,
        { parse_mode: "HTML" }
      );
      return;
    }
    await ctx.reply("⏳ Вы пока не привязаны к клиенту. Попросите менеджера invite-ссылку.");
  } catch (err) {
    console.error("[tg-poller] /status error:", err);
    await ctx.reply("Внутренняя ошибка.");
  }
});

bot.on("message", async (ctx) => {
  try {
    const user = await touchAppUser(ctx);
    if (!user) return;

    // Команды /start /help /status уже обработаны выше.
    const text = ctx.message?.text;
    if (text && text.startsWith("/")) return;

    // Заблокированных не сохраняем — просто молчим.
    if (user.status === "blocked") return;

    let body: string | null = text ?? ctx.message?.caption ?? null;
    let fileId: string | null = null;
    let fileType: string | null = null;

    if (ctx.message?.photo && ctx.message.photo.length > 0) {
      fileId   = ctx.message.photo[ctx.message.photo.length - 1].file_id;
      fileType = "photo";
    } else if (ctx.message?.document) {
      fileId   = ctx.message.document.file_id;
      fileType = "document";
    } else if (ctx.message?.voice) {
      fileId   = ctx.message.voice.file_id;
      fileType = "voice";
    } else if (ctx.message?.video) {
      fileId   = ctx.message.video.file_id;
      fileType = "video";
    } else if (ctx.message?.audio) {
      fileId   = ctx.message.audio.file_id;
      fileType = "audio";
    } else if (ctx.message?.sticker) {
      fileId   = ctx.message.sticker.file_id;
      fileType = "sticker";
    }

    if (!body && !fileId) return; // нечего сохранять

    await execute(
      `INSERT INTO CRM_CHAT_MESSAGES
         (APP_USER_ID, DIRECTION, BODY, TG_MESSAGE_ID, FILE_ID, FILE_TYPE, STATUS)
       VALUES (:1, 'in', :2, :3, :4, :5, 'sent')`,
      [user.id, body, ctx.message?.message_id ?? null, fileId, fileType]
    );
    await execute(
      `UPDATE APP_USERS
          SET LAST_MESSAGE_AT = SYSTIMESTAMP,
              UNREAD_COUNT    = UNREAD_COUNT + 1,
              ARCHIVED        = 'N'
        WHERE ID = :1`,
      [user.id]
    );
    await logEvent(user.id, "message_in", body ? body.slice(0, 200) : `[${fileType ?? "file"}]`);
  } catch (err) {
    console.error("[tg-poller] message error:", err);
  }
});

bot.catch((err) => {
  console.error("[tg-poller] bot error:", err);
});

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c] ?? c));
}

console.log("[tg-poller] starting long polling...");
bot.start({
  onStart: (info) => console.log(`[tg-poller] bot @${info.username} is running.`),
});
