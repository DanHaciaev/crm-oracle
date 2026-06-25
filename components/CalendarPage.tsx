"use client";

import { useEffect, useState, useRef } from "react";
import { useT } from "@/lib/locale";
import { toast } from "sonner";

interface CalTask {
  id: number;
  title: string;
  customer_name: string | null;
  assigned_to: string | null;
  due_date: string | null;
  priority: string;
  status: string;
}

const PRIORITY_CONFIG: Record<string, { dot: string; pill: string; label: string }> = {
  urgent: { dot: "bg-red-500",    pill: "bg-red-50 border-red-200 text-red-700",       label: "Срочно"  },
  high:   { dot: "bg-orange-400", pill: "bg-orange-50 border-orange-200 text-orange-700", label: "Высокий" },
  normal: { dot: "bg-[#516895]",  pill: "bg-blue-50 border-blue-200 text-blue-700",    label: "Обычный" },
  low:    { dot: "bg-gray-300",   pill: "bg-gray-50 border-gray-200 text-gray-500",    label: "Низкий"  },
};

const STATUS_CONFIG: Record<string, { badge: string; label: string }> = {
  open:        { badge: "bg-blue-50 text-blue-600 border-blue-200",       label: "Открыта"   },
  in_progress: { badge: "bg-violet-50 text-violet-600 border-violet-200", label: "В работе"  },
  done:        { badge: "bg-emerald-50 text-emerald-600 border-emerald-200", label: "Готово"  },
  cancelled:   { badge: "bg-gray-100 text-gray-400 border-gray-200",      label: "Отменена"  },
};

const WEEK_DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTH_NAMES = [
  "Январь","Февраль","Март","Апрель","Май","Июнь",
  "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь",
];

function taskPillClass(tk: CalTask) {
  if (tk.status === "done") return "bg-emerald-50 border-emerald-200 text-emerald-700";
  if (tk.status === "in_progress") return "bg-violet-50 border-violet-200 text-violet-700";
  return PRIORITY_CONFIG[tk.priority]?.pill ?? PRIORITY_CONFIG.normal.pill;
}

function taskDotClass(tk: CalTask) {
  if (tk.status === "done") return "bg-emerald-500";
  if (tk.status === "in_progress") return "bg-violet-500";
  return PRIORITY_CONFIG[tk.priority]?.dot ?? PRIORITY_CONFIG.normal.dot;
}

export default function CalendarPage({ embedded = false }: { embedded?: boolean }) {
  const t = useT();
  const today = new Date();

  const [year,   setYear]   = useState(today.getFullYear());
  const [month,  setMonth]  = useState(today.getMonth() + 1);
  const [tasks,  setTasks]  = useState<CalTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  // Create form
  const [showForm,  setShowForm]  = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formAssign, setFormAssign] = useState("");
  const [formPriority, setFormPriority] = useState("normal");
  const [formNotes, setFormNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);

  function loadTasks() {
    setLoading(true);
    fetch(`/api/calendar?year=${year}&month=${month}`)
      .then(r => r.json())
      .then((d: unknown) => { if (Array.isArray(d)) setTasks(d as CalTask[]); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadTasks(); }, [year, month]); // eslint-disable-line react-hooks/exhaustive-deps

  function prevMonth() {
    setSelected(null);
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    setSelected(null);
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }
  function goToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth() + 1);
    setSelected(null);
  }

  function selectDay(day: number) {
    const key = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    if (selected === key) { setSelected(null); setShowForm(false); return; }
    setSelected(key);
    setShowForm(false);
    setFormTitle(""); setFormAssign(""); setFormPriority("normal"); setFormNotes("");
  }

  function openForm() {
    setShowForm(true);
    setTimeout(() => titleRef.current?.focus(), 50);
  }

  async function createTask() {
    if (!formTitle.trim() || !selected) return;
    setSaving(true);
    try {
      const res = await fetch("/api/tasks", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:       formTitle.trim(),
          due_date:    selected,
          assigned_to: formAssign.trim() || null,
          priority:    formPriority,
          notes:       formNotes.trim() || null,
        }),
      });
      if (!res.ok) { toast.error("Ошибка создания задачи"); return; }
      toast.success("Задача создана");
      setShowForm(false);
      setFormTitle(""); setFormAssign(""); setFormPriority("normal"); setFormNotes("");
      loadTasks();
    } catch { toast.error("Ошибка"); }
    finally { setSaving(false); }
  }

  // Build grid
  const firstDow    = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  function dayTasks(day: number) {
    const key = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    return tasks.filter(tk => tk.due_date === key);
  }
  function isToday(day: number) {
    return day === today.getDate() && month === today.getMonth() + 1 && year === today.getFullYear();
  }

  const selectedTasks = selected ? tasks.filter(tk => tk.due_date === selected) : [];
  const selectedDayNum = selected ? parseInt(selected.split("-")[2], 10) : null;

  const totalOpen = tasks.filter(tk => tk.status !== "done" && tk.status !== "cancelled").length;
  const totalDone = tasks.filter(tk => tk.status === "done").length;

  const rootH = embedded ? "h-[calc(100vh-119px)]" : "h-[calc(100vh-65px)]";

  return (
    <div className={`flex ${rootH} overflow-hidden bg-[#F5F6FA]`}>

      {/* ── MAIN CALENDAR ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Top bar */}
        <div className="px-6 py-3.5 bg-white border-b border-[#c8d3e8] flex items-center gap-3 shrink-0">
          <h1 className="text-base font-bold text-gray-900">Календарь</h1>

          <div className="flex items-center gap-1 ml-4">
            <button onClick={goToday}
              className="px-3 py-1.5 text-sm rounded-lg border border-[#c8d3e8] text-gray-700 hover:bg-gray-50 transition font-medium">
              Сегодня
            </button>
            <button onClick={prevMonth}
              className="w-8 h-8 rounded-lg border border-[#c8d3e8] flex items-center justify-center text-gray-500 hover:bg-gray-50 transition ml-1">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M12.78 15.78a.75.75 0 01-1.06 0l-5.25-5.25a.75.75 0 010-1.06l5.25-5.25a.75.75 0 111.06 1.06L8.06 10l4.72 4.72a.75.75 0 010 1.06z" clipRule="evenodd"/>
              </svg>
            </button>
            <span className="text-sm font-semibold text-gray-800 min-w-37.5 text-center">
              {MONTH_NAMES[month - 1]}, {year}
            </span>
            <button onClick={nextMonth}
              className="w-8 h-8 rounded-lg border border-[#c8d3e8] flex items-center justify-center text-gray-500 hover:bg-gray-50 transition">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M7.22 15.78a.75.75 0 001.06 0l5.25-5.25a.75.75 0 000-1.06L8.28 4.22a.75.75 0 00-1.06 1.06L11.94 10l-4.72 4.72a.75.75 0 000 1.06z" clipRule="evenodd"/>
              </svg>
            </button>
          </div>

          <div className="ml-auto flex items-center gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#516895]"/>
              {totalOpen} открытых
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"/>
              {totalDone} выполнено
            </span>
          </div>
        </div>

        {/* Week headers */}
        <div className="grid grid-cols-7 bg-white border-b border-[#c8d3e8] shrink-0">
          {WEEK_DAYS.map((d, i) => (
            <div key={d} className={`py-2.5 text-center text-xs font-semibold uppercase tracking-wider
              ${i >= 5 ? "text-red-400" : "text-gray-400"}`}>
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="grid grid-cols-7">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="border-r border-b border-[#c8d3e8] min-h-27.5 bg-white animate-pulse"/>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7">
              {cells.map((day, idx) => {
                const isWknd   = idx % 7 >= 5;
                const todayFlg = day ? isToday(day) : false;
                const dateKey  = day ? `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}` : null;
                const isSel    = dateKey === selected;
                const dayList  = day ? dayTasks(day) : [];

                return (
                  <div
                    key={idx}
                    onClick={() => day && selectDay(day)}
                    className={`border-r border-b border-[#c8d3e8] min-h-27.5 p-1.5 transition-colors
                      ${!day ? "bg-[#F5F6FA]" : ""}
                      ${day && isWknd && !isSel ? "bg-gray-50/70" : ""}
                      ${day && !isSel && !isWknd ? "bg-white hover:bg-blue-50/30 cursor-pointer" : ""}
                      ${isSel ? "bg-[#516895]/5 ring-1 ring-inset ring-[#516895]/30 cursor-pointer" : ""}
                    `}
                  >
                    {day && (
                      <>
                        {/* Day number */}
                        <div className="flex items-center justify-between mb-1">
                          <span className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-semibold transition
                            ${todayFlg
                              ? "bg-[#516895] text-white shadow-sm"
                              : isWknd ? "text-red-400" : "text-gray-600"
                            }`}>
                            {day}
                          </span>
                          {dayList.length > 0 && (
                            <span className="text-[10px] text-gray-300 font-mono">{dayList.length}</span>
                          )}
                        </div>

                        {/* Task pills */}
                        <div className="space-y-0.5">
                          {dayList.slice(0, 3).map(tk => (
                            <div key={tk.id}
                              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium border truncate ${taskPillClass(tk)}`}
                              title={`${tk.title}${tk.customer_name ? ` — ${tk.customer_name}` : ""}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${taskDotClass(tk)}`}/>
                              <span className="truncate">{tk.title}</span>
                            </div>
                          ))}
                          {dayList.length > 3 && (
                            <div className="text-[10px] text-[#516895] font-medium px-1.5">
                              +{dayList.length - 3} ещё
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      {selected && selectedDayNum && (
        <>
        <div className="md:hidden fixed inset-0 bg-black/40 z-40" onClick={() => setSelected(null)} />
        <aside className="fixed inset-y-0 right-0 z-50 md:relative md:inset-auto md:z-auto w-full md:w-80 border-l border-[#c8d3e8] bg-white flex flex-col shrink-0 overflow-hidden">

          {/* Panel header */}
          <div className="px-4 pt-4 pb-3 border-b border-[#c8d3e8]">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-lg font-bold text-gray-900">
                  {selectedDayNum} {MONTH_NAMES[month - 1]}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {selectedTasks.length === 0
                    ? "Нет задач"
                    : `${selectedTasks.length} задач`}
                </div>
              </div>
              <button onClick={() => { setSelected(null); setShowForm(false); }}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-600 bg-gray-100 transition">
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"/>
                </svg>
              </button>
            </div>

            {/* Add task button */}
            {!showForm && (
              <button onClick={openForm}
                className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-xl border-2 border-dashed border-[#c8d3e8] text-sm text-[#516895] font-medium hover:border-[#516895] hover:bg-[#516895]/5 transition">
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z"/>
                </svg>
                Новая задача
              </button>
            )}
          </div>

          {/* Create form */}
          {showForm && (
            <div className="px-4 py-3 border-b border-[#c8d3e8] bg-[#F5F6FA] space-y-2.5">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Новая задача</div>

              <input
                ref={titleRef}
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                onKeyDown={e => e.key === "Enter" && createTask()}
                placeholder="Название задачи *"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#c8d3e8] bg-white outline-none focus:border-[#516895] transition placeholder:text-gray-300"
              />

              <input
                value={formAssign}
                onChange={e => setFormAssign(e.target.value)}
                placeholder="Исполнитель (необязательно)"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#c8d3e8] bg-white outline-none focus:border-[#516895] transition placeholder:text-gray-300"
              />

              <select
                value={formPriority}
                onChange={e => setFormPriority(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#c8d3e8] bg-white outline-none focus:border-[#516895] transition text-gray-700"
              >
                <option value="low">Низкий</option>
                <option value="normal">Обычный</option>
                <option value="high">Высокий</option>
                <option value="urgent">Срочно</option>
              </select>

              <textarea
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                placeholder="Заметки..."
                rows={2}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#c8d3e8] bg-white outline-none focus:border-[#516895] transition placeholder:text-gray-300 resize-none"
              />

              <div className="flex gap-2">
                <button
                  onClick={createTask}
                  disabled={saving || !formTitle.trim()}
                  className="flex-1 py-2 rounded-lg bg-[#516895] text-white text-sm font-semibold hover:bg-[#3f5278] disabled:opacity-50 transition"
                >
                  {saving ? "Сохранение..." : "Создать"}
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="px-3 py-2 rounded-lg border border-[#c8d3e8] text-sm text-gray-500 hover:bg-gray-50 transition"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}

          {/* Task list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {selectedTasks.length === 0 && !showForm ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-300 gap-2">
                <svg viewBox="0 0 48 48" fill="none" className="w-10 h-10 opacity-40">
                  <rect x="8" y="8" width="32" height="32" rx="6" stroke="currentColor" strokeWidth="2"/>
                  <path d="M16 24h16M16 30h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M20 18l2 2 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="text-sm">Нет задач на этот день</span>
              </div>
            ) : (
              selectedTasks.map(tk => {
                const pCfg = PRIORITY_CONFIG[tk.priority] ?? PRIORITY_CONFIG.normal;
                const sCfg = STATUS_CONFIG[tk.status] ?? STATUS_CONFIG.open;
                return (
                  <div key={tk.id}
                    className="rounded-xl border border-[#c8d3e8] bg-white p-3 hover:border-[#516895]/30 transition-colors">
                    <div className="flex items-start gap-2.5">
                      <span className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${pCfg.dot}`}/>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-semibold leading-snug ${
                          tk.status === "done" ? "line-through text-gray-400" : "text-gray-800"
                        }`}>
                          {tk.title}
                        </div>

                        {tk.customer_name && (
                          <div className="text-xs text-gray-400 mt-0.5 truncate">
                            🏢 {tk.customer_name}
                          </div>
                        )}
                        {tk.assigned_to && (
                          <div className="text-xs text-gray-400 mt-0.5">
                            👤 {tk.assigned_to}
                          </div>
                        )}

                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium border ${sCfg.badge}`}>
                            {sCfg.label}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium border ${pCfg.pill}`}>
                            {pCfg.label}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer link */}
          {selectedTasks.length > 0 && (
            <div className="p-3 border-t border-[#c8d3e8]">
              <a href="/tasks"
                className="block w-full text-center py-2 rounded-lg border border-[#c8d3e8] text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition">
                Все задачи →
              </a>
            </div>
          )}
        </aside>
        </>
      )}
    </div>
  );
}
