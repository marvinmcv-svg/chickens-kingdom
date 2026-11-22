// CRM: segments, search, filters, sort, CSV export; profile drawer with stats, history, favourites, addresses and editable fields.
import { sb, state, esc, money, dateTime, drawer, toast, errMsg, csv, storeName, phoneDisplay, statusPill } from "../lib.js";

const DAY = 86400000;
export function segmentOf(c, vipCut) {
  if (!c.orders_count) return "sin_pedidos";
  const days = c.last_order_at ? (Date.now() - new Date(c.last_order_at).getTime()) / DAY : 999;
  if (Number(c.total_spent) >= vipCut) return "vip";
  if (days > 60) return "perdido";
  if (c.orders_count >= 3 && days < 30) return "frecuente";
  if (c.orders_count >= 2 && days >= 30) return "en_riesgo";
  if (c.orders_count === 1) return "nuevo";
  return "ocasional";
}
const SEG = { vip: "VIP", frecuente: "Frecuente", en_riesgo: "En riesgo", nuevo: "Nuevo", ocasional: "Ocasional", perdido: "Perdido", sin_pedidos: "Sin pedidos" };

export default async function (root) {
  const { data, error } = await sb.from("customers").select("*").order("last_order_at", { ascending: false, nullsFirst: false }).limit(5000);
  if (error) { root.innerHTML = `<div class="empty">${esc(errMsg(error))}</div>`; return; }
  const spent = data.map((c) => Number(c.total_spent)).sort((a, b) => b - a);
  const vipCut = Math.max(500, spent[Math.floor(spent.length * 0.1)] || 0); // spent ≥ Bs 500 or top 10%
  data.forEach((c) => (c.segment = segmentOf(c, vipCut)));
  let seg = "", q = "", tag = "", pref = "", opt = "", sort = "last";
  root.innerHTML = `<div class="vhead"><h1>Clientes</h1><button class="btn" id="exp">Exportar CSV</button></div>
    <div class="seg" id="segs">${[["", "Todos"], ...Object.entries(SEG)].map(([k, v]) => `<button data-seg="${k}" class="${k === "" ? "is-on" : ""}">${v} <small>${k ? data.filter((c) => c.segment === k).length : data.length}</small></button>`).join("")}</div>
    <div class="toolbar" style="margin-top:12px">
      <label>Buscar<input id="q" placeholder="Nombre o teléfono"></label>
      <label>Etiqueta<input id="tag" placeholder="ej. empresa"></label>
      <label>Sucursal preferida<select id="pref"><option value="">Todas</option>${state.stores.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select></label>
      <label>Marketing<select id="opt"><option value="">Todos</option><option value="1">Acepta</option><option value="0">No acepta</option></select></label>
      <label>Orden<select id="sort"><option value="last">Último pedido</option><option value="spent">Más gasto</option><option value="orders">Más pedidos</option><option value="name">Nombre</option></select></label>
    </div><div id="tbl"></div>`;
  const $ = (s) => root.querySelector(s);
  function filtered() {
    const n = q.toLowerCase();
    return data.filter((c) => (!seg || c.segment === seg) && (!n || (c.name || "").toLowerCase().includes(n) || c.phone.includes(n.replace(/\D/g, "") || "§"))
      && (!tag || (c.tags || []).some((t) => t.toLowerCase().includes(tag.toLowerCase()))) && (!pref || c.preferred_store === pref) && (opt === "" || String(+c.marketing_opt_in) === opt))
      .sort((a, b) => sort === "spent" ? b.total_spent - a.total_spent : sort === "orders" ? b.orders_count - a.orders_count : sort === "name" ? (a.name || "").localeCompare(b.name || "") : String(b.last_order_at || "").localeCompare(String(a.last_order_at || "")));
  }
  function render() {
    const rows = filtered().slice(0, 300);
    $("#tbl").innerHTML = rows.length ? `<div class="tablewrap"><table><thead><tr><th>Cliente</th><th>Teléfono</th><th>Segmento</th><th>Pedidos</th><th>Gastado</th><th>Último</th><th>Sucursal</th></tr></thead><tbody>
      ${rows.map((c) => `<tr class="clickable" data-id="${c.id}"><td>${esc(c.name || "—")}${c.blocked ? ' <span class="tag tag--err">bloqueado</span>' : ""}</td><td>${esc(phoneDisplay(c.phone))}</td><td><span class="tag">${SEG[c.segment]}</span></td><td>${c.orders_count}</td><td>${money(c.total_spent)}</td><td>${dateTime(c.last_order_at)}</td><td>${esc(storeName(c.preferred_store))}</td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty">Sin clientes con esos filtros.</div>`;
  }
  $("#segs").addEventListener("click", (e) => { const b = e.target.closest("[data-seg]"); if (!b) return; seg = b.dataset.seg; root.querySelectorAll("#segs button").forEach((x) => x.classList.toggle("is-on", x === b)); render(); });
  [["#q", (v) => (q = v)], ["#tag", (v) => (tag = v)], ["#pref", (v) => (pref = v)], ["#opt", (v) => (opt = v)], ["#sort", (v) => (sort = v)]].forEach(([s, f]) => $(s).addEventListener("input", (e) => { f(e.target.value); render(); }));
  $("#exp").addEventListener("click", () => csv(filtered().map((c) => ({ nombre: c.name, telefono: c.phone, segmento: SEG[c.segment], pedidos: c.orders_count, gastado: c.total_spent, ultimo_pedido: c.last_order_at, sucursal: storeName(c.preferred_store), etiquetas: (c.tags || []).join("|"), marketing: c.marketing_opt_in ? "sí" : "no", cumpleanos: c.birthday || "" })), "clientes-chickens-kingdom.csv"));
  $("#tbl").addEventListener("click", (e) => { const tr = e.target.closest("[data-id]"); if (tr) profile(data.find((c) => c.id === tr.dataset.id)); });

  async function profile(c) {
    const [{ data: orders }, { data: addrs }] = await Promise.all([
      sb.from("orders").select("id, code, created_at, status, total, store_id, order_items(name, qty)").eq("customer_id", c.id).order("created_at", { ascending: false }).limit(50),
      sb.from("customer_addresses").select("*").eq("customer_id", c.id).order("last_used_at", { ascending: false }),
    ]);
    const fav = {}; (orders || []).forEach((o) => (o.order_items || []).forEach((i) => (fav[i.name] = (fav[i.name] || 0) + i.qty)));
    const d = drawer(`<h2>${esc(c.name || "Cliente")}</h2><p class="muted">${esc(phoneDisplay(c.phone))} · <span class="tag">${SEG[c.segment]}</span></p>
      <div class="cards"><div class="card kpi"><small>Pedidos</small><b>${c.orders_count}</b></div><div class="card kpi"><small>Gastado</small><b>${money(c.total_spent)}</b></div></div>
      <div class="section"><h3>Favoritos</h3>${Object.entries(fav).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, q]) => `<span class="tag">${esc(n)} × ${q}</span>`).join("") || '<p class="muted">—</p>'}</div>
      <div class="section"><h3>Direcciones</h3>${(addrs || []).map((a) => `<p>🏠 ${esc(a.address)}${a.reference ? ` · ${esc(a.reference)}` : ""}</p>`).join("") || '<p class="muted">—</p>'}</div>
      <form class="section" id="cf"><h3>Datos</h3>
        <div class="grid2"><label>Nombre<input name="name" value="${esc(c.name || "")}"></label><label>Correo<input name="email" type="email" value="${esc(c.email || "")}"></label>
        <label>Cumpleaños<input name="birthday" type="date" value="${esc(c.birthday || "")}"></label><label>Etiquetas (coma)<input name="tags" value="${esc((c.tags || []).join(", "))}"></label>
        <label>NIT / CI<input name="tax_id" value="${esc(c.tax_id || "")}"></label><label>Razón social<input name="business_name" value="${esc(c.business_name || "")}"></label></div>
        <label>Alergias<input name="allergies" value="${esc(c.allergies || "")}"></label><label>Notas<textarea name="notes" rows="2">${esc(c.notes || "")}</textarea></label>
        <label><input type="checkbox" name="marketing_opt_in"${c.marketing_opt_in ? " checked" : ""}>Acepta mensajes de marketing</label>
        <label><input type="checkbox" name="blocked"${c.blocked ? " checked" : ""}>Bloqueado (no puede pedir por la web)</label>
        <button class="btn btn--dark">Guardar</button></form>
      <div class="section"><h3>Historial</h3>${(orders || []).map((o) => `<p>${dateTime(o.created_at)} · ${esc(o.code)} · ${esc(storeName(o.store_id))} · ${statusPill(o.status)} · ${money(o.total)}</p>`).join("") || '<p class="muted">—</p>'}</div>`);
    d.el.querySelector("#cf").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const upd = { name: f.get("name") || null, email: f.get("email") || null, birthday: f.get("birthday") || null, tags: String(f.get("tags") || "").split(",").map((t) => t.trim()).filter(Boolean),
        tax_id: f.get("tax_id") || null, business_name: f.get("business_name") || null, allergies: f.get("allergies") || null, notes: f.get("notes") || null,
        marketing_opt_in: f.get("marketing_opt_in") === "on", blocked: f.get("blocked") === "on" };
      if (upd.marketing_opt_in && !c.marketing_opt_in) { upd.opt_in_at = new Date().toISOString(); upd.opt_in_source = "backoffice"; }
      const { error: err } = await sb.from("customers").update(upd).eq("id", c.id);
      if (err) toast(errMsg(err), "err"); else { Object.assign(c, upd); c.segment = segmentOf(c, vipCut); toast("Cliente actualizado"); d.close(); render(); }
    });
  }
  render();
}
