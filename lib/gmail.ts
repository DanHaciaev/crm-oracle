import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { simpleParser, type ParsedMail } from "mailparser";

const SMTP_USER = process.env.SMTP_USER ?? "";
const SMTP_PASS = process.env.SMTP_PASSWORD ?? "";

function makeClient() {
  return new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    logger: false,
    tls: { rejectUnauthorized: false },
  });
}

// ─── in-memory cache ────────────────────────────────────────────────────────
interface CacheEntry<T> { data: T; expires: number }
const _cache    = new Map<string, CacheEntry<unknown>>();
// raw MIME source cache — keyed by uid, separate from JSON cache
const _srcCache = new Map<number, { buf: Buffer; expires: number }>();

function cacheGet<T>(key: string): T | null {
  const e = _cache.get(key);
  if (!e) return null;
  if (Date.now() > e.expires) { _cache.delete(key); return null; }
  return e.data as T;
}
function cacheSet<T>(key: string, data: T, ttlMs: number) {
  _cache.set(key, { data, expires: Date.now() + ttlMs });
}

function srcGet(uid: number): Buffer | null {
  const e = _srcCache.get(uid);
  if (!e) return null;
  if (Date.now() > e.expires) { _srcCache.delete(uid); return null; }
  return e.buf;
}
function srcSet(uid: number, buf: Buffer) {
  _srcCache.set(uid, { buf, expires: Date.now() + 10 * 60_000 });
}

export function invalidateInboxCache() { _cache.delete("inbox"); }
// ────────────────────────────────────────────────────────────────────────────

export interface AttachmentMeta {
  index: number;
  filename: string;
  contentType: string;
  size: number;
}

export interface EmailSummary {
  uid: number;
  subject: string;
  fromAddress: string;
  fromName: string;
  date: string;
  unread: boolean;
  preview: string;
}

export interface EmailFull extends EmailSummary {
  to: string;
  textBody: string;
  htmlBody: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  attachments: AttachmentMeta[];
}

// ─── fetch raw MIME source (with cache) ─────────────────────────────────────
async function fetchSource(uid: number): Promise<Buffer | null> {
  const cached = srcGet(uid);
  if (cached) return cached;

  const client = makeClient();
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
    if (!msg?.source) return null;
    srcSet(uid, msg.source);
    return msg.source;
  } finally {
    lock.release();
    await client.logout();
  }
}

function parsedToFull(uid: number, parsed: ParsedMail): EmailFull {
  const from    = parsed.from?.value[0];
  const toAddr  = parsed.to
    ? (Array.isArray(parsed.to) ? parsed.to[0].text : parsed.to.text)
    : "";
  const htmlBody  = parsed.html || null;
  const textBody  = parsed.text
    ?? (htmlBody ? htmlBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "");

  // skip inline images (contentDisposition === 'inline' with cid) — those are embedded in HTML
  const attachments: AttachmentMeta[] = (parsed.attachments ?? [])
    .map((a, i) => ({
      index:       i,
      filename:    a.filename || `attachment-${i + 1}`,
      contentType: a.contentType,
      size:        a.size ?? a.content.length,
    }))
    .filter((a) => a.size > 0);

  return {
    uid,
    subject:     parsed.subject ?? "(без темы)",
    fromAddress: from?.address ?? "",
    fromName:    from?.name ?? from?.address ?? "",
    date:        parsed.date?.toISOString() ?? "",
    unread:      false,
    preview:     textBody.slice(0, 150),
    to:          toAddr,
    textBody,
    htmlBody,
    messageId:   parsed.messageId ?? null,
    inReplyTo:   parsed.inReplyTo ?? null,
    attachments,
  };
}

// ─── inbox list ──────────────────────────────────────────────────────────────
async function _fetchInbox(limit: number): Promise<EmailSummary[]> {
  const client = makeClient();
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const status = await client.status("INBOX", { messages: true });
    const total  = status.messages ?? 0;
    if (total === 0) return [];

    const start   = Math.max(1, total - limit + 1);
    const results: EmailSummary[] = [];

    for await (const msg of client.fetch(`${start}:${total}`, {
      envelope: true,
      flags:    true,
      uid:      true,
    })) {
      const from = msg.envelope.from?.[0];
      results.push({
        uid:         msg.uid,
        subject:     msg.envelope.subject ?? "(без темы)",
        fromAddress: from?.address ?? "",
        fromName:    from?.name ?? from?.address ?? "",
        date:        msg.envelope.date?.toISOString() ?? "",
        unread:      !msg.flags.has("\\Seen"),
        preview:     "",
      });
    }
    return results.reverse();
  } finally {
    lock.release();
    await client.logout();
  }
}

export async function fetchInbox(limit = 40): Promise<EmailSummary[]> {
  const cached = cacheGet<EmailSummary[]>("inbox");
  if (cached) return cached;

  const results = await _fetchInbox(limit);
  cacheSet("inbox", results, 60_000);
  setTimeout(() => {
    _fetchInbox(limit).then((r) => cacheSet("inbox", r, 60_000)).catch(() => {});
  }, 60_000);
  return results;
}

// ─── single email ────────────────────────────────────────────────────────────
export async function fetchEmailByUid(uid: number): Promise<EmailFull | null> {
  const key    = `email:${uid}`;
  const cached = cacheGet<EmailFull>(key);
  if (cached) return cached;

  const source = await fetchSource(uid);
  if (!source) return null;

  const parsed = await simpleParser(source);
  const result = parsedToFull(uid, parsed);
  cacheSet(key, result, 10 * 60_000);
  return result;
}

// ─── single attachment (for download endpoint) ───────────────────────────────
export async function getAttachment(uid: number, index: number) {
  const source = await fetchSource(uid); // reuses cache — no extra IMAP call
  if (!source) return null;

  const parsed = await simpleParser(source);
  const att    = parsed.attachments?.[index];
  if (!att) return null;

  return {
    filename:    att.filename || `attachment-${index + 1}`,
    contentType: att.contentType,
    content:     att.content, // Buffer
  };
}

// ─── mark as read ────────────────────────────────────────────────────────────
export async function markAsRead(uid: number): Promise<void> {
  const key    = `email:${uid}`;
  const cached = cacheGet<EmailFull>(key);
  if (cached) cacheSet(key, { ...cached, unread: false }, 10 * 60_000);

  const inbox = cacheGet<EmailSummary[]>("inbox");
  if (inbox) {
    cacheSet("inbox", inbox.map((e) => e.uid === uid ? { ...e, unread: false } : e), 60_000);
  }

  const client = makeClient();
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
  } finally {
    lock.release();
    await client.logout();
  }
}

// ─── delete (move to Trash) ──────────────────────────────────────────────────
export async function deleteEmail(uid: number): Promise<void> {
  // remove from caches immediately
  _cache.delete(`email:${uid}`);
  _srcCache.delete(uid);
  const inbox = cacheGet<EmailSummary[]>("inbox");
  if (inbox) cacheSet("inbox", inbox.filter((e) => e.uid !== uid), 60_000);

  const client = makeClient();
  await client.connect();

  // find the Trash folder by special-use attribute (works for any Gmail language)
  const folders  = await client.list("", "*");
  const trashDir = folders.find((f) => f.specialUse === "\\Trash")?.path ?? "[Gmail]/Trash";

  const lock = await client.getMailboxLock("INBOX");
  try {
    await client.messageMove(String(uid), trashDir, { uid: true });
  } finally {
    lock.release();
    await client.logout();
  }
}

// ─── send ────────────────────────────────────────────────────────────────────
export interface SendOptions {
  to: string;
  subject: string;
  text: string;
  inReplyTo?: string;
  references?: string;
}

export async function sendEmail(opts: SendOptions): Promise<void> {
  const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST ?? "smtp.gmail.com",
    port:   Number(process.env.SMTP_PORT ?? 587),
    secure: false,
    auth:   { user: SMTP_USER, pass: SMTP_PASS },
  });

  const companyName = process.env.COMPANY_NAME ?? "CRM Oracle";
  await transporter.sendMail({
    from:    `"${companyName}" <${SMTP_USER}>`,
    to:      opts.to,
    subject: opts.subject,
    text:    opts.text,
    ...(opts.inReplyTo ? { inReplyTo: opts.inReplyTo, references: opts.references ?? opts.inReplyTo } : {}),
  });

  invalidateInboxCache();
}
