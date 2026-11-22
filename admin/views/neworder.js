// Fast manual entry (phone / walk-in / WhatsApp / app): phone lookup, menu picker with search → place_order (server-priced).
import { sb, state, esc, money, toast, errMsg, isAdmin, myStores, CHANNELS, SERVICES, PAYMENTS } from "../lib.js";

export default async function (root) {
  const items = state.menu.filter((m) => m.active);
  const cart = new Map();
  let ref = crypto.randomUUID();
  root.innerHTML = `<div class="vhead"><h1>Nuevo pedido</h1></div>
    <div class="grid2" style="align-items:start">
      <section class="card">
        <h2>Cliente</h2>
        <div class="row"><label style="flex:1">WhatsApp / teléfono<input id="ph" inputmode="numeric" placeholder="71234567"></label><button class="btn" type="button" id="look">Buscar</button></div>
        <p class="muted" id="found"></p>
        <label>Nombre<input id="nm"></label>
        <div class="grid2">
          <label>Canal<select id="ch">${["phone", "walk_in", "whatsapp", "kingdom_app"].map((c) => `<option value="${c}">${CHANNELS[c]}</option>`).join("")}</select></label>
          <label>Servicio<select id="sv">${Object.entries(SERVICES).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
          <label>Sucursal<select id="st">${myStores().map((s) => `<option value="${s.id}"${s.id === state.me.store_id ? " selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label>
          <label>Para (hora, opcional)<input id="sc" type="time"></label>
        </div>
        <div id="addrBox"><label>Dirección<input id="ad"></label><label>Referencia<input id="rf"></label></div>
        <label>Notas<input id="nt" placeholder="Sin llajua, pago con Yape…"></label>
        <label>Forma de pago<select id="pm"><option value="">—</option>${Object.entries(PAYMENTS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
      </section>
      <section class="card">
        <h2>Productos</h2>
        <input id="q" placeholder="Buscar en el menú…" aria-label="Buscar en el menú">
        <div id="list" style="max-height:300px;overflow:auto;margin:8px 0"></div>
        <h3>Bandeja</h3><div id="cart"></div>
        <p class="err" id="msg" aria-live="polite"></p>
        <button class="btn btn--red btn--lg btn--block" id="go">Registrar pedido</button>
      </section>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const svc = () => $("#sv").value;
  const syncAddr = () => ($("#addrBox").hidden = svc() !== "delivery");
  $("#sv").addEventListener("change", syncAddr); syncAddr();
  function renderList() {
    const q = $("#q").value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    $("#list").innerHTML = items.filter((i) => !q || (i.name + " " + (i.description || "")).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(q))
      .map((i) => `<div class="row row--between" style="padding:6px 0;border-bottom:1px solid var(--line)"><span>${esc(i.name)} <small class="muted">${money(i.price)}</small></span><button class="btn btn--sm btn--red" data-add="${i.id}">+</button></div>`).join("") || `<p class="muted">Sin resultados</p>`;
  }
  function renderCart() {
    const rows = [...cart.entries()].map(([id, q]) => ({ it: items.find((i) => i.id === id), q }));
    const tot = rows.reduce((s, r) => s + r.it.price * r.q, 0);
    $("#cart").innerHTML = rows.length ? `<table><tbody>${rows.map((r) => `<tr><td>${esc(r.it.name)}</td><td><button class="btn btn--sm" data-dec="${r.it.id}">−</button> ${r.q} <button class="btn btn--sm" data-add="${r.it.id}">+</button></td><td>${money(r.it.price * r.q)}</td></tr>`).join("")}
      <tr><th colspan="2">Total estimado (el sistema recalcula)</th><th>${money(tot)}</th></tr></tbody></table>` : `<p class="muted">Vacía.</p>`;
    ref = crypto.randomUUID();
  }
  root.addEventListener("click", (e) => {
    const a = e.target.closest("[data-add]"); if (a) { cart.set(a.dataset.add, Math.min(50, (cart.get(a.dataset.add) || 0) + 1)); renderCart(); }
    const d = e.target.closest("[data-dec]"); if (d) { const q = (cart.get(d.dataset.dec) || 0) - 1; if (q > 0) cart.set(d.dataset.dec, q); else cart.delete(d.dataset.dec); renderCart(); }
  });
  $("#q").addEventListener("input", renderList);
  $("#look").addEventListener("click", async () => {
    const { data: norm } = await sb.rpc("normalize_phone", { p: $("#ph").value });
    if (!norm) { $("#found").textContent = "Número inválido."; return; }
    const { data: c } = await sb.from("customers").select("id, name, blocked, orders_count, customer_addresses(address, reference, last_used_at)").eq("phone", norm).maybeSingle();
    if (!c) { $("#found").textContent = "Cliente nuevo."; return; }
    $("#nm").value = c.name || "";
    const last = (c.customer_addresses || []).sort((a, b) => b.last_used_at.localeCompare(a.last_used_at))[0];
    if (last) { $("#ad").value = last.address; $("#rf").value = last.reference || ""; }
    $("#found").innerHTML = `Cliente conocido · ${c.orders_count} pedido(s)${c.blocked ? ' · <b style="color:var(--err)">BLOQUEADO</b>' : ""}`;
  });
  $("#go").addEventListener("click", async () => {
    $("#msg").textContent = "";
    if (!cart.size) { $("#msg").textContent = "Agrega al menos un producto."; return; }
    const btn = $("#go"); btn.disabled = true;
    const payload = {
      client_ref: `admin-${ref}`, channel: $("#ch").value, store: $("#st").value, service: svc(), customer_name: $("#nm").value.trim(), customer_phone: $("#ph").value.trim(),
      address: svc() === "delivery" ? $("#ad").value.trim() : null, reference: svc() === "delivery" ? $("#rf").value.trim() : null,
      scheduled_for: $("#sc").value || null, notes: $("#nt").value.trim() || null, items: [...cart.entries()].map(([id, qty]) => ({ id, qty })),
    };
    const { data, error } = await sb.rpc("place_order", { payload });
    btn.disabled = false;
    if (error) { $("#msg").textContent = errMsg(error); return; }
    const pm = $("#pm").value;
    if (pm) await sb.from("orders").update({ payment_method: pm }).eq("code", data.code);
    toast(`Pedido ${data.code} (#${data.order_no}) registrado · ${money(data.total)}`);
    location.hash = "#/pedidos";
  });
  renderList(); renderCart();
}
