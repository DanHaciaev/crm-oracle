// Telegram bot long-polling worker.
// Run with: npm run poller
//
// Commands:
//   /start           — registers/touches AGRO_CRM_APP_USERS; greets in user's lang.
//   /start <token>   — links AGRO_CRM_APP_USERS to AGRO_CUSTOMERS via AGRO_CRM_TG_BINDINGS.
//   /help            — help (translated).
//   /status          — current link state (translated).
//   /language        — choose interface language (inline keyboard ru/ro/en).

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
import { Bot, InlineKeyboard, type Context } from "grammy";
import { t, normalizeLang, type Lang } from "../lib/i18n";

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
      `INSERT INTO AGRO_CRM_APP_USER_EVENTS (APP_USER_ID, EVENT_TYPE, PAYLOAD)
       VALUES (:1, :2, :3)`,
      [appUserId, eventType, payload ?? null]
    );
  } catch (err) {
    console.error("[tg-poller] logEvent failed:", err);
  }
}

interface AppUserInfo {
  id:            number;
  status:        string;
  customerId:    number | null;
  customerName:  string | null;
  lang:          Lang;
}

/**
 * MERGE по chat_id + SELECT текущего состояния.
 *
 * Важный нюанс: LANGUAGE_CODE — ставится только при ПЕРВОМ insert (из
 * Telegram language_code). На повторных встречах не перезаписываем, чтобы
 * сохранить явный выбор пользователя через /language.
 */
async function touchAppUser(ctx: Context): Promise<AppUserInfo | null> {
  if (!ctx.chat || !ctx.from) return null;
  const chatId      = ctx.chat.id;
  const u           = ctx.from;
  const initialLang = normalizeLang(u.language_code);

  await execute(
    `MERGE INTO AGRO_CRM_APP_USERS au
     USING (SELECT :1 AS CHAT_ID, :2 AS UNAME, :3 AS FNAME, :4 AS LNAME, :5 AS LANG FROM DUAL) src
     ON (au.TELEGRAM_CHAT_ID = src.CHAT_ID)
     WHEN MATCHED THEN
       UPDATE SET TELEGRAM_USERNAME   = src.UNAME,
                  TELEGRAM_FIRST_NAME = src.FNAME,
                  TELEGRAM_LAST_NAME  = src.LNAME,
                  LAST_SEEN           = SYSTIMESTAMP
     WHEN NOT MATCHED THEN
       INSERT (TELEGRAM_CHAT_ID, TELEGRAM_USERNAME, TELEGRAM_FIRST_NAME, TELEGRAM_LAST_NAME, LANGUAGE_CODE)
       VALUES (src.CHAT_ID, src.UNAME, src.FNAME, src.LNAME, src.LANG)`,
    [chatId, u.username ?? null, u.first_name ?? null, u.last_name ?? null, initialLang]
  );

  const rows = await query<{
    ID: number; STATUS: string; CUSTOMER_ID: number | null;
    CUSTOMER_NAME: string | null; LANGUAGE_CODE: string | null;
  }>(
    `SELECT au.ID, au.STATUS, au.CUSTOMER_ID, c.NAME AS CUSTOMER_NAME, au.LANGUAGE_CODE
       FROM AGRO_CRM_APP_USERS au
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
    lang:         normalizeLang(rows[0].LANGUAGE_CODE),
  };
}

function languageKeyboard() {
  return new InlineKeyboard()
    .text("🇷🇺 Русский",  "lang:ru")
    .text("🇷🇴 Română",   "lang:ro")
    .text("🇬🇧 English",  "lang:en");
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c] ?? c));
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
    if (!user) { await ctx.reply("Internal error."); return; }
    const lang = user.lang;

    if (user.status === "blocked") {
      await ctx.reply(t(lang, "blocked"));
      return;
    }

    // /start без токена — приветствие
    if (!inviteToken) {
      await logEvent(user.id, "start");

      if (user.status === "linked" && user.customerName) {
        await ctx.reply(
          t(lang, "welcome_linked", { name: escapeHtml(user.customerName) }),
          { parse_mode: "HTML" }
        );
      } else {
        await ctx.reply(t(lang, "welcome_pending"), { parse_mode: "HTML" });
      }
      return;
    }

    // /start <token>
    await logEvent(user.id, "start_with_token", inviteToken);

    const bindings = await query<{
      ID: number; CUSTOMER_ID: number; STATUS: string; EXPIRES_AT: Date | null;
    }>(
      `SELECT ID, CUSTOMER_ID, STATUS, EXPIRES_AT
         FROM AGRO_CRM_TG_BINDINGS WHERE INVITE_TOKEN = :1`,
      [inviteToken]
    );
    if (bindings.length === 0) {
      await ctx.reply(t(lang, "invite_invalid"));
      return;
    }
    const b = bindings[0];

    if (b.STATUS === "bound")   { await ctx.reply(t(lang, "invite_used"));    return; }
    if (b.STATUS === "revoked") { await ctx.reply(t(lang, "invite_revoked")); return; }
    if (b.STATUS === "expired") { await ctx.reply(t(lang, "invite_expired")); return; }
    if (b.EXPIRES_AT && new Date(b.EXPIRES_AT).getTime() < Date.now()) {
      await execute(`UPDATE AGRO_CRM_TG_BINDINGS SET STATUS = 'expired' WHERE ID = :1`, [b.ID]);
      await ctx.reply(t(lang, "invite_expired"));
      return;
    }

    await execute(
      `UPDATE AGRO_CRM_APP_USERS
          SET CUSTOMER_ID = :1, STATUS = 'linked', LAST_SEEN = SYSTIMESTAMP
        WHERE ID = :2`,
      [b.CUSTOMER_ID, user.id]
    );
    await execute(
      `UPDATE AGRO_CRM_TG_BINDINGS
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
      t(lang, "link_success", { name: escapeHtml(custName) }),
      { parse_mode: "HTML" }
    );
  } catch (err) {
    console.error("[tg-poller] /start error:", err);
    await ctx.reply("Internal error / Внутренняя ошибка. Try /start later.");
  }
});

bot.command("help", async (ctx) => {
  const user = await touchAppUser(ctx);
  const lang = user?.lang ?? normalizeLang(ctx.from?.language_code);
  await ctx.reply(t(lang, "help"), { parse_mode: "HTML" });
});

bot.command("status", async (ctx) => {
  try {
    const user = await touchAppUser(ctx);
    if (!user) { await ctx.reply("Internal error."); return; }
    const lang = user.lang;

    if (user.status === "blocked") {
      await ctx.reply(t(lang, "status_blocked"));
      return;
    }
    if (user.status === "linked" && user.customerName) {
      await ctx.reply(
        t(lang, "status_linked", { name: escapeHtml(user.customerName) }),
        { parse_mode: "HTML" }
      );
      return;
    }
    await ctx.reply(t(lang, "status_pending"));
  } catch (err) {
    console.error("[tg-poller] /status error:", err);
    await ctx.reply(t("ru", "internal_error"));
  }
});

bot.command("language", async (ctx) => {
  const user = await touchAppUser(ctx);
  const lang = user?.lang ?? normalizeLang(ctx.from?.language_code);
  await ctx.reply(t(lang, "choose_language"), { reply_markup: languageKeyboard() });
});

bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data ?? "";
  if (!data.startsWith("lang:")) {
    await ctx.answerCallbackQuery();
    return;
  }
  const newLang = normalizeLang(data.slice(5));

  if (!ctx.chat) {
    await ctx.answerCallbackQuery();
    return;
  }

  try {
    await execute(
      `UPDATE AGRO_CRM_APP_USERS SET LANGUAGE_CODE = :1 WHERE TELEGRAM_CHAT_ID = :2`,
      [newLang, ctx.chat.id]
    );
    await ctx.answerCallbackQuery({ text: t(newLang, "language_set") });
    // Заменяем текст исходного сообщения на подтверждение, чтоб не дублить.
    try {
      await ctx.editMessageText(t(newLang, "language_set"));
    } catch { /* сообщение могло уже устареть — игнорируем */ }
  } catch (err) {
    console.error("[tg-poller] language change failed:", err);
    await ctx.answerCallbackQuery({ text: "Error", show_alert: true });
  }
});

bot.on("message", async (ctx) => {
  try {
    const user = await touchAppUser(ctx);
    if (!user) return;

    // Команды /start /help /status /language уже обработаны выше.
    const text = ctx.message?.text;
    if (text && text.startsWith("/")) return;

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

    if (!body && !fileId) return;

    await execute(
      `INSERT INTO AGRO_CRM_CHAT_MESSAGES
         (APP_USER_ID, DIRECTION, BODY, TG_MESSAGE_ID, FILE_ID, FILE_TYPE, STATUS)
       VALUES (:1, 'in', :2, :3, :4, :5, 'sent')`,
      [user.id, body, ctx.message?.message_id ?? null, fileId, fileType]
    );
    await execute(
      `UPDATE AGRO_CRM_APP_USERS
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

console.log("[tg-poller] starting long polling...");
bot.start({
  onStart: (info) => console.log(`[tg-poller] bot @${info.username} is running.`),
});
