"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AuthPage() {
  const [tab, setTab]           = useState<"login" | "register">("login");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const router                  = useRouter();

  const [form, setForm] = useState({
    email:      "",
    password:   "",
    first_name: "",
    last_name:  "",
  });

  function updateForm(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const endpoint = tab === "login" ? "/api/auth/login" : "/api/auth/register";
    const res = await fetch(endpoint, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(form),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error);
      return;
    }

    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl shadow-sm border w-full max-w-md p-8">
        <h1 className="text-2xl font-bold mb-2">CRM Oracle</h1>
        <p className="text-sm text-gray-400 mb-6">
          {tab === "login" ? "Войдите в аккаунт" : "Создайте аккаунт"}
        </p>

        {/* Табы */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6">
          {(["login", "register"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(null); }}
              className={`flex-1 py-2 text-sm rounded-md transition font-medium ${
                tab === t ? "bg-white shadow-sm text-black" : "text-gray-500 hover:text-black"
              }`}
            >
              {t === "login" ? "Вход" : "Регистрация"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === "register" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm text-gray-600">Имя</label>
                <input
                  className="border rounded-lg px-3 py-2 text-sm text-black outline-none focus:ring-2 focus:ring-black/10"
                  placeholder="Иван"
                  value={form.first_name}
                  onChange={(e) => updateForm("first_name", e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm text-gray-600">Фамилия</label>
                <input
                  className="border rounded-lg px-3 py-2 text-sm text-black outline-none focus:ring-2 focus:ring-black/10"
                  placeholder="Иванов"
                  value={form.last_name}
                  onChange={(e) => updateForm("last_name", e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-600">Email *</label>
            <input
              type="email"
              required
              className="border rounded-lg px-3 py-2 text-black text-sm outline-none focus:ring-2 focus:ring-black/10"
              placeholder="mail@mail.com"
              value={form.email}
              onChange={(e) => updateForm("email", e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-600">Пароль *</label>
            <input
              type="password"
              required
              className="border rounded-lg px-3 py-2 text-sm text-black outline-none focus:ring-2 focus:ring-black/10"
              placeholder="минимум 6 символов"
              value={form.password}
              onChange={(e) => updateForm("password", e.target.value)}
            />
          </div>

          {error && (
            <div className="px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-500">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 text-sm rounded-lg bg-black text-white hover:bg-gray-800 disabled:opacity-50 transition font-medium"
          >
            {loading ? "Загрузка..." : tab === "login" ? "Войти" : "Зарегистрироваться"}
          </button>
        </form>
      </div>
    </div>
  );
}