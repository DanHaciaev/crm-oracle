/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useT } from "@/lib/locale";

interface EmailSummary {
  uid: number;
  subject: string;
  fromAddress: string;
  fromName: string;
  date: string;
  unread: boolean;
  preview: string;
}

interface AttachmentMeta {
  index: number;
  filename: string;
  contentType: string;
  size: number;
}

interface EmailFull extends EmailSummary {
  to: string;
  textBody: string;
  htmlBody: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  attachments: AttachmentMeta[];
}

type View = "email" | "compose";

export default function EmailPage() {
  const { locale } = useLocale();
  const t = useT();

  const [emails, setEmails]           = useState<EmailSummary[]>([]);
  const [loading, setLoading]         = useState(true);
  const [activeUid, setActiveUid]     = useState<number | null>(null);
  const [current, setCurrent]         = useState<EmailFull | null>(null);
  const [loadingEmail, setLE]         = useState(false);
  const [view, setView]               = useState<View>("email");
  const [error, setError]             = useState<string | null>(null);

  const [composeTo, setComposeTo]     = useState("");
  const [composeSubj, setComposeSubj] = useState("");
  const [composeText, setComposeText] = useState("");
  const [sending, setSending]         = useState(false);
  const [deleting, setDeleting]       = useState(false);

  function fmtTime(s: string) {
    if (!s) return "";
    const d = new Date(s);
    if (isNaN(d.getTime())) return "";
    const now = new Date();
    const loc = locale === "ru" ? "ru-RU" : locale === "ro" ? "ro-RO" : "en-GB";
    return d.toDateString() === now.toDateString()
      ? d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString(loc, { day: "2-digit", month: "2-digit", year: "2-digit" });
  }

  function fmtFull(s: string) {
    if (!s) return "";
    const d = new Date(s);
    if (isNaN(d.getTime())) return "";
    const loc = locale === "ru" ? "ru-RU" : locale === "ro" ? "ro-RO" : "en-GB";
    return d.toLocaleString(loc, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  const fetchInbox = useCallback(async () => {
    const res = await fetch("/api/email/inbox");
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError((j as { error?: string }).error ?? t("email.loadError"));
      setLoading(false);
      return;
    }
    const data: EmailSummary[] = await res.json();
    setEmails(data);
    setLoading(false);
    setError(null);
  }, [t]);

  useEffect(() => { fetchInbox(); }, [fetchInbox]);

  async function openEmail(uid: number) {
    setActiveUid(uid);
    setView("email");
    setCurrent(null);
    setLE(true);
    setEmails((prev) => prev.map((e) => e.uid === uid ? { ...e, unread: false } : e));

    const res = await fetch(`/api/email/${uid}`);
    setLE(false);
    if (!res.ok) { alert(t("email.fetchError")); return; }
    const data: EmailFull = await res.json();
    setCurrent(data);
  }

  function openCompose(replyTo?: EmailFull) {
    setView("compose");
    setActiveUid(null);
    if (replyTo) {
      setComposeTo(replyTo.fromAddress);
      setComposeSubj(replyTo.subject.startsWith("Re:") ? replyTo.subject : `Re: ${replyTo.subject}`);
      setComposeText(`\n\n--- ${replyTo.fromName || replyTo.fromAddress} ${t("email.wrote")} ---\n${replyTo.textBody.slice(0, 500)}`);
    } else {
      setComposeTo("");
      setComposeSubj("");
      setComposeText("");
    }
  }

  async function deleteEmail(uid: number) {
    if (!confirm(t("email.deleteConfirm"))) return;
    setDeleting(true);
    const res = await fetch(`/api/email/${uid}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) { alert(t("email.deleteError")); return; }
    setActiveUid(null);
    setCurrent(null);
    setEmails((prev) => prev.filter((e) => e.uid !== uid));
  }

  async function sendEmail() {
    if (!composeTo.trim() || !composeText.trim()) return;
    setSending(true);
    const body: Record<string, string> = {
      to:      composeTo.trim(),
      subject: composeSubj.trim() || t("email.noSubject"),
      text:    composeText.trim(),
    };
    if (current?.messageId && composeSubj.startsWith("Re:")) {
      body.inReplyTo  = current.messageId;
      body.references = current.messageId;
    }
    const res = await fetch("/api/email/send", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
    setSending(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert((j as { error?: string }).error ?? t("email.sendError"));
      return;
    }
    setView("email");
    setComposeText("");
    alert(t("email.sent"));
  }

  const unreadCount = emails.filter((e) => e.unread).length;

  return (
    <div className="flex h-[calc(100vh-65px)] overflow-hidden">
      {/* LEFT: email list */}
      <aside
        className={`${
          activeUid !== null || view === "compose" ? "hidden inbox:flex" : "flex"
        } w-full inbox:w-90 inbox:border-r border-gray-800 flex-col`}
      >
        <div className="p-3 sm:p-4 border-b border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold">{t("email.title")}</h1>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <span className="text-sm text-gray-500">{unreadCount} {t("email.unread")}</span>
              )}
              <button
                onClick={() => openCompose()}
                className="px-3 py-1 text-sm rounded-md bg-emerald-700 text-white hover:bg-emerald-600 transition"
              >
                {t("email.compose")}
              </button>
            </div>
          </div>
          <button
            onClick={fetchInbox}
            className="text-xs text-gray-500 hover:text-gray-700 transition"
          >
            {t("email.refresh")}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-sm text-gray-500">{t("email.loading")}</div>
          ) : error ? (
            <div className="p-4 text-sm text-red-500">{error}</div>
          ) : emails.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">{t("email.empty")}</div>
          ) : (
            emails.map((em) => (
              <button
                key={em.uid}
                onClick={() => openEmail(em.uid)}
                className={`w-full text-left px-4 py-3 border-b border-gray-800 transition flex items-start gap-3 ${
                  activeUid === em.uid ? "bg-gray-100" : "hover:bg-gray-50"
                }`}
              >
                <div className="shrink-0 w-9 h-9 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center font-semibold text-sm">
                  {(em.fromName?.[0] ?? em.fromAddress?.[0] ?? "?").toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className={`truncate ${em.unread ? "font-semibold" : "font-medium text-gray-700"}`}>
                      {em.fromName || em.fromAddress}
                    </div>
                    <div className="text-xs text-gray-500 shrink-0">{fmtTime(em.date)}</div>
                  </div>
                  <div className={`text-sm truncate mt-0.5 ${em.unread ? "text-gray-900" : "text-gray-500"}`}>
                    {em.subject}
                  </div>
                  <div className="text-xs text-gray-400 truncate mt-0.5">{em.preview}</div>
                  {em.unread && (
                    <span className="inline-block mt-1 w-2 h-2 rounded-full bg-emerald-500" />
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* RIGHT: email view or compose */}
      <main
        className={`${
          activeUid !== null || view === "compose" ? "flex" : "hidden inbox:flex"
        } flex-1 flex-col min-w-0`}
      >
        {view === "compose" ? (
          <div className="flex flex-col h-full">
            <div className="p-3 sm:p-4 border-b border-gray-800 flex items-center gap-3">
              <button
                onClick={() => { setView("email"); setActiveUid(null); }}
                className="inbox:hidden w-8 h-8 rounded-md flex items-center justify-center text-gray-500 hover:bg-gray-100 transition"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M12.78 15.78a.75.75 0 01-1.06 0l-5.25-5.25a.75.75 0 010-1.06l5.25-5.25a.75.75 0 111.06 1.06L8.06 10l4.72 4.72a.75.75 0 010 1.06z" clipRule="evenodd" />
                </svg>
              </button>
              <h2 className="font-semibold">
                {composeSubj.startsWith("Re:") ? t("email.replyTitle") : t("email.newEmail")}
              </h2>
            </div>
            <div className="flex-1 flex flex-col p-4 gap-3 overflow-auto">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">{t("email.to")}</label>
                <input
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  placeholder="email@example.com"
                  className="rounded-lg border border-gray-800 px-3 py-2 text-sm outline-none focus:border-gray-600"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">{t("email.subject")}</label>
                <input
                  value={composeSubj}
                  onChange={(e) => setComposeSubj(e.target.value)}
                  placeholder={t("email.subjectPlaceholder")}
                  className="rounded-lg border border-gray-800 px-3 py-2 text-sm outline-none focus:border-gray-600"
                />
              </div>
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-xs text-gray-500">{t("email.body")}</label>
                <textarea
                  value={composeText}
                  onChange={(e) => setComposeText(e.target.value)}
                  rows={12}
                  className="flex-1 resize-none rounded-lg border border-gray-800 px-3 py-2 text-sm outline-none focus:border-gray-600"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={sendEmail}
                  disabled={sending || !composeTo.trim() || !composeText.trim()}
                  className="px-4 py-2 text-sm rounded-lg bg-emerald-700 text-white hover:bg-emerald-600 disabled:opacity-50 transition"
                >
                  {sending ? t("email.sending") : t("email.send")}
                </button>
                <button
                  onClick={() => { setView("email"); setActiveUid(null); }}
                  className="px-4 py-2 text-sm rounded-lg border border-gray-800 hover:bg-gray-100 transition"
                >
                  {t("email.cancel")}
                </button>
              </div>
            </div>
          </div>
        ) : activeUid === null ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
            {t("email.selectPrompt")}
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div className="p-3 sm:p-4 border-b border-gray-800 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <button
                  onClick={() => { setActiveUid(null); setCurrent(null); }}
                  className="inbox:hidden shrink-0 mt-1 w-8 h-8 rounded-md flex items-center justify-center text-gray-500 hover:bg-gray-100 transition"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path fillRule="evenodd" d="M12.78 15.78a.75.75 0 01-1.06 0l-5.25-5.25a.75.75 0 010-1.06l5.25-5.25a.75.75 0 111.06 1.06L8.06 10l4.72 4.72a.75.75 0 010 1.06z" clipRule="evenodd" />
                  </svg>
                </button>
                <div>
                  {loadingEmail || !current ? (
                    <div className="text-sm text-gray-500">{t("email.loading")}</div>
                  ) : (
                    <>
                      <div className="font-semibold text-base leading-tight">{current.subject}</div>
                      <div className="text-sm text-gray-500 mt-0.5">
                        {t("email.from")} <span className="text-gray-700">{current.fromName || current.fromAddress}</span>
                        {current.fromName && <span className="ml-1 text-gray-400">&lt;{current.fromAddress}&gt;</span>}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">{fmtFull(current.date)}</div>
                    </>
                  )}
                </div>
              </div>
              {current && (
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => openCompose(current)}
                    className="px-3 py-1 text-sm rounded-md border border-gray-800 hover:bg-gray-100 transition"
                  >
                    {t("email.reply")}
                  </button>
                  <button
                    onClick={() => deleteEmail(current.uid)}
                    disabled={deleting}
                    className="px-3 py-1 text-sm rounded-md border border-red-300 text-red-500 hover:bg-red-50 disabled:opacity-50 transition"
                  >
                    {deleting ? "..." : t("email.delete")}
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-auto p-4 sm:p-6">
              {loadingEmail ? (
                <div className="text-sm text-gray-500">{t("email.loading")}</div>
              ) : (
                <>
                  {current?.htmlBody ? (
                    <iframe
                      key={current.uid}
                      srcDoc={current.htmlBody}
                      sandbox="allow-same-origin allow-popups"
                      className="w-full border-0"
                      style={{ minHeight: "400px" }}
                      title="email-body"
                      onLoad={(e) => {
                        const iframe = e.currentTarget;
                        const body = iframe.contentDocument?.body;
                        if (body) iframe.style.height = `${body.scrollHeight + 32}px`;
                      }}
                    />
                  ) : (
                    <pre className="text-sm text-gray-800 whitespace-pre-wrap wrap-break-word font-sans leading-relaxed">
                      {current?.textBody ?? t("email.emptyBody")}
                    </pre>
                  )}

                  {current && current.attachments.length > 0 && (
                    <div className="mt-6 border-t border-gray-200 pt-4">
                      <div className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">
                        {t("email.attachments")} ({current.attachments.length})
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {current.attachments.map((att) => (
                          <a
                            key={att.index}
                            href={`/api/email/${current.uid}/attachment/${att.index}`}
                            download={att.filename}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition text-sm text-gray-700 max-w-xs"
                          >
                            <FileIcon contentType={att.contentType} />
                            <span className="truncate flex-1">{att.filename}</span>
                            <span className="shrink-0 text-xs text-gray-400">{fmtSize(att.size)}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function fmtSize(bytes: number): string {
  if (bytes < 1024)         return `${bytes} B`;
  if (bytes < 1024 * 1024)  return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ contentType }: { contentType: string }) {
  const ct = contentType.toLowerCase();
  if (ct.startsWith("image/"))                               return <span className="text-base">🖼️</span>;
  if (ct === "application/pdf")                              return <span className="text-base">📄</span>;
  if (ct.includes("word") || ct.includes("document"))       return <span className="text-base">📝</span>;
  if (ct.includes("excel") || ct.includes("sheet"))         return <span className="text-base">📊</span>;
  if (ct.includes("zip") || ct.includes("rar") || ct.includes("archive")) return <span className="text-base">🗜️</span>;
  return <span className="text-base">📎</span>;
}
