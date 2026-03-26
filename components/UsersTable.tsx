/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";

interface User {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  created_at: string;
}

const EMPTY_CREATE_FORM = { email: "", password: "", first_name: "", last_name: "", role: "user" };
type CreateForm = typeof EMPTY_CREATE_FORM;
type EditForm   = { first_name: string; last_name: string; role: string };

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<CreateForm>(EMPTY_CREATE_FORM);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!form.email || !form.password) return;
    setSaving(true);
    const res = await fetch("/api/users", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(form),
    });
    const result = await res.json();
    setSaving(false);
    if (!res.ok) return alert("Ошибка: " + result.error);
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-semibold">Новый пользователь</h2>
        <div className="space-y-3">
          {[
            { key: "first_name", label: "Имя",      placeholder: "Иван" },
            { key: "last_name",  label: "Фамилия",   placeholder: "Иванов" },
            { key: "email",      label: "Email *",   placeholder: "ivan@mail.ru" },
            { key: "password",   label: "Пароль *",  placeholder: "минимум 6 символов", type: "password" },
          ].map(({ key, label, placeholder, type }) => (
            <div key={key} className="flex flex-col gap-1">
              <label className="text-sm text-gray-600">{label}</label>
              <input
                type={type ?? "text"}
                className="border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                placeholder={placeholder}
                value={form[key as keyof CreateForm]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-600">Роль</label>
            <select
              className="border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 bg-white"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50 transition">Отмена</button>
          <button
            onClick={handleSubmit}
            disabled={saving || !form.email || !form.password}
            className="px-4 py-2 text-sm rounded-lg bg-black text-white hover:bg-gray-800 disabled:opacity-50 transition"
          >
            {saving ? "Создание..." : "Создать"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditModal({ form, setForm, onClose, onSubmit, loading }: {
  form: EditForm;
  setForm: React.Dispatch<React.SetStateAction<EditForm>>;
  onClose: () => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-semibold">Редактировать пользователя</h2>
        <div className="space-y-3">
          {[
            { key: "first_name", label: "Имя",     placeholder: "Иван" },
            { key: "last_name",  label: "Фамилия",  placeholder: "Иванов" },
          ].map(({ key, label, placeholder }) => (
            <div key={key} className="flex flex-col gap-1">
              <label className="text-sm text-gray-600">{label}</label>
              <input
                className="border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                placeholder={placeholder}
                value={form[key as keyof EditForm]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-600">Роль</label>
            <select
              className="border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 bg-white"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50 transition">Отмена</button>
          <button onClick={onSubmit} disabled={loading} className="px-4 py-2 text-sm rounded-lg bg-black text-white hover:bg-gray-800 disabled:opacity-50 transition">
            {loading ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ name, onClose, onConfirm, loading }: {
  name: string; onClose: () => void; onConfirm: () => void; loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold">Удалить пользователя?</h2>
        <p className="text-sm text-gray-500">
          Вы уверены что хотите удалить <span className="font-medium text-black">{name}</span>? Это действие необратимо.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50 transition">Отмена</button>
          <button onClick={onConfirm} disabled={loading} className="px-4 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition">
            {loading ? "Удаление..." : "Удалить"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${role === "admin" ? "bg-black text-white" : "bg-gray-100 text-gray-600"}`}>
      {role ?? "user"}
    </span>
  );
}

export function UsersTable() {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";

  const [users, setUsers]               = useState<User[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [editTarget, setEditTarget]     = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [createOpen, setCreateOpen]     = useState(false);
  const [form, setForm]                 = useState<EditForm>({ first_name: "", last_name: "", role: "user" });
  const [saving, setSaving]             = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const res  = await fetch("/api/users");
    const data = await res.json();
    if (!res.ok) setError(data.error);
    else setUsers(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  function openEdit(u: User) {
    setForm({ first_name: u.first_name ?? "", last_name: u.last_name ?? "", role: u.role ?? "user" });
    setEditTarget(u);
  }

  async function handleEdit() {
    if (!editTarget) return;
    setSaving(true);
    const res = await fetch("/api/users", {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ id: editTarget.id, ...form }),
    });
    setSaving(false);
    if (!res.ok) return alert("Ошибка сохранения");
    setUsers((prev) => prev.map((u) => u.id === editTarget.id ? { ...u, ...form } : u));
    setEditTarget(null);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    const res = await fetch("/api/users", {
      method:  "DELETE",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ id: deleteTarget.id }),
    });
    setSaving(false);
    if (!res.ok) return alert("Ошибка удаления");
    setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
    setDeleteTarget(null);
  }

  if (loading) return <div className="mt-5 text-sm text-gray-400">Загрузка...</div>;
  if (error)   return <div className="mt-5 text-sm text-red-500">Ошибка: {error}</div>;

  if (!isAdmin) return (
    <div className="mt-5 text-sm text-red-400 border border-red-100 rounded-xl p-4 text-center">
      Доступ только для администраторов
    </div>
  );

  return (
    <>
      <div className="flex justify-end mt-5">
        <button onClick={() => setCreateOpen(true)} className="px-4 py-2 text-sm rounded-lg bg-black text-white hover:bg-gray-800 transition">
          + Добавить пользователя
        </button>
      </div>

      <div className="w-full overflow-auto h-fit mt-3 border rounded-xl">
        <Table>
          <TableHeader className="sticky top-0 z-20 bg-white">
            <TableRow>
              <TableHead className="text-center">Имя</TableHead>
              <TableHead className="text-center">Фамилия</TableHead>
              <TableHead className="text-center">Email</TableHead>
              <TableHead className="text-center">Роль</TableHead>
              <TableHead className="text-center">Дата регистрации</TableHead>
              <TableHead className="text-center">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-gray-400">Нет пользователей</TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="text-center font-medium">{u.first_name || "—"}</TableCell>
                  <TableCell className="text-center">{u.last_name || "—"}</TableCell>
                  <TableCell className="text-center">{u.email || "—"}</TableCell>
                  <TableCell className="text-center"><RoleBadge role={u.role} /></TableCell>
                  <TableCell className="text-center">
                    {new Date(u.created_at).toLocaleDateString("ru-RU")}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex justify-center gap-2">
                      <button onClick={() => openEdit(u)} className="px-3 py-1 text-xs rounded-md border hover:bg-gray-50 transition">Изменить</button>
                      <button onClick={() => setDeleteTarget(u)} className="px-3 py-1 text-xs rounded-md border border-red-200 text-red-500 hover:bg-red-50 transition">Удалить</button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {createOpen && <CreateModal onClose={() => setCreateOpen(false)} onCreated={fetchUsers} />}
      {editTarget && <EditModal form={form} setForm={setForm} loading={saving} onClose={() => setEditTarget(null)} onSubmit={handleEdit} />}
      {deleteTarget && (
        <ConfirmModal
          name={[deleteTarget.first_name, deleteTarget.last_name].filter(Boolean).join(" ") || deleteTarget.email}
          loading={saving}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}
    </>
  );
}