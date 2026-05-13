import { Api, InputFile } from "grammy";

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

/**
 * Send a PDF document to a Telegram chat from a Buffer.
 * No temp file is involved — InputFile принимает Buffer напрямую.
 */
export async function sendDocument(
  chatId: number,
  pdfBuffer: Buffer,
  filename: string,
  caption?: string
): Promise<number> {
  const res = await api().sendDocument(chatId, new InputFile(pdfBuffer, filename), {
    caption,
    parse_mode: "HTML",
  });
  return res.message_id;
}
