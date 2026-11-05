import { Lang } from "./common";
import { salesPalletBon, shippingNote, exportDecl } from "./sales";
import { purchaseAct } from "./purchase";
import { custodyReleaseAct } from "./custody";
import { massBalance, parsePeriod } from "./stock";
import { qaProtocol, gmpChecklist, haccpReport } from "./quality";
import { returnAct } from "./returns";
import { reconciliationAct } from "./reconciliation";
import { tripSheet } from "./trips";

export { DocNotFound, parseLang } from "./common";

// "record" documents print one row (?id=…), "period" documents a date range
// (?date_from=…&date_to=…[&warehouse_id=…]).
type Builder =
  | { kind: "record"; build: (id: number, lang: Lang) => Promise<unknown> }
  | { kind: "period"; build: (sp: URLSearchParams, lang: Lang) => Promise<unknown> };

export const DOC_BUILDERS: Record<string, Builder> = {
  sales_pallet_bon:    { kind: "record", build: salesPalletBon },
  shipping_note:       { kind: "record", build: shippingNote },
  export_decl:         { kind: "record", build: exportDecl },
  purchase_act:        { kind: "record", build: purchaseAct },
  custody_release_act: { kind: "record", build: custodyReleaseAct },
  return_act:          { kind: "record", build: returnAct },
  trip_sheet:          { kind: "record", build: tripSheet },
  qa_protocol:         { kind: "record", build: qaProtocol },
  gmp_checklist:       { kind: "record", build: gmpChecklist },
  mass_balance:        { kind: "period", build: (sp, lang) => massBalance(parsePeriod(sp), lang) },
  haccp_report:        { kind: "period", build: (sp, lang) => haccpReport(parsePeriod(sp), lang) },
  reconciliation_act:  { kind: "period", build: reconciliationAct },
};
