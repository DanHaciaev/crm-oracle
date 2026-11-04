"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AuthPage() {


  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const [form, setForm] = useState({
    username: "",
    password: "",
  });

  // Prefill from DEFAULT_USERNAME / DEFAULT_PASSWORD in .env (empty there =
  // empty form). Doesn't overwrite anything the user already typed.
  useEffect(() => {
    fetch("/api/auth/login-defaults")
      .then(r => r.json())
      .then((d: { username?: string; password?: string }) =>
        setForm(f => ({ username: f.username || d.username || "", password: f.password || d.password || "" })))
      .catch(() => {});
  }, []);
  // Set when the account has 2FA: the password step passed, a code is next.
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");

  function updateForm(key: "username" | "password", value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = challenge
      ? await fetch("/api/auth/login-2fa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ challenge, code }),
        })
      : await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
    const data = await res.json().catch(() => ({} as { error?: string; requires_2fa?: boolean; challenge?: string }));
    setLoading(false);

    if (!res.ok) {
      // Expired challenge → back to the password step.
      if (challenge && res.status === 401 && /истекла/.test(data.error ?? "")) { setChallenge(null); setCode(""); }
      setError(data.error ?? `Ошибка входа (${res.status})`);
      return;
    }
    if (data.requires_2fa && data.challenge) {
      setChallenge(data.challenge);
      return;
    }
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl shadow-sm border w-full max-w-md p-8">
        <h1 className="text-2xl font-bold mb-2">CRM Oracle</h1>
        <p className="text-sm text-gray-400 mb-6">
          {challenge ? "Введите 6-значный код из приложения-аутентификатора" : "Войдите в аккаунт"}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {challenge ? (
            <div className="flex flex-col gap-1">
              <label className="text-sm text-gray-600">Код подтверждения *</label>
              <input
                required
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]{6,7}"
                maxLength={7}
                className="border rounded-lg px-3 py-2 text-black text-lg tracking-[0.4em] text-center outline-none focus:ring-2 focus:ring-black/10"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <button type="button" onClick={() => { setChallenge(null); setCode(""); setError(null); }}
                      className="text-xs text-gray-400 hover:text-gray-700 self-start mt-1">
                ← Войти под другим пользователем
              </button>
            </div>
          ) : <>
            <div className="flex flex-col gap-1">
              <label className="text-sm text-gray-600">Логин *</label>
              <input
                required
                autoComplete="username"
                className="border rounded-lg px-3 py-2 text-black text-sm outline-none focus:ring-2 focus:ring-black/10"
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
          </>}

          {error && (
            <div className="px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-500">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 text-sm rounded-lg bg-black text-white hover:bg-gray-800 disabled:opacity-50 transition font-medium"
          >
            {loading ? "Загрузка..." : challenge ? "Подтвердить" : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}
