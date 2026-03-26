"use client";

import { useEffect, useState, useRef } from "react";

interface FileInfo {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
}

interface Commit {
  sha: string;
  message: string;
  author: string;
  date: string;
  stats: { additions: number; deletions: number; total: number };
  files: FileInfo[];
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  added:    { label: "добавлен",       className: "text-green-600" },
  removed:  { label: "удалён",         className: "text-red-500" },
  modified: { label: "изменён",        className: "text-blue-600" },
  renamed:  { label: "переименован",   className: "text-yellow-600" },
};

export default function GitReport() {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [open, setOpen]       = useState<Record<string, boolean>>({});
  const reportRef             = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/git-report")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setCommits(data);
        setLoading(false);
      })
      .catch(() => { setError("Ошибка загрузки"); setLoading(false); });
  }, []);

  function toggleCommit(sha: string) {
    setOpen((prev) => ({ ...prev, [sha]: !prev[sha] }));
  }

  function downloadHTML() {
    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Git отчёт</title>
  <style>
    body { font-family: sans-serif; padding: 32px; color: #111; }
    h1 { font-size: 24px; margin-bottom: 24px; }
    .commit { border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 16px; padding: 16px; }
    .message { font-weight: 600; font-size: 15px; }
    .meta { font-size: 12px; color: #6b7280; }
    .stats { font-size: 13px; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 6px 8px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; }
    td { padding: 6px 8px; border-bottom: 1px solid #f3f4f6; }
    .green { color: #16a34a; } .red { color: #dc2626; } .blue { color: #2563eb; }
  </style>
</head>
<body>
  <h1>Git отчёт — ${new Date().toLocaleDateString("ru-RU")}</h1>
  ${commits.map((c) => `
    <div class="commit">
      <div class="message">${c.message}</div>
      <div class="meta">${c.sha} · ${c.author} · ${new Date(c.date).toLocaleString("ru-RU")}</div>
      ${c.stats ? `<div class="stats">
        Файлов: <b>${c.files.length}</b> &nbsp;
        <span class="green">+${c.stats.additions}</span> &nbsp;
        <span class="red">-${c.stats.deletions}</span>
      </div>` : ""}
      <table>
        <thead><tr><th>Файл</th><th>Статус</th><th>+</th><th>-</th></tr></thead>
        <tbody>
          ${c.files.map((f) => `
            <tr>
              <td>${f.filename}</td>
              <td class="${f.status === "added" ? "green" : f.status === "removed" ? "red" : "blue"}">${STATUS_LABEL[f.status]?.label ?? f.status}</td>
              <td class="green">+${f.additions}</td>
              <td class="red">-${f.deletions}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `).join("")}
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `git-report-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadPDF() {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Git отчёт</title>
  <style>
    body { font-family: sans-serif; padding: 24px; color: #111; font-size: 13px; }
    h1 { font-size: 20px; margin-bottom: 20px; }
    .commit { border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 12px; padding: 12px; page-break-inside: avoid; }
    .message { font-weight: 600; font-size: 14px; }
    .meta { font-size: 11px; color: #6b7280; margin-top: 2px; }
    .stats { font-size: 12px; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 6px; }
    th { text-align: left; padding: 4px 6px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; }
    td { padding: 4px 6px; border-bottom: 1px solid #f3f4f6; }
    .green { color: #16a34a; } .red { color: #dc2626; } .blue { color: #2563eb; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>Git отчёт — ${new Date().toLocaleDateString("ru-RU")}</h1>
  ${commits.map((c) => `
    <div class="commit">
      <div class="message">${c.message}</div>
      <div class="meta">${c.sha} · ${c.author} · ${new Date(c.date).toLocaleString("ru-RU")}</div>
      ${c.stats ? `<div class="stats">
        Файлов: <b>${c.files.length}</b> &nbsp;
        <span class="green">+${c.stats.additions}</span> &nbsp;
        <span class="red">-${c.stats.deletions}</span>
      </div>` : ""}
      <table>
        <thead><tr><th>Файл</th><th>Статус</th><th>+</th><th>-</th></tr></thead>
        <tbody>
          ${c.files.map((f) => `
            <tr>
              <td>${f.filename}</td>
              <td class="${f.status === "added" ? "green" : f.status === "removed" ? "red" : "blue"}">${STATUS_LABEL[f.status]?.label ?? f.status}</td>
              <td class="green">+${f.additions}</td>
              <td class="red">-${f.deletions}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `).join("")}
</body>
</html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
  }

  if (loading) return <div className="p-6 text-sm text-gray-400">Загрузка коммитов...</div>;
  if (error)   return <div className="p-6 text-sm text-red-500">Ошибка: {error}</div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Отчёт по коммитам</h1>
          <p className="text-sm text-gray-400 mt-0.5">Последние {commits.length} коммитов</p>
        </div>
        <div className="flex gap-2">
          <button onClick={downloadHTML} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50 transition">
            Скачать HTML
          </button>
          <button onClick={downloadPDF} className="px-4 py-2 text-sm rounded-lg bg-black text-white hover:bg-gray-800 transition">
            Скачать PDF
          </button>
        </div>
      </div>

      <div ref={reportRef} className="space-y-3">
        {commits.map((c) => (
          <div key={c.sha} className="border rounded-xl overflow-hidden">
            <button
              onClick={() => toggleCommit(c.sha)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition text-left"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{c.message}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {c.sha} · {c.author} · {new Date(c.date).toLocaleString("ru-RU")}
                </p>
              </div>
              <div className="flex items-center gap-3 ml-4 shrink-0">
                {c.stats && (
                  <div className="flex gap-2 text-xs">
                    <span className="text-gray-500">{c.files.length} файлов</span>
                    <span className="text-green-600">+{c.stats.additions}</span>
                    <span className="text-red-500">-{c.stats.deletions}</span>
                  </div>
                )}
                <span className="text-gray-400 text-xs">{open[c.sha] ? "▲" : "▼"}</span>
              </div>
            </button>

            {open[c.sha] && (
              <div className="border-t">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left px-4 py-2 font-medium text-gray-500">Файл</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-500">Статус</th>
                      <th className="px-4 py-2 font-medium text-gray-500 text-center">+</th>
                      <th className="px-4 py-2 font-medium text-gray-500 text-center">-</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.files.map((f, i) => (
                      <tr key={i} className="border-t border-gray-50">
                        <td className="px-4 py-2 font-mono text-gray-700 break-all">{f.filename}</td>
                        <td className={`px-4 py-2 ${STATUS_LABEL[f.status]?.className ?? ""}`}>
                          {STATUS_LABEL[f.status]?.label ?? f.status}
                        </td>
                        <td className="px-4 py-2 text-center text-green-600">+{f.additions}</td>
                        <td className="px-4 py-2 text-center text-red-500">-{f.deletions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}