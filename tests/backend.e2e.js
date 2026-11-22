#!/usr/bin/env node
/*
 * Live checks against the real Supabase project (creates test orders, then cancels them).
 *   node tests/backend.e2e.js <ownerEmail> <ownerPw> <managerEmail> <managerPw> <kitchenEmail> <kitchenPw>
 * Uses only the publishable key from js/config.js plus those staff logins. Never the service-role key.
 */
"use strict";
const CFG = require("../js/config.js");
const [ownerE, ownerP, mgrE, mgrP, kitE, kitP] = process.argv.slice(2);
if (!CFG.supabaseUrl || !CFG.publishableKey) { console.error("Fill js/config.js first."); process.exit(1); }
if (!kitP) { console.error("Usage: node tests/backend.e2e.js ownerEmail ownerPw managerEmail managerPw kitchenEmail kitchenPw"); process.exit(1); }
const base = CFG.supabaseUrl.replace(/\/$/, "");
let fails = 0;
const check = (name, cond, extra) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && extra ? " :: " + JSON.stringify(extra).slice(0, 300) : ""}`); if (!cond) fails++; };
async function call(path, { method = "POST", body, token } = {}) {
  const res = await fetch(base + path, { method, headers: { apikey: CFG.publishableKey, Authorization: `Bearer ${token || CFG.publishableKey}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => null);
  return { status: res.status, data: j };
}
const rpc = (fn, body, token) => call(`/rest/v1/rpc/${fn}`, { body, token });
async function login(email, password) { const r = await call("/auth/v1/token?grant_type=password", { body: { email, password } }); if (!r.data || !r.data.access_token) throw new Error(`login failed for ${email}`); return r.data.access_token; }

(async () => {
  const run = Date.now().toString(36);
  const phone = "7" + String(Math.floor(1000000 + Math.random() * 8999999));
  const [owner, mgr, kit] = [await login(ownerE, ownerP), await login(mgrE, mgrP), await login(kitE, kitP)];
  const { data: me } = await call(`/rest/v1/staff?select=store_id&role=eq.manager&email=eq.${encodeURIComponent(mgrE)}`, { method: "GET", token: mgr });
  const store = me && me[0] && me[0].store_id;
  check("manager has a store", !!store, me);
  const payload = { client_ref: `e2e-${run}`, channel: "web", store, service: "pickup", customer_name: "Prueba E2E", customer_phone: phone, items: [{ id: "combo-queen", qty: 2, price: 1 }] };

  const a = await rpc("place_order", { payload });
  check("anon can place an order", a.status === 200 && a.data && a.data.ok, a);
  check("server prices the order (client price ignored)", a.data && Number(a.data.subtotal) === 86, a.data);
  const b = await rpc("place_order", { payload });
  check("idempotent client_ref", b.data && b.data.duplicate === true && b.data.code === a.data.code, b.data);
  const t = await rpc("track_order", { token: a.data.tracking_token });
  check("anon can track", t.data && t.data.code === a.data.code, t.data);
  check("tracking hides the phone", !JSON.stringify(t.data).includes(phone));
  const ro = await call("/rest/v1/orders?select=id&limit=1", { method: "GET" });
  check("anon cannot read orders", ro.status >= 400 || (Array.isArray(ro.data) && ro.data.length === 0), ro);
  const rc = await call("/rest/v1/customers?select=id&limit=1", { method: "GET" });
  check("anon cannot read customers", rc.status >= 400 || (Array.isArray(rc.data) && rc.data.length === 0), rc);

  const { data: rows } = await call(`/rest/v1/orders?select=id,store_id&code=eq.${a.data.code}`, { method: "GET", token: mgr });
  check("manager sees own-store order", rows && rows.length === 1, rows);
  const id = rows && rows[0] && rows[0].id;
  check("kitchen confirms", (await rpc("set_order_status", { p_order: id, p_status: "confirmed" }, kit)).status === 200);
  check("kitchen fries", (await rpc("set_order_status", { p_order: id, p_status: "frying" }, kit)).status === 200);
  const kd = await rpc("set_order_status", { p_order: id, p_status: "out_for_delivery" }, kit);
  check("kitchen cannot dispatch", kd.status >= 400, kd.data);
  const kc = await rpc("set_order_status", { p_order: id, p_status: "cancelled", p_cancel_reason: "changed_mind" }, kit);
  check("kitchen cannot cancel", kc.status >= 400, kc.data);

  const avail = await call("/rest/v1/store_item_availability", { body: { store_id: store, item_id: "combo-king", available: false }, token: kit });
  check("kitchen can 86 an item", avail.status < 300, avail);
  const so = await rpc("place_order", { payload: { ...payload, client_ref: `e2e-${run}-so`, items: [{ id: "combo-king" }] } });
  check("sold-out item rejected", so.status >= 400 && /sold_out/.test(JSON.stringify(so.data)), so.data);
  await call(`/rest/v1/store_item_availability?store_id=eq.${store}&item_id=eq.combo-king`, { method: "PATCH", body: { available: true }, token: kit });

  await call(`/rest/v1/stores?id=eq.${store}`, { method: "PATCH", body: { is_paused: true, pause_reason: "E2E" }, token: mgr });
  const pz = await rpc("place_order", { payload: { ...payload, client_ref: `e2e-${run}-pz` } });
  check("paused store rejected", pz.status >= 400 && /store_paused/.test(JSON.stringify(pz.data)), pz.data);
  await call(`/rest/v1/stores?id=eq.${store}`, { method: "PATCH", body: { is_paused: false, pause_reason: null }, token: mgr });

  const au = await call(`/rest/v1/audit_log?select=id&entity=eq.orders&entity_id=eq.${id}`, { method: "GET", token: owner });
  check("audit rows appear for status changes", Array.isArray(au.data) && au.data.length >= 2, au.data);

  const cx = await rpc("set_order_status", { p_order: id, p_status: "cancelled", p_cancel_reason: "other", p_note: "Prueba E2E" }, mgr);
  check("manager cancels (cleanup)", cx.status === 200, cx.data);
  console.log(fails ? `\n${fails} check(s) failed.` : "\nAll live checks passed.");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
