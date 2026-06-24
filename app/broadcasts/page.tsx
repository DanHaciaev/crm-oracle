"use client";

import { Suspense, useState } from "react";
import Layout from "@/components/Layout";
import BroadcastPage from "@/components/BroadcastPage";
import AutomationsPage from "@/components/AutomationsPage";

type View = "broadcasts" | "automations";

export default function BroadcastsRoute() {
  const [view, setView] = useState<View>("broadcasts");

  return (
    <Layout>
      <div className="flex flex-col h-full">
        {/* Toggle bar */}
        <div className="flex items-center gap-1 px-4 py-2.5 bg-white border-b border-[#c8d3e8] shrink-0">
          <button
            onClick={() => setView("broadcasts")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition border
              ${view === "broadcasts"
                ? "bg-[#516895] text-white border-[#516895]"
                : "border-[#c8d3e8] text-gray-500 hover:bg-gray-50"}`}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M3.5 2A1.5 1.5 0 002 3.5V5c0 1.149.15 2.263.43 3.326a13.022 13.022 0 009.244 9.244c1.063.28 2.177.43 3.326.43h1.5a1.5 1.5 0 001.5-1.5v-1.148a1.5 1.5 0 00-1.175-1.465l-3.223-.716a1.5 1.5 0 00-1.767 1.052l-.267.933c-.117.41-.555.643-.95.48a11.542 11.542 0 01-6.254-6.254c-.163-.395.07-.833.48-.95l.933-.267a1.5 1.5 0 001.052-1.767l-.716-3.223A1.5 1.5 0 004.648 2H3.5z"/>
            </svg>
            Рассылки
          </button>
          <button
            onClick={() => setView("automations")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition border
              ${view === "automations"
                ? "bg-[#516895] text-white border-[#516895]"
                : "border-[#c8d3e8] text-gray-500 hover:bg-gray-50"}`}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M11.983 1.907a.75.75 0 00-1.292-.657l-8.5 9.5A.75.75 0 002.75 12h6.572l-1.305 6.093a.75.75 0 001.292.657l8.5-9.5A.75.75 0 0017.25 8h-6.572l1.305-6.093z" clipRule="evenodd"/>
            </svg>
            Автоматизация
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {view === "broadcasts"
            ? <Suspense><BroadcastPage /></Suspense>
            : <AutomationsPage />
          }
        </div>
      </div>
    </Layout>
  );
}
