import { query } from "@/lib/oracle";
import {
  Row, Lang, DocNotFound, s, n, fmtDate, pickName, getCompany,
  palletKind, crateKind, mergeKind, tareUnit, PalletKind, CrateKind, TareKind,
} from "./common";

// NOTES value on AGRO_SALES_ALLOCATION_PALLETS rows that are parts of one
// supplier-total row split across several FIFO batches (DIPP FRUICT
// _split_aggregate_pallet_row). Must match AGG_PALLET_NOTE there.
const AGG_PALLET_NOTE = "[total]";

async function salesHeader(docId: number) {
  const rows = await query<Row>(`
    SELECT sd.ID, sd.DOC_NUMBER, sd.INVOICE_NUMBER, sd.DOC_DATE, sd.NOTES, sd.STATUS,
           NVL(sd.CURRENCY_CODE, 'MDL') AS CURRENCY_CODE,
           w.NAME AS WAREHOUSE_NAME,
           c.NAME AS CUSTOMER_NAME, c.ADDRESS AS CUSTOMER_ADDRESS,
           c.TAX_ID AS CUSTOMER_TAX_ID, c.COUNTRY AS CUSTOMER_COUNTRY,
           v.PLATE_NUMBER AS VEHICLE_PLATE, v.DRIVER_NAME
    FROM AGRO_SALES_DOCS sd
    LEFT JOIN AGRO_WAREHOUSES w ON w.ID = sd.WAREHOUSE_ID
    LEFT JOIN AGRO_CUSTOMERS  c ON c.ID = sd.CUSTOMER_ID
    LEFT JOIN AGRO_VEHICLES   v ON v.ID = sd.VEHICLE_ID
    WHERE sd.ID = :1
  `, [docId]);
  if (!rows.length) throw new DocNotFound("Документ продажи не найден");
  return rows[0];
}

// ── Bon vânzare (sales pallet bon) ───────────────────────────────────────
// One truck can carry several products, and each product's pallets can come
// from several suppliers — the client's paper bon groups pallet rows by
// producer, each with its own subtotal. Shared pallets (palet comun) are
// pulled out into their own section. Ported from DIPP FRUICT
// get_document_data("sales_pallet_bon").

interface Pallet {
  pallet_no: number; gross_kg: number; crates_count: number; net_kg: number;
  rejected: boolean; rejected_kg: number; notes: string;
  agg_part?: boolean; shared_group?: string;
}
interface Group {
  item_name: string; variety_name: string; supplier_name: string;
  packaging_kind_label: string; pallet_kind: PalletKind; crate_kind: CrateKind;
  pallets: Pallet[];
  total_gross_kg: number; total_crates: number; total_tare_kg: number; total_net_kg: number;
  rejected_pallets: number; rejected_crates: number; rejected_kg: number;
  tare_per_unit_kg: number | null; tare_unit_kind: TareKind | null;
  total_pallet_count: number;
}
interface SharedGroup {
  item_name: string; variety_name: string; packaging_kind_label: string;
  pallet_kind: PalletKind; crate_kind: CrateKind;
  participants: { supplier_name: string; gross_kg: number; net_kg: number; crates_count: number }[];
  total_gross_kg: number; total_net_kg: number; total_crates: number; total_tare_kg: number;
  tare_per_unit_kg: number | null; tare_unit_kind: TareKind | null;
}

export async function salesPalletBon(docId: number, lang: Lang) {
  const hdr = await salesHeader(docId);

  const [lineRows, allocRows, palletRows] = await Promise.all([
    query<Row>(`
      SELECT sl.ID, sl.NET_WEIGHT_KG, sl.GROSS_WEIGHT_KG, sl.CRATES_COUNT,
             i.NAME_RU AS ITEM_NAME_RU, i.NAME_RO AS ITEM_NAME_RO,
             pt.NAME_RO AS PKG_TYPE_NAME_RO, pt.NAME_RU AS PKG_TYPE_NAME_RU,
             pt2.NAME_RO AS PALLET_TYPE_NAME_RO, pt2.NAME_RU AS PALLET_TYPE_NAME_RU,
             v.NAME_RO AS VARIETY_NAME_RO, v.NAME_RU AS VARIETY_NAME_RU
      FROM AGRO_SALES_LINES sl
      JOIN AGRO_ITEMS i ON i.ID = sl.ITEM_ID
      LEFT JOIN AGRO_PACKAGING_TYPES pt  ON pt.ID  = sl.PACKAGING_TYPE_ID
      LEFT JOIN AGRO_PACKAGING_TYPES pt2 ON pt2.ID = sl.PALLET_TYPE_ID
      LEFT JOIN AGRO_ITEM_VARIETIES  v   ON v.ID   = sl.VARIETY_ID
      WHERE sl.SALES_DOC_ID = :1
      ORDER BY sl.ID
    `, [docId]),
    query<Row>(`
      SELECT ba.ID, ba.SALES_LINE_ID, ba.ALLOCATED_QTY_KG, s.NAME AS SUPPLIER_NAME
      FROM AGRO_BATCH_ALLOCATIONS ba
      JOIN AGRO_SALES_LINES sl ON sl.ID = ba.SALES_LINE_ID
      JOIN AGRO_BATCHES b ON b.ID = ba.BATCH_ID
      LEFT JOIN AGRO_PURCHASE_LINES pl ON pl.ID = b.PURCHASE_LINE_ID
      LEFT JOIN AGRO_PURCHASE_DOCS  pd ON pd.ID = pl.PURCHASE_DOC_ID
      LEFT JOIN AGRO_SUPPLIERS      s  ON s.ID  = pd.SUPPLIER_ID
      WHERE sl.SALES_DOC_ID = :1
      ORDER BY ba.ID
    `, [docId]),
    query<Row>(`
      SELECT p.ALLOCATION_ID, p.PALLET_NO, p.GROSS_WEIGHT_KG, p.CRATES_COUNT, p.NET_WEIGHT_KG,
             p.REJECTED, p.REJECTED_QTY_KG, p.NOTES, p.SHARED_PALLETS
      FROM AGRO_SALES_ALLOCATION_PALLETS p
      JOIN AGRO_BATCH_ALLOCATIONS ba ON ba.ID = p.ALLOCATION_ID
      JOIN AGRO_SALES_LINES sl ON sl.ID = ba.SALES_LINE_ID
      WHERE sl.SALES_DOC_ID = :1
      ORDER BY p.ALLOCATION_ID, p.PALLET_NO
    `, [docId]),
  ]);

  const allocsByLine = new Map<number, Row[]>();
  for (const a of allocRows) {
    const k = n(a.SALES_LINE_ID);
    allocsByLine.set(k, [...(allocsByLine.get(k) ?? []), a]);
  }
  const palletsByAlloc = new Map<number, Row[]>();
  for (const p of palletRows) {
    const k = n(p.ALLOCATION_ID);
    palletsByAlloc.set(k, [...(palletsByAlloc.get(k) ?? []), p]);
  }

  const raw: Group[] = [];
  const productNames: string[] = [];
  let grandGross = 0, grandTare = 0, grandNet = 0, grandCrates = 0;
  let grandRejPallets = 0, grandRejCrates = 0, grandRejKg = 0;

  for (const ln of lineRows) {
    const itemName    = pickName(lang, ln.ITEM_NAME_RO, ln.ITEM_NAME_RU);
    const varietyName = pickName(lang, ln.VARIETY_NAME_RO, ln.VARIETY_NAME_RU);
    if (itemName && !productNames.includes(itemName)) productNames.push(itemName);
    const pk = palletKind(ln.PALLET_TYPE_NAME_RO, ln.PALLET_TYPE_NAME_RU, ln.PKG_TYPE_NAME_RO, ln.PKG_TYPE_NAME_RU);
    const ck = crateKind(ln.PKG_TYPE_NAME_RO, ln.PKG_TYPE_NAME_RU);
    const pkgLabel = pickName(lang, ln.PKG_TYPE_NAME_RO, ln.PKG_TYPE_NAME_RU);
    const base = { item_name: itemName, variety_name: varietyName, packaging_kind_label: pkgLabel, pallet_kind: pk, crate_kind: ck };

    const allocs = allocsByLine.get(n(ln.ID)) ?? [];
    if (!allocs.length) {
      // Line was never run through batch allocation — fall back to the
      // weights entered directly on the sales line so the bon isn't empty.
      const net = n(ln.NET_WEIGHT_KG), gross = n(ln.GROSS_WEIGHT_KG), crates = n(ln.CRATES_COUNT);
      const tare = gross ? Math.max(gross - net, 0) : 0;
      if (net || gross) {
        const [tpu, tuk] = tareUnit(tare, crates, 1, ck, pk);
        raw.push({
          ...base, supplier_name: "",
          pallets: [{ pallet_no: 1, gross_kg: gross, crates_count: crates, net_kg: net, rejected: false, rejected_kg: 0, notes: "" }],
          total_gross_kg: gross, total_crates: crates, total_tare_kg: tare, total_net_kg: net,
          rejected_pallets: 0, rejected_crates: 0, rejected_kg: 0,
          tare_per_unit_kg: tpu, tare_unit_kind: tuk, total_pallet_count: 1,
        });
        grandGross += gross; grandTare += tare; grandNet += net; grandCrates += crates;
      }
      continue;
    }

    for (const alloc of allocs) {
      const pallets = palletsByAlloc.get(n(alloc.ID)) ?? [];
      let ctx: Pallet[];
      let gGross: number, gTare: number, gCrates: number, gNet: number;
      let gRejPallets = 0, gRejCrates = 0, gRejKg = 0;

      if (pallets.length) {
        ctx = pallets.map(p => ({
          pallet_no:    n(p.PALLET_NO),
          gross_kg:     n(p.GROSS_WEIGHT_KG),
          crates_count: n(p.CRATES_COUNT),
          net_kg:       n(p.NET_WEIGHT_KG),
          rejected:     p.REJECTED === "Y",
          rejected_kg:  n(p.REJECTED_QTY_KG),
          notes:        p.NOTES === AGG_PALLET_NOTE ? "" : s(p.NOTES),
          agg_part:     p.NOTES === AGG_PALLET_NOTE,
          shared_group: s(p.SHARED_PALLETS).trim(),
        }));
        gGross  = ctx.reduce((a, p) => a + p.gross_kg, 0);
        const rawNet = ctx.reduce((a, p) => a + p.net_kg, 0);
        gCrates = ctx.reduce((a, p) => a + p.crates_count, 0);
        gRejKg  = ctx.reduce((a, p) => a + p.rejected_kg, 0);
        // Tare = Gross - Net: the per-pallet TARE field isn't always filled in.
        gTare = Math.max(gGross - rawNet, 0);
        // Billed net = weighed net minus the rejected (rebut) portion.
        gNet  = rawNet - gRejKg;
        gRejPallets = ctx.filter(p => p.rejected).length;
        gRejCrates  = ctx.filter(p => p.rejected).reduce((a, p) => a + p.crates_count, 0);
      } else {
        // No per-pallet breakdown (older doc or FIFO auto-allocation).
        const net = n(alloc.ALLOCATED_QTY_KG);
        ctx = net ? [{ pallet_no: 1, gross_kg: net, crates_count: 0, net_kg: net, rejected: false, rejected_kg: 0, notes: "" }] : [];
        gGross = net; gTare = 0; gCrates = 0; gNet = net;
      }

      raw.push({
        ...base, supplier_name: s(alloc.SUPPLIER_NAME), pallets: ctx,
        total_gross_kg: gGross, total_crates: gCrates, total_tare_kg: gTare, total_net_kg: gNet,
        rejected_pallets: gRejPallets, rejected_crates: gRejCrates, rejected_kg: gRejKg,
        tare_per_unit_kg: null, tare_unit_kind: null, total_pallet_count: 0,
      });
      grandGross += gGross; grandTare += gTare; grandNet += gNet; grandCrates += gCrates;
      grandRejPallets += gRejPallets; grandRejCrates += gRejCrates; grandRejKg += gRejKg;
    }
  }

  // Merge FIFO splits back into one printed group per
  // (product, variety, supplier, packaging) — what the operator entered.
  const merged = new Map<string, Group>();
  for (const g of raw) {
    const key = JSON.stringify([g.item_name, g.variety_name, g.supplier_name, g.packaging_kind_label]);
    const m = merged.get(key);
    if (!m) { merged.set(key, { ...g, pallets: [...g.pallets] }); continue; }
    m.pallets = [...m.pallets, ...g.pallets];
    m.total_gross_kg += g.total_gross_kg; m.total_crates += g.total_crates;
    m.total_tare_kg += g.total_tare_kg;   m.total_net_kg += g.total_net_kg;
    m.rejected_pallets += g.rejected_pallets; m.rejected_crates += g.rejected_crates;
    m.rejected_kg += g.rejected_kg;
  }

  const sharedRaw: (Pallet & { item_name: string; variety_name: string; packaging_kind_label: string;
                               pallet_kind: PalletKind; crate_kind: CrateKind; supplier_name: string })[] = [];
  const groups: Group[] = [];
  for (const m of merged.values()) {
    const sharedHere = m.pallets.filter(p => p.shared_group);
    if (sharedHere.length) {
      m.pallets = m.pallets.filter(p => !p.shared_group);
      for (const p of sharedHere) sharedRaw.push({
        ...p, item_name: m.item_name, variety_name: m.variety_name, packaging_kind_label: m.packaging_kind_label,
        pallet_kind: m.pallet_kind, crate_kind: m.crate_kind, supplier_name: m.supplier_name,
      });
      // The shared pallet's weight now belongs to its own section.
      const gross  = m.pallets.reduce((a, p) => a + p.gross_kg, 0);
      const rawNet = m.pallets.reduce((a, p) => a + p.net_kg, 0);
      const rejKg  = m.pallets.reduce((a, p) => a + p.rejected_kg, 0);
      m.total_gross_kg = gross;
      m.total_net_kg   = rawNet - rejKg;
      m.total_tare_kg  = Math.max(gross - rawNet, 0);
      m.total_crates   = m.pallets.reduce((a, p) => a + p.crates_count, 0);
      if (!m.pallets.length) continue;
    }

    // One supplier total split across FIFO batches → print as the single row typed.
    if (m.pallets.length > 1 && m.pallets.every(p => p.agg_part)) {
      const parts = m.pallets;
      m.pallets = [{
        pallet_no:    parts.reduce((a, p) => a + p.pallet_no, 0),
        gross_kg:     parts.reduce((a, p) => a + p.gross_kg, 0),
        crates_count: Math.trunc(parts.reduce((a, p) => a + p.crates_count, 0)),
        net_kg:       parts.reduce((a, p) => a + p.net_kg, 0),
        rejected: false, rejected_kg: 0, notes: "", agg_part: true,
      }];
    }

    // Pallet count: a lone row keeps its saved PALLET_NO (the real count);
    // once several rows are merged, a real per-pallet row counts as 1 and an
    // aggregate row as its own PALLET_NO.
    let units: number;
    if (m.pallets.length === 1) {
      units = m.pallets[0].pallet_no || 0;
    } else {
      units = m.pallets.reduce((a, p) => a + (p.agg_part ? p.pallet_no || 0 : 1), 0);
      m.pallets.filter(p => !p.agg_part).forEach((p, i) => { p.pallet_no = i + 1; });
    }
    [m.tare_per_unit_kg, m.tare_unit_kind] = tareUnit(m.total_tare_kg, m.total_crates, units, m.crate_kind, m.pallet_kind);
    m.total_pallet_count = units;
    groups.push(m);
  }

  const sharedByTag = new Map<string, SharedGroup>();
  for (const p of sharedRaw) {
    const tag = p.shared_group!;
    let sg = sharedByTag.get(tag);
    if (!sg) {
      sg = {
        item_name: p.item_name, variety_name: p.variety_name, packaging_kind_label: p.packaging_kind_label,
        pallet_kind: p.pallet_kind, crate_kind: p.crate_kind, participants: [],
        total_gross_kg: 0, total_net_kg: 0, total_crates: 0, total_tare_kg: 0,
        tare_per_unit_kg: null, tare_unit_kind: null,
      };
      sharedByTag.set(tag, sg);
    }
    const net = p.net_kg - p.rejected_kg;
    sg.participants.push({ supplier_name: p.supplier_name, gross_kg: p.gross_kg, net_kg: net, crates_count: p.crates_count });
    sg.total_gross_kg += p.gross_kg; sg.total_net_kg += net; sg.total_crates += p.crates_count;
  }
  const sharedGroups = [...sharedByTag.values()].map(sg => {
    sg.total_tare_kg = Math.max(sg.total_gross_kg - sg.total_net_kg, 0);
    [sg.tare_per_unit_kg, sg.tare_unit_kind] = tareUnit(sg.total_tare_kg, sg.total_crates, 1, sg.crate_kind, sg.pallet_kind);
    return sg;
  });

  const pk = mergeKind<PalletKind>([...groups.map(g => g.pallet_kind), ...sharedGroups.map(g => g.pallet_kind)], "pallet");
  const ck = mergeKind<CrateKind>([...groups.map(g => g.crate_kind), ...sharedGroups.map(g => g.crate_kind)], "crate");
  // Each shared pallet counts once document-wide, not once per participant.
  const grandUnits = groups.reduce((a, g) => a + g.total_pallet_count, 0) + sharedGroups.length;
  const [tpu, tuk] = tareUnit(grandTare, grandCrates, grandUnits, ck, pk);
  const company = await getCompany();

  return {
    company_name:   company.name,
    // The client's own invoice number, once entered, replaces the internal SALE-… number.
    doc_number:     s(hdr.INVOICE_NUMBER) || s(hdr.DOC_NUMBER),
    doc_date:       fmtDate(hdr.DOC_DATE),
    warehouse_name: s(hdr.WAREHOUSE_NAME),
    customer_name:  s(hdr.CUSTOMER_NAME),
    vehicle_plate:  s(hdr.VEHICLE_PLATE),
    product_names:  productNames.join(", "),
    notes:          s(hdr.NOTES),
    groups, shared_groups: sharedGroups,
    total_gross_kg: grandGross, total_crates: grandCrates, total_tare_kg: grandTare, total_net_kg: grandNet,
    rejected_pallets: grandRejPallets, rejected_crates: grandRejCrates, rejected_kg: grandRejKg,
    pallet_kind: pk, crate_kind: ck,
    tare_per_unit_kg: tpu, tare_unit_kind: tuk, total_pallet_count: grandUnits,
  };
}

// ── Aviz de însoțire a mărfii (shipping note) ────────────────────────────
async function salesLines(docId: number, lang: Lang) {
  const rows = await query<Row>(`
    SELECT i.NAME_RO AS ITEM_NAME_RO, i.NAME_RU AS ITEM_NAME_RU,
           sl.NET_WEIGHT_KG, sl.PRICE_PER_KG, sl.AMOUNT
    FROM AGRO_SALES_LINES sl
    LEFT JOIN AGRO_ITEMS i ON i.ID = sl.ITEM_ID
    WHERE sl.SALES_DOC_ID = :1
    ORDER BY sl.ID
  `, [docId]);
  return rows.map(r => ({
    item_name:    pickName(lang, r.ITEM_NAME_RO, r.ITEM_NAME_RU),
    qty_kg:       n(r.NET_WEIGHT_KG),
    price_per_kg: n(r.PRICE_PER_KG),
    line_total:   n(r.AMOUNT),
  }));
}

export async function shippingNote(docId: number, lang: Lang) {
  const [hdr, lines, company] = await Promise.all([salesHeader(docId), salesLines(docId, lang), getCompany()]);
  return {
    company_name:     company.name,
    company_address:  company.address,
    company_idno:     company.fiscal_code,
    doc_number:       s(hdr.INVOICE_NUMBER) || s(hdr.DOC_NUMBER),
    doc_date:         fmtDate(hdr.DOC_DATE),
    customer_name:    s(hdr.CUSTOMER_NAME),
    customer_address: s(hdr.CUSTOMER_ADDRESS),
    customer_idno:    s(hdr.CUSTOMER_TAX_ID),
    currency_code:    s(hdr.CURRENCY_CODE),
    lines,
    total_qty_kg:     lines.reduce((a, l) => a + l.qty_kg, 0),
    total_amount:     lines.reduce((a, l) => a + l.line_total, 0),
    vehicle_number:   s(hdr.VEHICLE_PLATE),
    driver_name:      s(hdr.DRIVER_NAME),
    warehouse_name:   s(hdr.WAREHOUSE_NAME),
  };
}

// ── Declarație de export ─────────────────────────────────────────────────
// Keyed by the sales document. If no AGRO_EXPORT_DECLS row exists yet the
// declaration prints as a blank form pre-filled from the sale, to be
// completed by hand.
export async function exportDecl(docId: number, lang: Lang) {
  const [hdr, lines, company, decls, suppliers] = await Promise.all([
    salesHeader(docId),
    salesLines(docId, lang),
    getCompany(),
    query<Row>(`
      SELECT DECL_NUMBER, DECL_DATE, STATUS, DESTINATION_COUNTRY, TRANSPORT_MODE, PORT_OF_EXIT,
             PHYTO_CERT_NUMBER, PHYTO_CERT_DATE, NOTES
      FROM AGRO_EXPORT_DECLS WHERE SALES_DOC_ID = :1 ORDER BY ID DESC
    `, [docId]),
    // Every supplier whose batches went into this shipment — the GlobalGAP
    // box must list each one, since not all of them may be certified.
    query<Row>(`
      SELECT DISTINCT s.ID, s.NAME, s.GLOBALGAP_CERTIFIED, s.GLOBALGAP_CERT_NO, s.GLOBALGAP_EXPIRY
      FROM AGRO_BATCH_ALLOCATIONS ba
      JOIN AGRO_SALES_LINES sl ON sl.ID = ba.SALES_LINE_ID
      JOIN AGRO_BATCHES b ON b.ID = ba.BATCH_ID
      LEFT JOIN AGRO_PURCHASE_LINES pl ON pl.ID = b.PURCHASE_LINE_ID
      LEFT JOIN AGRO_PURCHASE_DOCS  pd ON pd.ID = pl.PURCHASE_DOC_ID
      LEFT JOIN AGRO_SUPPLIERS      s  ON s.ID  = pd.SUPPLIER_ID
      WHERE sl.SALES_DOC_ID = :1 AND s.ID IS NOT NULL
      ORDER BY s.NAME
    `, [docId]),
  ]);
  const ed = decls[0] ?? {};
  return {
    company_name:        company.name,
    company_address:     company.address,
    has_decl:            decls.length > 0,
    decl_number:         s(ed.DECL_NUMBER),
    decl_date:           fmtDate(ed.DECL_DATE),
    doc_number:          s(hdr.INVOICE_NUMBER) || s(hdr.DOC_NUMBER),
    status:              s(ed.STATUS),
    customer_name:       s(hdr.CUSTOMER_NAME),
    destination_country: s(ed.DESTINATION_COUNTRY) || s(hdr.CUSTOMER_COUNTRY),
    lines,
    total_qty_kg:        lines.reduce((a, l) => a + l.qty_kg, 0),
    total_amount:        lines.reduce((a, l) => a + l.line_total, 0),
    currency_code:       s(hdr.CURRENCY_CODE),
    transport_mode:      s(ed.TRANSPORT_MODE),
    port_of_exit:        s(ed.PORT_OF_EXIT),
    phytosanitary_cert:  s(ed.PHYTO_CERT_NUMBER),
    phyto_date:          fmtDate(ed.PHYTO_CERT_DATE),
    notes:               s(ed.NOTES),
    suppliers: suppliers.map(r => ({
      name:                s(r.NAME),
      globalgap_certified: r.GLOBALGAP_CERTIFIED === "Y",
      globalgap_cert_no:   s(r.GLOBALGAP_CERT_NO),
      globalgap_expiry:    fmtDate(r.GLOBALGAP_EXPIRY),
    })),
  };
}
