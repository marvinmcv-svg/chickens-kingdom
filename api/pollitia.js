/*
 * POST /api/pollitia: Pollit-IA, the virtual receptionist.
 * Streams plain text. Provider: POLLITIA_PROVIDER forces one; otherwise NVIDIA if
 * NVIDIA_API_KEY is set, else Anthropic if ANTHROPIC_API_KEY is set, else 503 not_configured.
 */
"use strict";
const { SYSTEM_PROMPT, liveContext } = require("./_prompt.js");

const hits = new Map();
function limited(ip) {
  const now = Date.now();
  if (hits.size > 5000) hits.clear();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now); hits.set(ip, arr);
  return arr.length > 12;
}

function sanitize(body) {
  let b = body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { return null; } }
  if (!b || !Array.isArray(b.messages)) return null;
  let msgs = b.messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1200) }))
    .slice(-16);
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  // merge consecutive same-role turns so the roles alternate
  msgs = msgs.reduce((acc, m) => { const last = acc[acc.length - 1]; if (last && last.role === m.role) last.content += "\n" + m.content; else acc.push({ ...m }); return acc; }, []);
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return null;
  return msgs;
}

function pickProvider() {
  const forced = (process.env.POLLITIA_PROVIDER || "").toLowerCase();
  if (forced === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (forced === "nvidia" && process.env.NVIDIA_API_KEY) return "nvidia";
  if (forced) return null;
  if (process.env.NVIDIA_API_KEY) return "nvidia";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

async function streamAnthropic(messages, res) {
  const Anthropic = require("@anthropic-ai/sdk");
  const client = new Anthropic();
  const stream = client.beta.messages.stream({
    model: process.env.POLLITIA_MODEL || "claude-sonnet-5-5",
    max_tokens: 1024,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    // static, cached system prompt
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    // live context goes AFTER the conversation as a mid-conversation system message
    messages: [...messages, { role: "system", content: liveContext() }],
  });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") res.write(event.delta.text);
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") res.write("\n\nDe eso no te puedo ayudar, pero sí con el menú, las promos o las sucursales 🍗.");
  else if (final.stop_reason === "max_tokens") res.write("…");
}

async function streamNvidia(messages, res) {
  const OpenAI = require("openai");
  const client = new OpenAI({ apiKey: process.env.NVIDIA_API_KEY, baseURL: "https://integrate.api.nvidia.com/v1" });
  const stream = await client.chat.completions.create({
    model: process.env.POLLITIA_NVIDIA_MODEL || "nvidia/llama-3.3-nemotron-super-49b-v1.5",
    temperature: 0.6, top_p: 0.95, max_tokens: 1024, stream: true,
    messages: [{ role: "system", content: `${SYSTEM_PROMPT}\n\n${liveContext()}` }, ...messages],
  });
  for await (const chunk of stream) {
    const d = chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
    if (d && typeof d.content === "string") res.write(d.content); // never stream reasoning_content
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "method_not_allowed" }); }
  // The site sends X-Pollitia-Soft so "expected" states come back as 200 + JSON (no red console
  // errors in the browser); other clients get the plain 503 / 429 status codes.
  const soft = req.headers["x-pollitia-soft"] === "1";
  const fail = (code, error) => (soft ? res.status(200).json({ error }) : res.status(code).json({ error }));
  const provider = pickProvider();
  if (!provider) return fail(503, "not_configured");
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || (req.socket && req.socket.remoteAddress) || "anon";
  if (limited(ip)) return fail(429, "rate_limited");
  const messages = sanitize(req.body);
  if (!messages) return res.status(400).json({ error: "bad_request" });

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Accel-Buffering", "no");
  try {
    if (provider === "anthropic") await streamAnthropic(messages, res);
    else await streamNvidia(messages, res);
  } catch (err) {
    console.error(`[pollitia] provider=${provider} status=${err && err.status} message=${err && err.message}`);
    res.write("\n\n[[error]]");
  }
  res.end();
};
