// Team (owner/admin): staff list, create users, change role/store/active, reset password.
import { sb, state, esc, toast, errMsg, modal, ROLES, storeName } from "../lib.js";

export default async function (root) {
  const roleOpts = (sel) => Object.entries(ROLES).filter(([k]) => k !== "owner" || state.me.role === "owner").map(([k, v]) => `<option value="${k}"${k === sel ? " selected" : ""}>${v}</option>`).join("");
  const storeOpts = (sel) => `<option value="">Todas (solo dueño/admin)</option>` + state.stores.map((s) => `<option value="${s.id}"${s.id === sel ? " selected" : ""}>${esc(s.name)}</option>`).join("");
  async function load() {
    const { data, error } = await sb.from("staff").select("*").order("role").order("full_name");
    if (error) { root.innerHTML = `<div class="empty">${esc(errMsg(error))}</div>`; return; }
    root.innerHTML = `<div class="vhead"><h1>Equipo</h1><button class="btn btn--red" id="add">+ Nuevo usuario</button></div>
      <div class="tablewrap"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Sucursal</th><th>Estado</th><th></th></tr></thead><tbody>
      ${data.map((s) => `<tr data-id="${s.user_id}"><td>${esc(s.full_name)}${s.user_id === state.me.user_id ? " <small class='muted'>(tú)</small>" : ""}</td><td>${esc(s.email || "")}</td><td>${esc(ROLES[s.role])}</td><td>${esc(s.store_id ? storeName(s.store_id) : "Todas")}</td>
        <td>${s.active ? '<span class="tag tag--ok">Activo</span>' : '<span class="tag tag--err">Inactivo</span>'}</td>
        <td class="row"><button class="btn btn--sm" data-edit>Editar</button><button class="btn btn--sm" data-pw>Contraseña</button></td></tr>`).join("")}</tbody></table></div>`;
    root.querySelector("#add").addEventListener("click", () => {
      const m = modal(`<h2>Nuevo usuario</h2><form id="nf"><label>Nombre completo<input name="name" required></label><label>Correo<input name="email" type="email" required></label>
        <label>Contraseña temporal (mín. 8)<input name="pw" type="text" minlength="8" required></label><label>Teléfono<input name="phone"></label>
        <div class="grid2"><label>Rol<select name="role">${roleOpts("cashier")}</select></label><label>Sucursal<select name="store">${storeOpts(state.me.store_id)}</select></label></div>
        <p class="err" id="ne"></p><div class="row row--end"><button class="btn" type="button" data-close>Cancelar</button><button class="btn btn--red">Crear</button></div></form>`);
      m.el.querySelector("#nf").addEventListener("submit", async (e) => {
        e.preventDefault(); const f = new FormData(e.target);
        const { error: err } = await sb.rpc("admin_create_staff", { p_email: f.get("email"), p_password: f.get("pw"), p_full_name: f.get("name"), p_role: f.get("role"), p_store: f.get("store") || null, p_phone: f.get("phone") || null });
        if (err) { m.el.querySelector("#ne").textContent = errMsg(err); return; }
        m.close(); toast("Usuario creado. Entrégale su contraseña temporal en privado."); load();
      });
    });
    root.querySelector("tbody").addEventListener("click", (e) => {
      const tr = e.target.closest("[data-id]"); if (!tr) return;
      const s = data.find((x) => x.user_id === tr.dataset.id);
      if (e.target.closest("[data-edit]")) {
        const m = modal(`<h2>Editar ${esc(s.full_name)}</h2><form id="ef"><label>Nombre<input name="name" value="${esc(s.full_name)}"></label>
          <div class="grid2"><label>Rol<select name="role">${roleOpts(s.role)}</select></label><label>Sucursal<select name="store">${storeOpts(s.store_id)}</select></label></div>
          <label><input type="checkbox" name="active"${s.active ? " checked" : ""}>Activo</label><p class="err" id="ee"></p>
          <div class="row row--end"><button class="btn" type="button" data-close>Cancelar</button><button class="btn btn--red">Guardar</button></div></form>`);
        m.el.querySelector("#ef").addEventListener("submit", async (ev) => {
          ev.preventDefault(); const f = new FormData(ev.target);
          const { error: err } = await sb.rpc("admin_update_staff", { p_user: s.user_id, p_role: f.get("role"), p_store: f.get("store") || null, p_active: f.get("active") === "on", p_full_name: f.get("name") });
          if (err) { m.el.querySelector("#ee").textContent = errMsg(err); return; }
          m.close(); toast("Cambios guardados"); load();
        });
      }
      if (e.target.closest("[data-pw]")) {
        const m = modal(`<h2>Nueva contraseña para ${esc(s.full_name)}</h2><form id="pf"><label>Contraseña (mín. 8)<input name="pw" type="text" minlength="8" required></label><p class="err" id="pe"></p>
          <div class="row row--end"><button class="btn" type="button" data-close>Cancelar</button><button class="btn btn--red">Cambiar</button></div></form>`);
        m.el.querySelector("#pf").addEventListener("submit", async (ev) => {
          ev.preventDefault();
          const { error: err } = await sb.rpc("admin_set_password", { p_user: s.user_id, p_password: new FormData(ev.target).get("pw") });
          if (err) { m.el.querySelector("#pe").textContent = errMsg(err); return; }
          m.close(); toast("Contraseña actualizada");
        });
      }
    });
  }
  await load();
}
