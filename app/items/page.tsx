"use client";

import { useState } from "react";
import Layout from "@/components/Layout";
import ItemsTable from "@/components/ItemsTable";
import AnalyticsPage from "@/components/AnalyticsPage";

export default function ItemsPage() {
  const [view, setView] = useState<"list" | "analytics">("list");

  return (
    <Layout>
      <div>
        <div className="flex gap-1 px-4 sm:px-8 pt-5 pb-0 bg-white border-b border-[#c8d3e8]">
          <button
            onClick={() => setView("list")}
            className={`px-4 py-2.5 text-sm border-b-2 transition -mb-px ${
              view === "list"
                ? "border-brand text-brand font-medium"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Товары
          </button>
          <button
            onClick={() => setView("analytics")}
            className={`px-4 py-2.5 text-sm border-b-2 transition -mb-px ${
              view === "analytics"
                ? "border-brand text-brand font-medium"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Аналитика
          </button>
        </div>
        {view === "list" ? <ItemsTable hideHeader /> : <AnalyticsPage hideHeader />}
      </div>
    </Layout>
  );
}
