/*
 * Pollit-IA deterministic tools. The model only PROPOSES tool calls; this file validates and executes them.
 * Every price, total, deal, opening hour and order is computed here from js/data.js (catalog()).
 */
"use strict";
const crypto = require("crypto");
const K = require("../js/data.js");
const CFG = require("../js/config.js");

const CAT = K.catalog();
const CUR = K.config.currency;
const DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const KIND_RANK = { combo: 0, main: 0, promo: 1, drink: 2, side: 3, sauce: 4, extra: 4, dessert: 5 };
const MAX_LINES = 30;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const money = (n) => `${CUR} ${Number.isInteger(n) ? n : String(Math.round(n * 100) / 100).replace(".", ",")}`;
const round2 = (n) => Math.round(n * 100) / 100;
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9/ ]+/g, " ").replace(/\s+/g, " ").trim();
const toMin = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };

/* ---------------- time ---------------- */
function clock(now) {
  const p = {};
  new Intl.DateTimeFormat("en-US", { timeZone: K.config.timezone, weekday: "short", hour: "2-digit", minute: "2-digit", year: "numeric", month: "2-digit", day: "2-digit", hourCycle: "h23" })
    .formatToParts(now || new Date()).forEach((x) => (p[x.type] = x.value));
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  const mins = (+p.hour % 24) * 60 + +p.minute;
  return { day, mins, hhmm: `${String(+p.hour % 24).padStart(2, "0")}:${p.minute}`, date: `${p.year}-${p.month}-${p.day}`, label: `${DAYS[day]} ${p.day}/${p.month}/${p.year} ${String(+p.hour % 24).padStart(2, "0")}:${p.minute}` };
}
function branchStatus(b, mins) {
  const o = toMin(b.open), c = toMin(b.close);
  if (mins >= o && mins < c) return c - mins <= 30 ? { open: true, label: "cierra pronto", code: "closing_soon" } : { open: true, label: "abierta", code: "open" };
  if (mins < o && o - mins <= 60) return { open: false, label: `abre a las ${b.open}`, code: "opens_soon" };
  return { open: false, label: mins < o ? `abre a las ${b.open}` : `cerrada, abre mañana a las ${b.open}`, code: "closed" };
}
const activePromos = (c) => K.weekly.filter((w) => !w.ref && w.day === c.day && (!w.until || c.date <= w.until));
const promoActiveOn = (w, c) => w.day === c.day && (!w.until || c.date <= w.until);

/* ---------------- search ---------------- */
// local words, English and slang → menu words. Multi-word keys are matched first and consume their words.
const SYNONYMS = {
  "sin carne": "@veg", "no meat": "@veg", "meat free": "@veg", vegetariano: "@veg", vegetariana: "@veg", veggie: "@veg", vegano: "@veg", vegan: "@veg",
  "1/4": "cuarto", quarter: "cuarto", "1/2": "medio", half: "medio",
  chicken: "pollo", pollito: "pollo", presa: "presas", piece: "presas", pieces: "presas",
  nuggets: "pipocas", nugget: "pipocas", popcorn: "pipocas", pipoca: "pipocas", bocaditos: "pipocas", poppers: "pipocas",
  fries: "papas", papitas: "papas", chips: "papas", "french fries": "papas",
  rice: "arroz", beans: "frijol", porotos: "frijol", frejol: "frijol", frijoles: "frijol",
  juice: "jugo", jugos: "jugo", refresco: "jugo", soda: "jugo", gaseosa: "jugo", bebida: "jugo", drink: "jugo", drinks: "jugo", tomar: "jugo",
  sauce: "salsa", salsas: "salsa", ketchup: "salsa", mayo: "salsa",
  "ice cream": "helado", helados: "helado", postre: "helado", dessert: "helado", paleta: "helado",
  big: "grande", large: "grande", grandote: "grande", medium: "mediano", small: "mediano", chico: "mediano", pequeno: "mediano", regular: "mediano",
  reina: "queen", rey: "king", "passion fruit": "maracuya", fresa: "frutilla", strawberry: "frutilla",
  wing: "ala", wings: "ala", alita: "ala", alitas: "ala", breast: "pecho", pechuga: "pecho", leg: "pierna", thigh: "entrepierna",
  menu: "combo", menues: "combo", promo: "yape", promocion: "yape", oferta: "yape",
};
const SYN_KEYS = Object.keys(SYNONYMS).map(norm).sort((a, b) => b.split(" ").length - a.split(" ").length);
const NEG = new Set(["sin", "without", "no", "except", "menos"]);
const STOP = new Set(["de", "del", "la", "el", "los", "las", "un", "una", "con", "y", "para", "por", "quiero", "dame", "me", "a", "en", "the", "with", "and", "please", "porfa", "que", "tienen", "hay", "algo", "opciones", "opcion", "something", "options", "anything", "tienes", "ver", "busco", "quisiera", "un poco"]);

function synVal(k) { const v = SYNONYMS[Object.keys(SYNONYMS).find((x) => norm(x) === k)]; return v.startsWith("@") ? v : norm(v); }
function itemWords(it) { return norm(`${it.name} ${it.desc} ${it.cat} ${it.kind} ${it.size || ""}`).split(" "); }
function tokenize(q) {
  let s = ` ${norm(q)} `;
  const toks = [];
  // multi-word synonyms consume their words
  SYN_KEYS.filter((k) => k.includes(" ")).forEach((k) => { if (s.includes(` ${k} `)) { s = s.replace(` ${k} `, " "); toks.push({ t: synVal(k), neg: false }); } });
  const words = s.trim().split(" ").filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    let w = words[i], neg = false;
    if (NEG.has(w) && words[i + 1]) { neg = true; w = words[++i]; }
    if (STOP.has(w)) continue;
    const syn = Object.keys(SYNONYMS).find((x) => norm(x) === w);
    toks.push({ t: syn ? synVal(norm(syn)) : w, neg });
  }
  return toks;
}
const wordHit = (words, tok) => words.some((w) => w === tok || (tok.length >= 3 && w.startsWith(tok)));
const MEATY = new Set(["main", "combo", "promo"]);

function searchMenu(query, ctx) {
  const toks = tokenize(query);
  const wantVeg = toks.some((t) => t.t === "@veg" && !t.neg);
  const negs = toks.filter((t) => t.neg && t.t !== "@veg").map((t) => t.t);
  const pos = toks.filter((t) => !t.neg && t.t !== "@veg").map((t) => t.t);
  const meatNeg = negs.some((n) => ["carne", "pollo", "meat"].includes(n));
  let items = Object.values(CAT);
  if (wantVeg || meatNeg) items = items.filter((it) => !MEATY.has(it.kind));
  const scored = items.map((it) => {
    const words = itemWords(it);
    if (negs.some((n) => wordHit(words, n))) return null;
    const hits = pos.filter((t) => wordHit(words, t)).length;
    const nameHits = pos.filter((t) => wordHit(norm(it.name).split(" "), t)).length;
    if (pos.length && !hits) return null;
    return { it, score: hits * 10 + nameHits * 5 - (KIND_RANK[it.kind] || 0) };
  }).filter(Boolean).sort((a, b) => b.score - a.score || (KIND_RANK[a.it.kind] || 0) - (KIND_RANK[b.it.kind] || 0) || a.it.price - b.it.price);
  const results = scored.slice(0, 8).map(({ it }) => brief(it, ctx));
  const out = { results };
  if (pos.includes("helado") || /helad|postre|ice cream/.test(norm(query))) {
    out.desserts = K.menu.find((c) => c.id === "helados").items.map((h) => h.name);
    out.note = "Los helados Kingdom no tienen precio publicado y no se pueden pedir por aquí: se consultan en la sucursal.";
  }
  if (wantVeg || meatNeg) out.note = (out.note ? out.note + " " : "") + "No hay platos principales sin carne: solo porciones, salsa y jugos (y helados en sucursal).";
  if (!results.length && !out.note) { logMiss(query, "no_results"); out.note = "Sin resultados en el menú."; }
  return out;
}
function brief(it, ctx) {
  const b = { id: it.id, name: it.name, price: it.price, kind: it.kind, desc: it.desc };
  if (it.kind === "promo") { const c = clock(ctx && ctx.now); b.available_today = promoActiveOn(K.weekly.find((w) => w.id === it.id), c); b.rules = K.promoRules; }
  return b;
}

/* ---------------- resolve items ---------------- */
const JUICE = { mango: "mango", maracuya: "maracuya", frutilla: "frutilla" };
function resolveItem(ref, size) {
  if (!ref) return { error: "Falta el producto." };
  const raw = String(ref).trim();
  if (CAT[raw]) return withSize(CAT[raw], size);
  const q = norm(raw);
  // exact name
  const exact = Object.values(CAT).find((it) => norm(it.name) === q);
  if (exact) return withSize(exact, size);
  const toks = tokenize(raw).filter((t) => !t.neg).map((t) => t.t);
  const sizeWord = size ? norm(size) : toks.find((t) => t === "grande" || t === "mediano");
  const core = toks.filter((t) => t !== "grande" && t !== "mediano");
  let cands = Object.values(CAT).filter((it) => { const w = norm(it.name).split(" "); return core.every((t) => wordHit(w, t)); });
  if (!cands.length) cands = Object.values(CAT).filter((it) => { const w = itemWords(it); return core.every((t) => wordHit(w, t)); });
  if (sizeWord) { const bySize = cands.filter((it) => it.kind !== "drink" || it.size === sizeWord); if (bySize.length) cands = bySize; }
  if (cands.length === 1) return { item: cands[0] };
  if (!cands.length) { logMiss(raw, "unresolved_item"); return { error: `No encontré «${raw}» en el menú.` }; }
  // prefer an exact-name-prefix match among main kinds
  const named = cands.filter((it) => norm(it.name).startsWith(q));
  if (named.length === 1) return { item: named[0] };
  return { ambiguous: true, options: cands.slice(0, 6).map((it) => ({ id: it.id, name: it.name, price: it.price })) };
}
function withSize(it, size) {
  if (!size) return { item: it };
  const s = norm(size).replace(/^(large|big)$/, "grande").replace(/^(medium|small|chico)$/, "mediano");
  if (it.kind !== "drink") return { item: it, note: `${it.name} no viene en tamaños.` };
  const flavor = Object.keys(JUICE).find((f) => it.id.includes(f));
  const target = CAT[`jugo-${flavor}-${s === "grande" ? "g" : "m"}`];
  return target ? { item: target } : { item: it, note: `Solo hay tamaños mediano y grande.` };
}

/* ---------------- cart ---------------- */
const cartLines = (cart) => Object.entries(cart).filter(([id, q]) => CAT[id] && q > 0).map(([id, q]) => ({ id, name: CAT[id].name, qty: q, unit: CAT[id].price, total: round2(CAT[id].price * q) }));
const cartTotal = (cart) => round2(cartLines(cart).reduce((s, l) => s + l.total, 0));
const cartView = (cart) => ({ lines: cartLines(cart), total: cartTotal(cart), total_text: money(cartTotal(cart)), items: cartLines(cart).reduce((s, l) => s + l.qty, 0) });

/* ---------------- deals ---------------- */
function comboValue(c) {
  const parts = c.parts.map((slot) => Math.min(...slot.map((id) => CAT[id].price)));
  return round2(parts.reduce((a, b) => a + b, 0));
}
function dealHints(state, now) {
  const cart = state.cart, total = cartTotal(cart), hints = [];
  K.combos.filter((c) => c.parts).forEach((c) => {
    const combo = CAT[c.id];
    const [mainSlot, drinkSlot] = c.parts;
    const main = mainSlot.find((id) => cart[id] > 0);
    if (!main) return;
    const drink = drinkSlot.find((id) => cart[id] > 0);
    if (drink) {
      const after = round2(total - CAT[main].price - CAT[drink].price + combo.price);
      if (after < total) hints.push({ type: "switch_to_combo", combo_id: c.id, combo: combo.name, replaces: [CAT[main].name, CAT[drink].name], saving: round2(total - after), total_if_accepted: after, total_if_accepted_text: money(after) });
    } else {
      const after = round2(total - CAT[main].price + combo.price);
      hints.push({ type: "almost_combo", combo_id: c.id, combo: combo.name, missing: "refresco (jugo o soda)", extra_cost: round2(combo.price - CAT[main].price), extra_cost_text: money(round2(combo.price - CAT[main].price)), total_if_accepted: after, total_if_accepted_text: money(after) });
    }
  });
  const c = clock(now);
  activePromos(c).forEach((w) => {
    const applies = cartLines(cart).filter((l) => (w.cats || []).includes(CAT[l.id].cat)).map((l) => l.name);
    if (applies.length) hints.push({ type: "promo_of_the_day", promo_id: w.id, promo: w.title, price: w.price, applies_to: applies, rules: K.promoRules });
  });
  return hints;
}

/* ---------------- WhatsApp + order ---------------- */
function normPhone(v) {
  let d = String(v || "").replace(/\D/g, "");
  const pre = K.config.phonePrefix;
  if (d.startsWith(pre) && d.length === pre.length + K.config.phoneDigits) d = d.slice(pre.length);
  return new RegExp(`^[67]\\d{${K.config.phoneDigits - 1}}$`).test(d) ? d : "";
}
function findBranch(ref) {
  if (!ref) return null;
  const q = norm(ref);
  return K.branches.find((b) => b.id === ref || norm(b.name) === q) || K.branches.find((b) => norm(b.name).startsWith(q) || q.includes(norm(b.name))) || null;
}
const mapsLink = (loc) => `https://maps.google.com/?q=${loc.lat},${loc.lng}`;
function waMessage(state, extra) {
  const o = state.order || {}, b = findBranch(o.branch), L = [];
  L.push(o.service === "delivery" ? "¡Hola Chicken's Kingdom! 🍗 Quiero hacer un pedido *a domicilio*:" : "¡Hola Chicken's Kingdom! 🍗 Quiero hacer un pedido *para recoger*:", "");
  cartLines(state.cart).forEach((l) => L.push(`• ${l.qty} × ${l.name}: ${money(l.total)}`));
  L.push(`*Total: ${money(cartTotal(state.cart))}*`, "");
  if (o.name) L.push(`👤 ${o.name}`);
  if (o.phone) L.push(`📱 ${o.phone}`);
  L.push(`📍 Sucursal: ${b ? `${b.name} (${b.city})` : "Call Center"}`);
  if (o.service === "delivery") { if (o.address) L.push(`🏠 ${o.address}`); if (o.reference) L.push(`↪ ${o.reference}`); if (o.location) L.push(`🗺️ ${mapsLink(o.location)}`); }
  L.push(`🕒 ${o.when && o.when !== "asap" ? `Para las ${o.when}` : "Lo antes posible"}`);
  if (o.payment) L.push(`💳 ${o.payment}`);
  if (o.notes) L.push(`💬 ${o.notes}`);
  L.push("", "(Pedido hecho con Pollit-IA)");
  if (extra) L.push("", ...extra);
  return L.join("\n");
}
const waUrl = (num, text) => `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
function orderToken(state) {
  const o = state.order || {};
  const payload = JSON.stringify([Object.entries(state.cart).sort(), o.service, o.branch, o.address || "", o.reference || "", o.location || null, o.when, o.name, o.phone, o.payment || "", o.notes || ""]);
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 16);
}
const trackUrl = (token) => `${CFG.siteUrl.replace(/\/$/, "")}${CFG.trackPath}?t=${encodeURIComponent(token)}`;
function missingDetails(state, now) {
  const o = state.order || {}, miss = [];
  if (!Object.keys(state.cart).length) miss.push("productos");
  if (!o.service) miss.push("service (delivery o recoger)");
  if (!o.branch) miss.push("branch (sucursal)");
  if (o.service === "delivery" && !o.address && !o.location) miss.push("address (dirección o ubicación)");
  if (!o.when) miss.push("when (lo antes posible u hora)");
  if (!o.name) miss.push("name (nombre)");
  if (!o.phone) miss.push("phone (WhatsApp de 8 dígitos)");
  return miss;
}
function timeProblem(o, now) {
  const b = findBranch(o.branch); if (!b) return null;
  const c = clock(now);
  const at = o.when && o.when !== "asap" ? toMin(o.when) : c.mins;
  if (o.when && o.when !== "asap" && at < c.mins) return `Esa hora ya pasó (son las ${c.hhmm}).`;
  if (at < toMin(b.open) || at >= toMin(b.close)) return `${b.name} atiende de ${b.open} a ${b.close}${o.when && o.when !== "asap" ? "" : ` y ahora está cerrada (son las ${c.hhmm})`}.`;
  return null;
}

/* ---------------- tool schemas (provider-neutral JSON Schema) ---------------- */
const S = (props, req) => ({ type: "object", properties: props, required: req || [], additionalProperties: false });
const str = (d) => ({ type: "string", description: d });
const TOOLS = [
  { name: "search_menu", description: "Busca en el menú por nombre, ingrediente o tipo (pollo, pipocas, jugo, sin carne…). Devuelve ids y precios reales.", input_schema: S({ query: str("Lo que busca el cliente, en sus palabras") }, ["query"]) },
  { name: "get_item_details", description: "Detalle de un producto: precio, contenido, promos y combos que lo incluyen. Siempre incluye el aviso de alérgenos.", input_schema: S({ item: str("id o nombre del producto") }, ["item"]) },
  { name: "get_whats_new", description: "Novedades: promo vigente, promo de hoy y combos.", input_schema: S({}) },
  { name: "get_branches", description: "Sucursales con horario, si están abiertas ahora, dirección, WhatsApp y mapa. Sin nombre devuelve todas.", input_schema: S({ name: str("nombre o parte del nombre de la sucursal o ciudad (opcional)") }) },
  { name: "get_deals", description: "Promo de hoy, combos con su ahorro y sugerencias según el carrito (con total_if_accepted exacto).", input_schema: S({}) },
  { name: "cart_add", description: "Agrega productos al carrito. Si es ambiguo devuelve opciones.", input_schema: S({ items: { type: "array", items: S({ item: str("id o nombre"), qty: { type: "integer", minimum: 1, maximum: 50 }, size: str("mediano o grande (solo jugos)") }, ["item"]) } }, ["items"]) },
  { name: "cart_remove", description: "Quita un producto del carrito (o qty unidades).", input_schema: S({ item: str("id o nombre"), qty: { type: "integer", minimum: 1, maximum: 50 } }, ["item"]) },
  { name: "cart_set_qty", description: "Fija la cantidad de un producto (0 lo quita).", input_schema: S({ item: str("id o nombre"), qty: { type: "integer", minimum: 0, maximum: 50 } }, ["item", "qty"]) },
  { name: "cart_clear", description: "Vacía el carrito.", input_schema: S({}) },
  { name: "cart_view", description: "Muestra el carrito y el total.", input_schema: S({}) },
  { name: "cart_undo", description: "Deshace el último cambio del carrito.", input_schema: S({}) },
  { name: "cart_swap_to_combo", description: "Cambia el plato (y el jugo si está) por el combo; el resto del carrito queda igual.", input_schema: S({ combo_id: str("id del combo") }, ["combo_id"]) },
  { name: "suggest_upsell", description: "Una sola sugerencia por conversación (completar combo, un jugo o una porción).", input_schema: S({}) },
  { name: "get_my_orders", description: "Mi Pedido: los últimos pedidos de este dispositivo.", input_schema: S({}) },
  { name: "reorder", description: "Carga un pedido anterior de Mi Pedido (0 = el más reciente) al carrito.", input_schema: S({ index: { type: "integer", minimum: 0, maximum: 2 } }, ["index"]) },
  { name: "set_order_details", description: "Guarda y valida los datos del pedido; devuelve lo que falta. Pago solo si el cliente lo menciona.", input_schema: S({
    service: { type: "string", enum: ["delivery", "pickup"] }, branch: str("sucursal"), address: str("dirección"), reference: str("referencia"),
    when: str("asap o HH:MM de hoy"), name: str("nombre"), phone: str("WhatsApp, 8 dígitos"), payment: str("forma de pago si el cliente la menciona"), notes: str("notas") }) },
  { name: "request_location", description: "Muestra el botón para compartir la ubicación (Entrega con Pin).", input_schema: S({}) },
  { name: "prepare_order", description: "Revisa que todo esté completo y arma la lectura final con un token de confirmación.", input_schema: S({}) },
  { name: "place_order", description: "Registra el pedido. SOLO después de un sí explícito del cliente a la lectura final.", input_schema: S({ token: str("token de prepare_order") }, ["token"]) },
  { name: "get_order_status", description: "Estado en vivo del último pedido (Sigue tu pedido).", input_schema: S({}) },
  { name: "handoff_to_human", description: "Pasa la conversación a una persona por WhatsApp (reclamos, devoluciones, eventos grandes, alergias severas, o tras 2 intentos fallidos).", input_schema: S({ reason: str("motivo"), summary: str("resumen corto") }, ["reason", "summary"]) },
  { name: "show_options", description: "Muestra 2 a 4 botones de respuesta rápida.", input_schema: S({ options: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 } }, ["options"]) },
  { name: "log_miss", description: "Registra algo que el cliente pidió y no supimos responder.", input_schema: S({ text: str("lo pedido"), reason: str("por qué no se pudo") }, ["text", "reason"]) },
];

/* ---------------- state ---------------- */
function sanitizeState(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  const cleanCart = (c) => {
    const out = {}; let n = 0;
    if (c && typeof c === "object") for (const [id, q] of Object.entries(c)) {
      if (!CAT[id] || n >= MAX_LINES) continue;
      const qty = Math.min(50, Math.max(0, Math.floor(Number(q) || 0)));
      if (qty > 0) { out[id] = qty; n++; }
    }
    return out;
  };
  const o = s.order && typeof s.order === "object" ? s.order : {};
  const order = {};
  if (o.service === "delivery" || o.service === "pickup") order.service = o.service;
  const b = findBranch(typeof o.branch === "string" ? o.branch : ""); if (b) order.branch = b.id;
  for (const k of ["address", "reference", "name", "payment", "notes"]) if (typeof o[k] === "string" && o[k].trim()) order[k] = o[k].trim().slice(0, 200);
  if (o.when === "asap" || (typeof o.when === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(o.when))) order.when = o.when;
  if (normPhone(o.phone)) order.phone = normPhone(o.phone);
  if (o.location && Number.isFinite(+o.location.lat) && Number.isFinite(+o.location.lng) && Math.abs(+o.location.lat) <= 90 && Math.abs(+o.location.lng) <= 180) order.location = { lat: +(+o.location.lat).toFixed(6), lng: +(+o.location.lng).toFixed(6) };
  const history = (Array.isArray(s.history) ? s.history : []).slice(0, 3).map((h) => ({
    id: String((h && h.id) || "").slice(0, 40), at: Number(h && h.at) || 0, branch: findBranch(h && h.branch) ? findBranch(h.branch).id : undefined,
    service: h && (h.service === "delivery" || h.service === "pickup") ? h.service : undefined, cart: cleanCart(h && h.cart),
    track: h && typeof h.track === "string" && UUID_RE.test(h.track) ? h.track : undefined,
  })).filter((h) => Object.keys(h.cart).length);
  const stage = ["browsing", "awaiting_confirmation", "placed"].includes(s.stage) ? s.stage : "browsing";
  const placed = s.placed && typeof s.placed === "object" && typeof s.placed.token === "string" ? {
    token: s.placed.token.slice(0, 16), id: String(s.placed.id || "").slice(0, 40), url: typeof s.placed.url === "string" && s.placed.url.startsWith("https://wa.me/") ? s.placed.url : "",
    track: typeof s.placed.track === "string" && UUID_RE.test(s.placed.track) ? s.placed.track : undefined, total: Number(s.placed.total) || 0, branch: String(s.placed.branch || "").slice(0, 60),
  } : null;
  return {
    cart: cleanCart(s.cart), prevCart: cleanCart(s.prevCart), order, stage,
    token: typeof s.token === "string" && /^[0-9a-f]{16}$/.test(s.token) ? s.token : null,
    upsold: !!s.upsold, newsShown: !!s.newsShown, history, placed,
  };
}

/* ---------------- confirmation detection ---------------- */
const YES = /^(si+|sí+|s[ií] por favor|claro|dale|ok(ay)?|okey|listo|va|vale|confirmo|confirmar|confirma|s[ií],? confirmar|s[ií] confirmo|correcto|perfecto|de una|yes|yep|sure|go ahead|confirm|exacto|as[ií] est[aá] bien|est[aá] bien|todo bien|👍|✅)[\s!.,🍗]*$/i;
const NOPE = /\b(no|pero|cambi|quita|saca|agrega|aumenta|añade|anade|espera|mejor|wait|but|change|remove|add)\b/i;
function isYes(text) {
  const t = String(text || "").trim();
  if (!t || t.length > 60 || NOPE.test(t)) return false;
  return YES.test(t) || /^(s[ií]|ok|dale|listo|claro|confirm[oa]r?)\b.{0,30}$/i.test(t);
}

/* ---------------- misses ---------------- */
function logMiss(text, reason) { try { console.log(JSON.stringify({ evt: "pollitia_miss", text: String(text).slice(0, 200), reason })); } catch (e) { /* noop */ } }

/* ---------------- runner ---------------- */
async function runTool(name, args, ctx) {
  const state = ctx.state, now = ctx.now, ev = [];
  const a = args && typeof args === "object" ? args : {};
  const emitCart = () => ev.push({ type: "cart", cart: Object.assign({}, state.cart) });
  const r = (result) => ({ result, events: ev });
  switch (name) {
    case "search_menu": return r(searchMenu(a.query || "", ctx));

    case "get_item_details": {
      const res = resolveItem(a.item);
      if (res.error || res.ambiguous) {
        const h = K.menu.find((c) => c.id === "helados").items.find((x) => norm(x.name) === norm(a.item) || norm(a.item).includes(norm(x.name)));
        if (h) return r({ name: `Helado ${h.name}`, desc: h.desc, price: null, note: "Precio no publicado: se consulta en la sucursal. No se puede pedir por aquí.", allergens: "No tenemos información de alérgenos; consulta en la sucursal." });
        return r(res);
      }
      const it = res.item, c = clock(now);
      return r({
        id: it.id, name: it.name, price: it.price, price_text: money(it.price), kind: it.kind, size: it.size, contents: it.desc,
        base: MEATY.has(it.kind) ? K.base : undefined,
        promos: K.weekly.filter((w) => !w.ref && (w.cats || []).includes(it.cat)).map((w) => ({ promo: w.title, day: DAYS[w.day], price: w.price, today: promoActiveOn(w, c), until: w.until })),
        combos: K.combos.filter((cb) => cb.parts && cb.parts.some((slot) => slot.includes(it.id))).map((cb) => ({ id: cb.id, name: CAT[cb.id].name, price: CAT[cb.id].price })),
        allergens: "No tenemos información de alérgenos; consulta en la sucursal antes de pedir.",
        rules: it.kind === "promo" ? K.promoRules : undefined,
      });
    }

    case "get_whats_new": {
      const c = clock(now); state.newsShown = true;
      return r({
        new_items: Object.values(CAT).filter((it) => it.hot && it.kind !== "promo").map((it) => brief(it, ctx)),
        weekly_promo: K.weekly.filter((w) => !w.ref && (!w.until || c.date <= w.until)).map((w) => ({ id: w.id, title: w.title, day: DAYS[w.day], price: w.price, until: w.until, desc: w.desc })),
        today: activePromos(c).map((w) => ({ id: w.id, title: w.title, price: w.price })),
        combos: K.combos.filter((cb) => cb.parts).map((cb) => ({ id: cb.id, name: CAT[cb.id].name, price: CAT[cb.id].price, contents: CAT[cb.id].desc })),
        rules: K.promoRules,
      });
    }

    case "get_branches": {
      const c = clock(now), q = norm(a.name || "");
      const list = K.branches.filter((b) => !q || norm(`${b.name} ${b.city}`).includes(q) || q.includes(norm(b.name)));
      if (!list.length) logMiss(a.name, "unknown_branch");
      return r({
        now: c.hhmm, open_now: K.branches.filter((b) => branchStatus(b, c.mins).open).length, total: K.branches.length,
        branches: (list.length ? list : K.branches).map((b) => ({ id: b.id, name: b.name, city: b.city, hours: `${b.open}–${b.close}`, status: branchStatus(b, c.mins).label, address: b.address, notes: b.notes || undefined, whatsapp: `+${b.whatsapp}`, maps: b.maps })),
        note: list.length ? undefined : "No encontré esa sucursal; estas son todas.",
      });
    }

    case "get_deals": {
      const c = clock(now);
      return r({
        today: activePromos(c).map((w) => ({ id: w.id, title: w.title, price: w.price, desc: w.desc, rules: K.promoRules })),
        next_promo: activePromos(c).length ? undefined : K.weekly.filter((w) => !w.ref && (!w.until || c.date <= w.until)).map((w) => `${w.title} los ${DAYS[w.day]} a ${money(w.price)}`)[0],
        combos: K.combos.filter((cb) => cb.parts).map((cb) => { const v = comboValue(cb); return { id: cb.id, name: CAT[cb.id].name, price: CAT[cb.id].price, contents: CAT[cb.id].desc, separately: v, saving: round2(v - CAT[cb.id].price), note: "«Por separado» compara el plato con un jugo mediano." }; }),
        cart_hints: dealHints(state, now),
        cart_total: cartTotal(state.cart),
      });
    }

    case "cart_add": {
      const items = Array.isArray(a.items) ? a.items.slice(0, 10) : [];
      const added = [], options = [], notes = [];
      const before = Object.assign({}, state.cart);
      const c = clock(now);
      for (const x of items) {
        const res = resolveItem(x && x.item, x && x.size);
        if (res.ambiguous) { options.push({ asked: x.item, options: res.options }); continue; }
        if (res.error) { notes.push(res.error); continue; }
        const it = res.item;
        if (res.note) notes.push(res.note);
        if (it.kind === "promo") {
          const w = K.weekly.find((p) => p.id === it.id);
          if (!promoActiveOn(w, c)) { notes.push(`${it.name} es solo los ${DAYS[w.day]}${w.until ? ` hasta el ${w.until.split("-").reverse().join("/")}` : ""}; hoy no está disponible.`); continue; }
          if ((state.order || {}).service === "delivery") notes.push("El Combo Yape es solo en sucursal (en mesa o para llevar), no delivery.");
        }
        if (!state.cart[it.id] && Object.keys(state.cart).length >= MAX_LINES) { notes.push("El carrito llegó al máximo de productos distintos."); continue; }
        const qty = Math.min(50, Math.max(1, Math.floor(Number(x.qty) || 1)));
        state.cart[it.id] = Math.min(50, (state.cart[it.id] || 0) + qty);
        added.push({ id: it.id, name: it.name, qty, unit: it.price });
      }
      if (added.length) { state.prevCart = before; state.stage = "browsing"; state.token = null; emitCart(); }
      return r({ added, needs_choice: options.length ? options : undefined, notes: notes.length ? notes : undefined, cart: cartView(state.cart) });
    }

    case "cart_remove": case "cart_set_qty": {
      const res = resolveItem(a.item);
      if (res.error || res.ambiguous) return r(res);
      const id = res.item.id;
      if (!state.cart[id] && name === "cart_remove") return r({ note: `${res.item.name} no está en el carrito.`, cart: cartView(state.cart) });
      const before = Object.assign({}, state.cart);
      if (name === "cart_remove") { const q = a.qty ? Math.floor(a.qty) : state.cart[id]; state.cart[id] -= q; }
      else state.cart[id] = Math.min(50, Math.max(0, Math.floor(Number(a.qty) || 0)));
      if (!(state.cart[id] > 0)) delete state.cart[id];
      state.prevCart = before; state.stage = "browsing"; state.token = null; emitCart();
      return r({ ok: true, cart: cartView(state.cart) });
    }

    case "cart_clear": { state.prevCart = Object.assign({}, state.cart); state.cart = {}; state.stage = "browsing"; state.token = null; emitCart(); return r({ ok: true, cart: cartView(state.cart) }); }
    case "cart_view": return r(cartView(state.cart));
    case "cart_undo": {
      if (!state.prevCart) return r({ note: "No hay nada que deshacer." });
      const cur = state.cart; state.cart = state.prevCart; state.prevCart = cur; state.stage = "browsing"; state.token = null; emitCart();
      return r({ ok: true, cart: cartView(state.cart) });
    }

    case "cart_swap_to_combo": {
      const cb = K.combos.find((x) => x.id === a.combo_id && x.parts);
      if (!cb) return r({ error: "Ese combo no existe." });
      const main = cb.parts[0].find((id) => state.cart[id] > 0);
      if (!main) return r({ error: `Para cambiar a ${CAT[cb.id].name} el carrito debe tener ${cb.parts[0].map((id) => CAT[id].name).join(" o ")}.` });
      const before = Object.assign({}, state.cart);
      const drink = cb.parts[1].find((id) => state.cart[id] > 0);
      for (const id of [main, drink].filter(Boolean)) { state.cart[id] -= 1; if (state.cart[id] <= 0) delete state.cart[id]; }
      state.cart[cb.id] = (state.cart[cb.id] || 0) + 1;
      state.prevCart = before; state.stage = "browsing"; state.token = null; emitCart();
      return r({ ok: true, swapped: [CAT[main].name, drink && CAT[drink].name].filter(Boolean), for: CAT[cb.id].name, cart: cartView(state.cart) });
    }

    case "suggest_upsell": {
      if (state.upsold) return r({ note: "Ya hiciste una sugerencia en esta conversación; no insistas." });
      if (!Object.keys(state.cart).length) return r({ note: "El carrito está vacío: primero ayuda a elegir." });
      state.upsold = true;
      const hint = dealHints(state, now).find((h) => h.type === "almost_combo" || h.type === "switch_to_combo");
      if (hint) return r({ suggestion: hint });
      const lines = cartLines(state.cart);
      const hasDrink = lines.some((l) => CAT[l.id].kind === "drink" || CAT[l.id].kind === "combo");
      const mains = lines.filter((l) => MEATY.has(CAT[l.id].kind)).reduce((s, l) => s + l.qty, 0);
      if (!hasDrink && mains) { const id = mains >= 3 ? "jugo-maracuya-g" : "jugo-maracuya-m"; return r({ suggestion: { type: "drink", id, name: CAT[id].name, price: CAT[id].price, why: "Para acompañar" } }); }
      if (!lines.some((l) => CAT[l.id].kind === "side")) return r({ suggestion: { type: "addon", id: "papas-fritas", name: CAT["papas-fritas"].name, price: CAT["papas-fritas"].price } });
      return r({ note: "No hay una sugerencia útil; no ofrezcas nada más." });
    }

    case "get_my_orders": {
      return r({ orders: state.history.map((h, i) => ({ index: i, code: h.id, when: h.at ? new Date(h.at).toISOString().slice(0, 10) : undefined, branch: h.branch && findBranch(h.branch).name, service: h.service, items: cartLines(h.cart).map((l) => `${l.qty} × ${l.name}`), total: cartTotal(h.cart) })), note: state.history.length ? undefined : "No hay pedidos anteriores en este dispositivo." });
    }

    case "reorder": {
      const h = state.history[Math.floor(Number(a.index) || 0)];
      if (!h) return r({ error: "No encontré ese pedido en Mi Pedido." });
      state.prevCart = Object.assign({}, state.cart);
      const c = clock(now);
      state.cart = Object.fromEntries(Object.entries(h.cart).filter(([id]) => CAT[id].kind !== "promo" || promoActiveOn(K.weekly.find((w) => w.id === id), c)));
      state.order = Object.assign({}, state.order, { branch: h.branch || state.order.branch, service: h.service || state.order.service });
      state.stage = "browsing"; state.token = null; emitCart();
      const dropped = Object.keys(h.cart).filter((id) => !state.cart[id]).map((id) => CAT[id].name);
      return r({ ok: true, cart: cartView(state.cart), branch: state.order.branch && findBranch(state.order.branch).name, service: state.order.service, dropped: dropped.length ? `${dropped.join(", ")} no está disponible hoy` : undefined });
    }

    case "set_order_details": {
      const o = state.order = Object.assign({}, state.order);
      const problems = [];
      if (a.service) { if (a.service === "delivery" || a.service === "pickup") o.service = a.service; else problems.push("service debe ser delivery o pickup"); }
      if (a.branch) { const b = findBranch(a.branch); if (b) o.branch = b.id; else { problems.push(`No existe la sucursal «${a.branch}». Sucursales: ${K.branches.map((x) => x.name).join(", ")}.`); logMiss(a.branch, "unknown_branch"); } }
      if (a.address) o.address = String(a.address).slice(0, 200);
      if (a.reference) o.reference = String(a.reference).slice(0, 200);
      if (a.name) o.name = String(a.name).slice(0, 80);
      if (a.notes) o.notes = String(a.notes).slice(0, 200);
      if (a.payment) o.payment = String(a.payment).slice(0, 60);
      if (a.phone) { const p = normPhone(a.phone); if (p) o.phone = p; else problems.push("El WhatsApp debe tener 8 dígitos y empezar con 6 o 7 (por ejemplo 71234567)."); }
      if (a.when) {
        const w = String(a.when).trim().toLowerCase();
        if (/^(asap|ya|ahora|lo antes posible|cuanto antes|now)$/.test(w)) o.when = "asap";
        else { const m = w.match(/^(\d{1,2})[:h.](\d{2})$/); if (m && +m[1] < 24 && +m[2] < 60) o.when = `${String(+m[1]).padStart(2, "0")}:${m[2]}`; else problems.push("La hora debe ser «asap» o HH:MM."); }
      }
      const tp = timeProblem(o, now); if (tp) problems.push(tp);
      if (o.service === "delivery" && Object.keys(state.cart).some((id) => CAT[id].inStoreOnly)) problems.push("El Combo Yape es solo en sucursal: para delivery hay que quitarlo, o elegir recoger.");
      state.stage = "browsing"; state.token = null;
      return r({ saved: o, problems: problems.length ? problems : undefined, missing: missingDetails(state, now), delivery_fee: o.service === "delivery" ? "El costo de envío se confirma por WhatsApp con la sucursal." : undefined });
    }

    case "request_location": ev.push({ type: "location" }); return r({ ok: true, note: "Se mostró el botón «Compartir mi ubicación»." });

    case "prepare_order": {
      const miss = missingDetails(state, now);
      if (miss.length) return r({ ready: false, missing: miss });
      const o = state.order, tp = timeProblem(o, now);
      if (tp) return r({ ready: false, problem: tp });
      if (o.service === "delivery" && Object.keys(state.cart).some((id) => CAT[id].inStoreOnly)) return r({ ready: false, problem: "El Combo Yape es solo en sucursal: quítalo o cambia a recoger." });
      const b = findBranch(o.branch);
      const summary = [
        ...cartLines(state.cart).map((l) => `${l.qty} × ${l.name} — ${money(l.total)}`),
        `Total: ${money(cartTotal(state.cart))}${o.service === "delivery" ? " + envío (se confirma por WhatsApp)" : ""}`,
        o.service === "delivery" ? `Delivery a: ${o.address || "ubicación compartida"}${o.reference ? ` (${o.reference})` : ""}` : "Para recoger en sucursal",
        `Sucursal: ${b.name} (${b.city})`, `Hora: ${o.when === "asap" ? "lo antes posible" : o.when}`, `A nombre de: ${o.name} · ${o.phone}`,
      ].join("\n");
      state.token = orderToken(state); state.stage = "awaiting_confirmation";
      ev.push({ type: "readback", summary });
      return r({ ready: true, token: state.token, summary, instruction: "Muestra la lectura y pregunta si confirma. Termina tu turno aquí; NO digas que está confirmado." });
    }

    case "place_order": {
      if (state.placed && state.placed.token === a.token && state.stage === "placed") {
        if (!ctx.placedThisTurn) ev.push({ type: "order", id: state.placed.id, url: state.placed.url, track: state.placed.track ? trackUrl(state.placed.track) : undefined, branch: state.placed.branch, total: state.placed.total });
        return r({ ok: true, duplicate: true, code: state.placed.id, note: "Este pedido ya estaba registrado; no se duplicó." });
      }
      if (!ctx.allowPlace) return r({ ok: false, error: "No puedes registrar el pedido todavía: primero muestra la lectura con prepare_order y espera el «sí» del cliente en su próximo mensaje." });
      if (state.stage !== "awaiting_confirmation" || !state.token || a.token !== state.token || orderToken(state) !== a.token) return r({ ok: false, error: "El pedido cambió desde la lectura: vuelve a llamar prepare_order." });
      const o = state.order, b = findBranch(o.branch);
      const payload = {
        client_ref: `pollitia-${a.token}-${o.phone}`, channel: "pollitia", store: b.id, service: o.service, customer_name: o.name, customer_phone: o.phone,
        address: o.service === "delivery" ? o.address || null : null, reference: o.service === "delivery" ? o.reference || null : null,
        lat: o.location ? o.location.lat : null, lng: o.location ? o.location.lng : null, scheduled_for: o.when && o.when !== "asap" ? o.when : null,
        notes: [o.notes, o.payment && `Pago: ${o.payment}`].filter(Boolean).join(" · ") || null,
        items: cartLines(state.cart).map((l) => ({ id: l.id, qty: l.qty })),
      };
      let code = `PI-${a.token.slice(0, 5).toUpperCase()}`, total = cartTotal(state.cart), track = null;
      const be = ctx.backend ? await ctx.backend.placeOrder(payload) : { offline: true };
      if (be.error) {
        state.stage = "awaiting_confirmation";
        return r({ ok: false, business_error: be.error, reason: be.message || be.error, instruction: "Explica el motivo con palabras simples y ofrece una alternativa (otra sucursal, quitar el producto, recoger)." });
      }
      if (be.data) { code = be.data.code; total = Number(be.data.total) || total; track = be.data.tracking_token; }
      else console.log(JSON.stringify({ evt: "pollitia_backend_offline", code }));
      const text = waMessage(state, [`Pedido *${code}*`, track ? `Sigue tu pedido: ${trackUrl(track)}` : null].filter(Boolean));
      const url = waUrl(b.whatsapp, text);
      const entry = { code, at: ctx.nowMs || Date.now(), branch: b.id, service: o.service, cart: Object.assign({}, state.cart), track: track || undefined };
      state.stage = "placed"; ctx.placedThisTurn = true;
      state.placed = { token: a.token, id: code, url, track: track || undefined, total, branch: b.name };
      state.history = [{ id: code, at: entry.at, branch: b.id, service: o.service, cart: entry.cart, track: track || undefined }].concat(state.history).slice(0, 3);
      ev.push({ type: "order", id: code, url, track: track ? trackUrl(track) : undefined, branch: b.name, total, entry, payload });
      return r({ ok: true, code, total, total_text: money(total), branch: b.name, recorded: !!be.data, instruction: "Dile que toque el botón verde para enviarlo por WhatsApp a la sucursal. No pegues enlaces." });
    }

    case "get_order_status": {
      const h = state.history[0];
      if (!h) return r({ note: "No hay pedidos recientes en este dispositivo." });
      const b = h.branch && findBranch(h.branch);
      if (b) ev.push({ type: "handoff", url: waUrl(b.whatsapp, `Hola, consulto por mi pedido ${h.id} 🍗`), to: b.name });
      if (!h.track) return r({ code: h.id, status: "unknown", note: "Este pedido no tiene seguimiento en línea; consulta por WhatsApp con la sucursal." });
      const t = ctx.backend ? await ctx.backend.trackOrder(h.track) : { offline: true };
      if (!t.data) { ev.push({ type: "track", url: trackUrl(h.track), code: h.id }); return r({ code: h.id, status: "unknown", note: "No pude consultar el estado ahora; usa el botón de seguimiento o el WhatsApp de la sucursal." }); }
      ev.push({ type: "track", url: trackUrl(h.track), code: t.data.code });
      return r({ code: t.data.code, status: t.data.status, service: t.data.service, events: (t.data.events || []).map((e) => ({ status: e.status, at: e.at })), cancel_reason: t.data.cancel_reason || undefined, note: "Describe el estado con esas palabras; no inventes horas ni etapas." });
    }

    case "handoff_to_human": {
      const b = findBranch((state.order || {}).branch);
      const num = b ? b.whatsapp : K.config.callCenter;
      const text = `Hola Chicken's Kingdom 👋 Vengo de Pollit-IA.\nMotivo: ${String(a.reason || "").slice(0, 120)}\nResumen: ${String(a.summary || "").slice(0, 400)}`;
      ev.push({ type: "handoff", url: waUrl(num, text), to: b ? b.name : "Chicken's Kingdom" });
      return r({ ok: true, to: b ? b.name : "WhatsApp oficial", note: "Se mostró el botón para hablar con una persona." });
    }

    case "show_options": {
      const opts = (Array.isArray(a.options) ? a.options : []).map((x) => String(x).slice(0, 40)).filter(Boolean).slice(0, 4);
      if (opts.length >= 2) ev.push({ type: "options", options: opts });
      return r({ ok: opts.length >= 2 });
    }

    case "log_miss": logMiss(a.text, a.reason); return r({ ok: true });

    default: return r({ error: `Herramienta desconocida: ${name}` });
  }
}

module.exports = {
  TOOLS, runTool, sanitizeState, isYes, searchMenu, resolveItem, dealHints, comboValue, cartView, cartTotal, orderToken, waMessage, normPhone,
  findBranch, clock, branchStatus, activePromos, trackUrl, CAT, money,
};
