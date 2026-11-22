// Branches: hours, pause with reason and auto-resume, delivery/pick-up toggles, prep minutes, delivery fee, WhatsApp, address.
import { sb, state, esc, toast, errMsg, myStores, modal, hhmm } from "../lib.js";

export default async function (root) {
  async function load() {
    const { data, error } = await sb.from("stores").select("*").order("sort");
    if (error) { root.innerHTML = `<div class="empty">${esc(errMsg(error))}</div>`; return; }
    const mine = data.filter((s) => myStores().some((m) => m.id === s.id));
    const paused = (s) => s.is_paused && (!s.paused_until || new Date(s.paused_until) > new Date());
    root.innerHTML = `<div class="vhead"><h1>Sucursales</h1></div>
      <div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">${mine.map((s) => `
      <form class="card" data-id="${s.id}">
        <div class="row row--between"><h2 style="margin:0">${esc(s.name)}</h2><span class="tag ${paused(s) ? "tag--warn" : "tag--ok"}">${paused(s) ? `Pausada${s.paused_until ? " hasta " + hhmm(s.paused_until) : ""}` : "Recibiendo pedidos"}</span></div>
        <p class="muted">${esc(s.city)}${s.pause_reason && paused(s) ? ` · ${esc(s.pause_reason)}` : ""}</p>
        ${paused(s) ? `<button class="btn btn--ok btn--block" type="button" data-resume>Reanudar pedidos</button>` : `<button class="btn btn--block" type="button" data-pause>Pausar pedidos</button>`}
        <div class="grid2" style="margin-top:12px">
          <label>Abre<input name="open_time" type="time" value="${s.open_time.slice(0, 5)}"></label><label>Cierra<input name="close_time" type="time" value="${s.close_time.slice(0, 5)}"></label>
          <label>Minutos de preparación<input name="prep_minutes" type="number" min="1" max="240" value="${s.prep_minutes}"></label>
          <label>Costo de envío (Bs)<input name="delivery_fee" type="number" min="0" step="0.5" value="${s.delivery_fee ?? ""}" placeholder="Se cotiza"></label>
        </div>
        <label>WhatsApp (con 591)<input name="whatsapp" value="${esc(s.whatsapp || "")}" inputmode="numeric"></label>
        <label>Dirección<input name="address" value="${esc(s.address || "")}"></label>
        <label><input type="checkbox" name="accepts_delivery"${s.accepts_delivery ? " checked" : ""}>Acepta delivery</label>
        <label><input type="checkbox" name="accepts_pickup"${s.accepts_pickup ? " checked" : ""}>Acepta para recoger</label>
        <button class="btn btn--dark">Guardar</button>
      </form>`).join("")}</div>`;
  }
  const save = async (id, upd, msg) => { const { error } = await sb.from("stores").update(upd).eq("id", id); if (error) toast(errMsg(error), "err"); else { toast(msg); load(); } };
  root.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    save(e.target.dataset.id, { open_time: f.get("open_time"), close_time: f.get("close_time"), prep_minutes: Number(f.get("prep_minutes")) || 20,
      delivery_fee: f.get("delivery_fee") === "" ? null : Number(f.get("delivery_fee")), whatsapp: String(f.get("whatsapp") || "").replace(/\D/g, "") || null,
      address: f.get("address") || null, accepts_delivery: f.get("accepts_delivery") === "on", accepts_pickup: f.get("accepts_pickup") === "on" }, "Sucursal actualizada");
  });
  root.addEventListener("click", (e) => {
    const id = e.target.closest("[data-id]") && e.target.closest("[data-id]").dataset.id;
    if (e.target.closest("[data-resume]")) save(id, { is_paused: false, pause_reason: null, paused_until: null }, "Pedidos reanudados");
    if (e.target.closest("[data-pause]")) {
      const m = modal(`<h2>Pausar ${esc((state.stores.find((s) => s.id === id) || {}).name)}</h2><form id="pf">
        <label>Motivo<input name="reason" placeholder="Saturados, sin pollo, corte de luz…" required></label>
        <label>¿Por cuánto tiempo?<select name="mins"><option value="15">15 minutos</option><option value="30" selected>30 minutos</option><option value="60">1 hora</option><option value="0">Hasta que la reanude</option></select></label>
        <div class="row row--end"><button class="btn" type="button" data-close>Volver</button><button class="btn btn--red">Pausar</button></div></form>`);
      m.el.querySelector("#pf").addEventListener("submit", (ev) => {
        ev.preventDefault(); const f = new FormData(ev.target), mins = Number(f.get("mins"));
        m.close(); save(id, { is_paused: true, pause_reason: f.get("reason"), paused_until: mins ? new Date(Date.now() + mins * 60000).toISOString() : null }, "Sucursal pausada");
      });
    }
  });
  await load();
}
