/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/locale";

interface Attachment {
  id:          number;
  file_name:   string;
  file_type:   string | null;
  file_size:   number | null;
  uploaded_by: string | null;
  uploaded_at: string | null;
}

function fmtSize(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fileIcon(type: string | null) {
  if (!type) return "📄";
  if (type.startsWith("image/"))                              return "🖼️";
  if (type === "application/pdf")                             return "📕";
  if (type.includes("word") || type.includes("document"))    return "📝";
  if (type.includes("excel") || type.includes("sheet"))      return "📊";
  return "📄";
}

interface Props {
  entityType:   "customer" | "task";
  entityId:     number;
  currentUser?: string;
  isAdmin?:     boolean;
}

export default function AttachmentsPanel({ entityType, entityId, currentUser, isAdmin }: Props) {
  const t = useT();
  const [items, setItems]         = useState<Attachment[]>([]);
  const [loading, setLoading]     = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting]   = useState<number | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch(`/api/attachments?entity_type=${entityType}&entity_id=${entityId}`);
    const data = await res.json().catch(() => []);
    if (res.ok) setItems(data as Attachment[]);
    setLoading(false);
  }, [entityType, entityId]);

  useEffect(() => { load(); }, [load]);

  async function upload(files: FileList | null) {
    if (!files || !files.length) return;
    setUploading(true); setError(null);
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file",        file);
      form.append("entity_type", entityType);
      form.append("entity_id",   String(entityId));
      const res  = await fetch("/api/attachments", { method: "POST", body: form });
      const json = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) { setError(json.error ?? t("files.uploadError")); break; }
    }
    setUploading(false);
    load();
    if (inputRef.current) inputRef.current.value = "";
  }

  async function remove(att: Attachment) {
    if (!confirm(`${t("files.deleteConfirm")} "${att.file_name}"?`)) return;
    setDeleting(att.id);
    await fetch(`/api/attachments/${att.id}`, { method: "DELETE" });
    setDeleting(null);
    setItems((prev) => prev.filter((a) => a.id !== att.id));
  }

  return (
    <div className="space-y-4">
      <div
        className="border-2 border-dashed border-zinc-700 rounded-xl p-6 text-center cursor-pointer hover:border-zinc-500 transition"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files); }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => upload(e.target.files)}
        />
        {uploading ? (
          <p className="text-sm text-zinc-400">{t("files.uploading")}</p>
        ) : (
          <>
            <p className="text-sm text-zinc-400">
              {t("files.dropzoneOrSelect")} <span className="text-white underline">{t("files.orSelect")}</span>
            </p>
            <p className="text-xs text-zinc-600 mt-1">{t("files.maxSizeFile")}</p>
          </>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-12 animate-pulse bg-zinc-800/40 rounded-lg" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-600 text-center py-4">{t("files.noFiles")}</p>
      ) : (
        <div className="space-y-2">
          {items.map((att) => {
            const canDel = isAdmin || att.uploaded_by === currentUser;
            return (
              <div key={att.id} className="flex items-center gap-3 border border-zinc-800 rounded-xl px-4 py-3 hover:bg-zinc-800/20 transition group">
                <span className="text-xl shrink-0">{fileIcon(att.file_type)}</span>
                <div className="flex-1 min-w-0">
                  <a
                    href={`/api/attachments/${att.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-zinc-200 hover:text-white truncate block"
                  >
                    {att.file_name}
                  </a>
                  <div className="text-xs text-zinc-600 mt-0.5">
                    {fmtSize(att.file_size)} · {att.uploaded_by ?? "—"} · {fmtDate(att.uploaded_at)}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={`/api/attachments/${att.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-zinc-500 hover:text-white transition px-2 py-1 border border-zinc-700 rounded-lg"
                  >
                    {t("common.download")}
                  </a>
                  {canDel && (
                    <button
                      onClick={() => remove(att)}
                      disabled={deleting === att.id}
                      className="text-zinc-700 hover:text-red-400 transition text-xs disabled:opacity-40 opacity-0 group-hover:opacity-100"
                      title={t("common.delete")}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
