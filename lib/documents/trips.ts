import { tripDetail } from "@/lib/deliveries";
import { DocNotFound, fmtDate, fmtDateTime, getCompany } from "./common";

// ── Foaie de parcurs / маршрутный лист ───────────────────────────────────
// Printed from the Deliveries page: the trip's vehicle, driver and stops in
// delivery order, with a signature line per stop for the consignee.
export async function tripSheet(id: number) {
  const [d, company] = await Promise.all([tripDetail(id), getCompany()]);
  if (!d) throw new DocNotFound("Рейс не найден");
  return {
    company_name: company.name, company_address: company.address, company_idno: company.fiscal_code,
    doc_number: d.number, doc_date: fmtDate(d.date), status: d.status,
    plate: d.plate, vehicle_type: d.vehicle_type, carrier: d.carrier, driver: d.driver, driver_phone: d.driver_phone,
    destination: d.destination, departed_at: d.departed_at ? fmtDateTime(d.departed_at) : "", notes: d.notes,
    stops: d.stops.map(x => ({
      customer_name: x.customer_name, address: x.address, phone: x.phone, sale_number: x.sale_number,
      sale_date: fmtDate(x.sale_date), net_kg: x.net_kg, amount: x.amount, currency: x.currency,
    })),
    total_kg: d.stops.reduce((a, x) => a + x.net_kg, 0),
  };
}
