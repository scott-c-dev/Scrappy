# Scrappy — cook what's about to go bad

> **Scrappy doesn't tell you what you can cook — it tells you what you can eat tonight using the rotting stuff in your fridge.**

Say what's in your fridge. Scrappy designs a couple of dishes
**around the ingredients that are about to spoil**, using **only what you already
have** — no shopping trip — and walks you through cooking with step-by-step
reference images. Anti-waste is the driver of the whole flow, not a footnote.
It's a mobile-first PWA.

## What it does

- **Voice-first input** — tap and say what you've got, in one breath ("half a
  cabbage that's wilting, three eggs, leftover rice"). Typing is the backup. You
  see what was heard before anything is sent, and can fix it or say it again.
- **Freshness you state, not guessed** — say something is going bad and it's
  tagged `going bad` (cooked first); `use soon` and `fresh` work the same way.
  Anything you didn't mention is "not sure", and the recipes judge it by how
  quickly that food usually spoils.
- **Optional adjustments** — tap an item to change its amount (a ruler, quick
  picks or "as needed"), unit or freshness. Units follow your region (metric or
  imperial, changeable in Settings), and a unit you said ("a block of tofu") is kept.
- **Your own AI key** — connect Claude, OpenAI or any OpenAI-compatible service
  once, in about a minute; you pay it directly, and there are no accounts. The
  key stays on your device (see "Your AI key").
- **Constraint-solving recipes** — dishes use **only your ingredients +
  basic pantry staples**. A server-side validation pass blocks any ingredient the
  model tries to sneak in (the anti-waste moat — see below).
- **Waste-prevention narrative up front** — "Your cabbage and tofu are on the
  clock — I'll cook them first," plus a "you used these up before they turned" payoff.
- **Swap a dish** — just swap it, or say or type what to change ("make it
  spicier", "no tofu"); the replacement still uses up what's on the clock.
- **Step-by-step cook mode** with reference images that depict the **action in
  progress** (knife/pan technique), generated via Midjourney, plus a finale plated
  shot. Images stream in behind shimmer placeholders and degrade gracefully.
- **Clear failure states** — no mic access, offline, a noisy room, no food
  heard, and each way an AI service can fail (out of credit, too busy, key
  refused, model gone, not answering, too slow) get their own message and a
  way forward (retry, type, resend, fewer dishes, fix it in AI settings) —
  the same wherever they happen.
- **Installable PWA** — manifest, icons, service worker, mobile-portrait layout.

## Why voice, not photos?

The most common question about Scrappy is "why not just take a photo of the
fridge, or the receipt?" We built the fridge photo and then removed it.

- **A photo shows what's there, not what's urgent.** Scrappy needs the two or
  three things about to go bad. A photo can't see the chicken bought five days
  ago, what's in a container, or anything behind the milk — but you know, and
  you can say it in one sentence.
- **It only looks effortless.** One photo misses things; several photos mean
  more work than talking, plus duplicates to merge and more corrections on the
  confirm screen.
- **It's slower, pricier and more private.** Uploading and reading an image adds
  seconds at the start, costs more than a sentence, and sends a picture of your
  kitchen to the cloud.
- **Receipts answer "what did I buy", not "what's left".** Food gets eaten
  between shopping and cooking, so a receipt means keeping a pantry list up to
  date — the kind of chore people give up on. Receipts also carry things
  unrelated to cooking (pharmacy items, card digits) that shouldn't leave your phone.

So Scrappy keeps no inventory: you describe the moment you're about to cook, and
that's it.

## Architecture

Everything AI runs through a **thin server-side proxy** (Next.js route handlers).
Browsers can't call most AI services directly, so the user's key travels with
each request to the proxy, which calls the service and **never stores or logs
it**. Server-side credentials (Midjourney, Deepgram) never enter the client bundle.

```
src/lib/api.ts  (browser fetch)  ──►  src/app/api/*/route.ts  (server proxy)  ──►  src/lib/server/*
```

Speech is recognised in the browser (Web Speech API), so only the transcript
reaches the server.

| Route | Does |
|---|---|
| `POST /api/ingredients` | The **LLM** parses a transcript → ingredients, amounts, units + freshness. |
| `POST /api/recipes` | The **LLM** generates dishes/steps under the hard ingredient constraint, with a server-side **validation pass**; also handles single-dish **swap** (with an optional note). |
| `POST /api/preference` | Maps a spoken phrase to a preference value (servings, dishes, diet, allergies). |
| `POST /api/ai/check` | Checks the user's AI settings before saving, free: lists the key's models. Also fills the model picker. |
| `GET /api/capabilities` | Whether this server can make step pictures (Midjourney set up). |
| `POST /api/images` | Generates step/finale images via **Midjourney's MCP server** (the backend acts as an MCP client). |
| `POST /api/transcribe` | **Deepgram** speech-to-text for browsers without the Web Speech API. Switched off for now (`DEEPGRAM_FALLBACK_ENABLED` in `src/lib/voice.ts`). |

**Client:** the app shell is `src/app/Scrappy.tsx`, state and flow live in
`src/app/hooks/useScrappy.ts`, and screens and sheets are in `src/app/components/`.
Styling is Tailwind with the design's tokens and type scale defined in
`src/app/globals.css`; shared pieces (sheet, buttons, chips) are in
`src/app/components/ui.tsx`.

**Server:** `src/lib/server/llm.ts` (one JSON-schema call, in either API format),
`src/lib/server/netguard.ts` (the private-address guard), `src/lib/server/midjourney.ts`
(+ `mcp-oauth.ts`), `src/lib/server/mock.ts` (mock mode) and `src/lib/staples.ts`
(the staples whitelist + the validation normaliser).

### The anti-waste moat

Ask any LLM for "a recipe with these ingredients" and it will quietly add things
training-data recipes always have. Scrappy forbids that: the prompt hard-limits
ingredients to **your list + a small staples whitelist** (`src/lib/staples.ts`),
and after generation a validation pass scans every dish — if an out-of-set
ingredient appears, it re-prompts once, then strips and logs it. No phantom
groceries.

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · PWA ·
Web Speech API · Anthropic SDK or OpenAI SDK (Chat Completions) · zod · Midjourney via
`@modelcontextprotocol/sdk` · Deepgram (optional fallback).

## Getting started

### Prerequisites
- Node 20+ and **pnpm**
- To try it for real, an AI API key — entered in the app, not here (see
  "Your AI key"). Without one, use mock mode.
- Optional: a **Midjourney** account for step images (its MCP server is
  OAuth-gated — there is no API key). Without it, steps show caption cards.
- Optional: a **Deepgram** key, only if you re-enable the speech fallback.

### 1. Install
```bash
pnpm install
```

### 2. Configure the server
Copy the template (`.env.local` is gitignored). Nothing in it is required, and
there's no AI key in it — see "Your AI key". Every setting is described in
"Configuration" below.
```bash
cp .env.example .env.local
```

#### Your AI key
Scrappy has no accounts, so it can't hand out free usage: **each person
connects their own AI key** and pays that service directly. Until then, the
mic shows a short card saying so, and "Add a key" opens Settings → AI service:
pick a service, paste the key, Check & save. The model is pre-filled with a
good default.

- **Where it lives:** on the device (or only until the tab closes, if
  "Remember on this device" is off). It's sent with each AI request, through
  the server to the service; the server never stores or logs it.
- **Checked before saving:** listing the key's models (free) catches a wrong
  key, an unreachable address or a model the key can't use. For a custom
  service, one tiny request also finds whether it takes
  Structured Outputs; if not, JSON mode is switched on and the screen says so.
  Running out of credit shows up at first use, with its own message.
- **Models:** Claude uses `claude-haiku-5-5` and OpenAI `gpt-6-luna` (reasoning
  `low`) unless you pick another. The default is saved as "Scrappy's default",
  so a newer default in the code reaches everyone who never picked a model.
- **Other services (Custom):** any Claude-style or OpenAI-style (Chat
  Completions) API — DeepSeek, Groq, OpenRouter, vLLM… — with its address, key
  and model. Under **Advanced**: reasoning effort, and JSON mode for services
  without Structured Outputs (set for you when you save; a request rejected
  in Structured Outputs mode is also retried once in JSON mode). Every reply
  is checked against the schema.
- **When a request fails,** the message says whose side it's on and what
  helps: try again, wait a minute (too busy), fewer dishes or a faster model
  (no answer within 2 minutes), or "Open AI settings" (key refused, model gone,
  a custom address not answering) — then back where you were, with what you
  said kept. Settings shows the last such failure until a request works.
- **Private addresses are refused.** Requests go through the server, so an
  address like `http://192.168.1.20:11434` would reach the *server's* network,
  not the user's. Set `ALLOW_PRIVATE_LLM_URLS=1` only when you run Scrappy on
  your own network (e.g. to use Ollama on another machine).
- Weaker models add ingredients you don't have more often; the validation pass
  still catches them, but recipe quality depends on the model you pick.

### 3. Authorize Midjourney (optional, one-time per machine)
Midjourney has no API key — auth is OAuth. Run the one-time login; it opens a
browser, you approve, and tokens are saved to `.mcp-auth/` (gitignored). The
backend refreshes them automatically after that.
```bash
pnpm midjourney:auth      # browser consent
pnpm midjourney:probe     # optional: confirm tools + a sample generation
```

### 4. Run
```bash
pnpm dev        # https://localhost:3000  (use a phone-sized viewport)
# or
pnpm build && pnpm start
```
The mic needs a secure context, so `pnpm dev` serves HTTPS. To try it on a phone,
`pnpm tun_dev` runs the dev server plus a temporary Cloudflare tunnel and prints
a public `https://….trycloudflare.com` URL.

## Configuration

Server settings go in `.env.local`; `.env.example` has each one commented out
with the same notes. Restart the dev server after changing them. Switches
count as on for any value except `0` and `false`.

| Variable | Values (default) | What it's for |
|---|---|---|
| `MOCK_AI` | `1` (off) | Answer the AI routes with local fakes — no AI service, no credit. See "Mock mode". |
| `DEV_LAN_ORIGIN` | an IP, e.g. `10.0.0.175` (unset) | Your computer's LAN IP, so a phone on the same Wi-Fi can use the dev server. Tunnel addresses (`*.trycloudflare.com`) are always allowed. |
| `ALLOW_PRIVATE_LLM_URLS` | `1` (refuse) | Let a Custom AI service use a private or local address. Only when Scrappy runs on your own network — see "Your AI key". |
| `MIDJOURNEY_MCP_URL` | a URL (`https://mcp.midjourney.com/mcp`) | The Midjourney MCP server for step pictures. The login itself is `pnpm midjourney:auth`, not a variable. |
| `DEEPGRAM_API_KEY` | a Deepgram key (unset) | Speech for browsers without the Web Speech API. Unused while `DEEPGRAM_FALLBACK_ENABLED` is `false` in `src/lib/voice.ts`. |

Two more are read only by the test walkthrough (`node scripts/e2e.mjs`), set on
the command line: `BASE` — the app's address (`http://localhost:3210`) — and
`E2E_AI_KEY` — a Claude key for real calls (a mock key otherwise).

There's no code-level switch for the AI service: each person's settings come
from the app (Settings → AI service).

### Mock mode
With `MOCK_AI=1`, the AI routes answer instantly from local fakes, so you can
work on the UI, or try the whole flow, without credit.

**What's faked**
- **Ingredients:** picked out of what you say by name — about 40 common foods
  (eggs, cabbage, tofu, rice, chicken, tomatoes…). Freshness comes from words
  like "wilting", "going bad" or "old" (going bad), "leftover" or "opened" (use
  soon) and "fresh" or "just bought" (fresh); amounts from numbers and units
  you say ("two eggs", "200 g tofu").
- **Preferences:** numbers for servings and dishes; words like "vegetarian",
  "gluten" or "dairy" for diet and allergies.
- **Dishes and swaps:** made from your ingredients, going-bad ones first; a
  swap note ("make it spicier") shows in the new dish's description.
- **Pictures:** placeholder images, so Step pictures is always available.
- **The key check:** any key connects, and lists a few model names.

**Seeing each state**

| To see | Do this |
|---|---|
| "One thing before we cook" card | Tap the mic with no key saved (or after Settings → AI service → Remove key) |
| Key check: wrong key | A key containing `wrong` |
| Key check: model not found | A key containing `nomodel` |
| Key check: can't reach | A key containing `down` |
| Key check: private address | Custom, with an address like `http://192.168.1.20:11434/v1` |
| Key check: "switched on JSON mode" | Custom, with a key containing `jsononly` |
| Key switched by its prefix | Paste a key starting `sk-proj-` (OpenAI) or `sk-ant-` (Claude) |
| "Out of credit" | Say or type "out of credit" as your list, as a preference, or as a swap's "what should change" |
| "Your AI's swamped" | Say or type "too busy" (same places) |
| "Your AI key was refused" | Say or type "key refused" |
| "Model not found" | Say or type "no such model" |
| "Can't reach …" | Say or type "can't reach" |
| "That took too long" | Say or type "too slow" |
| "That didn't come back right" (any other failure) | Say or type "server error" |
| Recipe generation failing | Start with `MOCK_FAIL_RECIPES=<kind>` (e.g. `busy`, `credit`, `timeout`) |
| "Still cooking up ideas…" (after 30 s) | Start with `MOCK_FAIL_RECIPES=slow` (dishes come after 35 s) |
| "Last request failed" in Settings | Any of credit, key refused, model not found, then open Settings |
| "Picture didn't load" | Real only: a step picture that fails to generate |
| "Heard you — but no food?" | Say or type something with no food in it |
| "You're offline" | Turn the network off (e.g. DevTools → Network → Offline) |
| "I can't hear you" / "one more time?" | Real browser states: block the mic, or stop without speaking |

Mock keys are saved like real ones, per browser and address.

## Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` / `build` / `start` | Next.js dev (HTTPS) / production build / serve |
| `pnpm tun_dev` | Dev server + Cloudflare tunnel, for testing on a phone |
| `pnpm clean` | Delete `.next` — fixes a dev server serving stale styles after restarts |
| `pnpm tun_dev:clean` | `clean`, then `tun_dev` |
| `pnpm lint` | ESLint |
| `pnpm test` | LLM layer tests: real routes against a fake LLM server — both API formats, the key check, the private-address guard; no key or credits needed |
| `pnpm midjourney:auth` | One-time Midjourney OAuth login (saves tokens to `.mcp-auth/`) |
| `pnpm midjourney:probe` | List the MCP tools + run a sample image generation |
| `node scripts/e2e.mjs` | Playwright walkthrough (input → confirm → dishes → cook → finish); `E2E_AI_KEY` for real calls |

## Try it

Speak or type: *"two tomatoes, half a cabbage that's going bad, three eggs, a block
of tofu that's going bad, scallions, and a bowl of leftover rice."* Scrappy marks
the cabbage and tofu as going bad, proposes three dishes that use them up first,
and cooks you through them.

## Notes & limitations

- **Voice needs the Web Speech API** — Chrome, Edge and Safari (including iPhone)
  have it; Firefox doesn't, so Firefox users type instead.
- **Midjourney is slow and async** (~30–60s/job); step images are generated
  staggered in the background and shown behind shimmer placeholders, so latency is
  hidden during real cooking. A failed image degrades to its caption card — never a
  broken image or a blocked step.
- **`.mcp-auth/` is per-machine** — run `pnpm midjourney:auth` once on each machine.
- **Step pictures are the host's cost.** The AI key is the user's, but pictures
  come from the Midjourney account of whoever runs the server. Without it, the
  Step pictures setting is hidden and cooking is text only.
- **A saved key belongs to the site's address.** A quick Cloudflare tunnel gets a
  new address on each run, so the key has to be entered again; the LAN address
  (`DEV_LAN_ORIGIN`) stays the same.
- **The private-address guard checks the address before connecting** and
  refuses redirects. A DNS answer that changes between the check and the
  request (DNS rebinding) isn't covered; set no `ALLOW_PRIVATE_LLM_URLS` on
  public hosts and keep the server off sensitive networks.
- No accounts, inventory, history or shopping lists, by design: you describe what
  you have when you're about to cook, and nothing needs keeping up to date.
