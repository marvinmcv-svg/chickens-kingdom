/*
 * POST /api/pollitia: Pollit-IA ordering assistant. Tool-calling agent loop, streams NDJSON events.
 * Body: { messages: [{role, content}], state, channel: "text" | "voice" }
 * Provider: POLLITIA_PROVIDER forces one; otherwise NVIDIA if NVIDIA_API_KEY is set, else Anthropic if
 * ANTHROPIC_API_KEY is set, else 503 not_configured. The model proposes; api/_tools.js computes everything.
 */
"use strict";
const { TOOLS, runTool, sanitizeState, isYes, clock, cartView } = require("./_tools.js");
const { SYSTEM_PROMPT, liveContext } = require("./_prompt.js");
const persona = require("./_persona.js");
const backend = require("./_backend.js");

const MAX_ROUNDS = 6;
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  if (hits.size > 5000) hits.clear();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now); hits.set(ip, arr);
  return arr.length > 15;
}

function sanitizeMessages(list) {
  if (!Array.isArray(list)) return null;
  let msgs = list.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1200) })).slice(-16);
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  msgs = msgs.reduce((acc, m) => { const last = acc[acc.length - 1]; if (last && last.role === m.role) last.content += "\n" + m.content; else acc.push({ ...m }); return acc; }, []);
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return null;
  return msgs;
}

function pickProvider() {
  const forced = (process.env.POLLITIA_PROVIDER || "").toLowerCase();
  if (forced === "anthropic") return process.env.ANTHROPIC_API_KEY ? "anthropic" : null;
  if (forced === "nvidia") return process.env.NVIDIA_API_KEY ? "nvidia" : null;
  if (process.env.NVIDIA_API_KEY) return "nvidia";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

// Executes one tool call with the confirmation guard, emits its events, returns the JSON string for the model.
function makeExecutor(ctx, emit) {
  return async function exec(name, args) {
    if (name === "place_order") {
      // Server-enforced confirmation: only with a yes in the newest message to the read-back that existed at the start.
      ctx.allowPlace = !!(ctx.tokenAtStart && ctx.yes && args && args.token === ctx.tokenAtStart);
    }
    let out;
    try { out = await runTool(name, args, ctx); } catch (err) { console.error(`[pollitia] tool ${name} failed: ${err && err.message}`); out = { result: { error: "La herramienta falló; intenta de otra forma o pasa con una persona." }, events: [] }; }
    ctx.allowPlace = false;
    out.events.forEach(emit);
    return JSON.stringify(out.result);
  };
}

async function loopAnthropic({ messages, live, channel, exec, write }) {
  const Anthropic = require("@anthropic-ai/sdk");
  const client = new Anthropic();
  const voice = channel === "voice";
  const model = voice ? process.env.POLLITIA_VOICE_MODEL || "claude-haiku-5-5" : process.env.POLLITIA_MODEL || "claude-sonnet-5-5";
  const useFallback = /^claude-sonnet-5-5/.test(model);
  const tools = TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
  const msgs = messages.map((m) => ({ role: m.role, content: m.content }));
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const params = {
      model, max_tokens: voice ? 400 : 1024,
      output_config: { effort: "low" },
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }, // static: cached (tools + system)
        { type: "text", text: live }, // live context: uncached
      ],
      tools, messages: msgs,
    };
    const stream = useFallback
      ? client.beta.messages.stream({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
      : client.messages.stream(params);
    write.newRound();
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") write.text(event.delta.text);
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") { write.text("\n\nDe eso no te puedo ayudar, pero sí con tu pedido 🍗."); return; }
    const uses = final.content.filter((b) => b.type === "tool_use");
    if (!uses.length) { if (final.stop_reason === "max_tokens") write.text("…"); return; }
    msgs.push({ role: "assistant", content: final.content });
    const results = [];
    for (const u of uses) results.push({ type: "tool_result", tool_use_id: u.id, content: await exec(u.name, u.input) });
    msgs.push({ role: "user", content: results });
  }
}

async function loopNvidia({ messages, live, exec, write }) {
  const OpenAI = require("openai");
  const client = new OpenAI({ apiKey: process.env.NVIDIA_API_KEY, baseURL: "https://integrate.api.nvidia.com/v1" });
  const tools = TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));
  const msgs = [{ role: "system", content: `${SYSTEM_PROMPT}\n\n${live}` }, ...messages];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const stream = await client.chat.completions.create({
      model: process.env.POLLITIA_NVIDIA_MODEL || "nvidia/nemotron-3-ultra-550b-a55b",
      temperature: 0.6, top_p: 0.95, max_tokens: 1024, stream: true, tools, messages: msgs,
    });
    write.newRound();
    const calls = []; let text = "";
    for await (const chunk of stream) {
      const d = chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
      if (!d) continue;
      if (typeof d.content === "string" && d.content) { text += d.content; write.text(d.content); } // never stream reasoning_content
      for (const tc of d.tool_calls || []) {
        const i = tc.index || 0;
        calls[i] = calls[i] || { id: "", name: "", args: "" };
        if (tc.id) calls[i].id = tc.id;
        if (tc.function && tc.function.name) calls[i].name += tc.function.name;
        if (tc.function && tc.function.arguments) calls[i].args += tc.function.arguments;
      }
    }
    const real = calls.filter((c) => c && c.name);
    if (!real.length) return;
    real.forEach((c, i) => { if (!c.id) c.id = `call_${round}_${i}`; });
    msgs.push({ role: "assistant", content: text || null, tool_calls: real.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.args || "{}" } })) });
    for (const c of real) {
      let args = {};
      try { args = JSON.parse(c.args || "{}"); } catch (e) { args = {}; }
      msgs.push({ role: "tool", tool_call_id: c.id, content: await exec(c.name, args) });
    }
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "method_not_allowed" }); }
  // The site sends X-Pollitia-Soft so expected states come back as 200 + JSON (clean browser console).
  const soft = req.headers["x-pollitia-soft"] === "1";
  const fail = (code, error) => (soft ? res.status(200).json({ error }) : res.status(code).json({ error }));
  const provider = pickProvider();
  if (!provider) return fail(503, "not_configured");
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || (req.socket && req.socket.remoteAddress) || "anon";
  if (limited(ip)) return fail(429, "rate_limited");
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const messages = sanitizeMessages(body && body.messages);
  if (!messages) return res.status(400).json({ error: "bad_request" });
  const channel = body.channel === "voice" ? "voice" : "text";
  const state = sanitizeState(body.state);
  const now = new Date();

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Accel-Buffering", "no");
  const emit = (ev) => { const e = Object.assign({}, ev); delete e.payload; res.write(JSON.stringify(e) + "\n"); };

  // text writer: paragraph break between tool rounds only after a finished sentence
  let acc = "", pendingBreak = false;
  const write = {
    newRound() { if (acc.trim()) pendingBreak = true; },
    text(t) {
      if (!t) return;
      if (pendingBreak) { pendingBreak = false; if (/[.!?…)🍗🙏✨😊👍]\s*$/u.test(acc)) t = "\n\n" + t.replace(/^\s+/, ""); }
      acc += t; emit({ type: "text", text: t });
    },
  };

  const lastUser = messages[messages.length - 1].content;
  const ctx = { state, now, nowMs: now.getTime(), backend, allowPlace: false, tokenAtStart: state.stage === "awaiting_confirmation" ? state.token : null, yes: isYes(lastUser) };
  const exec = makeExecutor(ctx, emit);

  // Guard 1: a clear yes to the read-back places the order BEFORE the model runs.
  let serverNote = "";
  if (ctx.tokenAtStart && ctx.yes) {
    const out = JSON.parse(await exec("place_order", { token: ctx.tokenAtStart }));
    serverNote = out.ok ? `El servidor acaba de registrar el pedido ${out.code} (total ${out.total_text || ""}). Confírmalo en una línea y dile que toque el botón verde.`
      : `El pedido NO se pudo registrar: ${out.reason || out.error}. Explícalo simple y ofrece una alternativa.`;
  }

  // persona hint (rotating, optional)
  const c = clock(now);
  const egg = persona.easterEgg(lastUser);
  const items = cartView(state.cart).items;
  const tag = serverNote && state.stage === "placed" ? "order_confirmed" : messages.length === 1 ? (c.mins >= 22 * 60 ? "late_night" : "greeting") : items >= 8 ? "big_order" : null;
  const line = egg || (tag && persona.pickLine(tag, []));
  const live = liveContext({ state, now, channel, persona: line }) + (serverNote ? `\n${serverNote}` : "");

  try {
    if (provider === "anthropic") await loopAnthropic({ messages, live, channel, exec, write });
    else await loopNvidia({ messages, live, channel, exec, write });
  } catch (err) {
    console.error(`[pollitia] provider=${provider} status=${err && err.status} message=${err && err.message}`);
    emit({ type: "error", kind: err && err.status === 429 ? "rate" : "net" });
  }
  emit({ type: "state", state });
  res.end();
};

module.exports._internal = { sanitizeMessages, pickProvider, makeExecutor };
