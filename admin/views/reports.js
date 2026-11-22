// Reports: date range + store, KPI tiles vs targets, SVG charts, top items, cancel reasons, CSV export of orders.
import { sb, state, esc, money, todayLocal, csv, toast, errMsg, isAdmin, myStores, storeName, CHANNELS, SERVICES, STATUS } from "../lib.js";

const TARGETS = { avg_prep_min: [15, "≤ 15 min"], avg_out_door_min: [20, "≤ 20 min"], avg_delivery_min: [40, "≤ 40 min"], cancelled_pct: [3, "< 3%"], late_pct: [20, "< 20%"] };
function tile(label, value, key, suffix = "") {
  let cls = "";
  if (key && value != null) cls = Number(value) <= TARGETS[key][0] ? "kpi--good" : Number(value) <= TARGETS[key][0] * 1.3 ? "kpi--warn" : "kpi--bad";
  return `<div class="card kpi ${cls}"><small>${esc(label)}</small><b>${value == null ? "—" : esc(value) + suffix}</b>${key ? `<small>meta ${TARGETS[key][1]}</small>` : ""}</div>`;
}
function barsSvg(rows, xKey, yKey, fmt) {
  if (!rows.length) return `<p class="muted">Sin datos.</p>`;
  const W = 640, H = 180, max = Math.max(...rows.map((r) => Number(r[yKey]))) || 1, bw = W / rows.length;
  return `<svg class="chart" viewBox="0 0 ${W} ${H + 24}" role="img" aria-label="Gráfico">${rows.map((r, i) => {
    const h = Math.max(2, (Number(r[yKey]) / max) * H);
    return `<rect x="${i * bw + 3}" y="${H - h}" width="${Math.max(2, bw - 6)}" height="${h}" rx="3" fill="#e4650a"><title>${esc(fmt(r))}</title></rect>
      <text x="${i * bw + bw / 2}" y="${H + 16}" text-anchor="middle">${esc(String(r[xKey]).slice(-5))}</text>`;
  }).join("")}</svg>`;
}
const barList = (rows, label, val, fmt) => rows.length ? `<div class="bars">${(() => { const max = Math.max(...rows.map(val)) || 1; return rows.map((r) => `<div><span>${esc(label(r))}</span><i style="width:${(val(r) / max) * 100}%"></i><b>${esc(fmt(r))}</b></div>`).join(""); })()}</div>` : `<p class="muted">Sin datos.</p>`;

export default async function (root) {
  const today = todayLocal();
  const from0 = new Date(Date.now() - 6 * 86400000).toLocaleDateString("en-CA", { timeZone: "America/La_Paz" });
  root.innerHTML = `<div class="vhead"><h1>Reportes</h1></div>
    <form class="toolbar" id="f"><label>Desde<input type="date" name="from" value="${from0}"></label><label>Hasta<input type="date" name="to" value="${today}"></label>
      ${isAdmin() ? `<label>Sucursal<select name="store"><option value="">Todas</option>${myStores().map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select></label>` : ""}
      <button class="btn btn--dark">Ver</button><button class="btn" type="button" id="exp">Exportar pedidos (CSV)</button></form><div id="out"></div>`;
  const form = root.querySelector("#f");
  async function run() {
    const f = new FormData(form);
    const { data: r, error } = await sb.rpc("report_summary", { p_from: f.get("from"), p_to: f.get("to"), p_store: f.get("store") || null });
    if (error) { root.querySelector("#out").innerHTML = `<div class="empty">${esc(errMsg(error))}</div>`; return; }
    root.querySelector("#out").innerHTML = `
      <div class="cards">${tile("Pedidos", r.orders)}${tile("Ventas", money(r.revenue))}${tile("Ticket promedio", money(r.avg_ticket))}${tile("Clientes", r.customers)}${tile("Clientes nuevos", r.new_customers)}</div>
      <div class="cards">${tile("Preparación (min)", r.avg_prep_min, "avg_prep_min")}${tile("Salida de sucursal (min)", r.avg_out_door_min, "avg_out_door_min")}${tile("Entrega delivery (min)", r.avg_delivery_min, "avg_delivery_min")}
        ${tile("Cancelados", r.cancelled_pct, "cancelled_pct", "%")}${tile("Tarde (> 45 min)", r.late_pct, "late_pct", "%")}</div>
      <div class="grid2" style="align-items:start">
        <section class="card"><h3>Ventas por día</h3>${barsSvg(r.by_day, "day", "revenue", (x) => `${x.day}: ${money(x.revenue)} · ${x.orders} pedidos`)}</section>
        <section class="card"><h3>Pedidos por hora</h3>${barsSvg(r.by_hour, "hour", "orders", (x) => `${x.hour}:00 · ${x.orders} pedidos`)}</section>
        <section class="card"><h3>Por sucursal</h3>${barList(r.by_store, (x) => storeName(x.store), (x) => Number(x.revenue), (x) => money(x.revenue))}</section>
        <section class="card"><h3>Por canal</h3>${barList(r.by_channel, (x) => CHANNELS[x.channel] || x.channel, (x) => x.orders, (x) => x.orders)}
          <h3 style="margin-top:14px">Por servicio</h3>${barList(r.by_service, (x) => SERVICES[x.service] || x.service, (x) => x.orders, (x) => x.orders)}</section>
        <section class="card"><h3>Más vendidos</h3>${barList(r.top_items, (x) => x.item, (x) => Number(x.qty), (x) => `${x.qty} u.`)}</section>
        <section class="card"><h3>Motivos de cancelación</h3>${barList(r.cancel_reasons, (x) => x.reason, (x) => x.count, (x) => x.count)}</section>
      </div>`;
  }
  form.addEventListener("submit", (e) => { e.preventDefault(); run(); });
  root.querySelector("#exp").addEventListener("click", async () => {
    const f = new FormData(form);
    let q = sb.from("orders").select("code, order_no, business_day, created_at, store_id, channel, service, status, customer_name, customer_phone, subtotal, delivery_fee, discount, total, payment_method, payment_status, cancel_reason")
      .gte("business_day", f.get("from")).lte("business_day", f.get("to")).order("created_at").limit(10000);
    if (f.get("store")) q = q.eq("store_id", f.get("store"));
    const { data, error } = await q;
    if (error) { toast(errMsg(error), "err"); return; }
    csv(data.map((o) => ({ ...o, store_id: storeName(o.store_id), status: STATUS[o.status].label })), `pedidos-${f.get("from")}_${f.get("to")}.csv`);
  });
  await run();
}
