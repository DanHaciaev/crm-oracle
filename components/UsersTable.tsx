/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useT, useLocale } from "@/lib/locale";

interface User {
  id: number;
  username: string;
  first_name: string | null;
  last_name: string | null;
  role: "admin" | "manager";
  active: boolean;
  created_at: string;
}

type Role = "admin" | "manager";

const EMPTY_FORM = {
  username: "",
  password: "",
  first_name: "",
  last_name: "",
  role: "manager" as Role,
};

type CreateForm = typeof EMPTY_FORM;

type EditForm = {
  first_name: string;
  last_name: string;
  role: Role;
  password: string;
};

// ─── Create Modal ────────────────────────────────────────────────────────────

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const t = useT();
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!form.username || !form.password) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? t("common.error")); return; }
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-semibold">{t("users.newUser")}</h2>
        <div className="space-y-3">
          {[
            { key: "first_name", label: t("users.firstName"),    placeholder: "Ivan" },
            { key: "last_name",  label: t("users.lastName"),     placeholder: "Ivanov" },
            { key: "username",   label: `${t("common.username")} *`, placeholder: "ivan" },
            { key: "password",   label: `${t("common.password")} *`, placeholder: t("users.passwordMin"), type: "password" },
          ].map(({ key, label, placeholder, type }) => (
            <div key={key} className="flex flex-col gap-1">
              <label className="text-sm text-gray-600">{label}</label>
              <input
                type={type ?? "text"}
                className="border rounded-lg px-3 py-2 text-sm text-black outline-none focus:ring-2 focus:ring-black/10"
                placeholder={placeholder}
                value={form[key as keyof CreateForm] as string}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-600">{t("common.role")}</label>
            <select
              className="border rounded-lg px-3 py-2 text-sm text-black outline-none focus:ring-2 focus:ring-black/10 bg-white"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
            >
              <option value="manager">{t("common.manager")}</option>
              <option value="admin">{t("common.admin")}</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-500">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50 transition">{t("common.cancel")}</button>
          <button
            onClick={handleSubmit}
            disabled={saving || !form.username || !form.password}
            className="px-4 py-2 text-sm rounded-lg bg-black text-white hover:bg-gray-800 disabled:opacity-50 transition"
          >
            {saving ? t("users.creating") : t("common.create")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

function EditModal({ user, onClose, onSaved }: { user: User; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const [form, setForm] = useState<EditForm>({
    first_name: user.first_name ?? "",
    last_name: user.last_name ?? "",
    role: user.role,
    password: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    const body: Record<string, unknown> = {
      id: user.id,
      first_name: form.first_name,
      last_name: form.last_name,
      role: form.role,
    };
    if (form.password) body.password = form.password;

    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError((data as { error?: string }).error ?? t("common.error"));
      return;
    }

    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{t("users.editTitle")}</h2>
          <p className="text-sm text-gray-400 mt-0.5">{user.username}</p>
        </div>

        <div className="space-y-3">
          {[
            { key: "first_name", label: t("users.firstName"), placeholder: "Ivan" },
            { key: "last_name",  label: t("users.lastName"),  placeholder: "Ivanov" },
          ].map(({ key, label, placeholder }) => (
            <div key={key} className="flex flex-col gap-1">
              <label className="text-sm text-gray-600">{label}</label>
              <input
                type="text"
                className="border rounded-lg px-3 py-2 text-sm text-black outline-none focus:ring-2 focus:ring-black/10"
                placeholder={placeholder}
                value={form[key as keyof EditForm] as string}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}

          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-600">{t("common.role")}</label>
            <select
              className="border rounded-lg px-3 py-2 text-sm text-black outline-none focus:ring-2 focus:ring-black/10 bg-white"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
            >
              <option value="manager">{t("common.manager")}</option>
              <option value="admin">{t("common.admin")}</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-600">
              {t("users.newPassword")}{" "}
              <span className="text-gray-400">{t("users.leaveEmptyToKeep")}</span>
            </label>
            <input
              type="password"
              className="border rounded-lg px-3 py-2 text-sm text-black outline-none focus:ring-2 focus:ring-black/10"
              placeholder="••••••"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
          </div>
        </div>

        {error && (
          <div className="px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-500">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50 transition">
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 text-sm rounded-lg bg-black text-white hover:bg-gray-800 disabled:opacity-50 transition"
          >
            {saving ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Confirm Delete Modal ─────────────────────────────────────────────────────

function ConfirmModal({ name, onClose, onConfirm, loading }: {
  name: string; onClose: () => void; onConfirm: () => void; loading: boolean;
}) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold">{t("users.deleteConfirm")}</h2>
        <p className="text-sm text-gray-500">
          {name}? {t("users.deleteConfirmMsg")}
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50 transition">{t("common.cancel")}</button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition"
          >
            {loading ? t("customers.deleting") : t("common.delete")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Role Badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${role === "admin" ? "bg-black text-white" : "bg-gray-100 text-gray-600"}`}>
      {role}
    </span>
  );
}

// ─── Main Table ───────────────────────────────────────────────────────────────

export default function UsersTable({ currentUserId }: { currentUserId: number }) {
  const t = useT();
  const { locale } = useLocale();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/users");
    const data = await res.json();
    if (!res.ok) setError(data.error ?? t("common.error"));
    else setUsers(data);
    setLoading(false);
  }, [t]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await fetch("/api/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: deleteTarget.id }),
    });
    setDeleting(false);
    if (!res.ok) { alert(t("customers.deleteError")); return; }
    setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
    setDeleteTarget(null);
  }

  const loc = locale === "ru" ? "ru-RU" : locale === "ro" ? "ro-RO" : "en-GB";

  if (loading) return <div className="mt-5 text-sm text-gray-400">{t("common.loading")}</div>;
  if (error) return <div className="mt-5 text-sm text-red-500">{t("common.error")}: {error}</div>;

  return (
    <>
      <div className="flex justify-end mt-2">
        <button
          onClick={() => setCreateOpen(true)}
          className="px-4 py-2 text-sm rounded-lg bg-black text-white hover:bg-gray-800 transition"
        >
          + {t("users.addUser")}
        </button>
      </div>

      <div className="w-full overflow-auto mt-3 border rounded-xl">
        <Table>
          <TableHeader className="sticky top-0 z-20 bg-white">
            <TableRow>
              <TableHead className="text-center">{t("users.firstName")}</TableHead>
              <TableHead className="text-center">{t("users.lastName")}</TableHead>
              <TableHead className="text-center">{t("common.username")}</TableHead>
              <TableHead className="text-center">{t("common.role")}</TableHead>
              <TableHead className="text-center">{t("common.createdAt")}</TableHead>
              <TableHead className="text-center">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-gray-400">{t("users.noUsers")}</TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="text-center font-medium">{u.first_name || "—"}</TableCell>
                  <TableCell className="text-center">{u.last_name || "—"}</TableCell>
                  <TableCell className="text-center">{u.username}</TableCell>
                  <TableCell className="text-center"><RoleBadge role={u.role} /></TableCell>
                  <TableCell className="text-center">
                    {new Date(u.created_at).toLocaleDateString(loc)}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => setEditTarget(u)}
                        className="px-3 py-1 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 transition"
                      >
                        {t("users.changing")}
                      </button>
                      <button
                        onClick={() => setDeleteTarget(u)}
                        disabled={u.id === currentUserId}
                        title={u.id === currentUserId ? t("users.cannotDeleteSelf") : ""}
                        className="px-3 py-1 text-xs rounded-md border border-gray-300 text-red-500 hover:bg-red-50 disabled:opacity-40 disabled:hover:bg-transparent transition"
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {createOpen && <CreateModal onClose={() => setCreateOpen(false)} onCreated={fetchUsers} />}

      {editTarget && (
        <EditModal
          user={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={fetchUsers}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          name={[deleteTarget.first_name, deleteTarget.last_name].filter(Boolean).join(" ") || deleteTarget.username}
          loading={deleting}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}
    </>
  );
}
