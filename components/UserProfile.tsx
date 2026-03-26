"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";

export default function UserProfile() {
  const { user, loading } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "", role: "user" });
  const [saving, setSaving] = useState(false);

  if (loading) return <div className="p-8 text-sm text-gray-400">Загрузка...</div>;
  if (!user) return <div className="p-8 text-sm text-red-500">Пользователь не найден</div>;

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ") || "Без имени";
  const initials = fullName.charAt(0).toUpperCase();
  const joined = new Date(user.created_at).toLocaleDateString("ru-RU", {
    day: "numeric", month: "long", year: "numeric",
  });

  function openEdit() {
    if (!user) return;
    setForm({
      first_name: user.first_name ?? "",
      last_name: user.last_name ?? "",
      role: user.role ?? "user",
    });
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    const res = await fetch("/api/auth/update", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) return alert("Ошибка сохранения");
    window.location.reload();
  }

  return (
    <div className="text-black p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-6">
          <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center">
            <span className="text-2xl font-bold text-gray-500">{initials}</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold">{fullName}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${user.role === "admin" ? "bg-black text-white" : "bg-gray-100 text-gray-600"
              }`}>
              {user.role ?? "user"}
            </span>
            <p className="text-zinc-500 text-sm mt-1">Зарегистрирован {joined}</p>
          </div>
        </div>
        <button onClick={openEdit} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50 transition">
          Редактировать
        </button>
      </div>

      {/* Details */}
      <div className="border p-6 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Информация о профиле</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-zinc-400 text-sm">Email</p>
            <p className="text-black font-medium mt-0.5">{user.email}</p>
          </div>
          <div>
            <p className="text-zinc-400 text-sm">Роль</p>
            <p className="text-black font-medium mt-0.5">{user.role ?? "user"}</p>
          </div>
          <div>
            <p className="text-zinc-400 text-sm">Имя</p>
            <p className="text-black font-medium mt-0.5">{user.first_name || "—"}</p>
          </div>
          <div>
            <p className="text-zinc-400 text-sm">Фамилия</p>
            <p className="text-black font-medium mt-0.5">{user.last_name || "—"}</p>
          </div>
          <div>
            <p className="text-zinc-400 text-sm">Дата регистрации</p>
            <p className="text-black font-medium mt-0.5">{joined}</p>
          </div>
          <div>
            <p className="text-zinc-400 text-sm">ID пользователя</p>
            <p className="text-black font-medium mt-0.5 text-xs break-all">{user.id}</p>
          </div>
        </div>
      </div>

      {/* Модалка редактирования */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold">Редактировать профиль</h2>
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm text-gray-600">Имя</label>
                <input
                  className="border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  placeholder="Иван"
                  value={form.first_name}
                  onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm text-gray-600">Фамилия</label>
                <input
                  className="border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  placeholder="Иванов"
                  value={form.last_name}
                  onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                />
              </div>

              {/* Только для админа */}
              {user.role === "admin" && (
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
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditing(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50 transition">
                Отмена
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm rounded-lg bg-black text-white hover:bg-gray-800 disabled:opacity-50 transition"
              >
                {saving ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}