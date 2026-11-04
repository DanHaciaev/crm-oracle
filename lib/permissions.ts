// Role/permission model — client-safe (no DB import), shared by the sidebar,
// the page guard in Layout and the API guard in proxy.ts.
//
// Roles are exactly what AGRO_USERS.ROLE allows (the table is shared with
// DIPP FRUICT, so no new roles are invented here). "admin" is a hardcoded
// superuser — full access always, never configurable — so a bad permission
// edit can never lock the admin out of the CRM. The other three get a level
// per sidebar section: DEFAULTS below, overridden by whatever the admin saved
// in AGRO_CRM_ROLE_PERMISSIONS (Users > Roles).

export type Role   = "admin" | "manager" | "operator" | "viewer";
export type Access = "none" | "view" | "edit";
export const ROLES: Role[] = ["admin", "manager", "operator", "viewer"];
export const CONFIGURABLE_ROLES = ["manager", "operator", "viewer"] as const;
export type ConfigurableRole = (typeof CONFIGURABLE_ROLES)[number];

// One module per sidebar item, grouped the same way as the sidebar.
export const MODULE_GROUPS = [
  { key: "sales",     modules: ["customers", "leads", "sales", "returns", "payments", "client-viewer", "loyalty"] },
  { key: "supply",    modules: ["warehouse", "suppliers", "purchases", "weight-tickets", "custody", "items", "directories"] },
  { key: "docs",      modules: ["documents", "reports", "rates", "profitability"] },
  { key: "analytics", modules: ["segments", "churn", "duplicates"] },
  { key: "comms",     modules: ["staff-chat", "inbox", "email", "broadcasts"] },
  { key: "work",      modules: ["tasks", "calendar"] },
  { key: "admin",     modules: ["managers", "users", "audit-log", "settings"] },
] as const;

export type Module = (typeof MODULE_GROUPS)[number]["modules"][number];
export const MODULES: Module[] = MODULE_GROUPS.flatMap(g => [...g.modules]);
// Read-only by nature — the matrix offers only none/view for them.
export const VIEW_ONLY_MODULES: Module[] = ["client-viewer", "returns", "rates", "documents", "reports", "profitability", "churn", "segments", "audit-log"];

export type PermissionMap = Record<Module, Access>;

function fill(level: Access, overrides: Partial<PermissionMap>): PermissionMap {
  return Object.fromEntries(MODULES.map(m => [m, overrides[m] ?? level])) as PermissionMap;
}

const ADMIN_ONLY: Partial<PermissionMap> = { managers: "none", users: "none", "audit-log": "none", settings: "none", profitability: "none" };

export const DEFAULTS: Record<ConfigurableRole, PermissionMap> = {
  // Sales side: works with clients, leads, orders; sees purchasing/stock.
  manager: fill("edit", {
    ...ADMIN_ONLY,
    "client-viewer": "view", returns: "view", payments: "view", rates: "view", directories: "view", warehouse: "view", suppliers: "view", purchases: "view", "weight-tickets": "view",
    custody: "view", items: "view", documents: "view", reports: "view", segments: "view", churn: "view",
  }),
  // Warehouse side: purchases, weighing, storage, stock; sees sales.
  operator: fill("none", {
    customers: "view", sales: "view", returns: "view", rates: "view", directories: "view", "client-viewer": "view",
    warehouse: "edit", suppliers: "edit", purchases: "edit", "weight-tickets": "edit", custody: "edit", items: "edit",
    documents: "view", reports: "view", "staff-chat": "edit", tasks: "edit", calendar: "edit",
  }),
  // Read-only everywhere except the admin section.
  viewer: fill("view", ADMIN_ONLY),
};

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as string[]).includes(v);
}

export function resolvePermissions(role: Role, overrides: Partial<Record<string, string>> = {}): PermissionMap {
  if (role === "admin") return fill("edit", {});
  const base = DEFAULTS[role];
  const out = { ...base };
  for (const m of MODULES) {
    const v = overrides[m];
    if (v === "none" || v === "view" || v === "edit") out[m] = v;
    if (VIEW_ONLY_MODULES.includes(m) && out[m] === "edit") out[m] = "view";
  }
  return out;
}

const RANK: Record<Access, number> = { none: 0, view: 1, edit: 2 };

export function can(perms: PermissionMap | null | undefined, module: Module, level: "view" | "edit" = "view") {
  if (!perms) return false;
  return RANK[perms[module] ?? "none"] >= RANK[level];
}

// ── Pages ────────────────────────────────────────────────────────────────
// Path prefix → module. Pages not listed (dashboard, print pages opened
// from an allowed section…) are open to every signed-in user.
const PAGE_MODULES: [string, Module][] = [
  ["/customers", "customers"], ["/leads", "leads"], ["/sales", "sales"], ["/returns", "returns"], ["/receivables", "payments"],
  ["/client-viewer", "client-viewer"], ["/loyalty", "loyalty"],
  ["/warehouse", "warehouse"], ["/directories", "directories"], ["/suppliers", "suppliers"], ["/purchases", "purchases"], ["/weight-tickets", "weight-tickets"],
  ["/acts", "weight-tickets"], ["/custody", "custody"], ["/items", "items"], ["/analytics", "items"],
  ["/documents", "documents"], ["/reports", "reports"], ["/rates", "rates"], ["/profitability", "profitability"],
  ["/segments", "segments"], ["/churn", "churn"], ["/duplicates", "duplicates"],
  ["/staff-chat", "staff-chat"], ["/inbox", "inbox"], ["/app-users", "inbox"], ["/email", "email"],
  ["/broadcasts", "broadcasts"], ["/automations", "broadcasts"],
  ["/tasks", "tasks"], ["/calendar", "calendar"],
  ["/managers", "managers"], ["/users", "users"], ["/audit-log", "audit-log"], ["/settings", "settings"],
];

export function pageModule(pathname: string): Module | null {
  for (const [prefix, m] of PAGE_MODULES) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return m;
  }
  return null;
}

// ── API ──────────────────────────────────────────────────────────────────
// First matching prefix wins (more specific first). `read` = modules any of
// which allows GET (several pages read each other's data — the client viewer
// reads sales, tasks/loyalty read the customer list…); `write` = modules
// whose edit level allows POST/PUT/PATCH/DELETE. "any" = every signed-in user.
type ApiRule = { prefix: string; read: Module[] | "any"; write: Module[] | "any" | "read" };

const CUSTOMER_READERS: Module[] = ["customers", "client-viewer", "loyalty", "segments", "churn", "duplicates", "leads", "sales", "tasks", "calendar", "inbox"];

export const API_RULES: ApiRule[] = [
  // Writes through these are read-like (mark as read / AI analysis of data the user can see).
  { prefix: "/api/notifications",        read: "any", write: "any" },
  { prefix: "/api/ai/models",            read: "any", write: "any" },
  { prefix: "/api/ai/customer",          read: ["customers", "client-viewer"], write: "read" },
  { prefix: "/api/ai/broadcast",         read: ["broadcasts"], write: "read" },
  { prefix: "/api/ai/email",             read: ["email"],      write: "read" },
  { prefix: "/api/ai/sentiment",         read: ["inbox"],      write: "read" },
  { prefix: "/api/email/mark-read",      read: ["email"],      write: "read" },

  // Dashboard widgets — dashboard is open to everyone.
  { prefix: "/api/dashboard",            read: "any", write: [] },
  { prefix: "/api/forecast",             read: "any", write: [] },
  { prefix: "/api/recommendations",      read: "any", write: [] },
  { prefix: "/api/leads/winloss",        read: "any", write: [] },
  { prefix: "/api/manager-stats",        read: "any", write: ["managers"] },
  { prefix: "/api/manager-targets",      read: "any", write: ["managers"] },

  // Reference lists used in forms all over the CRM.
  { prefix: "/api/users",                read: "any", write: ["users"] },
  { prefix: "/api/items",                read: "any", write: ["items"] },
  { prefix: "/api/analytics",            read: ["items"], write: [] },

  { prefix: "/api/customers/segments",   read: ["segments", "customers"], write: ["segments"] },
  { prefix: "/api/customers",            read: CUSTOMER_READERS, write: ["customers"] },
  { prefix: "/api/activities",           read: ["customers", "client-viewer", "sales", "leads"], write: ["customers", "sales", "leads"] },
  { prefix: "/api/attachments",          read: ["customers", "client-viewer", "sales", "leads"], write: ["customers", "sales", "leads"] },
  { prefix: "/api/nps",                  read: ["customers", "client-viewer"], write: ["customers"] },
  { prefix: "/api/loyalty",              read: ["loyalty", "customers", "client-viewer"], write: ["loyalty"] },
  { prefix: "/api/client-viewer",        read: ["client-viewer"], write: [] },
  { prefix: "/api/leads",                read: ["leads"], write: ["leads"] },
  { prefix: "/api/pipelines",            read: ["leads"], write: ["leads"] },
  { prefix: "/api/import",               read: ["customers", "leads", "payments"], write: ["customers", "leads", "payments"] },
  { prefix: "/api/receivables",          read: ["payments"], write: ["payments"] },
  { prefix: "/api/payments",             read: ["payments"], write: ["payments"] },
  { prefix: "/api/reports/receivables",  read: ["payments"], write: [] },
  { prefix: "/api/reports/payments",     read: ["payments"], write: [] },
  { prefix: "/api/documents/reconciliation_act", read: ["payments"], write: [] },
  { prefix: "/api/returns",              read: ["returns", "sales"], write: [] },
  { prefix: "/api/reports/returns",      read: ["returns", "sales"], write: [] },
  { prefix: "/api/sales",                read: ["sales", "client-viewer", "customers", "documents"], write: ["sales"] },
  { prefix: "/api/churn",                read: ["churn"], write: ["churn"] },
  { prefix: "/api/duplicates",           read: ["duplicates"], write: ["duplicates"] },

  { prefix: "/api/directories",          read: ["directories"], write: ["directories"] },
  { prefix: "/api/warehouse",            read: ["warehouse"], write: ["warehouse"] },
  { prefix: "/api/suppliers",            read: ["suppliers", "purchases"], write: ["suppliers"] },
  { prefix: "/api/purchases",            read: ["purchases", "suppliers", "documents"], write: ["purchases"] },
  { prefix: "/api/weight-tickets",       read: ["weight-tickets", "purchases"], write: ["weight-tickets"] },
  { prefix: "/api/custody",              read: ["custody", "documents"], write: ["custody"] },
  { prefix: "/api/documents/return_act", read: ["returns", "sales", "documents"], write: [] },
  { prefix: "/api/documents",            read: ["documents"], write: [] },
  // Profitability export lives under /api/reports but needs its own grant (purchase costs).
  { prefix: "/api/reports/profitability", read: ["profitability"], write: [] },
  { prefix: "/api/profitability",        read: ["profitability"], write: [] },
  { prefix: "/api/reports",              read: ["reports"], write: [] },

  { prefix: "/api/staff-chat",           read: ["staff-chat"], write: ["staff-chat"] },
  { prefix: "/api/chat",                 read: ["inbox"], write: ["inbox"] },
  { prefix: "/api/app-users",            read: ["inbox", "customers"], write: ["inbox", "customers"] },
  { prefix: "/api/email",                read: ["email"], write: ["email"] },
  { prefix: "/api/broadcasts",           read: ["broadcasts"], write: ["broadcasts"] },
  { prefix: "/api/automations",          read: ["broadcasts"], write: ["broadcasts"] },

  { prefix: "/api/tasks",                read: ["tasks", "calendar", "customers"], write: ["tasks", "calendar"] },
  { prefix: "/api/calendar",             read: ["calendar", "tasks"], write: ["calendar"] },

  // Global search — the route itself only searches sections the role can see.
  { prefix: "/api/search",               read: "any", write: [] },
  // Own account (password, 2FA, own sign-ins) — every signed-in user.
  { prefix: "/api/account",              read: "any", write: "any" },
  { prefix: "/api/rates",                read: "any", write: ["settings"] },
  { prefix: "/api/settings",             read: "any", write: ["settings"] },
  { prefix: "/api/audit-log",            read: ["audit-log"], write: [] },
  { prefix: "/api/roles",                read: ["users"], write: ["users"] }, // the route itself further limits writes to admin
];

// Not checked by the proxy: sign-in and the public lead form. Cron jobs
// (/api/cron/*) are handled separately in proxy.ts (x-cron-secret or a user).
export const PUBLIC_API = ["/api/auth/login", "/api/auth/login-2fa", "/api/auth/login-defaults", "/api/auth/logout", "/api/leads/public"];

export function apiAllowed(perms: PermissionMap, path: string, method: string): boolean | null {
  const rule = API_RULES.find(r => path === r.prefix || path.startsWith(r.prefix + "/"));
  if (!rule) return null;
  const any = (mods: Module[] | "any", level: "view" | "edit") =>
    mods === "any" || mods.some(m => can(perms, m, level));
  if (method === "GET" || method === "HEAD") return any(rule.read, "view");
  // Marking something as read (chat/[id]/read, email/mark-read…) is part of viewing it.
  if (rule.write === "read" || /\/(mark-)?read(-all)?$/.test(path)) return any(rule.read, "view");
  return any(rule.write, "edit");
}
