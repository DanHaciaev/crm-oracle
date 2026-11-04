"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Layout from "@/components/Layout";
import UsersTable from "@/components/UsersTable";
import RolesMatrix from "@/components/RolesMatrix";
import { LoginHistoryTable, type LoginRow } from "@/components/LoginHistoryTable";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/lib/locale";

export default function UsersPage() {
  const { user, loading } = useAuth();
  const router            = useRouter();
  const t                 = useT();
  const [tab, setTab]     = useState<"users" | "roles" | "logins">("users");

  useEffect(() => {
    if (loading) return;
    if (!user)               router.replace("/");
    else if (user.role !== "admin") router.replace("/dashboard");
  }, [user, loading, router]);

  if (loading || !user || user.role !== "admin") {
    return (
      <Layout>
        <div className="p-8 text-sm text-gray-400">Загрузка...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-4 sm:p-8">
        <h1 className="text-2xl font-bold mb-1">{t("roles.pageTitle")}</h1>
        <p className="text-sm text-gray-500 mb-4">{t("roles.pageSubtitle")}</p>
        <div className="flex gap-1 mb-5 border-b border-[#dde3ef]">
          {(["users", "roles", "logins"] as const).map(k => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
                tab === k ? "border-brand text-brand" : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {t(k === "users" ? "roles.tabUsers" : k === "roles" ? "roles.tabRoles" : "account.tabLogins")}
            </button>
          ))}
        </div>
        {tab === "users" ? <UsersTable currentUserId={user.id} /> : tab === "roles" ? <RolesMatrix /> : <LoginsTab />}
      </div>
    </Layout>
  );
}

// All users' sign-ins; "failed only" makes brute-force attempts easy to spot.
function LoginsTab() {
  const t = useT();
  const [rows, setRows] = useState<LoginRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch(`/api/users/logins${failed ? "?failed=1" : ""}`).then(r => r.json()).then(setRows).catch(() => setRows([]));
  }, [failed]);
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm text-gray-600">
        <input type="checkbox" checked={failed} onChange={e => setFailed(e.target.checked)} />{t("account.failedOnly")}
      </label>
      {rows ? <LoginHistoryTable rows={rows} showUser /> : <div className="text-sm text-gray-400">{t("common.loading")}</div>}
    </div>
  );
}
