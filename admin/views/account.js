// My account: profile summary and change own password.
import { sb, state, esc, toast, errMsg, ROLES, storeName } from "../lib.js";

export default async function (root) {
  const me = state.me;
  root.innerHTML = `<div class="vhead"><h1>Mi cuenta</h1></div>
    <div class="grid2" style="align-items:start">
      <section class="card"><h2>${esc(me.full_name)}</h2><p>${esc(me.email || "")}</p><p><span class="tag">${esc(ROLES[me.role])}</span> ${me.store_id ? esc(storeName(me.store_id)) : "Todas las sucursales"}</p></section>
      <form class="card" id="pf"><h2>Cambiar contraseña</h2>
        <label>Nueva contraseña (mín. 8)<input type="password" name="pw" minlength="8" required autocomplete="new-password"></label>
        <label>Repite la contraseña<input type="password" name="pw2" minlength="8" required autocomplete="new-password"></label>
        <p class="err" id="pe" aria-live="polite"></p><button class="btn btn--red">Guardar</button></form>
    </div>`;
  root.querySelector("#pf").addEventListener("submit", async (e) => {
    e.preventDefault(); const f = new FormData(e.target), err = root.querySelector("#pe");
    if (f.get("pw") !== f.get("pw2")) { err.textContent = "Las contraseñas no coinciden."; return; }
    const { error } = await sb.auth.updateUser({ password: f.get("pw") });
    if (error) { err.textContent = errMsg(error); return; }
    err.textContent = ""; e.target.reset(); toast("Contraseña actualizada");
  });
}
