// Order detail drawer: timeline, customer, address, payment, rider, notes, next/recall/cancel, WhatsApp, tracking link.
import { sb, state, esc, money, hhmm, dateTime, drawer, modal, toast, errMsg, statusPill, nextStep, STATUS, CHANNELS, SERVICES, PAYMENTS, PAY_STATUS,
  isMgr, hasRole, storeName, trackUrl, phoneDisplay } from "../lib.js";

export async function advance(order, status, extra = {}) {
  const { error } = await sb.rpc("set_order_status", { p_order: order.id, p_status: status, p_note: extra.note || null, p_cancel_reason: extra.reason || null });
  if (error) { toast(errMsg(error), "err"); return false; }
  toast(`${order.code}: ${STATUS[status].label}`);
  return true;
}

export async function openOrder(id, onChange) {
  const { data: o, error } = await sb.from("orders").select("*, order_items(*), order_events(*)").eq("id", id).single();
  if (error || !o) { toast(errMsg(error), "err"); return; }
  const events = (o.order_events || []).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const nx = nextStep(o);
  const riders = hasRole("owner", "admin", "manager", "cashier") ? (await sb.from("staff").select("user_id, full_name").eq("role", "rider").eq("active", true).eq("store_id", o.store_id)).data || [] : [];
  const maps = o.lat && o.lng ? `https://maps.google.com/?q=${o.lat},${o.lng}` : o.address ? `https://www.google.com/maps/search/${encodeURIComponent(o.address + " " + (state.stores.find((s) => s.id === o.store_id) || {}).city)}` : null;
  const canEdit = hasRole("owner", "admin", "manager", "cashier");
  const d = drawer(`
    <div class="row row--between"><h2>${esc(o.code)} <small class="muted">#${esc(o.order_no || "")}</small></h2>${statusPill(o.status)}</div>
    <p class="muted">${esc(storeName(o.store_id))} · ${esc(SERVICES[o.service])} · ${esc(CHANNELS[o.channel])} · ${dateTime(o.created_at)}${o.scheduled_for ? ` · programado ${hhmm(o.scheduled_for)}` : ""}</p>
    ${o.possible_duplicate ? `<p class="tag tag--warn">⚠ Posible duplicado</p>` : ""}
    <div class="row">${nx ? `<button class="btn btn--red btn--lg" data-act="next">${esc(nx[1])}</button>` : ""}
      ${o.customer_phone ? `<a class="btn btn--wa" target="_blank" rel="noopener" href="https://wa.me/${o.customer_phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hola ${o.customer_name || ""}, te escribimos de Chicken's Kingdom por tu pedido ${o.code} 🍗`)}">WhatsApp al cliente</a>` : ""}
      <button class="btn" data-act="copy">Copiar seguimiento</button></div>
    <div class="section"><h3>Productos</h3>
      <table><tbody>${(o.order_items || []).map((i) => `<tr><td>${i.qty} × ${esc(i.name)}</td><td style="text-align:right">${money(i.line_total)}</td></tr>`).join("")}
      <tr><td>Subtotal</td><td style="text-align:right">${money(o.subtotal)}</td></tr>
      <tr><td>Envío</td><td style="text-align:right">${money(o.delivery_fee)}</td></tr>
      ${Number(o.discount) ? `<tr><td>Descuento</td><td style="text-align:right">− ${money(o.discount)}</td></tr>` : ""}
      <tr><th>Total</th><th style="text-align:right">${money(o.total)}</th></tr></tbody></table></div>
    <div class="section"><h3>Cliente</h3>
      <p><b>${esc(o.customer_name || "—")}</b> · ${esc(phoneDisplay(o.customer_phone))}</p>
      ${o.service === "delivery" ? `<p>🏠 ${esc(o.address || "Ubicación compartida")}${o.reference ? ` · ↪ ${esc(o.reference)}` : ""} ${maps ? `<a href="${esc(maps)}" target="_blank" rel="noopener">Ver mapa ↗</a>` : ""}</p>` : ""}
      ${o.notes ? `<p>💬 ${esc(o.notes)}</p>` : ""}</div>
    ${canEdit ? `<form class="section" id="opsForm"><h3>Pago y despacho</h3>
      <div class="grid2">
        <label>Forma de pago<select name="payment_method"><option value="">—</option>${Object.entries(PAYMENTS).map(([k, v]) => `<option value="${k}"${o.payment_method === k ? " selected" : ""}>${v}</option>`).join("")}</select></label>
        <label>Estado del pago<select name="payment_status">${Object.entries(PAY_STATUS).map(([k, v]) => `<option value="${k}"${o.payment_status === k ? " selected" : ""}>${v}</option>`).join("")}</select></label>
        ${o.service === "delivery" ? `<label>Repartidor<select name="rider_id"><option value="">—</option>${riders.map((r) => `<option value="${r.user_id}"${o.rider_id === r.user_id ? " selected" : ""}>${esc(r.full_name)}</option>`).join("")}</select></label>
        <label>Costo de envío (Bs)<input name="delivery_fee" type="number" min="0" step="0.5" value="${Number(o.delivery_fee)}"></label>` : ""}
        <label>Cambio para (Bs)<input name="cash_change_for" type="number" min="0" step="1" value="${o.cash_change_for ?? ""}"></label>
        <label>NIT / CI factura<input name="invoice_tax_id" value="${esc(o.invoice_tax_id || "")}"></label>
      </div>
      <label>Notas<textarea name="notes" rows="2">${esc(o.notes || "")}</textarea></label>
      <button class="btn btn--dark" type="submit">Guardar</button></form>` : ""}
    <div class="section"><h3>Historial</h3><ol class="timeline">${events.map((e) => `<li><time>${hhmm(e.created_at)}</time><span>${statusPill(e.status)} ${esc(e.note || "")}</span></li>`).join("")}</ol></div>
    <div class="section row">
      ${isMgr() ? `<button class="btn" data-act="recall">Volver a un estado anterior</button>` : ""}
      ${o.status !== "cancelled" && o.status !== "delivered" ? `<button class="btn btn--ghost" data-act="cancel" style="color:var(--err)">Cancelar pedido</button>` : ""}
    </div>`);
  const changed = () => { d.close(); if (onChange) onChange(); };
  d.el.addEventListener("click", async (e) => {
    const act = e.target.closest("[data-act]"); if (!act) return;
    const a = act.dataset.act;
    if (a === "next" && nx && (await advance(o, nx[0]))) changed();
    if (a === "copy") { try { await navigator.clipboard.writeText(trackUrl(o.tracking_token)); toast("Enlace de seguimiento copiado"); } catch (err) { toast(trackUrl(o.tracking_token)); } }
    if (a === "cancel") {
      const m = modal(`<h2>Cancelar ${esc(o.code)}</h2><form id="cf"><label>Motivo<select name="reason" required><option value="">Elige un motivo</option>${state.reasons.map((r) => `<option value="${r.code}">${esc(r.label)}</option>`).join("")}</select></label>
        <label>Nota<textarea name="note" rows="2"></textarea></label><div class="row row--end"><button class="btn" type="button" data-close>Volver</button><button class="btn btn--red">Cancelar pedido</button></div></form>`);
      m.el.querySelector("#cf").addEventListener("submit", async (ev) => { ev.preventDefault(); const f = new FormData(ev.target); if (await advance(o, "cancelled", { reason: f.get("reason"), note: f.get("note") })) { m.close(); changed(); } });
    }
    if (a === "recall") {
      const m = modal(`<h2>Volver ${esc(o.code)} a…</h2><form id="rf"><label>Estado<select name="s">${Object.entries(STATUS).filter(([k]) => k !== o.status && k !== "cancelled").map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("")}</select></label>
        <label>Nota<input name="note"></label><div class="row row--end"><button class="btn" type="button" data-close>Volver</button><button class="btn btn--red">Cambiar</button></div></form>`);
      m.el.querySelector("#rf").addEventListener("submit", async (ev) => { ev.preventDefault(); const f = new FormData(ev.target); if (await advance(o, f.get("s"), { note: f.get("note") })) { m.close(); changed(); } });
    }
  });
  const form = d.el.querySelector("#opsForm");
  if (form) form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(form), upd = {};
    for (const [k, v] of f.entries()) upd[k] = v === "" ? null : ["delivery_fee", "cash_change_for"].includes(k) ? Number(v) : v;
    if (upd.delivery_fee == null && "delivery_fee" in upd) upd.delivery_fee = 0;
    const { error: err } = await sb.from("orders").update(upd).eq("id", o.id);
    if (err) toast(errMsg(err), "err"); else { toast("Pedido actualizado"); changed(); }
  });
}
