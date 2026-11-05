// Deliveries: trips (AGRO_CRM_TRIPS) with stops (AGRO_CRM_TRIP_STOPS), one
// stop per sales document. CRM-only — DIPP FRUICT has the vehicles and the
// sales documents but no trips, and the CRM never writes to either: a trip
// only refers to them. Every change goes to the audit log ('trip').
import { query } from "@/lib/oracle";
import { tx } from "@/lib/receivables";

type Row = Record<string, unknown>;
type Exec = (sql: string, b: Record<string, unknown>) => Promise<Row[]>;
const n = (v: unknown) => (v == null ? 0 : Number(v));
const nn = (v: unknown) => (v == null ? null : Number(v));
const s = (v: unknown) => (v == null ? "" : String(v));
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const TRIP_STATUSES = ["planned", "loading", "in_transit", "delivered", "cancelled"] as const;
export const STOP_STATUSES = ["pending", "delivered", "failed"] as const;
// Allowed moves; editing the stop list is possible only while planned/loading.
const NEXT: Record<string, string[]> = {
  planned:    ["loading", "in_transit", "cancelled"],
  loading:    ["planned", "in_transit", "cancelled"],
  in_transit: ["loading", "delivered", "cancelled"],
  delivered:  ["in_transit"],
  cancelled:  ["planned"],
};
const EDITABLE_STOPS = ["planned", "loading"];

export class DeliveryError extends Error {}

async function audit(exec: Exec, id: number, name: string, action: string, user: string, changes: unknown) {
  await exec(`INSERT INTO AGRO_CRM_AUDIT_LOG (ENTITY_TYPE, ENTITY_ID, ENTITY_NAME, ACTION, CHANGED_BY, NEW_VALUES)
              VALUES ('trip', :id, :name, :act, :usr, :new)`,
    { id, name: name.slice(0, 200), act: action, usr: user, new: JSON.stringify(changes) });
}

// ── Lists ────────────────────────────────────────────────────────────────

export async function listTrips(sp: URLSearchParams) {
  const w: string[] = [];
  const b: Record<string, string | number> = {};
  const df = sp.get("date_from") ?? "", dt = sp.get("date_to") ?? "", st = sp.get("status") ?? "";
  if (ISO.test(df)) { w.push("t.TRIP_DATE >= TO_DATE(:df, 'YYYY-MM-DD')"); b.df = df; }
  if (ISO.test(dt)) { w.push("t.TRIP_DATE < TO_DATE(:dt, 'YYYY-MM-DD') + 1"); b.dt = dt; }
  if (st === "active") w.push("t.STATUS IN ('planned', 'loading', 'in_transit')");
  else if ((TRIP_STATUSES as readonly string[]).includes(st)) { w.push("t.STATUS = :st"); b.st = st; }
  const veh = Number(sp.get("vehicle_id"));
  if (veh > 0) { w.push("t.VEHICLE_ID = :veh"); b.veh = veh; }
  const q = (sp.get("q") ?? "").trim().slice(0, 60);
  if (q) {
    w.push(`(UPPER(t.TRIP_NUMBER) LIKE :q OR UPPER(t.DRIVER_NAME) LIKE :q OR UPPER(t.DESTINATION) LIKE :q OR UPPER(v.PLATE_NUMBER) LIKE :q
             OR EXISTS (SELECT 1 FROM AGRO_CRM_TRIP_STOPS x JOIN AGRO_SALES_DOCS sd ON sd.ID = x.SALES_DOC_ID JOIN AGRO_CUSTOMERS c ON c.ID = sd.CUSTOMER_ID
                        WHERE x.TRIP_ID = t.ID AND (UPPER(c.NAME) LIKE :q OR UPPER(sd.DOC_NUMBER) LIKE :q OR UPPER(sd.INVOICE_NUMBER) LIKE :q)))`);
    b.q = `%${q.toUpperCase()}%`;
  }
  const rows = await query<Row>(`
    SELECT * FROM (
      SELECT t.ID, t.TRIP_NUMBER, t.TRIP_DATE, t.STATUS, t.DRIVER_NAME, t.CARRIER_NAME, t.DESTINATION, t.DEPARTED_AT, t.ARRIVED_AT,
             t.COST_AMOUNT, t.COST_CURRENCY, v.ID AS VEHICLE_ID, v.PLATE_NUMBER,
             (SELECT COUNT(*) FROM AGRO_CRM_TRIP_STOPS x WHERE x.TRIP_ID = t.ID) AS STOPS,
             (SELECT COUNT(*) FROM AGRO_CRM_TRIP_STOPS x WHERE x.TRIP_ID = t.ID AND x.STATUS = 'delivered') AS DELIVERED,
             (SELECT COUNT(*) FROM AGRO_CRM_TRIP_STOPS x WHERE x.TRIP_ID = t.ID AND x.STATUS = 'failed') AS FAILED,
             (SELECT NVL(SUM(sd.TOTAL_NET_KG), 0) FROM AGRO_CRM_TRIP_STOPS x JOIN AGRO_SALES_DOCS sd ON sd.ID = x.SALES_DOC_ID WHERE x.TRIP_ID = t.ID) AS NET_KG,
             (SELECT LISTAGG(c.NAME, ', ') WITHIN GROUP (ORDER BY x.STOP_ORDER)
                FROM AGRO_CRM_TRIP_STOPS x JOIN AGRO_SALES_DOCS sd ON sd.ID = x.SALES_DOC_ID JOIN AGRO_CUSTOMERS c ON c.ID = sd.CUSTOMER_ID
               WHERE x.TRIP_ID = t.ID) AS CUSTOMERS
      FROM AGRO_CRM_TRIPS t
      LEFT JOIN AGRO_VEHICLES v ON v.ID = t.VEHICLE_ID
      ${w.length ? "WHERE " + w.join(" AND ") : ""}
      ORDER BY t.TRIP_DATE DESC, t.ID DESC
    ) WHERE ROWNUM <= 2000`, b);
  const list = rows.map(r => ({
    id: n(r.ID), number: s(r.TRIP_NUMBER), date: iso(r.TRIP_DATE), status: s(r.STATUS),
    driver: s(r.DRIVER_NAME), carrier: s(r.CARRIER_NAME), destination: s(r.DESTINATION),
    departed_at: iso(r.DEPARTED_AT), arrived_at: iso(r.ARRIVED_AT),
    cost: nn(r.COST_AMOUNT), cost_currency: s(r.COST_CURRENCY) || "MDL",
    vehicle_id: nn(r.VEHICLE_ID), plate: s(r.PLATE_NUMBER),
    stops: n(r.STOPS), delivered: n(r.DELIVERED), failed: n(r.FAILED), net_kg: n(r.NET_KG), customers: s(r.CUSTOMERS),
  }));
  const cnt = (k: string) => list.filter(r => r.status === k).length;
  return {
    rows: list,
    totals: {
      count: list.length, planned: cnt("planned") + cnt("loading"), in_transit: cnt("in_transit"), delivered: cnt("delivered"),
      net_kg: list.filter(r => r.status !== "cancelled").reduce((a, r) => a + r.net_kg, 0),
      failed_stops: list.reduce((a, r) => a + r.failed, 0),
    },
  };
}

export async function tripDetail(id: number) {
  const [hdr, stops, hist] = await Promise.all([
    query<Row>(`
      SELECT t.*, v.PLATE_NUMBER, v.VEHICLE_TYPE, v.DRIVER_NAME AS VEHICLE_DRIVER
      FROM AGRO_CRM_TRIPS t LEFT JOIN AGRO_VEHICLES v ON v.ID = t.VEHICLE_ID WHERE t.ID = :1`, [id]),
    query<Row>(`
      SELECT x.ID, x.SALES_DOC_ID, x.STOP_ORDER, x.ADDRESS, x.STATUS, x.DELIVERED_AT, x.RECEIVED_BY, x.NOTES,
             NVL(sd.INVOICE_NUMBER, sd.DOC_NUMBER) AS SALE_NUMBER, sd.DOC_DATE, sd.STATUS AS SALE_STATUS, sd.TOTAL_NET_KG,
             sd.TOTAL_AMOUNT, NVL(sd.CURRENCY_CODE, 'MDL') AS CUR, c.ID AS CUSTOMER_ID, c.NAME AS CUSTOMER_NAME,
             c.CONTACT_PHONE, sv.PLATE_NUMBER AS SALE_PLATE
      FROM AGRO_CRM_TRIP_STOPS x
      JOIN AGRO_SALES_DOCS sd ON sd.ID = x.SALES_DOC_ID
      LEFT JOIN AGRO_CUSTOMERS c ON c.ID = sd.CUSTOMER_ID
      LEFT JOIN AGRO_VEHICLES sv ON sv.ID = sd.VEHICLE_ID
      WHERE x.TRIP_ID = :1 ORDER BY x.STOP_ORDER, x.ID`, [id]),
    query<Row>(`SELECT ACTION, CHANGED_BY, CHANGED_AT, NEW_VALUES FROM AGRO_CRM_AUDIT_LOG
                WHERE ENTITY_TYPE = 'trip' AND ENTITY_ID = :1 ORDER BY CHANGED_AT DESC, ID DESC`, [id]),
  ]);
  if (!hdr.length) return null;
  const h = hdr[0];
  return {
    id: n(h.ID), number: s(h.TRIP_NUMBER), date: iso(h.TRIP_DATE), status: s(h.STATUS),
    vehicle_id: nn(h.VEHICLE_ID), plate: s(h.PLATE_NUMBER), vehicle_type: s(h.VEHICLE_TYPE),
    carrier: s(h.CARRIER_NAME), driver: s(h.DRIVER_NAME), driver_phone: s(h.DRIVER_PHONE), destination: s(h.DESTINATION),
    departed_at: iso(h.DEPARTED_AT), arrived_at: iso(h.ARRIVED_AT),
    cost: nn(h.COST_AMOUNT), cost_currency: s(h.COST_CURRENCY) || "MDL", notes: s(h.NOTES),
    created_by: s(h.CREATED_BY), created_at: iso(h.CREATED_AT), next: NEXT[s(h.STATUS)] ?? [],
    stops_editable: EDITABLE_STOPS.includes(s(h.STATUS)),
    stops: stops.map(x => ({
      id: n(x.ID), sales_doc_id: n(x.SALES_DOC_ID), order: n(x.STOP_ORDER), address: s(x.ADDRESS), status: s(x.STATUS),
      delivered_at: iso(x.DELIVERED_AT), received_by: s(x.RECEIVED_BY), notes: s(x.NOTES),
      sale_number: s(x.SALE_NUMBER), sale_date: iso(x.DOC_DATE), sale_status: s(x.SALE_STATUS),
      net_kg: n(x.TOTAL_NET_KG), amount: n(x.TOTAL_AMOUNT), currency: s(x.CUR),
      customer_id: nn(x.CUSTOMER_ID), customer_name: s(x.CUSTOMER_NAME), phone: s(x.CONTACT_PHONE), sale_plate: s(x.SALE_PLATE),
    })),
    history: hist.map(r => {
      let changes: Record<string, unknown> = {};
      try { changes = JSON.parse(s(r.NEW_VALUES)) ?? {}; } catch { /* foreign row */ }
      return { action: s(r.ACTION), by: s(r.CHANGED_BY), at: iso(r.CHANGED_AT), changes };
    }),
  };
}

// Sales documents not in any live trip — the pool to plan trips from.
// `include` keeps the trip's own documents in the list while editing it.
export async function availableSales(sp: URLSearchParams) {
  const days = Math.min(Math.max(Number(sp.get("days")) || 30, 1), 365);
  const include = Number(sp.get("trip_id")) || 0;
  const rows = await query<Row>(`
    SELECT * FROM (
      SELECT sd.ID, NVL(sd.INVOICE_NUMBER, sd.DOC_NUMBER) AS NUM, sd.DOC_DATE, sd.STATUS, sd.TOTAL_NET_KG, sd.TOTAL_AMOUNT,
             NVL(sd.CURRENCY_CODE, 'MDL') AS CUR, sd.SALE_TYPE, c.ID AS CUSTOMER_ID, c.NAME AS CUSTOMER_NAME, c.ADDRESS, c.COUNTRY,
             v.ID AS VEHICLE_ID, v.PLATE_NUMBER
      FROM AGRO_SALES_DOCS sd
      LEFT JOIN AGRO_CUSTOMERS c ON c.ID = sd.CUSTOMER_ID
      LEFT JOIN AGRO_VEHICLES v ON v.ID = sd.VEHICLE_ID
      WHERE sd.STATUS IN ('draft', 'confirmed', 'shipped')
        AND sd.DOC_DATE >= TRUNC(SYSDATE) - :days
        AND NOT EXISTS (SELECT 1 FROM AGRO_CRM_TRIP_STOPS x JOIN AGRO_CRM_TRIPS t ON t.ID = x.TRIP_ID
                        WHERE x.SALES_DOC_ID = sd.ID AND t.STATUS <> 'cancelled' AND t.ID <> :inc)
      ORDER BY sd.DOC_DATE DESC, sd.ID DESC
    ) WHERE ROWNUM <= 500`, { days, inc: include });
  return rows.map(r => ({
    id: n(r.ID), number: s(r.NUM), date: iso(r.DOC_DATE), status: s(r.STATUS), sale_type: s(r.SALE_TYPE),
    net_kg: n(r.TOTAL_NET_KG), amount: n(r.TOTAL_AMOUNT), currency: s(r.CUR),
    customer_id: nn(r.CUSTOMER_ID), customer_name: s(r.CUSTOMER_NAME), address: s(r.ADDRESS), country: s(r.COUNTRY),
    vehicle_id: nn(r.VEHICLE_ID), plate: s(r.PLATE_NUMBER),
  }));
}

export async function vehicleOptions() {
  const rows = await query<Row>(`SELECT ID, PLATE_NUMBER, VEHICLE_TYPE, DRIVER_NAME FROM AGRO_VEHICLES WHERE NVL(ACTIVE, 'Y') = 'Y' ORDER BY PLATE_NUMBER`, []);
  return rows.map(r => ({ id: n(r.ID), plate: s(r.PLATE_NUMBER), type: s(r.VEHICLE_TYPE), driver: s(r.DRIVER_NAME) }));
}

// ── Vehicles & drivers overview ──────────────────────────────────────────

export async function vehiclesOverview() {
  const rows = await query<Row>(`
    SELECT v.ID, v.PLATE_NUMBER, v.VEHICLE_TYPE, v.DRIVER_NAME, NVL(v.ACTIVE, 'Y') AS ACTIVE,
           (SELECT COUNT(*) FROM AGRO_CRM_TRIPS t WHERE t.VEHICLE_ID = v.ID AND t.STATUS <> 'cancelled') AS TRIPS,
           (SELECT MAX(t.TRIP_DATE) FROM AGRO_CRM_TRIPS t WHERE t.VEHICLE_ID = v.ID AND t.STATUS <> 'cancelled') AS LAST_TRIP,
           (SELECT MAX(t.TRIP_NUMBER) KEEP (DENSE_RANK LAST ORDER BY t.ID) FROM AGRO_CRM_TRIPS t
             WHERE t.VEHICLE_ID = v.ID AND t.STATUS IN ('loading', 'in_transit')) AS BUSY_TRIP,
           (SELECT MAX(t.STATUS) KEEP (DENSE_RANK LAST ORDER BY t.ID) FROM AGRO_CRM_TRIPS t
             WHERE t.VEHICLE_ID = v.ID AND t.STATUS IN ('loading', 'in_transit')) AS BUSY_STATUS,
           (SELECT COUNT(*) FROM AGRO_SALES_DOCS sd WHERE sd.VEHICLE_ID = v.ID) AS SALES,
           (SELECT NVL(SUM(sd.TOTAL_NET_KG), 0) FROM AGRO_SALES_DOCS sd WHERE sd.VEHICLE_ID = v.ID) AS SALES_KG,
           (SELECT MAX(sd.DOC_DATE) FROM AGRO_SALES_DOCS sd WHERE sd.VEHICLE_ID = v.ID) AS LAST_SALE,
           (SELECT COUNT(*) FROM AGRO_PURCHASE_DOCS pd WHERE pd.VEHICLE_ID = v.ID) AS PURCHASES
    FROM AGRO_VEHICLES v
    ORDER BY NVL(v.ACTIVE, 'Y') DESC, v.PLATE_NUMBER`, []);
  return rows.map(r => ({
    id: n(r.ID), plate: s(r.PLATE_NUMBER), type: s(r.VEHICLE_TYPE), driver: s(r.DRIVER_NAME), active: s(r.ACTIVE) !== "N",
    trips: n(r.TRIPS), last_trip: iso(r.LAST_TRIP), busy_trip: s(r.BUSY_TRIP), busy_status: s(r.BUSY_STATUS),
    sales: n(r.SALES), sales_kg: n(r.SALES_KG), last_sale: iso(r.LAST_SALE), purchases: n(r.PURCHASES),
  }));
}

// Drivers have no table of their own: they are the names on vehicles plus
// the names written on trips (a hired driver, a replacement…).
export async function driversOverview() {
  const [veh, trips] = await Promise.all([
    query<Row>(`SELECT DRIVER_NAME, PLATE_NUMBER FROM AGRO_VEHICLES WHERE DRIVER_NAME IS NOT NULL AND NVL(ACTIVE, 'Y') = 'Y'`, []),
    query<Row>(`
      SELECT t.DRIVER_NAME, MAX(t.DRIVER_PHONE) AS PHONE, COUNT(*) AS TRIPS,
             SUM(CASE WHEN t.STATUS = 'delivered' THEN 1 ELSE 0 END) AS DONE,
             SUM(CASE WHEN t.STATUS IN ('loading', 'in_transit') THEN 1 ELSE 0 END) AS ACTIVE_TRIPS,
             MAX(t.TRIP_DATE) AS LAST_TRIP,
             (SELECT COUNT(*) FROM AGRO_CRM_TRIP_STOPS x JOIN AGRO_CRM_TRIPS t2 ON t2.ID = x.TRIP_ID
               WHERE t2.DRIVER_NAME = t.DRIVER_NAME AND t2.STATUS <> 'cancelled' AND x.STATUS = 'failed') AS FAILED
      FROM AGRO_CRM_TRIPS t
      WHERE t.DRIVER_NAME IS NOT NULL AND t.STATUS <> 'cancelled'
      GROUP BY t.DRIVER_NAME`, []),
  ]);
  const map = new Map<string, { name: string; plates: string[]; phone: string; trips: number; done: number; active: number; failed: number; last_trip: string | null }>();
  const key = (v: unknown) => s(v).trim().toUpperCase();
  for (const v of veh) {
    const k = key(v.DRIVER_NAME);
    const e = map.get(k) ?? { name: s(v.DRIVER_NAME).trim(), plates: [], phone: "", trips: 0, done: 0, active: 0, failed: 0, last_trip: null };
    e.plates.push(s(v.PLATE_NUMBER));
    map.set(k, e);
  }
  for (const t of trips) {
    const k = key(t.DRIVER_NAME);
    const e = map.get(k) ?? { name: s(t.DRIVER_NAME).trim(), plates: [], phone: "", trips: 0, done: 0, active: 0, failed: 0, last_trip: null };
    e.phone = e.phone || s(t.PHONE); e.trips += n(t.TRIPS); e.done += n(t.DONE); e.active += n(t.ACTIVE_TRIPS);
    e.failed += n(t.FAILED); e.last_trip = iso(t.LAST_TRIP) ?? e.last_trip;
    map.set(k, e);
  }
  return [...map.values()].sort((a, b) => b.trips - a.trips || a.name.localeCompare(b.name));
}

// ── Writes ───────────────────────────────────────────────────────────────

export interface TripInput {
  trip_date: string; vehicle_id: number | null; carrier: string | null; driver: string | null; driver_phone: string | null;
  destination: string | null; cost: number | null; cost_currency: string | null; notes: string | null;
  stops: { sales_doc_id: number; address: string | null }[];
}

const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max) || null;

export function parseTrip(b: Record<string, unknown>): TripInput {
  const date = String(b.trip_date ?? "");
  if (!ISO.test(date)) throw new DeliveryError("Укажите дату рейса");
  const veh = Number(b.vehicle_id);
  const carrier = text(b.carrier, 200);
  if (!(veh > 0) && !carrier) throw new DeliveryError("Выберите машину или укажите перевозчика");
  let cost: number | null = null;
  if (b.cost != null && String(b.cost).trim() !== "") {
    cost = Number(String(b.cost).replace(",", "."));
    if (!(cost >= 0) || cost > 1e9) throw new DeliveryError("Неверная стоимость перевозки");
    cost = Math.round(cost * 100) / 100;
  }
  const cur = String(b.cost_currency ?? "").trim().toUpperCase();
  if (cur && !/^[A-Z]{3}$/.test(cur)) throw new DeliveryError("Неверная валюта");
  const raw = Array.isArray(b.stops) ? b.stops : [];
  const stops = raw.map(x => {
    const o = (x ?? {}) as Record<string, unknown>;
    return { sales_doc_id: Number(o.sales_doc_id), address: text(o.address, 500) };
  }).filter(x => x.sales_doc_id > 0);
  if (!stops.length) throw new DeliveryError("Добавьте в рейс хотя бы одну продажу");
  if (new Set(stops.map(x => x.sales_doc_id)).size !== stops.length) throw new DeliveryError("Продажа добавлена в рейс дважды");
  if (stops.length > 100) throw new DeliveryError("Слишком много точек в рейсе");
  return {
    trip_date: date, vehicle_id: veh > 0 ? veh : null, carrier, driver: text(b.driver, 200), driver_phone: text(b.driver_phone, 50),
    destination: text(b.destination, 300), cost, cost_currency: cost != null ? cur || "MDL" : null, notes: text(b.notes, 1000), stops,
  };
}

async function checkTrip(p: TripInput, tripId: number) {
  if (p.vehicle_id) {
    const v = await query<Row>(`SELECT 1 AS X FROM AGRO_VEHICLES WHERE ID = :1`, [p.vehicle_id]);
    if (!v.length) throw new DeliveryError("Машина не найдена");
  }
  const ids = p.stops.map(x => x.sales_doc_id);
  const b = Object.fromEntries(ids.map((v, i) => [`d${i}`, v]));
  const list = ids.map((_, i) => `:d${i}`).join(",");
  const docs = await query<Row>(`SELECT ID, STATUS, NVL(INVOICE_NUMBER, DOC_NUMBER) AS NUM FROM AGRO_SALES_DOCS WHERE ID IN (${list})`, b);
  if (docs.length !== ids.length) throw new DeliveryError("Продажа не найдена");
  const bad = docs.find(d => !["draft", "confirmed", "shipped"].includes(s(d.STATUS)));
  if (bad) throw new DeliveryError(`Продажа ${s(bad.NUM)} в статусе «${s(bad.STATUS)}» — её нельзя везти`);
  const busy = await query<Row>(`
    SELECT NVL(sd.INVOICE_NUMBER, sd.DOC_NUMBER) AS NUM, t.TRIP_NUMBER
    FROM AGRO_CRM_TRIP_STOPS x JOIN AGRO_CRM_TRIPS t ON t.ID = x.TRIP_ID JOIN AGRO_SALES_DOCS sd ON sd.ID = x.SALES_DOC_ID
    WHERE x.SALES_DOC_ID IN (${list}) AND t.STATUS <> 'cancelled' AND t.ID <> :tid AND ROWNUM = 1`, { ...b, tid: tripId });
  if (busy.length) throw new DeliveryError(`Продажа ${s(busy[0].NUM)} уже в рейсе ${s(busy[0].TRIP_NUMBER)}`);
}

// Default stop address: the customer's address from DIPP FRUICT.
async function insertStops(exec: Exec, tripId: number, stops: TripInput["stops"], firstOrder = 1) {
  let i = firstOrder - 1;
  for (const x of stops) {
    i += 1;
    await exec(`
      INSERT INTO AGRO_CRM_TRIP_STOPS (TRIP_ID, SALES_DOC_ID, STOP_ORDER, ADDRESS, STATUS)
      SELECT :tid, sd.ID, :ord, NVL(:addr, c.ADDRESS), 'pending'
      FROM AGRO_SALES_DOCS sd LEFT JOIN AGRO_CUSTOMERS c ON c.ID = sd.CUSTOMER_ID WHERE sd.ID = :doc`,
      { tid: tripId, ord: i, addr: x.address, doc: x.sales_doc_id });
  }
}

export async function createTrip(p: TripInput, user: string, dryRun = false) {
  await checkTrip(p, 0);
  return tx(dryRun, async exec => {
    const id = n((await exec(`SELECT AGRO_CRM_TRIPS_SEQ.NEXTVAL AS V FROM DUAL`, {}))[0].V);
    const number = `TRP-${p.trip_date.replace(/-/g, "")}-${String(id).padStart(4, "0")}`;
    await exec(`
      INSERT INTO AGRO_CRM_TRIPS (ID, TRIP_NUMBER, TRIP_DATE, VEHICLE_ID, CARRIER_NAME, DRIVER_NAME, DRIVER_PHONE, DESTINATION,
                                  STATUS, COST_AMOUNT, COST_CURRENCY, NOTES, CREATED_BY)
      VALUES (:id, :num, TO_DATE(:d, 'YYYY-MM-DD'), :veh, :car, :drv, :ph, :dest, 'planned', :cost, :cur, :notes, :usr)`,
      { id, num: number, d: p.trip_date, veh: p.vehicle_id, car: p.carrier, drv: p.driver, ph: p.driver_phone,
        dest: p.destination, cost: p.cost, cur: p.cost_currency, notes: p.notes, usr: user });
    await insertStops(exec, id, p.stops);
    await audit(exec, id, number, "create", user, p);
    return { id, number };
  });
}

// Edit the trip header and, while planned/loading, its list of stops.
// Stops that stay keep their status/notes; only the order and address change.
export async function updateTrip(id: number, b: Record<string, unknown>, user: string, dryRun = false) {
  const cur = await tripDetail(id);
  if (!cur) throw new DeliveryError("Рейс не найден");
  const stopsGiven = Array.isArray(b.stops);
  if (stopsGiven && !cur.stops_editable) throw new DeliveryError("Состав рейса можно менять только до выезда");
  const p = parseTrip({
    trip_date: cur.date?.slice(0, 10), vehicle_id: cur.vehicle_id, carrier: cur.carrier, driver: cur.driver,
    driver_phone: cur.driver_phone, destination: cur.destination, cost: cur.cost, cost_currency: cur.cost != null ? cur.cost_currency : "",
    notes: cur.notes, stops: cur.stops.map(x => ({ sales_doc_id: x.sales_doc_id, address: x.address })),
    ...b,
  });
  if (stopsGiven) await checkTrip(p, id);
  else if (p.vehicle_id && p.vehicle_id !== cur.vehicle_id) {
    const v = await query<Row>(`SELECT 1 AS X FROM AGRO_VEHICLES WHERE ID = :1`, [p.vehicle_id]);
    if (!v.length) throw new DeliveryError("Машина не найдена");
  }
  return tx(dryRun, async exec => {
    await exec(`
      UPDATE AGRO_CRM_TRIPS SET TRIP_DATE = TO_DATE(:d, 'YYYY-MM-DD'), VEHICLE_ID = :veh, CARRIER_NAME = :car, DRIVER_NAME = :drv,
             DRIVER_PHONE = :ph, DESTINATION = :dest, COST_AMOUNT = :cost, COST_CURRENCY = :cur, NOTES = :notes, UPDATED_AT = SYSDATE
      WHERE ID = :id`,
      { id, d: p.trip_date, veh: p.vehicle_id, car: p.carrier, drv: p.driver, ph: p.driver_phone, dest: p.destination,
        cost: p.cost, cur: p.cost_currency, notes: p.notes });
    if (stopsGiven) {
      const keep = new Set(p.stops.map(x => x.sales_doc_id));
      for (const x of cur.stops) if (!keep.has(x.sales_doc_id)) await exec(`DELETE FROM AGRO_CRM_TRIP_STOPS WHERE ID = :id`, { id: x.id });
      const have = new Map(cur.stops.map(x => [x.sales_doc_id, x.id]));
      let i = 0;
      for (const x of p.stops) {
        i += 1;
        const sid = have.get(x.sales_doc_id);
        if (sid) await exec(`UPDATE AGRO_CRM_TRIP_STOPS SET STOP_ORDER = :o, ADDRESS = :a WHERE ID = :id`, { o: i, a: x.address, id: sid });
        else await insertStops(exec, id, [x], i);
      }
    }
    await audit(exec, id, cur.number, "update", user, { ...p, stops: stopsGiven ? p.stops : undefined });
    return { id };
  });
}

// Move the trip to another status. Leaving stamps DEPARTED_AT, arriving
// stamps ARRIVED_AT and marks the still-pending stops delivered; reopening a
// cancelled trip re-checks that its sales aren't in another trip by now.
export async function setTripStatus(id: number, status: string, user: string, dryRun = false) {
  const cur = await tripDetail(id);
  if (!cur) throw new DeliveryError("Рейс не найден");
  if (!(NEXT[cur.status] ?? []).includes(status)) throw new DeliveryError("Такой переход статуса невозможен");
  if (cur.status === "cancelled") {
    await checkTrip(parseTrip({ trip_date: cur.date?.slice(0, 10), vehicle_id: cur.vehicle_id, carrier: cur.carrier || "—",
      stops: cur.stops.map(x => ({ sales_doc_id: x.sales_doc_id })) }), id);
  }
  return tx(dryRun, async exec => {
    await exec(`
      UPDATE AGRO_CRM_TRIPS SET STATUS = :st, UPDATED_AT = SYSDATE,
             DEPARTED_AT = CASE WHEN :st IN ('in_transit', 'delivered') THEN NVL(DEPARTED_AT, SYSDATE) WHEN :st IN ('planned', 'loading') THEN NULL ELSE DEPARTED_AT END,
             ARRIVED_AT  = CASE WHEN :st = 'delivered' THEN NVL(ARRIVED_AT, SYSDATE) WHEN :st = 'cancelled' THEN ARRIVED_AT ELSE NULL END
      WHERE ID = :id`, { id, st: status });
    if (status === "delivered") {
      await exec(`UPDATE AGRO_CRM_TRIP_STOPS SET STATUS = 'delivered', DELIVERED_AT = SYSDATE WHERE TRIP_ID = :id AND STATUS = 'pending'`, { id });
    }
    await audit(exec, id, cur.number, "status", user, { from: cur.status, status });
    return { id, status };
  });
}

// Mark one stop delivered / failed (or back to pending) once the vehicle has left.
export async function updateStop(tripId: number, stopId: number, b: Record<string, unknown>, user: string, dryRun = false) {
  const cur = await tripDetail(tripId);
  if (!cur) throw new DeliveryError("Рейс не найден");
  const stop = cur.stops.find(x => x.id === stopId);
  if (!stop) throw new DeliveryError("Точка рейса не найдена");
  if (!["in_transit", "delivered"].includes(cur.status)) throw new DeliveryError("Отмечать доставку можно после выезда машины");
  const status = String(b.status ?? stop.status);
  if (!(STOP_STATUSES as readonly string[]).includes(status)) throw new DeliveryError("Неверный статус точки");
  const notes = b.notes !== undefined ? text(b.notes, 1000) : stop.notes || null;
  if (status === "failed" && !notes) throw new DeliveryError("Опишите, почему не доставлено");
  const receivedBy = b.received_by !== undefined ? text(b.received_by, 200) : stop.received_by || null;
  return tx(dryRun, async exec => {
    await exec(`
      UPDATE AGRO_CRM_TRIP_STOPS SET STATUS = :st, RECEIVED_BY = :rb, NOTES = :notes,
             DELIVERED_AT = CASE WHEN :st = 'pending' THEN NULL ELSE NVL(DELIVERED_AT, SYSDATE) END
      WHERE ID = :id`, { id: stopId, st: status, rb: receivedBy, notes });
    await audit(exec, tripId, cur.number, "stop", user, { sale: stop.sale_number, status, received_by: receivedBy, notes });
    return { id: stopId, status };
  });
}
