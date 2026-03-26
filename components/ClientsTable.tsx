/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useEffect, useState, useCallback } from "react";

interface Client {
  id: number;
  name: string;
  company: string | null;
  phone_number: string | null;
  email: string | null;
  created_at: string;
}

const EMPTY_FORM = { name: "", company: "", phone_number: "", email: "" };

interface FormData { name: string; company: string; phone_number: string; email: string; }

function Modal({ title, onClose, onSubmit, form, setForm, loading }: {
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  form: FormData;
  setForm: React.Dispatch<React.SetStateAction<FormData>>;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="space-y-3">
          {[
            { key: "name",         label: "Имя *",    placeholder: "Иван Иванов" },
            { key: "company",      label: "Компания", placeholder: "ООО Ромашка" },
            { key: "phone_number", label: "Телефон",  placeholder: "+7 999 000 00 00" },
            { key: "email",        label: "Email",    placeholder: "ivan@mail.ru" },
          ].map(({ key, label, placeholder }) => (
            <div key={key} className="flex flex-col gap-1">
              <label className="text-sm text-gray-600">{label}</label>
              <input
                className="border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                placeholder={placeholder}
                value={form[key as keyof FormData]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50 transition">Отмена</button>
          <button
            onClick={onSubmit}
            disabled={loading || !form.name.trim()}
            className="px-4 py-2 text-sm rounded-lg bg-black text-white hover:bg-gray-800 disabled:opacity-50 transition"
          >
            {loading ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ name, onClose, onConfirm, loading }: {
  name: string;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold">Удалить клиента?</h2>
        <p className="text-sm text-gray-500">
          Вы уверены, что хотите удалить{" "}
          <span className="font-medium text-black">{name}</span>? Это действие необратимо.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50 transition">Отмена</button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition"
          >
            {loading ? "Удаление..." : "Удалить"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ClientsTable() {
  const [clients, setClients]         = useState<Client[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [createOpen, setCreateOpen]   = useState(false);
  const [editTarget, setEditTarget]   = useState<Client | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [form, setForm]               = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving]           = useState(false);

  // ── Fetch ──────────────────────────────────────────────
  const fetchClients = useCallback(async () => {
    setLoading(true);
    const res  = await fetch("/api/clients");
    const data = await res.json();
    if (!res.ok) setError(data.error);
    else setClients(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  // ── Create ─────────────────────────────────────────────
  function openCreate() { setForm(EMPTY_FORM); setCreateOpen(true); }

  async function handleCreate() {
    setSaving(true);
    const res = await fetch("/api/clients", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) return alert("Ошибка: " + data.error);
    setClients((prev) => [data, ...prev]);
    setCreateOpen(false);
  }

  // ── Edit ───────────────────────────────────────────────
  function openEdit(c: Client) {
    setForm({ name: c.name, company: c.company ?? "", phone_number: c.phone_number ?? "", email: c.email ?? "" });
    setEditTarget(c);
  }

  async function handleEdit() {
    if (!editTarget) return;
    setSaving(true);
    const res = await fetch("/api/clients", {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ id: editTarget.id, ...form }),
    });
    setSaving(false);
    if (!res.ok) return alert("Ошибка сохранения");
    setClients((prev) => prev.map((c) => c.id === editTarget.id ? { ...c, ...form } : c));
    setEditTarget(null);
  }

  // ── Delete ─────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    const res = await fetch("/api/clients", {
      method:  "DELETE",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ id: deleteTarget.id }),
    });
    setSaving(false);
    if (!res.ok) return alert("Ошибка удаления");
    setClients((prev) => prev.filter((c) => c.id !== deleteTarget.id));
    setDeleteTarget(null);
  }

  if (loading) return <div className="mt-5 text-sm text-gray-400">Загрузка...</div>;
  if (error)   return <div className="mt-5 text-sm text-red-500">Ошибка: {error}</div>;

  return (
    <>
      <div className="flex justify-end mt-5">
        <button onClick={openCreate} className="px-4 py-2 text-sm rounded-lg bg-black text-white hover:bg-gray-800 transition">
          + Добавить клиента
        </button>
      </div>

      <div className="w-full overflow-auto h-fit mt-3 border rounded-xl">
        <Table>
          <TableHeader className="sticky top-0 z-20 bg-white">
            <TableRow>
              <TableHead className="text-center">Имя</TableHead>
              <TableHead className="text-center">Компания</TableHead>
              <TableHead className="text-center">Телефон</TableHead>
              <TableHead className="text-center">Email</TableHead>
              <TableHead className="text-center">Дата создания</TableHead>
              <TableHead className="text-center">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-gray-400">Нет данных</TableCell>
              </TableRow>
            ) : (
              clients.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-center font-medium">{c.name}</TableCell>
                  <TableCell className="text-center">{c.company ?? "—"}</TableCell>
                  <TableCell className="text-center">{c.phone_number ?? "—"}</TableCell>
                  <TableCell className="text-center">{c.email ?? "—"}</TableCell>
                  <TableCell className="text-center">
                    {new Date(c.created_at).toLocaleDateString("ru-RU")}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex justify-center gap-2">
                      <button onClick={() => openEdit(c)} className="px-3 py-1 text-xs rounded-md border hover:bg-gray-50 transition">Изменить</button>
                      <button onClick={() => setDeleteTarget(c)} className="px-3 py-1 text-xs rounded-md border border-red-200 text-red-500 hover:bg-red-50 transition">Удалить</button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {createOpen && <Modal title="Новый клиент" form={form} setForm={setForm} loading={saving} onClose={() => setCreateOpen(false)} onSubmit={handleCreate} />}
      {editTarget && <Modal title="Редактировать клиента" form={form} setForm={setForm} loading={saving} onClose={() => setEditTarget(null)} onSubmit={handleEdit} />}
      {deleteTarget && <ConfirmModal name={deleteTarget.name} loading={saving} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} />}
    </>
  );
}