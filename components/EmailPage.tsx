/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useT } from "@/lib/locale";
import { toast } from "sonner";
import { useConfirm } from "@/lib/confirm";

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
  const t       = useT();
  const confirm = useConfirm();

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
  const [aiHint, setAiHint]           = useState("");
  const [aiLoading, setAiLoading]     = useState(false);
  const [sentiment, setSentiment]     = useState<{ sentiment: string; label: string; score: number; summary: string } | null>(null);
  const [sentimentLoading, setSentLoading] = useState(false);

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
    setSentiment(null);
    setLE(true);
    setEmails((prev) => prev.map((e) => e.uid === uid ? { ...e, unread: false } : e));

    const res = await fetch(`/api/email/${uid}`);
    setLE(false);
    if (!res.ok) { toast.error(t("email.fetchError")); return; }
    const data: EmailFull = await res.json();
    setCurrent(data);
    const textToAnalyze = (data.textBody?.trim() || data.subject || "").slice(0, 1500);
    if (textToAnalyze) {
      setSentLoading(true);
      fetch("/api/ai/sentiment", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ text: textToAnalyze }),
      })
        .then((r) => r.json())
        .then((s) => { if (s?.sentiment) setSentiment(s); })
        .catch(() => null)
        .finally(() => setSentLoading(false));
    }
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
    if (!await confirm({ message: t("email.deleteConfirm"), danger: true })) return;
    setDeleting(true);
    const res = await fetch(`/api/email/${uid}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) { toast.error(t("email.deleteError")); return; }
    setActiveUid(null);
    setCurrent(null);
    setEmails((prev) => prev.filter((e) => e.uid !== uid));
  }

  async function generateAiEmail() {
    if (!aiHint.trim()) { toast.error(t("email.aiHint")); return; }
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai/email", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ hint: aiHint.trim(), to: composeTo.trim(), lang: locale }),
      });
      const data = await res.json().catch(() => ({})) as { subject?: string; body?: string; error?: string };
      if (!res.ok || data.error) { toast.error(data.error ?? t("common.error")); return; }
      if (data.subject) setComposeSubj(data.subject);
      if (data.body)    setComposeText(data.body);
      toast.success(t("email.aiGenerated"));
    } catch { toast.error(t("common.error")); }
    finally  { setAiLoading(false); }
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
      toast.error((j as { error?: string }).error ?? t("email.sendError"));
      return;
    }
    setView("email");
    setComposeText("");
    toast.success(t("email.sent"));
  }

  const unreadCount = emails.filter((e) => e.unread).length;

  return (
    <div className="flex h-[calc(100vh-65px)] overflow-hidden">
      {/* LEFT: email list */}
      <aside
        className={`${
          activeUid !== null || view === "compose" ? "hidden inbox:flex" : "flex"
        } w-full inbox:w-90 inbox:border-r border-[#c8d3e8] flex-col bg-white`}
      >
        <div className="px-4 pt-4 pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-base font-bold text-gray-900">{t("email.title")}</h1>
              {unreadCount > 0 && (
                <span className="text-xs text-gray-400">{unreadCount} {t("email.unread")}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={fetchInbox}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition"
                title={t("email.refresh")}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
                </svg>
              </button>
              <button
                onClick={() => openCompose()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark transition font-medium shadow-sm"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                </svg>
                {t("email.compose")}
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-sm text-gray-400 text-center pt-10">{t("email.loading")}</div>
          ) : error ? (
            <div className="p-4 text-sm text-red-500">{error}</div>
          ) : emails.length === 0 ? (
            <div className="p-4 text-sm text-gray-400 text-center pt-10">{t("email.empty")}</div>
          ) : (
            emails.map((em) => {
              const senderKey = em.fromName || em.fromAddress || "?";
              const initial   = senderKey[0].toUpperCase();
              return (
                <button
                  key={em.uid}
                  onClick={() => openEmail(em.uid)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 transition flex items-start gap-3 ${
                    activeUid === em.uid
                      ? "bg-brand/5 border-l-2 border-l-brand"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <div className={`shrink-0 w-9 h-9 rounded-full ${emailAvatarColor(senderKey)} text-white flex items-center justify-center font-semibold text-sm`}>
                    {initial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className={`truncate text-sm ${em.unread ? "font-bold text-gray-900" : "font-medium text-gray-700"}`}>
                        {em.fromName || em.fromAddress}
                      </div>
                      <div className="text-xs text-gray-400 shrink-0">{fmtTime(em.date)}</div>
                    </div>
                    <div className={`text-sm truncate mt-0.5 ${em.unread ? "font-medium text-gray-800" : "text-gray-500"}`}>
                      {em.subject}
                    </div>
                    <div className="text-xs text-gray-400 truncate mt-0.5">{em.preview}</div>
                  </div>
                  {em.unread && (
                    <span className="shrink-0 mt-1 w-2 h-2 rounded-full bg-brand" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* RIGHT: email view or compose */}
      <main
        className={`${
          activeUid !== null || view === "compose" ? "flex" : "hidden inbox:flex"
        } flex-1 flex-col min-w-0 bg-[#f3f5f9]`}
      >
        {view === "compose" ? (
          <div className="flex flex-col h-full">
            <div className="px-4 py-3 border-b border-[#c8d3e8] bg-white flex items-center gap-3">
              <button
                onClick={() => { setView("email"); setActiveUid(null); }}
                className="inbox:hidden w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 transition"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M12.78 15.78a.75.75 0 01-1.06 0l-5.25-5.25a.75.75 0 010-1.06l5.25-5.25a.75.75 0 111.06 1.06L8.06 10l4.72 4.72a.75.75 0 010 1.06z" clipRule="evenodd" />
                </svg>
              </button>
              <h2 className="font-semibold text-gray-900">
                {composeSubj.startsWith("Re:") ? t("email.replyTitle") : t("email.newEmail")}
              </h2>
            </div>
            <div className="flex-1 flex flex-col p-4 sm:p-6 gap-0 overflow-auto">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex-1 flex flex-col">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                  <span className="text-xs text-gray-400 w-12 shrink-0">{t("email.to")}</span>
                  <input
                    value={composeTo}
                    onChange={(e) => setComposeTo(e.target.value)}
                    placeholder="email@example.com"
                    className="flex-1 text-sm text-gray-900 outline-none bg-transparent"
                  />
                </div>
                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                  <span className="text-xs text-gray-400 w-12 shrink-0">{t("email.subject")}</span>
                  <input
                    value={composeSubj}
                    onChange={(e) => setComposeSubj(e.target.value)}
                    placeholder={t("email.subjectPlaceholder")}
                    className="flex-1 text-sm font-medium text-gray-900 outline-none bg-transparent"
                  />
                </div>
                <textarea
                  value={composeText}
                  onChange={(e) => setComposeText(e.target.value)}
                  rows={12}
                  placeholder={t("email.body")}
                  className="flex-1 resize-none px-4 py-3 text-sm text-gray-800 outline-none bg-transparent leading-relaxed"
                />
              </div>
              {/* AI generation block */}
              <div className="mt-3 border border-[#c8d3e8] rounded-xl p-3 bg-gray-50 flex gap-2 items-center">
                <span className="text-xs text-gray-400 shrink-0">✨ AI</span>
                <input
                  value={aiHint}
                  onChange={e => setAiHint(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && generateAiEmail()}
                  placeholder={t("email.aiHintPlaceholder")}
                  className="flex-1 text-sm bg-white border border-[#c8d3e8] rounded-lg px-3 py-1.5 outline-none focus:border-[#516895] transition"
                />
                <button
                  onClick={generateAiEmail}
                  disabled={aiLoading || !aiHint.trim()}
                  className="shrink-0 px-3 py-1.5 text-xs rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition"
                >
                  {aiLoading ? t("email.aiGenerating") : t("email.aiGenerate")}
                </button>
              </div>

              <div className="flex gap-2 mt-3">
                <button
                  onClick={sendEmail}
                  disabled={sending || !composeTo.trim() || !composeText.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm rounded-xl bg-brand text-white hover:bg-brand-dark disabled:opacity-50 transition font-medium shadow-sm"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                  {sending ? t("email.sending") : t("email.send")}
                </button>
                <button
                  onClick={() => { setView("email"); setActiveUid(null); }}
                  className="px-4 py-2.5 text-sm rounded-xl border border-[#c8d3e8] bg-white hover:bg-gray-50 transition text-gray-600"
                >
                  {t("email.cancel")}
                </button>
              </div>
            </div>
          </div>
        ) : activeUid === null ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
            <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-3xl">✉️</div>
            <span className="text-sm">{t("email.selectPrompt")}</span>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div className="px-4 py-3 border-b border-[#c8d3e8] bg-white flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <button
                  onClick={() => { setActiveUid(null); setCurrent(null); }}
                  className="inbox:hidden shrink-0 mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 transition"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path fillRule="evenodd" d="M12.78 15.78a.75.75 0 01-1.06 0l-5.25-5.25a.75.75 0 010-1.06l5.25-5.25a.75.75 0 111.06 1.06L8.06 10l4.72 4.72a.75.75 0 010 1.06z" clipRule="evenodd" />
                  </svg>
                </button>
                {current && (
                  <div className={`shrink-0 w-10 h-10 rounded-full ${emailAvatarColor(current.fromName || current.fromAddress)} text-white flex items-center justify-center font-bold text-base`}>
                    {(current.fromName?.[0] ?? current.fromAddress?.[0] ?? "?").toUpperCase()}
                  </div>
                )}
                <div>
                  {loadingEmail || !current ? (
                    <div className="text-sm text-gray-400 pt-1">{t("email.loading")}</div>
                  ) : (
                    <>
                      <div className="font-bold text-gray-900 leading-tight">{current.subject}</div>
                      <div className="text-sm text-gray-500 mt-0.5">
                        <span className="font-medium text-gray-700">{current.fromName || current.fromAddress}</span>
                        {current.fromName && <span className="ml-1 text-gray-400 text-xs">&lt;{current.fromAddress}&gt;</span>}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">{fmtFull(current.date)}</div>
                      <div className="mt-1">
                        {sentimentLoading ? (
                          <span className="text-xs text-gray-300 animate-pulse">{t("email.analyzingSentiment")}</span>
                        ) : sentiment ? (
                          <SentimentBadge sentiment={sentiment.sentiment} label={sentiment.label} score={sentiment.score} />
                        ) : null}
                      </div>
                    </>
                  )}
                </div>
              </div>
              {current && (
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => openCompose(current)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-[#c8d3e8] bg-white hover:bg-gray-50 transition text-gray-700 font-medium"
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                      <path fillRule="evenodd" d="M7.793 2.232a.75.75 0 01-.025 1.06L3.622 7.25h10.003a5.375 5.375 0 010 10.75H10.75a.75.75 0 010-1.5h2.875a3.875 3.875 0 000-7.75H3.622l4.146 3.957a.75.75 0 01-1.036 1.085l-5.5-5.25a.75.75 0 010-1.085l5.5-5.25a.75.75 0 011.06.025z" clipRule="evenodd" />
                    </svg>
                    {t("email.reply")}
                  </button>
                  <button
                    onClick={() => deleteEmail(current.uid)}
                    disabled={deleting}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-50 transition"
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                    </svg>
                    {deleting ? "..." : t("email.delete")}
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-auto p-4 sm:p-6">
              {loadingEmail ? (
                <div className="text-sm text-gray-400 text-center pt-10">{t("email.loading")}</div>
              ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-4 sm:p-6">
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
                  </div>

                  {current && current.attachments.length > 0 && (
                    <div className="px-4 sm:px-6 pb-4 border-t border-gray-100 pt-4">
                      <div className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wider">
                        {t("email.attachments")} ({current.attachments.length})
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {current.attachments.map((att) => (
                          <a
                            key={att.index}
                            href={`/api/email/${current.uid}/attachment/${att.index}`}
                            download={att.filename}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[#c8d3e8] hover:border-brand hover:bg-brand/5 transition text-sm text-gray-700 max-w-xs"
                          >
                            <FileIcon contentType={att.contentType} />
                            <span className="truncate flex-1">{att.filename}</span>
                            <span className="shrink-0 text-xs text-gray-400">{fmtSize(att.size)}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

const EMAIL_AVATAR_COLORS = [
  "bg-blue-500", "bg-violet-500", "bg-emerald-600",
  "bg-orange-500", "bg-rose-500", "bg-amber-500", "bg-cyan-600", "bg-indigo-500",
];

function emailAvatarColor(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) & 0xffff;
  return EMAIL_AVATAR_COLORS[h % EMAIL_AVATAR_COLORS.length];
}

function fmtSize(bytes: number): string {
  if (bytes < 1024)         return `${bytes} B`;
  if (bytes < 1024 * 1024)  return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function SentimentBadge({ sentiment, label, score }: { sentiment: string; label: string; score: number }) {
  const cfg = {
    positive: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500" },
    neutral:  { bg: "bg-gray-50",    border: "border-gray-200",    text: "text-gray-600",    dot: "bg-gray-400"    },
    negative: { bg: "bg-red-50",     border: "border-red-200",     text: "text-red-600",     dot: "bg-red-500"     },
  }[sentiment] ?? { bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-600", dot: "bg-gray-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium ${cfg.bg} ${cfg.border} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {label} {score}%
    </span>
  );
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
