// "Hoy": today's KPIs, live counts per status, every store's status, latest orders.
import { sb, state, esc, money, hhmm, todayLocal, statusPill, STATUS, isAdmin, myStores, storeName } from "../lib.js";
import { openOrder } from "./order-actions.js";

export default async function (root) {
  async function load() {
    const day = todayLocal();
    const store = isAdmin() ? null : state.me.store_id;
    let q = sb.from("orders").select("id, code, order_no, status, total, created_at, store_id, customer_name").eq("business_day", day).order("created_at", { ascending: false });
    if (store) q = q.eq("store_id", store);
    const [{ data: rep }, { data: orders }, { data: stores }] = await Promise.all([
      sb.rpc("report_summary", { p_from: day, p_to: day, p_store: store }),
      q, sb.from("stores").select("*").order("sort"),
    ]);
    const counts = {}; (orders || []).forEach((o) => (counts[o.status] = (counts[o.status] || 0) + 1));
    const nowMin = (() => { const p = new Intl.DateTimeFormat("en-GB", { timeZone: "America/La_Paz", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).split(":"); return +p[0] * 60 + +p[1]; })();
    const tm = (t) => { const [h, m] = t.split(":"); return +h * 60 + +m; };
    const vis = (stores || []).filter((s) => isAdmin() || s.id === state.me.store_id);
    const r = rep || {};
    root.innerHTML = `<div class="vhead"><h1>Hoy</h1><span class="muted">${esc(day.split("-").reverse().join("/"))}</span></div>
      <div class="cards">
        <div class="card kpi"><small>Pedidos</small><b>${r.orders ?? 0}</b></div>
        <div class="card kpi"><small>Ventas</small><b>${money(r.revenue)}</b></div>
        <div class="card kpi"><small>Ticket promedio</small><b>${money(r.avg_ticket)}</b></div>
        <div class="card kpi ${Number(r.cancelled_pct) >= 3 ? "kpi--bad" : "kpi--good"}"><small>Cancelados</small><b>${r.cancelled ?? 0} <small>(${r.cancelled_pct ?? 0}%)</small></b></div>
      </div>
      <div class="cards">${Object.keys(STATUS).map((s) => `<a class="card kpi" href="#/pedidos" style="text-decoration:none;color:inherit"><small>${esc(STATUS[s].label)}</small><b style="color:${STATUS[s].color}">${counts[s] || 0}</b></a>`).join("")}</div>
      <h2>Sucursales</h2>
      <div class="cards">${vis.map((s) => {
        const open = nowMin >= tm(s.open_time.slice(0, 5)) && nowMin < tm(s.close_time.slice(0, 5));
        const paused = s.is_paused && (!s.paused_until || new Date(s.paused_until) > new Date());
        return `<a class="card" href="#/sucursales" style="text-decoration:none;color:inherit"><b>${esc(s.name)}</b><br><span class="tag ${paused ? "tag--warn" : open ? "tag--ok" : "tag--err"}">${paused ? "Pausada" : open ? "Abierta" : "Cerrada"}</span>
          <small class="muted">${s.open_time.slice(0, 5)}–${s.close_time.slice(0, 5)}</small></a>`;
      }).join("")}</div>
      <h2>Últimos pedidos</h2>
      ${(orders || []).length ? `<div class="tablewrap"><table><thead><tr><th>#</th><th>Código</th><th>Sucursal</th><th>Cliente</th><th>Hora</th><th>Estado</th><th>Total</th></tr></thead><tbody>
        ${orders.slice(0, 10).map((o) => `<tr class="clickable" data-id="${o.id}"><td>${o.order_no}</td><td>${esc(o.code)}</td><td>${esc(storeName(o.store_id))}</td><td>${esc(o.customer_name || "")}</td><td>${hhmm(o.created_at)}</td><td>${statusPill(o.status)}</td><td>${money(o.total)}</td></tr>`).join("")}</tbody></table></div>`
        : `<div class="empty">Todavía no hay pedidos hoy.</div>`}`;
  }
  root.addEventListener("click", (e) => { const tr = e.target.closest("[data-id]"); if (tr) openOrder(tr.dataset.id, load); });
  await load();
  const ch = sb.channel(`home-${Date.now()}`).on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load)
    .on("postgres_changes", { event: "*", schema: "public", table: "stores" }, load).subscribe();
  const t = setInterval(load, 60000);
  return () => { sb.removeChannel(ch); clearInterval(t); };
}
