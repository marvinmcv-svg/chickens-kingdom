// Audit (owner/admin): who changed what and when, with a readable before → after diff and filters.
import { sb, esc, dateTime, errMsg, STATUS } from "../lib.js";

const ENT = { orders: "Pedido", stores: "Sucursal", menu_items: "Menú", store_item_availability: "Agotados", staff: "Equipo" };
const ACT = { insert: "creó", update: "cambió", delete: "eliminó" };
const show = (k, v) => (v == null ? "—" : k === "status" && STATUS[v] ? STATUS[v].label : typeof v === "object" ? JSON.stringify(v) : String(v));

export default async function (root) {
  root.innerHTML = `<div class="vhead"><h1>Auditoría</h1></div>
    <div class="toolbar"><label>Tipo<select id="ent"><option value="">Todo</option>${Object.entries(ENT).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
    <label>Desde<input type="date" id="from"></label><button class="btn btn--dark" id="go">Filtrar</button></div><div id="list"></div>`;
  const $ = (s) => root.querySelector(s);
  async function load() {
    let q = sb.from("audit_log").select("*").order("created_at", { ascending: false }).limit(300);
    if ($("#ent").value) q = q.eq("entity", $("#ent").value);
    if ($("#from").value) q = q.gte("created_at", $("#from").value);
    const [{ data, error }, { data: staff }] = await Promise.all([q, sb.from("staff").select("user_id, full_name")]);
    if (error) { $("#list").innerHTML = `<div class="empty">${esc(errMsg(error))}</div>`; return; }
    const who = (id) => (id ? ((staff || []).find((s) => s.user_id === id) || {}).full_name || "Usuario" : "Web / Pollit-IA");
    $("#list").innerHTML = data.length ? `<div class="tablewrap"><table><thead><tr><th>Cuándo</th><th>Quién</th><th>Qué</th><th>Cambio</th></tr></thead><tbody>
      ${data.map((a) => {
        const d = a.data || {};
        const diff = a.action === "update" && d.new ? Object.keys(d.new).map((k) => `${esc(k)}: <del>${esc(show(k, d.old && d.old[k]))}</del> → <ins>${esc(show(k, d.new[k]))}</ins>`).join("\n")
          : esc(JSON.stringify(d.new || d.old || {}).slice(0, 220));
        return `<tr><td>${dateTime(a.created_at)}</td><td>${esc(who(a.actor))}</td><td>${esc(ACT[a.action] || a.action)} ${esc(ENT[a.entity] || a.entity)} <small class="muted">${esc(a.entity_id || "")}</small></td><td><pre class="diff">${diff}</pre></td></tr>`;
      }).join("")}</tbody></table></div>` : `<div class="empty">Sin cambios registrados.</div>`;
  }
  $("#go").addEventListener("click", load);
  await load();
}
