// "Agotados" (86): big touch targets per item and store. Instantly blocks web and Pollit-IA orders for it.
import { sb, state, esc, money, toast, errMsg, myStores, isAdmin } from "../lib.js";

export default async function (root) {
  const stores = myStores();
  let store = state.me.store_id || (stores[0] || {}).id;
  async function load() {
    const { data, error } = await sb.from("store_item_availability").select("*").eq("store_id", store);
    if (error) { toast(errMsg(error), "err"); return; }
    const off = new Set(data.filter((a) => !a.available).map((a) => a.item_id));
    root.innerHTML = `<div class="vhead"><h1>Agotados</h1>${isAdmin() || stores.length > 1 ? `<label>Sucursal<select id="st">${stores.map((s) => `<option value="${s.id}"${s.id === store ? " selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label>` : ""}</div>
      <p class="muted">Toca un producto para marcarlo como agotado en esta sucursal. La web y Pollit-IA dejan de venderlo al instante.</p>
      <div class="avail">${state.menu.filter((m) => m.active).map((m) => `<button type="button" data-item="${m.id}" class="${off.has(m.id) ? "off" : ""}" aria-pressed="${off.has(m.id)}">${esc(m.name)}<small>${off.has(m.id) ? "AGOTADO · tocar para reactivar" : money(m.price) + " · disponible"}</small></button>`).join("")}</div>`;
    const sel = root.querySelector("#st"); if (sel) sel.addEventListener("change", (e) => { store = e.target.value; load(); });
  }
  root.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-item]"); if (!b) return;
    const available = b.classList.contains("off");
    b.disabled = true;
    const { error } = await sb.from("store_item_availability").upsert({ store_id: store, item_id: b.dataset.item, available, updated_at: new Date().toISOString(), updated_by: state.me.user_id });
    if (error) { toast(errMsg(error), "err"); b.disabled = false; return; }
    toast(available ? "Disponible otra vez ✅" : "Marcado como agotado 🚫"); load();
  });
  await load();
  const ch = sb.channel(`avail-${Date.now()}`).on("postgres_changes", { event: "*", schema: "public", table: "store_item_availability" }, load).subscribe();
  return () => sb.removeChannel(ch);
}
