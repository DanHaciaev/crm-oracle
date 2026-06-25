"use client";

import { useState, useEffect } from "react";

export default function CapturePage() {
  const [form, setForm]       = useState({ name: "", phone: "", email: "", company: "", notes: "" });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    window.history.pushState(null, "", window.location.href);
    const block = () => window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", block);
    return () => window.removeEventListener("popstate", block);
  }, []);
  const [done, setDone]       = useState(false);
  const [error, setError]     = useState<string | null>(null);

  function set(k: keyof typeof form, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSending(true); setError(null);
    try {
      const res = await fetch("/api/leads/public", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(form),
      });
      if (res.ok) setDone(true);
      else {
        const j = await res.json().catch(() => ({})) as { error?: string };
        setError(j.error ?? "Ошибка отправки");
      }
    } catch {
      setError("Ошибка сети");
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-[#f5f6fa] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-[#c8d3e8] p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-3xl mx-auto mb-4">✓</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Заявка отправлена!</h2>
          <p className="text-gray-500 text-sm">Мы свяжемся с вами в ближайшее время.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f6fa] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-[#c8d3e8] w-full max-w-md">
        <div className="px-8 pt-8 pb-4 border-b border-gray-100">
          <h1 className="text-2xl font-bold text-gray-900">Оставить заявку</h1>
          <p className="text-sm text-gray-400 mt-1">Мы свяжемся с вами в течение рабочего дня</p>
        </div>

        <form onSubmit={submit} className="px-8 py-6 space-y-4">
          <div>
            <label className="text-sm text-gray-500 block mb-1">Имя *</label>
            <input
              required
              value={form.name}
              onChange={e => set("name", e.target.value)}
              placeholder="Иван Иванов"
              className="w-full border border-[#c8d3e8] rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#516895] transition"
            />
          </div>
          <div>
            <label className="text-sm text-gray-500 block mb-1">Компания</label>
            <input
              value={form.company}
              onChange={e => set("company", e.target.value)}
              placeholder="ООО Пример"
              className="w-full border border-[#c8d3e8] rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#516895] transition"
            />
          </div>
          <div>
            <label className="text-sm text-gray-500 block mb-1">Телефон</label>
            <input
              type="tel"
              value={form.phone}
              onChange={e => set("phone", e.target.value)}
              placeholder="+373 69 000 000"
              className="w-full border border-[#c8d3e8] rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#516895] transition"
            />
          </div>
          <div>
            <label className="text-sm text-gray-500 block mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => set("email", e.target.value)}
              placeholder="ivan@example.com"
              className="w-full border border-[#c8d3e8] rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#516895] transition"
            />
          </div>
          <div>
            <label className="text-sm text-gray-500 block mb-1">Сообщение</label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
              placeholder="Расскажите о вашем запросе..."
              className="w-full border border-[#c8d3e8] rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#516895] transition resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={sending || !form.name.trim()}
            className="w-full py-3 rounded-xl bg-[#516895] text-white font-medium text-sm hover:bg-[#3d5070] disabled:opacity-50 transition"
          >
            {sending ? "Отправка..." : "Отправить заявку"}
          </button>
        </form>
      </div>
    </div>
  );
}
