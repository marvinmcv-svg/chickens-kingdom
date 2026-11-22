// Live kanban board per store: realtime + refetch on reconnect/visibility + 60s safety poll, beep on new orders.
import { sb, state, esc, money, hhmm, minsSince, ago, nextStep, STATUS, CHANNELS, SERVICES, isAdmin, myStores, beep } from "../lib.js";
import { advance, openOrder } from "./order-actions.js";

const COLS = ["new", "confirmed", "preparing", "frying", "ready", "out_for_delivery"];
const BASE_TITLE = "Pedidos · Chicken's Kingdom";

export default async function (root) {
  const stores = myStores();
  let store = isAdmin() ? "" : state.me.store_id;
  let orders = [], seen = null, unseen = 0;
  root.innerHTML = `<div class="vhead"><h1>Pedidos</h1>
    <div class="row">${isAdmin() ? `<label>Sucursal<select id="st"><option value="">Todas</option>${stores.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select></label>` : ""}
    <span class="muted" id="live">● En vivo</span></div></div>
    <div class="board" id="board"></div>
    <details class="section"><summary><b>Entregados y cancelados de hoy</b></summary><div id="closed"></div></details>`;
  const board = root.querySelector("#board");
  if (root.querySelector("#st")) root.querySelector("#st").addEventListener("change", (e) => { store = e.target.value; seen = null; load(); });

  const ageCls = (m) => (m < 10 ? "age--g" : m < 20 ? "age--a" : "age--r");
  function card(o, fresh) {
    const nx = nextStep(o), m = minsSince(o.created_at);
    return `<article class="ocard${fresh ? " is-new" : ""}" data-id="${o.id}" tabindex="0">
      <div class="ocard__top"><span class="ocard__no">#${esc(o.order_no || "")} <small class="muted">${esc(o.code)}</small></span><span class="ocard__age ${ageCls(m)}">${ago(o.created_at)}</span></div>
      <div class="row" style="gap:4px;margin-top:6px"><span class="tag">${esc(SERVICES[o.service])}</span><span class="tag">${esc(CHANNELS[o.channel])}</span>
        ${isAdmin() && !store ? `<span class="tag">${esc((state.stores.find((s) => s.id === o.store_id) || {}).name || "")}</span>` : ""}
        ${o.scheduled_for ? `<span class="tag tag--warn">🕒 ${hhmm(o.scheduled_for)}</span>` : ""}${o.possible_duplicate ? `<span class="tag tag--err">⚠ posible duplicado</span>` : ""}</div>
      <ul>${(o.order_items || []).map((i) => `<li>${i.qty} × ${esc(i.name)}</li>`).join("")}</ul>
      <div class="ocard__foot"><b>${money(o.total)}</b>${nx ? `<button class="btn btn--red btn--sm" data-next="${nx[0]}">${esc(nx[1])}</button>` : ""}</div></article>`;
  }
  function render(freshIds) {
    const active = orders.filter((o) => COLS.includes(o.status));
    board.innerHTML = COLS.map((c) => {
      const list = active.filter((o) => o.status === c);
      if (c === "out_for_delivery" && !list.length && !orders.some((o) => o.service === "delivery")) return "";
      return `<section class="col"><h3>${esc(STATUS[c].label)} <i>${list.length}</i></h3>${list.map((o) => card(o, freshIds.has(o.id))).join("") || '<p class="muted" style="padding:6px">—</p>'}</section>`;
    }).join("");
    const closed = orders.filter((o) => !COLS.includes(o.status));
    root.querySelector("#closed").innerHTML = closed.length ? `<div class="tablewrap"><table><tbody>${closed.map((o) => `<tr class="clickable" data-id="${o.id}"><td>#${o.order_no} ${esc(o.code)}</td><td>${esc(STATUS[o.status].label)}</td><td>${hhmm(o.created_at)}</td><td>${money(o.total)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Nada todavía.</p>`;
    const badge = document.querySelector('[data-badge="orders"]');
    const n = active.filter((o) => o.status === "new").length;
    if (badge) { badge.hidden = !n; badge.textContent = n; }
    document.title = unseen ? `(${unseen}) ${BASE_TITLE}` : BASE_TITLE;
  }
  async function load() {
    let q = sb.from("orders").select("*, order_items(name, qty)").eq("business_day", new Date().toLocaleDateString("en-CA", { timeZone: "America/La_Paz" })).order("created_at");
    if (store) q = q.eq("store_id", store);
    if (state.me.role === "rider") q = q.eq("service", "delivery");
    const { data, error } = await q;
    if (error) { root.querySelector("#live").textContent = "⚠ Sin conexión"; return; }
    root.querySelector("#live").textContent = "● En vivo";
    const fresh = new Set();
    if (seen) data.filter((o) => !seen.has(o.id) && o.status === "new").forEach((o) => fresh.add(o.id));
    if (fresh.size) {
      beep(); unseen += fresh.size;
      if (document.hidden && "Notification" in window && Notification.permission === "granted") new Notification("Nuevo pedido 🍗", { body: `${fresh.size} pedido(s) nuevo(s)` });
    }
    seen = new Set(data.map((o) => o.id)); orders = data; render(fresh);
  }
  root.addEventListener("click", async (e) => {
    unseen = 0; document.title = BASE_TITLE;
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    const nb = e.target.closest("[data-next]");
    if (nb) { e.stopPropagation(); const o = orders.find((x) => x.id === nb.closest("[data-id]").dataset.id); nb.disabled = true; if (await advance(o, nb.dataset.next)) load(); else nb.disabled = false; return; }
    const c = e.target.closest("[data-id]"); if (c) openOrder(c.dataset.id, load);
  });
  root.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches(".ocard")) openOrder(e.target.dataset.id, load); });

  await load();
  const ch = sb.channel(`orders-board-${Date.now()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => load())
    .subscribe((s) => { if (s === "SUBSCRIBED") load(); });
  const poll = setInterval(load, 60000);
  const tick = setInterval(() => render(new Set()), 30000);
  const onVis = () => { if (!document.hidden) { unseen = 0; load(); } };
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("online", load);
  return () => { sb.removeChannel(ch); clearInterval(poll); clearInterval(tick); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("online", load); document.title = BASE_TITLE; };
}
