# Chicken's Kingdom · sitio web + Pollit-IA

Marketing and ordering site for **Chicken's Kingdom Bolivia** (pollo frito y pipocas de pollo since 2000, 14 branches in Cochabamba and Santa Cruz), with **Pollit-IA**, an AI receptionist.

Every fact, price, photo and video comes from the brand's own channels: [Instagram](https://www.instagram.com/chickens.kingdom.bolivia/) and the official menu and branch cards on [chickenskingdom.com](https://www.chickenskingdom.com/). Each fact has a source comment in `js/data.js`.

## Structure

```
index.html        page structure + SEO (Open Graph, schema.org Restaurant)
css/styles.css    design system (brand tokens + colour-sampling notes at the top)
js/data.js        ALL content: menu, promos, combos, branches, facts (shared by site + AI)
js/app.js         rendering, cart, WhatsApp funnel, live open/closed status, AI chat UI
api/pollitia.js   AI endpoint (streams plain text; Claude or NVIDIA NIM)
api/_prompt.js    builds the AI's knowledge from js/data.js + live time/open branches
assets/img        post images, product crops, branch photos (webp)
assets/video      reels (mp4 + webp posters)      assets/hero   hero fan reels
assets/brand      icons + share image             site.webmanifest, favicon.ico
```

`js/data.js` is a UMD module: in the browser it sets `window.KINGDOM`, and in Node it is `module.exports`. The website and the AI read the same file, so they never disagree. **To change a price, promo or branch, edit only `js/data.js` and redeploy.**

## Run locally

```bash
npm install
npx vercel dev
```

A plain static server (`python3 -m http.server`) also works for the site. The chat then shows its "coming soon" state.

Preview another weekday's promo highlighting with `?dia=3` (0 = Sunday … 6 = Saturday).

## Deploy (Vercel)

Zero-config: static files plus the `api/` function. Set these in **Vercel → Project → Settings → Environment Variables**, then redeploy:

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude key (`ai_provider: anthropic`) |
| `POLLITIA_MODEL` | optional Claude model override (default `claude-sonnet-5-5`) |
| `NVIDIA_API_KEY` | NVIDIA NIM key (`ai_provider: nvidia`) |
| `POLLITIA_NVIDIA_MODEL` | optional NIM model override |
| `POLLITIA_PROVIDER` | optional, forces `anthropic` or `nvidia` |

Without a key, the chat politely says Pollit-IA is getting ready, and nothing errors.

## AI endpoint

`POST /api/pollitia` with `{ messages: [{ role, content }] }` streams `text/plain`.
- 405 on non-POST; 503 `not_configured` without a key; 400 on invalid history; 429 above 12 requests/min per IP.
- The site sends `X-Pollitia-Soft: 1`, which turns the expected 503/429 states into `200` + JSON so the browser console stays clean.
- Anthropic: streaming Messages API, a static system prompt with `cache_control` (prompt caching), live context (time, open branches, today's promo) sent after the conversation as a system message, and server-side refusal fallback.
- NVIDIA: OpenAI-compatible API at `integrate.api.nvidia.com`; never streams `reasoning_content`.

## Promo expiry

The **Combo Yape** (Wednesdays, Bs 20, Yape payment, in store only) is valid **until 30/12/2026**. The site and the AI hide it automatically after that date. Add the next promo in `js/data.js → weekly` and `yapa`.
