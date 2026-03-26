"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const FILE_TYPE_LABEL: Record<string, { label: string; icon: string }> = {
  image:   { label: "Изображение", icon: "🖼️" },
  pdf:     { label: "PDF",         icon: "📋" },
  word:    { label: "Word",        icon: "📝" },
  excel:   { label: "Excel",       icon: "📊" },
  archive: { label: "Архив",       icon: "🗜️" },
  video:   { label: "Видео",       icon: "🎬" },
  audio:   { label: "Аудио",       icon: "🎵" },
  other:   { label: "Другое",      icon: "📄" },
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

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const [docsRes, tasksRes, usersRes] = await Promise.all([
        fetch("/api/documents"),
        fetch("/api/tasks"),
        fetch("/api/users/for-tasks"),
      ]);
      if (!docsRes.ok) { setError("Ошибка загрузки документов"); setLoading(false); return; }
      setDocuments(await docsRes.json());
      setTasks(await tasksRes.json());
      setUsers(await usersRes.json());
      setLoading(false);
    }
    fetchData();
  }, []);

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
    return tasks.find((t) => t.id === taskId)?.title ?? "—";
  }

  function getUserName(userId: number | null) {
    if (!userId) return "—";
    const u = users.find((u) => u.id === userId);
    if (!u) return "—";
    return [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email;
  }

  if (loading) return <div className="p-6 text-sm text-gray-400">Загрузка...</div>;
  if (error)   return <div className="p-6 text-sm text-red-500">Ошибка: {error}</div>;

  const uniqueTypes = [...new Set(documents.map((d) => d.file_type).filter(Boolean))] as string[];

  return (
    <div className="p-6">
      {/* Заголовок */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Документы</h1>
          <p className="text-sm text-gray-400 mt-0.5">Всего: {filtered.length}</p>
        </div>
      </div>

      {/* Фильтры */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          placeholder="Поиск по названию..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 w-full sm:w-64"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 bg-white"
        >
          <option value="all">Все типы</option>
          {uniqueTypes.map((t) => (
            <option key={t} value={t}>{FILE_TYPE_LABEL[t]?.label ?? t}</option>
          ))}
        </select>
        <select
          value={taskFilter}
          onChange={(e) => setTaskFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 bg-white"
        >
          <option value="all">Все задачи</option>
          {tasks.map((t) => (
            <option key={t.id} value={String(t.id)}>{t.title}</option>
          ))}
        </select>
        {(search || typeFilter !== "all" || taskFilter !== "all") && (
          <button
            onClick={() => { setSearch(""); setTypeFilter("all"); setTaskFilter("all"); }}
            className="px-3 py-2 text-sm rounded-lg border hover:bg-gray-50 transition text-gray-500"
          >
            Сбросить
          </button>
        )}
      </div>

      {/* Таблица */}
      {filtered.length === 0 ? (
        <div className="border rounded-xl p-8 text-center text-sm text-gray-400">Документы не найдены</div>
      ) : (
        <div className="border rounded-xl overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-20 bg-white">
              <TableRow>
                <TableHead className="text-center">Файл</TableHead>
                <TableHead className="text-center">Тип</TableHead>
                <TableHead className="text-center">Размер</TableHead>
                <TableHead className="text-center">Задача</TableHead>
                <TableHead className="text-center">Загрузил</TableHead>
                <TableHead className="text-center">Дата</TableHead>
                <TableHead className="text-center">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((doc) => {
                const typeInfo = FILE_TYPE_LABEL[doc.file_type ?? "other"] ?? { label: "Другое", icon: "📄" };
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
                    <TableCell className=" text-center">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-center">{typeInfo.label}</span>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500 text-center">{formatSize(doc.size)}</TableCell>
                    <TableCell className="text-sm text-gray-500 max-w-32 truncate text-center">{getTaskTitle(doc.task_id)}</TableCell>
                    <TableCell className="text-sm text-gray-500 text-center">{getUserName(doc.uploaded_by)}</TableCell>
                    <TableCell className="text-sm text-gray-500 text-center">
                      {new Date(doc.created_at).toLocaleDateString("ru-RU")}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-center gap-2">
                        <a href={url} target="_blank" rel="noopener noreferrer" className="px-3 py-1 text-xs rounded-md border hover:bg-gray-50 transition">Открыть</a>
                        <a href={url} download={doc.name} className="px-3 py-1 text-xs rounded-md border border-black bg-black text-white hover:bg-gray-800 transition">Скачать</a>
                        <button onClick={() => setDeleteTarget(doc)} className="px-3 py-1 text-xs rounded-md border border-red-200 text-red-500 hover:bg-red-50 transition">Удалить</button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Модалка удаления */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold">Удалить документ?</h2>
            <p className="text-sm text-gray-500">
              Вы уверены что хотите удалить{" "}
              <span className="font-medium text-black">{deleteTarget.name}</span>? Это действие необратимо.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50 transition">Отмена</button>
              <button onClick={() => handleDelete(deleteTarget)} disabled={deleting} className="px-4 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition">
                {deleting ? "Удаление..." : "Удалить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}