// Official BNM exchange rates (AGRO_EXCHANGE_RATES, X → MDL). DIPP FRUICT
// loads them daily at 09:00 (bnm_daily_updater) and prunes rows older than
// 30 days; the CRM reads the same table and can load a day itself (button +
// /api/cron/bnm-rates) — same natural key (FROM, TO, DATE) as DIPP FRUICT's
// upsert_exchange_rate, so running both never creates duplicates.
import { query, execute } from "@/lib/oracle";

type Row = Record<string, unknown>;
export const RATE_CURRENCIES = ["EUR", "USD", "RON"] as const;

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export async function listRates(dateFrom: string | null, dateTo: string | null) {
  const binds: Record<string, string> = {};
  let cond = "";
  if (dateFrom) { cond += " AND RATE_DATE >= TO_DATE(:dfrom, 'YYYY-MM-DD')"; binds.dfrom = dateFrom; }
  if (dateTo)   { cond += " AND RATE_DATE < TO_DATE(:dto, 'YYYY-MM-DD') + 1"; binds.dto = dateTo; }
  const rows = await query<Row>(`
    SELECT FROM_CURRENCY, RATE, TO_CHAR(RATE_DATE, 'YYYY-MM-DD') AS D, SOURCE
    FROM AGRO_EXCHANGE_RATES
    WHERE TO_CURRENCY = 'MDL'${cond}
    ORDER BY RATE_DATE DESC, FROM_CURRENCY`, binds);

  // Pivot to one row per day: { date, EUR, USD, RON }.
  const byDay = new Map<string, Record<string, number | string>>();
  const currencies = new Set<string>();
  for (const r of rows) {
    const d = String(r.D), c = String(r.FROM_CURRENCY);
    currencies.add(c);
    const day = byDay.get(d) ?? { date: d };
    day[c] = Number(r.RATE);
    day.source = String(r.SOURCE ?? "");
    byDay.set(d, day);
  }
  const days = [...byDay.values()];
  const order = [...RATE_CURRENCIES.filter(c => currencies.has(c)), ...[...currencies].filter(c => !(RATE_CURRENCIES as readonly string[]).includes(c)).sort()];
  // Latest rate per currency and its change vs the previous available day.
  const latest: Record<string, { rate: number; date: string; prev: number | null; change: number | null }> = {};
  for (const c of order) {
    const withRate = days.filter(d => typeof d[c] === "number");
    if (!withRate.length) continue;
    const rate = withRate[0][c] as number, prev = withRate[1] ? (withRate[1][c] as number) : null;
    latest[c] = { rate, date: String(withRate[0].date), prev, change: prev != null ? rate - prev : null };
  }
  return { currencies: order, days, latest };
}

// Rate valid on a given date: the latest one published on or before it.
export async function rateOn(currency: string, date: string): Promise<number | null> {
  if (currency === "MDL") return 1;
  const rows = await query<Row>(`
    SELECT * FROM (SELECT RATE FROM AGRO_EXCHANGE_RATES
                    WHERE FROM_CURRENCY = :c AND TO_CURRENCY = 'MDL' AND RATE_DATE <= TO_DATE(:d, 'YYYY-MM-DD')
                    ORDER BY RATE_DATE DESC) WHERE ROWNUM = 1`, { c: currency, d: date });
  return rows.length ? Number(rows[0].RATE) : null;
}

// Loads one day's official rates from bnm.md (same XML feed DIPP FRUICT uses).
// dryRun parses the feed without writing (used to check the parser safely).
export async function fetchBnm(date?: string, currencies: readonly string[] = RATE_CURRENCIES, dryRun = false) {
  const d = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00`) : new Date();
  const day = iso(d);
  const bnmDate = `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;
  const res = await fetch(`https://bnm.md/en/official_exchange_rates?get_xml=1&date=${bnmDate}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`BNM ответил ${res.status}`);
  const xml = await res.text();
  // BNM echoes the date it actually published for (weekends → last working day).
  const published = xml.match(/<ValCurs[^>]*Date="(\d{2})\.(\d{2})\.(\d{4})"/);
  const want = new Set(currencies.map(c => c.toUpperCase()));
  const saved: { code: string; rate: number }[] = [];
  for (const m of xml.matchAll(/<Valute[^>]*>([\s\S]*?)<\/Valute>/g)) {
    const body = m[1];
    const code = body.match(/<CharCode>\s*([A-Z]{3})\s*<\/CharCode>/)?.[1];
    const nominal = Number((body.match(/<Nominal>\s*([\d.,]+)\s*<\/Nominal>/)?.[1] ?? "1").replace(",", "."));
    const value = Number((body.match(/<Value>\s*([\d.,]+)\s*<\/Value>/)?.[1] ?? "").replace(",", "."));
    if (!code || !want.has(code) || !(value > 0) || !(nominal > 0)) continue;
    const rate = Math.round((value / nominal) * 1e6) / 1e6;
    if (!dryRun) await execute(`
      MERGE INTO AGRO_EXCHANGE_RATES t
      USING (SELECT :c AS F, 'MDL' AS T, TO_DATE(:d, 'YYYY-MM-DD') AS D FROM DUAL) s
         ON (t.FROM_CURRENCY = s.F AND t.TO_CURRENCY = s.T AND t.RATE_DATE = s.D)
      WHEN MATCHED THEN UPDATE SET RATE = :r, SOURCE = 'BNM'
      WHEN NOT MATCHED THEN INSERT (ID, FROM_CURRENCY, TO_CURRENCY, RATE, RATE_DATE, SOURCE) VALUES (AGRO_EXCHANGE_RATES_SEQ.NEXTVAL, :c, 'MDL', :r, TO_DATE(:d, 'YYYY-MM-DD'), 'BNM')`,
      { c: code, r: rate, d: day });
    saved.push({ code, rate });
  }
  if (!saved.length) throw new Error("В ответе BNM нет курсов на эту дату");
  return { date: day, published_for: published ? `${published[3]}-${published[2]}-${published[1]}` : day, saved };
}
