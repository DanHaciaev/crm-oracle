// Translations for the Telegram bot.
// Поллер берёт ключи через t(lang, key, vars). Менеджер-сторона UI остаётся
// русской — переводим только bot-facing строки.

export type Lang = "ru" | "ro" | "en";

export const SUPPORTED_LANGS: readonly Lang[] = ["ru", "ro", "en"] as const;
export const DEFAULT_LANG: Lang = "ru";

const TR: Record<Lang, Record<string, string>> = {
  ru: {
    welcome_pending: [
      "👋 Здравствуйте!",
      "",
      "Это бот компании <b>AGRO</b>.",
      "Через меня вы будете получать акты взвешивания и общаться с менеджером.",
      "",
      "Чтобы подключиться:",
      "1. Свяжитесь со своим менеджером",
      "2. Попросите invite-ссылку",
      "3. Откройте её — и вы будете привязаны автоматически",
      "",
      "/help — подробнее · /language — сменить язык",
    ].join("\n"),

    welcome_linked: "👋 С возвращением!\nВы подключены как клиент: <b>{name}</b>.\n\nКоманды:\n/status — текущий статус\n/help — справка\n/language — язык",

    blocked:         "Доступ заблокирован администратором.",
    internal_error:  "Внутренняя ошибка. Попробуйте позже.",

    invite_invalid:  "⚠️ Ссылка недействительна.",
    invite_used:     "⚠️ Эта ссылка уже использована.",
    invite_revoked:  "⚠️ Эта ссылка была отозвана.",
    invite_expired:  "⚠️ Срок действия ссылки истёк. Попросите менеджера новую.",

    link_success:    "✅ Привязка успешна!\nВы подключены как клиент: <b>{name}</b>.\n\nТеперь вы будете получать уведомления.",

    status_blocked:  "🚫 Ваш доступ заблокирован администратором.",
    status_linked:   "✅ Вы привязаны.\nКлиент: <b>{name}</b>.",
    status_pending:  "⏳ Вы пока не привязаны к клиенту. Попросите менеджера invite-ссылку.",

    help: [
      "ℹ️ <b>Справка</b>",
      "",
      "Этот бот — канал связи с компанией AGRO для её клиентов.",
      "Через него вы получаете акты взвешивания, отслеживаете отгрузки и общаетесь с менеджером.",
      "",
      "<b>Чтобы подключиться:</b>",
      "1. Свяжитесь со своим менеджером",
      "2. Попросите invite-ссылку",
      "3. Откройте её — бот привяжет вас автоматически",
      "",
      "<b>Команды:</b>",
      "/start — начать / приветствие",
      "/status — мой статус",
      "/language — сменить язык",
      "/help — эта справка",
    ].join("\n"),

    choose_language: "🌐 Выберите язык / Alegeți limba / Choose language:",
    language_set:    "✅ Язык: Русский.",
  },

  ro: {
    welcome_pending: [
      "👋 Bună ziua!",
      "",
      "Acesta este botul companiei <b>AGRO</b>.",
      "Prin mine veți primi tichete de cântărire și veți comunica cu managerul.",
      "",
      "Pentru a vă conecta:",
      "1. Contactați managerul dumneavoastră",
      "2. Cereți un link de invitație",
      "3. Deschideți-l — veți fi conectat automat",
      "",
      "/help — detalii · /language — schimbați limba",
    ].join("\n"),

    welcome_linked: "👋 Bine ați revenit!\nSunteți conectat ca client: <b>{name}</b>.\n\nComenzi:\n/status — starea curentă\n/help — ajutor\n/language — limba",

    blocked:         "Acces blocat de administrator.",
    internal_error:  "Eroare internă. Încercați mai târziu.",

    invite_invalid:  "⚠️ Link invalid.",
    invite_used:     "⚠️ Acest link a fost deja folosit.",
    invite_revoked:  "⚠️ Acest link a fost revocat.",
    invite_expired:  "⚠️ Linkul a expirat. Cereți managerului unul nou.",

    link_success:    "✅ Conectare reușită!\nSunteți conectat ca client: <b>{name}</b>.\n\nVeți primi notificări de aici încolo.",

    status_blocked:  "🚫 Accesul dumneavoastră este blocat de administrator.",
    status_linked:   "✅ Sunteți conectat.\nClient: <b>{name}</b>.",
    status_pending:  "⏳ Nu sunteți încă conectat la un client. Cereți managerului un link de invitație.",

    help: [
      "ℹ️ <b>Ajutor</b>",
      "",
      "Acest bot este canalul de comunicare cu AGRO pentru clienții săi.",
      "Prin bot primiți tichete de cântărire, urmăriți livrările și comunicați cu managerul.",
      "",
      "<b>Pentru a vă conecta:</b>",
      "1. Contactați managerul",
      "2. Cereți un link de invitație",
      "3. Deschideți-l — botul vă va conecta automat",
      "",
      "<b>Comenzi:</b>",
      "/start — start / salut",
      "/status — starea mea curentă",
      "/language — schimbă limba",
      "/help — acest ajutor",
    ].join("\n"),

    choose_language: "🌐 Выберите язык / Alegeți limba / Choose language:",
    language_set:    "✅ Limba: Română.",
  },

  en: {
    welcome_pending: [
      "👋 Hello!",
      "",
      "This is the <b>AGRO</b> company bot.",
      "Through me you'll receive weighing tickets and chat with your manager.",
      "",
      "To connect:",
      "1. Contact your manager",
      "2. Ask them for an invite link",
      "3. Open it — you will be linked automatically",
      "",
      "/help — details · /language — change language",
    ].join("\n"),

    welcome_linked: "👋 Welcome back!\nYou're linked as customer: <b>{name}</b>.\n\nCommands:\n/status — current status\n/help — help\n/language — change language",

    blocked:         "Access blocked by administrator.",
    internal_error:  "Internal error. Try again later.",

    invite_invalid:  "⚠️ Invalid link.",
    invite_used:     "⚠️ This link has already been used.",
    invite_revoked:  "⚠️ This link has been revoked.",
    invite_expired:  "⚠️ Link expired. Ask your manager for a new one.",

    link_success:    "✅ Successfully linked!\nYou're connected as customer: <b>{name}</b>.\n\nYou will now receive notifications.",

    status_blocked:  "🚫 Your access is blocked by the administrator.",
    status_linked:   "✅ You're linked.\nCustomer: <b>{name}</b>.",
    status_pending:  "⏳ You're not linked to a customer yet. Ask your manager for an invite link.",

    help: [
      "ℹ️ <b>Help</b>",
      "",
      "This bot is the communication channel with AGRO for its customers.",
      "Through it you receive weighing tickets, track shipments, and chat with your manager.",
      "",
      "<b>To connect:</b>",
      "1. Contact your manager",
      "2. Ask for an invite link",
      "3. Open it — the bot will link you automatically",
      "",
      "<b>Commands:</b>",
      "/start — start / greeting",
      "/status — my current status",
      "/language — change language",
      "/help — this help",
    ].join("\n"),

    choose_language: "🌐 Выберите язык / Alegeți limba / Choose language:",
    language_set:    "✅ Language: English.",
  },
};

/** Приводит любой языковой код к одному из ru/ro/en (с fallback'ом). */
export function normalizeLang(code: string | null | undefined): Lang {
  const c = (code ?? "").toLowerCase().slice(0, 2);
  if ((SUPPORTED_LANGS as readonly string[]).includes(c)) return c as Lang;
  // post-soviet языки → русский по умолчанию (типично для рынка)
  if (c === "uk" || c === "be" || c === "kk" || c === "ky") return "ru";
  return DEFAULT_LANG;
}

/**
 * Получить переведённую строку.
 * Vars подставляются по плейсхолдеру `{key}`: t(lang, "link_success", { name: "ACME" }).
 */
export function t(lang: Lang, key: string, vars: Record<string, string> = {}): string {
  let s = TR[lang]?.[key] ?? TR[DEFAULT_LANG][key] ?? key;
  for (const [k, v] of Object.entries(vars)) {
    s = s.split(`{${k}}`).join(v);
  }
  return s;
}
