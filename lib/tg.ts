import { Api } from "grammy";

let _api: Api | null = null;

function api(): Api {
  if (_api) return _api;
  const token = process.env.TG_BOT_TOKEN;
  if (!token) throw new Error("TG_BOT_TOKEN is not set");
  _api = new Api(token);
  return _api;
}

/** Send plain text message to a Telegram chat. Returns Telegram's message_id. */
export async function sendText(chatId: number, text: string): Promise<number> {
  const res = await api().sendMessage(chatId, text);
  return res.message_id;
}
