// Backoffice shell: auth, role-based navigation, hash router with lazy-loaded views and cleanup.
import { sb, configured, libFailed, state, esc, ROLES, storeName, errMsg, toast, loading } from "./lib.js";

const ROUTES = [
  { path: "", view: "home", label: "Hoy", icon: "🏠", roles: ["owner", "admin", "manager"] },
  { path: "pedidos", view: "orders", label: "Pedidos", icon: "🍗", roles: ["owner", "admin", "manager", "cashier", "kitchen", "rider"] },
  { path: "nuevo", view: "neworder", label: "Nuevo pedido", icon: "➕", roles: ["owner", "admin", "manager", "cashier"] },
  { path: "clientes", view: "customers", label: "Clientes", icon: "👥", roles: ["owner", "admin", "manager", "cashier"] },
  { path: "sucursales", view: "stores", label: "Sucursales", icon: "🏪", roles: ["owner", "admin", "manager"] },
  { path: "agotados", view: "availability", label: "Agotados", icon: "🚫", roles: ["owner", "admin", "manager", "cashier", "kitchen"] },
  { path: "menu", view: "menu", label: "Menú", icon: "📋", roles: ["owner", "admin"] },
  { path: "reportes", view: "reports", label: "Reportes", icon: "📊", roles: ["owner", "admin", "manager", "cashier"] },
  { path: "equipo", view: "team", label: "Equipo", icon: "🧑‍🍳", roles: ["owner", "admin"] },
  { path: "auditoria", view: "audit", label: "Auditoría", icon: "🔎", roles: ["owner", "admin"] },
  { path: "cuenta", view: "account", label: "Mi cuenta", icon: "🙂", roles: ["owner", "admin", "manager", "cashier", "kitchen", "rider"] },
];
const show = (id) => ["boot", "login", "setup", "app"].forEach((x) => (document.getElementById(x).hidden = x !== id));
let cleanup = null;

async function start() {
  if (!configured) { show("setup"); return; }
  if (libFailed) {
    show("setup");
    document.querySelector("#setup h1").textContent = "Sin conexión";
    document.querySelector("#setup p").textContent = "No se pudo cargar el backoffice. Revisa tu conexión a internet y recarga la página.";
    return;
  }
  const { data } = await sb.auth.getSession();
  if (data.session) await enter(); else show("login");
  sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT") { state.me = null; show("login"); } });
}

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = document.getElementById("loginErr"); err.textContent = "";
  const { error } = await sb.auth.signInWithPassword({ email: document.getElementById("loginEmail").value.trim(), password: document.getElementById("loginPw").value });
  if (error) { err.textContent = errMsg(error); return; }
  await enter();
});

async function enter() {
  show("boot");
  const { data: { user } } = await sb.auth.getUser();
  const { data: me } = await sb.from("staff").select("*").eq("user_id", user && user.id).maybeSingle();
  if (!me || !me.active) {
    await sb.auth.signOut(); show("login");
    document.getElementById("loginErr").textContent = "Tu usuario no tiene acceso al backoffice. Habla con el dueño.";
    return;
  }
  state.me = me;
  const [stores, menu, reasons] = await Promise.all([
    sb.from("stores").select("*").order("sort"),
    sb.from("menu_items").select("*").order("sort"),
    sb.from("cancel_reasons").select("*").order("sort"),
  ]);
  state.stores = stores.data || []; state.menu = menu.data || []; state.reasons = reasons.data || [];
  renderShell(); show("app");
  window.addEventListener("hashchange", route);
  route();
}

function allowed() { return ROUTES.filter((r) => r.roles.includes(state.me.role)); }
function renderShell() {
  document.getElementById("nav").innerHTML = allowed().map((r) => `<a href="#/${r.path}" data-path="${r.path}"><span aria-hidden="true">${r.icon}</span><b>${esc(r.label)}</b><i class="nav__badge" data-badge="${r.view}" hidden></i></a>`).join("");
  document.getElementById("me").innerHTML = `<b>${esc(state.me.full_name)}</b><small>${esc(ROLES[state.me.role])}${state.me.store_id ? " · " + esc(storeName(state.me.store_id)) : ""}</small>
    <button class="btn btn--sm" type="button" id="logout">Salir</button>`;
  document.getElementById("logout").addEventListener("click", () => sb.auth.signOut());
}

async function route() {
  const path = location.hash.replace(/^#\/?/, "").split("?")[0];
  const list = allowed();
  const r = list.find((x) => x.path === path) || list[0];
  if (r.path !== path) { location.hash = `#/${r.path}`; return; }
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("is-on", a.dataset.path === r.path));
  if (cleanup) { try { cleanup(); } catch (e) { /* ignore */ } cleanup = null; }
  const main = document.getElementById("main");
  const view = document.createElement("div"); view.className = "view"; // fresh element per route: no piled-up listeners
  main.replaceChildren(view); loading(view);
  try {
    const mod = await import(`./views/${r.view}.js`);
    cleanup = (await mod.default(view)) || null;
  } catch (e) {
    console.error(e); view.innerHTML = `<div class="empty">No se pudo cargar esta sección. ${esc(errMsg(e))}</div>`; toast(errMsg(e), "err");
  }
  main.focus({ preventScroll: true });
}

start().catch((e) => { console.error(e); show("login"); });
