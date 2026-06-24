"use client";

import { useState } from "react";
import Layout from "@/components/Layout";
import TasksPage from "@/components/TasksPage";
import CalendarPage from "@/components/CalendarPage";

type View = "calendar" | "list";

export default function TasksRoute() {
  const [view, setView] = useState<View>("calendar");

  return (
    <Layout>
      <div className="flex flex-col h-full overflow-hidden">
        {/* View toggle bar */}
        <div className="flex items-center gap-1 px-4 py-2.5 bg-white border-b border-[#c8d3e8] shrink-0">
          <button
            onClick={() => setView("calendar")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition border
              ${view === "calendar"
                ? "bg-[#516895] text-white border-[#516895]"
                : "border-[#c8d3e8] text-gray-500 hover:bg-gray-50"}`}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd"/>
            </svg>
            Календарь
          </button>
          <button
            onClick={() => setView("list")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition border
              ${view === "list"
                ? "bg-[#516895] text-white border-[#516895]"
                : "border-[#c8d3e8] text-gray-500 hover:bg-gray-50"}`}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 5A.75.75 0 012.75 9h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 9.75zm0 5a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd"/>
            </svg>
            Список
          </button>
        </div>

        {/* Content */}
        {view === "calendar"
          ? <CalendarPage embedded />
          : <div className="flex-1 overflow-auto"><TasksPage /></div>
        }
      </div>
    </Layout>
  );
}
