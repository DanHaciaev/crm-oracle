"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useT } from "@/lib/locale";
import {
  CONFIGURABLE_ROLES, MODULE_GROUPS,
  type Access, type ConfigurableRole, type Module, type PermissionMap,
} from "@/lib/permissions";

interface Data {
  viewOnly: Module[];
  roles: Record<ConfigurableRole, PermissionMap>;
  defaults: Record<ConfigurableRole, PermissionMap>;
}

const LEVELS: Access[] = ["none", "view", "edit"];

const LEVEL_CLS: Record<Access, string> = {
  none: "bg-gray-100 text-gray-500 border-gray-200",
  view: "bg-blue-50 text-blue-700 border-blue-200",
  edit: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

// Per-role access matrix (Users > Roles). Admin is a fixed superuser and
// isn't listed. Each role is saved as a whole row; a cell that differs from
// the built-in default gets a dot so the admin sees what was customised.
export default function RolesMatrix() {
  const t = useT();
  const [data, setData]     = useState<Data | null>(null);
  const [draft, setDraft]   = useState<Record<ConfigurableRole, PermissionMap> | null>(null);
  const [saving, setSaving] = useState<ConfigurableRole | null>(null);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/roles")
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: Data) => { setData(d); setDraft(structuredClone(d.roles)); })
      .catch(() => setError(t("common.error")));
  }, [t]);

  if (error) return <div className="text-sm text-red-600">{error}</div>;
  if (!data || !draft) return <div className="text-sm text-gray-400">{t("common.loading")}</div>;

  const dirty = (r: ConfigurableRole) => JSON.stringify(draft[r]) !== JSON.stringify(data.roles[r]);

  function set(role: ConfigurableRole, m: Module, level: Access) {
    setDraft(d => d && { ...d, [role]: { ...d[role], [m]: level } });
  }

  async function save(role: ConfigurableRole) {
    setSaving(role);
    const res = await fetch("/api/roles", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, permissions: draft![role] }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(null);
    if (!res.ok) { toast.error(json.error ?? t("common.error")); return; }
    setData(d => d && { ...d, roles: { ...d.roles, [role]: json.permissions } });
    setDraft(d => d && { ...d, [role]: json.permissions });
    toast.success(t("roles.saved"));
  }

  function resetToDefault(role: ConfigurableRole) {
    setDraft(d => d && { ...d, [role]: { ...data!.defaults[role] } });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">{t("roles.hint")}</p>

      <div className="border border-[#c8d3e8] rounded-xl overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-gray-600">{t("roles.section")}</th>
              {CONFIGURABLE_ROLES.map(r => (
                <th key={r} className="px-3 py-2.5 font-medium text-gray-700 text-center min-w-[11rem]">{t(`roles.${r}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MODULE_GROUPS.map(g => (
              <GroupRows key={g.key} groupKey={g.key} modules={[...g.modules]}>
                {(m: Module) => CONFIGURABLE_ROLES.map(r => {
                  const levels = data.viewOnly.includes(m) ? LEVELS.filter(l => l !== "edit") : LEVELS;
                  const changed = draft[r][m] !== data.defaults[r][m];
                  return (
                    <td key={r} className="px-3 py-1.5 text-center">
                      <div className="inline-flex items-center gap-1">
                        {levels.map(l => (
                          <button
                            key={l}
                            type="button"
                            onClick={() => set(r, m, l)}
                            className={`px-2 py-0.5 rounded-md border text-xs transition ${
                              draft[r][m] === l ? LEVEL_CLS[l] + " font-semibold" : "border-transparent text-gray-400 hover:text-gray-700"
                            }`}
                          >
                            {t(`roles.level_${l}`)}
                          </button>
                        ))}
                        <span className={`w-1.5 h-1.5 rounded-full ${changed ? "bg-amber-500" : "bg-transparent"}`} title={changed ? t("roles.changed") : undefined} />
                      </div>
                    </td>
                  );
                })}
              </GroupRows>
            ))}
          </tbody>
          <tfoot className="bg-gray-50">
            <tr>
              <td className="px-4 py-2.5 text-xs text-gray-400">{t("roles.adminNote")}</td>
              {CONFIGURABLE_ROLES.map(r => (
                <td key={r} className="px-3 py-2.5 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <button
                      onClick={() => save(r)}
                      disabled={!dirty(r) || saving === r}
                      className="px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-medium disabled:opacity-40 transition"
                    >
                      {saving === r ? t("common.saving") : t("common.save")}
                    </button>
                    <button onClick={() => resetToDefault(r)} className="text-[11px] text-gray-400 hover:text-gray-700">
                      {t("roles.reset")}
                    </button>
                  </div>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function GroupRows({ groupKey, modules, children }: {
  groupKey: string; modules: Module[]; children: (m: Module) => React.ReactNode;
}) {
  const t = useT();
  return (
    <>
      <tr className="border-t border-[#dde3ef]">
        <td colSpan={4} className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-widest text-gray-400 font-semibold">
          {t(`roles.group_${groupKey}`)}
        </td>
      </tr>
      {modules.map(m => (
        <tr key={m} className="hover:bg-gray-50/60">
          <td className="px-4 py-1.5 text-gray-700">{t(`roles.module_${m.replace(/-/g, "_")}`)}</td>
          {children(m)}
        </tr>
      ))}
    </>
  );
}
