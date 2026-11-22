// Menu editing (owner/admin): name, description, price, active, meat-free. Reminder to keep js/data.js in sync.
import { sb, state, esc, toast, errMsg } from "../lib.js";

export default async function (root) {
  const { data, error } = await sb.from("menu_items").select("*").order("sort");
  if (error) { root.innerHTML = `<div class="empty">${esc(errMsg(error))}</div>`; return; }
  root.innerHTML = `<div class="vhead"><h1>Menú</h1></div>
    <p class="card" style="margin-bottom:14px">⚠️ La base de datos cobra estos precios, pero la página muestra los de <code>js/data.js</code>. Si cambias un precio aquí, cámbialo también en <code>data.js</code> (o regenera el seed) para que coincidan.</p>
    <div class="tablewrap"><table><thead><tr><th>Producto</th><th>Descripción</th><th>Precio (Bs)</th><th>Activo</th><th>Sin carne</th><th></th></tr></thead><tbody>
    ${data.map((m) => `<tr data-id="${m.id}"><td><input name="name" value="${esc(m.name)}" aria-label="Nombre"><small class="muted">${esc(m.id)} · ${esc(m.kind)}</small></td>
      <td><textarea name="description" rows="2" aria-label="Descripción">${esc(m.description || "")}</textarea></td>
      <td><input name="price" type="number" min="0" step="0.5" value="${Number(m.price)}" style="width:90px" aria-label="Precio"></td>
      <td><input type="checkbox" name="active"${m.active ? " checked" : ""} aria-label="Activo"></td>
      <td><input type="checkbox" name="veg"${m.veg ? " checked" : ""} aria-label="Sin carne"></td>
      <td><button class="btn btn--sm btn--dark" data-save>Guardar</button></td></tr>`).join("")}</tbody></table></div>`;
  root.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-save]"); if (!b) return;
    const tr = b.closest("tr"), v = (n) => tr.querySelector(`[name="${n}"]`);
    const price = Number(v("price").value);
    if (!(price >= 0)) { toast("Precio inválido", "err"); return; }
    const { error: err } = await sb.from("menu_items").update({ name: v("name").value.trim(), description: v("description").value.trim(), price, active: v("active").checked, veg: v("veg").checked }).eq("id", tr.dataset.id);
    if (err) toast(errMsg(err), "err"); else { toast("Producto guardado. Recuerda actualizar data.js"); const it = state.menu.find((m) => m.id === tr.dataset.id); if (it) Object.assign(it, { price, active: v("active").checked }); }
  });
}
