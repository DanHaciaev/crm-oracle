"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { useT } from "@/lib/locale";
import { useAuth } from "@/hooks/useAuth";
import { can } from "@/lib/permissions";
import { useUrlParam } from "@/hooks/useUrlParam";
import { useFetch, useLang, type Options } from "./shared";
import { OverviewTab, RotationTab, ControlTab } from "./SummaryTabs";
import { BatchesTab, BatchSheet } from "./BatchesTab";
import { MovementsTab, CellsTab } from "./JournalTabs";
import { BarcodesTab } from "./BarcodesTab";

type Tab = "overview" | "batches" | "movements" | "cells" | "rotation" | "control" | "barcodes";
const TABS: Tab[] = ["overview", "batches", "movements", "cells", "rotation", "control", "barcodes"];

// Warehouse section: a read-only control panel over DIPP FRUICT's stock data.
// Kilograms only change in DIPP FRUICT; the CRM's two safe actions (block /
// unblock a batch, acknowledge an alert) need "edit" on this section.
export default function WarehousePage() {
  const t = useT();
  const lang = useLang();
  const { user } = useAuth();
  const canEdit = can(user?.permissions, "warehouse", "edit");
  const [tab, setTab] = useState<Tab>("overview");
  const [batchFilter, setBatchFilter] = useState<Record<string, string>>({});
  const [batchKey, setBatchKey] = useState(0);      // remounts BatchesTab with new initial filters
  const [reloadKey, setReloadKey] = useState(0);    // refetch list after block/unblock
  const [openBatch, setOpenBatch] = useState<number | null>(null);
  const { data: options } = useFetch<Options>(`/api/warehouse/options?lang=${lang}`);
  // Global search links here with ?batch=<id> to open that batch's card.
  useUrlParam("batch", v => { if (Number(v) > 0) setOpenBatch(Number(v)); });

  function openBatches(f: Record<string, string>) {
    setBatchFilter(f); setBatchKey(k => k + 1); setTab("batches");
  }

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">{t("warehouse.title")}</h1>
        <p className="text-sm text-gray-500 mt-1 flex items-start gap-1.5"><Info className="w-4 h-4 mt-0.5 shrink-0" />{t("warehouse.subtitle")}</p>
      </div>

      <div className="flex gap-1 mb-5 overflow-x-auto border-b border-[#dde3ef]">
        {TABS.map(k => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition ${
              tab === k ? "border-brand text-brand" : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {t(`warehouse.tab_${k}`)}
          </button>
        ))}
      </div>

      {tab === "overview"  && <OverviewTab lang={lang} onOpenBatches={openBatches} />}
      {tab === "batches"   && <BatchesTab key={batchKey} lang={lang} options={options} initial={batchFilter} onOpenBatch={setOpenBatch} reloadKey={reloadKey} />}
      {tab === "movements" && <MovementsTab lang={lang} options={options} onOpenBatch={setOpenBatch} />}
      {tab === "cells"     && <CellsTab canEdit={canEdit} />}
      {tab === "rotation"  && <RotationTab lang={lang} />}
      {tab === "control"   && <ControlTab lang={lang} onOpenBatch={setOpenBatch} />}
      {tab === "barcodes"  && <BarcodesTab lang={lang} onOpenBatch={setOpenBatch} />}

      <BatchSheet id={openBatch} lang={lang} canEdit={canEdit} onClose={() => setOpenBatch(null)} onChanged={() => setReloadKey(k => k + 1)} />
    </div>
  );
}
