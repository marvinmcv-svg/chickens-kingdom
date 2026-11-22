/*
 * Calls the public Supabase RPCs (place_order, track_order) with the publishable key.
 * 6 s timeout. If the backend is not configured or unreachable, returns { offline: true }
 * so the WhatsApp order still goes out (a restaurant must never lose an order because the DB is down).
 */
"use strict";
const CFG = require("../js/config.js");

const ERRORS = {
  store_paused: "Esa sucursal pausó los pedidos por un momento.",
  delivery_unavailable: "Esa sucursal no está tomando delivery ahora.",
  pickup_unavailable: "Esa sucursal no está tomando pedidos para recoger ahora.",
  invalid_phone: "El número de WhatsApp no es válido (8 dígitos, empieza con 6 o 7).",
  missing_address: "Falta la dirección para el delivery.",
  rate_limited: "Hubo varios pedidos seguidos desde ese número; hay que esperar unos minutos.",
  customer_blocked: "No se pudo registrar el pedido; la persona debe escribir por WhatsApp.",
  in_store_only: "El Combo Yape es solo en sucursal, no delivery.",
};
const explain = (code) => code.startsWith("sold_out:") ? `Se acabó ${code.slice(9)} en esa sucursal.`
  : code.startsWith("unknown_item:") ? "Uno de los productos ya no está en el menú."
  : ERRORS[code] || "No se pudo registrar el pedido.";

const enabled = () => !!(CFG.supabaseUrl && CFG.publishableKey);

async function rpc(fn, body) {
  if (!enabled()) return { offline: true };
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(`${CFG.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/${fn}`, {
      method: "POST", signal: ctrl.signal,
      headers: { apikey: CFG.publishableKey, Authorization: `Bearer ${CFG.publishableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => null);
    if (res.ok) return { data: j };
    const code = String((j && (j.message || j.error)) || "").trim();
    if (res.status >= 500 || !code) { console.error(`[pollitia] backend ${fn} status=${res.status}`); return { offline: true }; }
    return { error: code, message: explain(code) };
  } catch (err) {
    console.error(`[pollitia] backend ${fn} unreachable: ${err && err.message}`);
    return { offline: true };
  } finally { clearTimeout(to); }
}

module.exports = {
  enabled,
  async placeOrder(payload) { const r = await rpc("place_order", { payload }); return r.data && r.data.ok ? { data: r.data } : r.data ? { offline: true } : r; },
  async trackOrder(token) { const r = await rpc("track_order", { token }); return r.data && r.data.code ? { data: r.data } : { offline: true }; },
  explain,
};
