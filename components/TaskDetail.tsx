/* eslint-disable react-hooks/set-state-in-effect */
 
"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  created:     { label: "Создано",  className: "bg-gray-100 text-gray-600" },
  in_progress: { label: "В работе", className: "bg-yellow-100 text-yellow-700" },
  review:      { label: "Ревью",    className: "bg-blue-100 text-blue-700" },
  changes:     { label: "Правки",   className: "bg-red-100 text-red-700" },
  done:        { label: "Готово",   className: "bg-green-100 text-green-700" },
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;

interface FileInfo {
  name: string;
  fullName: string;
  size: number;
  modifiedAt: string | null;
}

interface Task {
  id: number;
  title: string;
  description: string | null;
  status: string;
  assigned_to: number | null;
  created_by: number | null;
  created_at: string;
}

interface UserInfo {
  first_name: string | null;
  last_name: string | null;
  email: string;
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (["jpg","jpeg","png","gif","webp","svg"].includes(ext!)) return "🖼️";
  if (ext === "pdf") return "📋";
  if (["doc","docx"].includes(ext!)) return "📝";
  if (["xls","xlsx"].includes(ext!)) return "📊";
  if (["zip","rar","7z"].includes(ext!)) return "🗜️";
  if (["mp4","mov","avi"].includes(ext!)) return "🎬";
  if (["mp3","wav"].includes(ext!)) return "🎵";
  return "📄";
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleString("ru-RU", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function FileItem({ file, onDelete }: { file: FileInfo; onDelete: (name: string) => void }) {
  const url = `https://13.63.74.74/files/${file.fullName}`;
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm]   = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const res = await fetch("/api/delete-file", {
      method:  "DELETE",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ fileName: file.fullName }),
    });
    setDeleting(false);
    if (res.ok) onDelete(file.fullName);
    else alert("Ошибка удаления");
  }

  return (
    <div className="border rounded-xl overflow-hidden mb-3">
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl shrink-0">{getFileIcon(file.name)}</span>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{file.name}</p>
            <div className="flex gap-2 text-xs text-gray-400 mt-0.5">
              <span>{formatSize(file.size)}</span>
              {file.modifiedAt && <span>· {formatDate(file.modifiedAt)}</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-2 items-center shrink-0 ml-3">
          <a href={url} target="_blank" rel="noopener noreferrer" className="px-3 py-1 text-xs rounded-md border hover:bg-gray-50 transition">Открыть</a>
          <a href={url} download={file.name} className="px-3 py-1 text-xs rounded-md border border-black bg-black text-white hover:bg-gray-800 transition">Скачать</a>
          {confirm ? (
            <div className="flex gap-1 items-center">
              <span className="text-xs text-red-500">Удалить?</span>
              <button onClick={handleDelete} disabled={deleting} className="px-2 py-1 text-xs rounded-md bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition">
                {deleting ? "..." : "Да"}
              </button>
              <button onClick={() => setConfirm(false)} className="px-2 py-1 text-xs rounded-md border hover:bg-gray-50 transition">Нет</button>
            </div>
          ) : (
            <button onClick={() => setConfirm(true)} className="px-3 py-1 text-xs rounded-md border border-red-200 text-red-500 hover:bg-red-50 transition">Удалить</button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TaskDetail() {
  const { id }   = useParams<{ id: string }>();
  const router   = useRouter();
  const { user: currentUser } = useAuth();

  const [task, setTask]           = useState<Task | null>(null);
  const [assigned, setAssigned]   = useState<UserInfo | null>(null);
  const [createdBy, setCreatedBy] = useState<UserInfo | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [files, setFiles]         = useState<FileInfo[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [dragOver, setDragOver]   = useState(false);
  const [sizeError, setSizeError] = useState<string | null>(null);

  // fetchFiles объявлен до useEffect который его использует
  const fetchFiles = useCallback(async () => {
    setFilesLoading(true);
    const res  = await fetch(`/api/get-files?taskId=${id}`);
    const data = await res.json();
    setFiles(Array.isArray(data) ? data : []);
    setFilesLoading(false);
  }, [id]);

  useEffect(() => {
    async function fetchTask() {
      const res = await fetch(`/api/tasks/${id}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error); setLoading(false); return; }
      setTask(data);

      if (data.assigned_to || data.created_by) {
        const uRes  = await fetch(`/api/users/for-tasks`);
        const users = await uRes.json();
        if (data.assigned_to) {
          const found = users.find((u: { id: number }) => u.id === data.assigned_to);
          if (found) setAssigned(found);
        }
        if (data.created_by) {
          const found = users.find((u: { id: number }) => u.id === data.created_by);
          if (found) setCreatedBy(found);
        }
      }

      setLoading(false);
    }
    fetchTask();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    fetchFiles();
  }, [id, fetchFiles]);

  async function uploadFiles(fileList: FileList) {
    const filesArray = Array.from(fileList);
    const oversized  = filesArray.filter((f) => f.size > MAX_FILE_SIZE);
    if (oversized.length > 0) {
      setSizeError(`Файлы превышают 10MB: ${oversized.map((f) => f.name).join(", ")}`);
      setTimeout(() => setSizeError(null), 5000);
      return;
    }
    setSizeError(null);
    setUploading(true);
    setUploadProgress({ current: 0, total: filesArray.length });
    for (let i = 0; i < filesArray.length; i++) {
      const formData = new FormData();
      formData.append("file", filesArray[i]);
      formData.append("taskId", id);
      formData.append("userId", String(currentUser?.id ?? ""));
      await fetch("/api/upload-file", { method: "POST", body: formData });
      setUploadProgress({ current: i + 1, total: filesArray.length });
    }
    await fetchFiles();
    setUploading(false);
    setUploadProgress({ current: 0, total: 0 });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
  }

  function userName(profile: UserInfo | null) {
    if (!profile) return "—";
    return [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email;
  }

  if (loading) return <div className="p-8 text-sm text-gray-400">Загрузка...</div>;
  if (error)   return <div className="p-8 text-sm text-red-500">Ошибка: {error}</div>;
  if (!task)   return <div className="p-8 text-sm text-gray-400">Задача не найдена</div>;

  const status  = STATUS_LABEL[task.status];
  const created = new Date(task.created_at).toLocaleString("ru-RU");

  return (
    <div className="p-8">
      <button onClick={() => router.back()} className="text-sm text-gray-400 border px-4 py-2 rounded-lg hover:text-black transition mb-6 flex items-center gap-1">
        Назад
      </button>

      <div className="flex items-start justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold">{task.title}</h1>
        <span className={`px-3 py-1 rounded-full text-xs font-medium shrink-0 ${status?.className}`}>
          {status?.label ?? task.status}
        </span>
      </div>

      <div className="border rounded-xl p-5 mb-4">
        <h2 className="text-sm font-medium text-gray-500 mb-2">Описание</h2>
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.description || "Описание не указано"}</p>
      </div>

      <div className="border rounded-xl p-5 grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs text-gray-400">Исполнитель</p>
          <p className="text-sm font-medium mt-0.5">{userName(assigned)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Создал</p>
          <p className="text-sm font-medium mt-0.5">{userName(createdBy)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Дата создания</p>
          <p className="text-sm font-medium mt-0.5">{created}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">ID задачи</p>
          <p className="text-sm font-medium mt-0.5 font-mono">{task.id}</p>
        </div>
      </div>

      <div className="border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-gray-500">
            Файлы {files.length > 0 && <span className="text-gray-400">({files.length})</span>}
          </h2>
        </div>

        {sizeError && (
          <div className="mb-3 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-500">{sizeError}</div>
        )}

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition mb-4 ${dragOver ? "border-black bg-gray-50" : "border-gray-200"}`}
        >
          {uploading ? (
            <div>
              <p className="text-sm text-gray-500 mb-2">Загрузка {uploadProgress.current} из {uploadProgress.total}...</p>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div className="bg-black h-1.5 rounded-full transition-all" style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }} />
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-400 mb-1">Перетащи файлы сюда или</p>
              <p className="text-xs text-gray-300 mb-3">Максимум 10MB на файл</p>
              <label className="cursor-pointer px-4 py-2 text-sm rounded-lg bg-black text-white hover:bg-gray-800 transition">
                Выбрать файлы
                <input type="file" multiple className="hidden" onChange={(e) => e.target.files && uploadFiles(e.target.files)} />
              </label>
            </>
          )}
        </div>

        {filesLoading ? (
          <p className="text-sm text-gray-400">Загрузка файлов...</p>
        ) : files.length === 0 ? (
          <p className="text-sm text-gray-400">Файлов пока нет</p>
        ) : (
          <div>
            {files.map((f, i) => (
              <FileItem key={i} file={f} onDelete={(fileName) => setFiles((prev) => prev.filter((f) => f.fullName !== fileName))} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}