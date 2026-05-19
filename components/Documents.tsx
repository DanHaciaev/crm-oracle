"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useT, useLocale } from "@/lib/locale";

const FILE_TYPE_ICON: Record<string, string> = {
  image:   "🖼️",
  pdf:     "📋",
  word:    "📝",
  excel:   "📊",
  archive: "🗜️",
  video:   "🎬",
  audio:   "🎵",
  other:   "📄",
};

interface Document {
  id: number;
  name: string;
  full_name: string;
  size: number | null;
  file_type: string | null;
  task_id: number | null;
  uploaded_by: number | null;
  created_at: string;
}

interface Task { id: number; title: string; }
interface User { id: number; email: string; first_name: string | null; last_name: string | null; }

function formatSize(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Documents() {
  const t = useT();
  const { locale } = useLocale();
  const [documents, setDocuments]       = useState<Document[]>([]);
  const [tasks, setTasks]               = useState<Task[]>([]);
  const [users, setUsers]               = useState<User[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [search, setSearch]             = useState("");
  const [typeFilter, setTypeFilter]     = useState("all");
  const [taskFilter, setTaskFilter]     = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null);
  const [deleting, setDeleting]         = useState(false);

  const loc = locale === "ru" ? "ru-RU" : locale === "ro" ? "ro-RO" : "en-GB";

  function getTypeLabel(type: string | null) {
    const icon = FILE_TYPE_ICON[type ?? "other"] ?? "📄";
    const key = `files.types.${type}`;
    const translated = t(key);
    const label = translated !== key ? translated : (type ?? t("files.types.file"));
    return { label, icon };
  }

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const [docsRes, tasksRes, usersRes] = await Promise.all([
        fetch("/api/documents"),
        fetch("/api/tasks"),
        fetch("/api/users/for-tasks"),
      ]);
      if (!docsRes.ok) { setError(t("common.error")); setLoading(false); return; }
      setDocuments(await docsRes.json());
      setTasks(await tasksRes.json());
      setUsers(await usersRes.json());
      setLoading(false);
    }
    fetchData();
  }, [t]);

  const filtered = useMemo(() => {
    return documents.filter((d) => {
      const matchSearch = d.name.toLowerCase().includes(search.toLowerCase());
      const matchType   = typeFilter === "all" || d.file_type === typeFilter;
      const matchTask   = taskFilter === "all" || String(d.task_id) === taskFilter;
      return matchSearch && matchType && matchTask;
    });
  }, [documents, search, typeFilter, taskFilter]);

  async function handleDelete(doc: Document) {
    setDeleting(true);
    await fetch("/api/delete-file", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: doc.full_name }),
    });
    await fetch("/api/documents", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: doc.id }),
    });
    setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    setDeleteTarget(null);
    setDeleting(false);
  }

  function getTaskTitle(taskId: number | null) {
    if (!taskId) return "—";
    return tasks.find((task) => task.id === taskId)?.title ?? "—";
  }

  function getUserName(userId: number | null) {
    if (!userId) return "—";
    const u = users.find((u) => u.id === userId);
    if (!u) return "—";
    return [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email;
  }

  if (loading) return <div className="p-6 text-sm text-gray-400">{t("common.loading")}</div>;
  if (error)   return <div className="p-6 text-sm text-red-500">{t("common.error")}: {error}</div>;

  const uniqueTypes = [...new Set(documents.map((d) => d.file_type).filter(Boolean))] as string[];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">{t("common.files")}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{t("common.total")}: {filtered.length}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          placeholder={t("common.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 w-full sm:w-64"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 bg-white"
        >
          <option value="all">{t("common.all")}</option>
          {uniqueTypes.map((type) => (
            <option key={type} value={type}>{getTypeLabel(type).label}</option>
          ))}
        </select>
        <select
          value={taskFilter}
          onChange={(e) => setTaskFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 bg-white"
        >
          <option value="all">{t("common.all")} {t("tasks.title").toLowerCase()}</option>
          {tasks.map((task) => (
            <option key={task.id} value={String(task.id)}>{task.title}</option>
          ))}
        </select>
        {(search || typeFilter !== "all" || taskFilter !== "all") && (
          <button
            onClick={() => { setSearch(""); setTypeFilter("all"); setTaskFilter("all"); }}
            className="px-3 py-2 text-sm rounded-lg border hover:bg-gray-50 transition text-gray-500"
          >
            {t("common.reset")}
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="border rounded-xl p-8 text-center text-sm text-gray-400">{t("common.noData")}</div>
      ) : (
        <div className="border rounded-xl overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-20 bg-white">
              <TableRow>
                <TableHead className="text-center">{t("common.file")}</TableHead>
                <TableHead className="text-center">{t("common.type")}</TableHead>
                <TableHead className="text-center">{t("common.size")}</TableHead>
                <TableHead className="text-center">{t("tasks.title")}</TableHead>
                <TableHead className="text-center">{t("files.uploadedBy")}</TableHead>
                <TableHead className="text-center">{t("common.date")}</TableHead>
                <TableHead className="text-center">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((doc) => {
                const typeInfo = getTypeLabel(doc.file_type);
                const url      = `https://13.63.74.74/files/${doc.full_name}`;
                return (
                  <TableRow key={doc.id}>
                    <TableCell className="flex mx-auto max-w-fit">
                      <div className="flex items-center gap-2">
                        <span>{typeInfo.icon}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate max-w-45">{doc.name}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-sm bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-center">{typeInfo.label}</span>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500 text-center">{formatSize(doc.size)}</TableCell>
                    <TableCell className="text-sm text-gray-500 max-w-32 truncate text-center">{getTaskTitle(doc.task_id)}</TableCell>
                    <TableCell className="text-sm text-gray-500 text-center">{getUserName(doc.uploaded_by)}</TableCell>
                    <TableCell className="text-sm text-gray-500 text-center">
                      {new Date(doc.created_at).toLocaleDateString(loc)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-center gap-2">
                        <a href={url} target="_blank" rel="noopener noreferrer" className="px-3 py-1 text-sm rounded-md border hover:bg-gray-50 transition">{t("common.details")}</a>
                        <a href={url} download={doc.name} className="px-3 py-1 text-sm rounded-md border border-gray-800 text-gray-700 hover:bg-gray-100 transition">{t("common.download")}</a>
                        <button onClick={() => setDeleteTarget(doc)} className="px-3 py-1 text-sm rounded-md border border-red-200 text-red-500 hover:bg-red-50 transition">{t("common.delete")}</button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold">{t("files.deleteConfirmQ")}</h2>
            <p className="text-sm text-gray-500">
              <span className="font-medium text-black">{deleteTarget.name}</span>
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50 transition">{t("common.cancel")}</button>
              <button onClick={() => handleDelete(deleteTarget)} disabled={deleting} className="px-4 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition">
                {deleting ? t("customers.deleting") : t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
