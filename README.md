# Scrappy — cook what's about to go bad

> **Scrappy doesn't tell you what you can cook — it tells you what you can eat tonight using the rotting stuff in your fridge.**

Say what's in your fridge (by voice or a photo). Scrappy designs a couple of dishes
**around the ingredients that are about to spoil**, using **only what you already
have** — no shopping trip — and walks you through cooking with step-by-step
reference images. Anti-waste is the driver of the whole flow, not a footnote.

A mobile-first PWA built for the Berkeley AI Hackathon (Social Impact / Food Waste).

## What it does

- **Voice-first input** (Deepgram) — tap and say what you've got; typing and a
  **fridge photo** (multimodal vision) are fallbacks.
- **Three-tier freshness** — every ingredient is tagged `going bad` (rescue first),
  `use soon`, or fresh, and you can tap a chip to correct it.
- **Constraint-solving recipes** (Claude) — dishes use **only your ingredients +
  basic pantry staples**. A server-side validation pass blocks any ingredient the
  model tries to sneak in (the anti-waste moat — see below).
- **Waste-prevention narrative up front** — "Your cabbage and tofu are on their way
  out, so I built around them," plus a "you used these up before they turned" payoff.
- **Swap by voice** — don't like a dish? Tap Swap and say how it should change
  ("make it spicier", "no tofu"); the replacement still rescues the expiring items.
- **Step-by-step cook mode** with reference images that depict the **action in
  progress** (knife/pan technique), generated via Midjourney, plus a finale plated
  shot. Images stream in behind shimmer placeholders and degrade gracefully.
- **Installable PWA** — manifest, icons, service worker, mobile-portrait layout.

## Architecture

Everything AI runs through a **thin server-side proxy** (Next.js route handlers),
so **no API key or token ever enters the client bundle**.

```
src/lib/api.ts  (browser fetch)  ──►  src/app/api/*/route.ts  (server proxy)  ──►  src/lib/server/*
```

| Route | Does |
|---|---|
| `POST /api/transcribe` | Proxies recorded audio to **Deepgram** STT. |
| `POST /api/ingredients` | **Claude** parses a transcript or fridge photo → ingredients + freshness. |
| `POST /api/recipes` | **Claude** generates dishes/steps under the hard ingredient constraint, with a server-side **validation pass**; also handles single-dish **swap** (with an optional spoken note). |
| `POST /api/preference` | Maps a spoken phrase to a preference value. |
| `POST /api/images` | Generates step/finale images via **Midjourney's MCP server** (the backend acts as an MCP client). |

The UI lives in `src/app/Scrappy.tsx` (the original design, unchanged — only its
data sources became real). Server helpers: `src/lib/server/claude.ts`,
`src/lib/server/midjourney.ts` (+ `mcp-oauth.ts`), and `src/lib/staples.ts` (the
§7 whitelist + the validation normaliser).

### The anti-waste moat (§7)

Ask any LLM for "a recipe with these ingredients" and it will quietly add things
training-data recipes always have. Scrappy forbids that: the prompt hard-limits
ingredients to **your list + a small staples whitelist** (`src/lib/staples.ts`),
and after generation a validation pass scans every dish — if an out-of-set
ingredient appears, it re-prompts once, then strips and logs it. No phantom
groceries.

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · PWA ·
Anthropic SDK (`claude-opus-4-8`) · Deepgram SDK · Midjourney via
`@modelcontextprotocol/sdk`.

## Getting started

### Prerequisites
- Node 20+ and **pnpm**
- API keys: **Anthropic** and **Deepgram**
- A **Midjourney** account (its MCP server is OAuth-gated — there is no API key)

### 1. Install
```bash
pnpm install
```

### 2. Configure keys
Copy the template and fill it in (`.env.local` is gitignored):
```bash
cp .env.example .env.local
```
```
ANTHROPIC_API_KEY=...
DEEPGRAM_API_KEY=...
# MIDJOURNEY_MCP_URL=https://mcp.midjourney.com/mcp   # optional override
```

### 3. Authorize Midjourney (one-time, per machine)
Midjourney has no API key — auth is OAuth. Run the one-time login; it opens a
browser, you approve, and tokens are saved to `.mcp-auth/` (gitignored). The
backend refreshes them automatically after that.
```bash
pnpm midjourney:auth      # browser consent
pnpm midjourney:probe     # optional: confirm tools + a sample generation
```

### 4. Run
```bash
pnpm dev        # http://localhost:3000  (use a phone-sized viewport)
# or
pnpm build && pnpm start
```

## Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` / `build` / `start` | Next.js dev / production build / serve |
| `pnpm lint` | ESLint |
| `pnpm midjourney:auth` | One-time Midjourney OAuth login (saves tokens to `.mcp-auth/`) |
| `pnpm midjourney:probe` | List the MCP tools + run a sample image generation |
| `node scripts/e2e.mjs` | Playwright walkthrough (input → confirm → dishes → cook → finish) |

## Demo path

Speak or type: *"two tomatoes, half a cabbage that's going bad, three eggs, a block
of tofu that's going bad, scallions, and a bowl of leftover rice."* Scrappy tags
the cabbage/tofu as going bad and the rice as use-soon, proposes three dishes that
use them up first, and cooks you through them.

## Notes & limitations

- **Midjourney is slow and async** (~30–60s/job); step images are generated
  staggered in the background and shown behind shimmer placeholders, so latency is
  hidden during real cooking. A failed image degrades to its caption card — never a
  broken image or a blocked step.
- **`.mcp-auth/` is per-machine** — run `pnpm midjourney:auth` once on each machine.
- No accounts, persistence, history, or shopping lists by design (anti-waste
  philosophy; see the PRD).
