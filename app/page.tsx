"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AuthPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const router                = useRouter();

  const [form, setForm] = useState({ username: "", password: "" });

  function updateForm(key: "username" | "password", value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/auth/login", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({} as { error?: string }));
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? `Ошибка входа (${res.status})`);
      return;
    }
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl shadow-sm border w-full max-w-md p-8">
        <h1 className="text-2xl font-bold mb-2">CRM Oracle</h1>
        <p className="text-sm text-gray-400 mb-6">Войдите в аккаунт</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-600">Логин *</label>
            <input
              required
              autoComplete="username"
              className="border rounded-lg px-3 py-2 text-black text-sm outline-none focus:ring-2 focus:ring-black/10"
              placeholder="admin"
              value={form.username}
              onChange={(e) => updateForm("username", e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-600">Пароль *</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              className="border rounded-lg px-3 py-2 text-sm text-black outline-none focus:ring-2 focus:ring-black/10"
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
            {loading ? "Загрузка..." : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}
