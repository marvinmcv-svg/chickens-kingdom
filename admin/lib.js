// Backoffice shared library: Supabase client, state, formatters, labels, UI helpers, beep, CSV.
const CFG = window.KINGDOM_CONFIG || {};
export const configured = !!(CFG.supabaseUrl && CFG.publishableKey);
// Loaded lazily so an unconfigured site makes no network call, and a CDN failure shows a clear message.
let createClient = null;
if (configured) {
  try { ({ createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm")); }
  catch (e) { console.warn("[backoffice] no se pudo cargar supabase-js", e); }
}
export const sb = createClient ? createClient(CFG.supabaseUrl, CFG.publishableKey, { auth: { persistSession: true, autoRefreshToken: true } }) : null;
export const libFailed = configured && !sb;
export const siteUrl = (CFG.siteUrl || location.origin).replace(/\/$/, "");
export const trackUrl = (t) => `${siteUrl}${CFG.trackPath || "/sigue-tu-pedido/"}?t=${t}`;

export const state = { me: null, stores: [], menu: [], reasons: [] };

/* ---------- labels ---------- */
export const STATUS = {
  new: { label: "Nuevo", color: "#e4650a" }, confirmed: { label: "Confirmado", color: "#2f6fd6" }, preparing: { label: "En preparación", color: "#8a4fd0" },
  frying: { label: "En la freidora", color: "#c8141f" }, ready: { label: "Listo", color: "#11713a" }, out_for_delivery: { label: "En camino", color: "#0f8a8a" },
  delivered: { label: "Entregado", color: "#5e5e5e" }, cancelled: { label: "Cancelado", color: "#a3171f" },
};
export const NEXT = { new: ["confirmed", "Confirmar"], confirmed: ["preparing", "Empezar"], preparing: ["frying", "A la freidora"], frying: ["ready", "¡Listo!"] };
export function nextStep(o) {
  if (o.status === "ready") return o.service === "delivery" ? ["out_for_delivery", "Despachar"] : ["delivered", "Entregar"];
  if (o.status === "out_for_delivery") return ["delivered", "Entregar"];
  return NEXT[o.status] || null;
}
export const ROLES = { owner: "Dueño", admin: "Administrador", manager: "Gerente", cashier: "Caja", kitchen: "Cocina", rider: "Repartidor" };
export const CHANNELS = { web: "Web", pollitia: "Pollit-IA", whatsapp: "WhatsApp", phone: "Teléfono", walk_in: "Mostrador", kingdom_app: "App Kingdom" };
export const SERVICES = { delivery: "Delivery", pickup: "Recoger", dine_in: "En mesa" };
export const PAYMENTS = { yape: "Yape", qr: "QR", cash: "Efectivo", card: "Tarjeta", other: "Otro" };
export const PAY_STATUS = { pending: "Pendiente", paid: "Pagado", refunded: "Devuelto" };
export const isAdmin = () => state.me && ["owner", "admin"].includes(state.me.role);
export const isMgr = () => state.me && ["owner", "admin", "manager"].includes(state.me.role);
export const hasRole = (...r) => state.me && r.includes(state.me.role);
export const storeName = (id) => (state.stores.find((s) => s.id === id) || {}).name || id || "—";
export const myStores = () => (isAdmin() ? state.stores : state.stores.filter((s) => s.id === state.me.store_id));

/* ---------- formatters ---------- */
export const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const money = (n) => { n = Number(n) || 0; return `Bs ${Number.isInteger(n) ? n : n.toFixed(2).replace(".", ",")}`; };
const TZ = "America/La_Paz";
export const hhmm = (iso) => (iso ? new Intl.DateTimeFormat("es-BO", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso)) : "—");
export const dateTime = (iso) => (iso ? new Intl.DateTimeFormat("es-BO", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso)) : "—");
export const todayLocal = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
export const minsSince = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
export const ago = (iso) => { const m = minsSince(iso); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
export const phoneDisplay = (p) => (p ? p.replace(/^\+591/, "+591 ") : "—");

/* ---------- errors ---------- */
const ERR = {
  forbidden: "No tienes permiso para esto.", not_staff: "Tu usuario no es parte del equipo.", forbidden_store: "Esa sucursal no es la tuya.",
  reopen_needs_manager: "Solo un gerente puede reabrir un pedido cerrado.", kitchen_limited: "Cocina solo puede confirmar, preparar, freír y marcar listo.",
  rider_limited: "El repartidor solo puede despachar y entregar.", not_delivery: "Solo los pedidos de delivery salen «en camino».",
  cancel_reason_required: "Elige un motivo de cancelación.", cancel_note_required: "Escribe una nota para «Otro motivo».",
  cancel_needs_manager: "Cancelar un pedido ya en preparación necesita a un gerente.", recall_needs_manager: "Volver un pedido atrás necesita a un gerente.",
  weak_password: "La contraseña debe tener al menos 8 caracteres.", email_taken: "Ese correo ya tiene usuario.", invalid_email: "Correo inválido.",
  store_required: "Ese rol necesita una sucursal.", only_owner_creates_owner: "Solo el dueño puede crear otro dueño.", only_owner_edits_owner: "Solo el dueño puede editar a un dueño.",
  cannot_demote_self: "No puedes quitarte permisos ni desactivarte a ti mismo.", invalid_phone: "Teléfono inválido (8 dígitos, empieza con 6 o 7).",
  missing_name: "Falta el nombre del cliente.", missing_address: "Falta la dirección para el delivery.", store_paused: "La sucursal está pausada.",
  in_store_only: "El Combo Yape es solo en sucursal, no delivery.", no_items: "Agrega al menos un producto.", rate_limited: "Demasiados pedidos seguidos de ese número.",
};
export function errMsg(e) {
  const m = String((e && (e.message || e.error_description || e.error)) || e || "");
  if (m.startsWith("sold_out:")) return `Agotado en esa sucursal: ${m.slice(9)}`;
  if (m.startsWith("unknown_item:")) return "Producto desconocido o inactivo.";
  if (/Invalid login credentials/i.test(m)) return "Correo o contraseña incorrectos.";
  if (/permission denied|row-level security/i.test(m)) return ERR.forbidden;
  return ERR[m] || m || "Algo salió mal. Intenta de nuevo.";
}

/* ---------- UI ---------- */
export function toast(msg, kind = "ok") {
  const el = document.createElement("div");
  el.className = `toast toast--${kind}`; el.textContent = msg;
  document.getElementById("toasts").appendChild(el);
  setTimeout(() => el.classList.add("is-out"), 3200);
  setTimeout(() => el.remove(), 3700);
}
function overlay(cls, html, opts = {}) {
  const prev = document.activeElement;
  const wrap = document.createElement("div");
  wrap.className = `ov ${cls}`;
  wrap.innerHTML = `<div class="ov__scrim" data-close></div><div class="ov__panel" role="dialog" aria-modal="true" tabindex="-1">
    <button class="ov__x" type="button" data-close aria-label="Cerrar">✕</button>${html}</div>`;
  document.body.appendChild(wrap);
  const panel = wrap.querySelector(".ov__panel");
  const close = () => { document.removeEventListener("keydown", onKey); wrap.remove(); if (opts.onClose) opts.onClose(); if (prev && prev.focus) prev.focus(); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  wrap.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) close(); });
  setTimeout(() => (panel.querySelector("input,select,textarea,button:not(.ov__x)") || panel).focus(), 30);
  return { el: panel, close };
}
export const modal = (html, opts) => overlay("ov--modal", html, opts);
export const drawer = (html, opts) => overlay("ov--drawer", html, opts);
export function confirmBox(text, okLabel = "Confirmar") {
  return new Promise((resolve) => {
    let done = false;
    const m = modal(`<h2>${esc(text)}</h2><div class="row row--end"><button class="btn" data-close>Cancelar</button><button class="btn btn--red" id="cbOk">${esc(okLabel)}</button></div>`,
      { onClose: () => { if (!done) resolve(false); } });
    m.el.querySelector("#cbOk").addEventListener("click", () => { done = true; m.close(); resolve(true); });
  });
}
export function statusPill(s) { const st = STATUS[s] || { label: s, color: "#555" }; return `<span class="spill" style="--c:${st.color}">${esc(st.label)}</span>`; }
export function loading(root) { root.innerHTML = `<div class="loading"><span></span><span></span><span></span></div>`; }

/* ---------- beep (unlocked on first tap) ---------- */
let actx = null;
document.addEventListener("pointerdown", () => { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } } }, { once: true });
export function beep() {
  if (!actx) return;
  [0, 0.22].forEach((t) => {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = "triangle"; o.frequency.value = 880; o.connect(g); g.connect(actx.destination);
    g.gain.setValueAtTime(0.0001, actx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.4, actx.currentTime + t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + t + 0.18); o.start(actx.currentTime + t); o.stop(actx.currentTime + t + 0.2);
  });
}

/* ---------- CSV ---------- */
export function csv(rows, filename) {
  if (!rows.length) { toast("No hay datos para exportar", "warn"); return; }
  const cols = Object.keys(rows[0]);
  const cell = (v) => { const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const text = [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
  a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
