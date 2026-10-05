# Scrappy — cook what's about to go bad

> **Scrappy doesn't tell you what you can cook — it tells you what you can eat tonight using the rotting stuff in your fridge.**

Say what's in your fridge. Scrappy designs a couple of dishes
**around the ingredients that are about to spoil**, using **only what you already
have** — no shopping trip — and walks you through cooking with step-by-step
reference images. Anti-waste is the driver of the whole flow, not a footnote.

A mobile-first PWA, started at the Berkeley AI Hackathon (Social Impact / Food Waste).

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
- **Constraint-solving recipes** (Claude) — dishes use **only your ingredients +
  basic pantry staples**. A server-side validation pass blocks any ingredient the
  model tries to sneak in (the anti-waste moat — see below).
- **Waste-prevention narrative up front** — "Your cabbage and tofu are on the
  clock — I'll cook them first," plus a "you used these up before they turned" payoff.
- **Swap a dish** — just swap it, or say or type what to change ("make it
  spicier", "no tofu"); the replacement still uses up what's on the clock.
- **Step-by-step cook mode** with reference images that depict the **action in
  progress** (knife/pan technique), generated via Midjourney, plus a finale plated
  shot. Images stream in behind shimmer placeholders and degrade gracefully.
- **Clear failure states** — no mic access, offline, a noisy room or no food
  heard each get their own message and a way forward (retry, type, resend).
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

Everything AI runs through a **thin server-side proxy** (Next.js route handlers),
so **no API key or token ever enters the client bundle**.

```
src/lib/api.ts  (browser fetch)  ──►  src/app/api/*/route.ts  (server proxy)  ──►  src/lib/server/*
```

Speech is recognised in the browser (Web Speech API), so only the transcript
reaches the server.

| Route | Does |
|---|---|
| `POST /api/ingredients` | **Claude** parses a transcript → ingredients, amounts, units + freshness. |
| `POST /api/recipes` | **Claude** generates dishes/steps under the hard ingredient constraint, with a server-side **validation pass**; also handles single-dish **swap** (with an optional note). |
| `POST /api/preference` | Maps a spoken phrase to a preference value (servings, dishes, diet, allergies). |
| `POST /api/images` | Generates step/finale images via **Midjourney's MCP server** (the backend acts as an MCP client). |
| `POST /api/transcribe` | **Deepgram** speech-to-text for browsers without the Web Speech API. Switched off for now (`DEEPGRAM_FALLBACK_ENABLED` in `src/lib/voice.ts`). |

**Client:** the app shell is `src/app/Scrappy.tsx`, state and flow live in
`src/app/hooks/useScrappy.ts`, and screens and sheets are in `src/app/components/`.
Styling is Tailwind with the design's tokens and type scale defined in
`src/app/globals.css`; shared pieces (sheet, buttons, chips) are in
`src/app/components/ui.tsx`.

**Server:** `src/lib/server/claude.ts`, `src/lib/server/midjourney.ts`
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
Web Speech API · Anthropic SDK (`claude-opus-4-8`) · Midjourney via
`@modelcontextprotocol/sdk` · Deepgram (optional fallback).

## Getting started

### Prerequisites
- Node 20+ and **pnpm**
- An **Anthropic** API key
- Optional: a **Midjourney** account for step images (its MCP server is
  OAuth-gated — there is no API key). Without it, steps show caption cards.
- Optional: a **Deepgram** key, only if you re-enable the speech fallback.

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
# DEEPGRAM_API_KEY=...                                 # only for the fallback
# MIDJOURNEY_MCP_URL=https://mcp.midjourney.com/mcp   # optional override
# MOCK_AI=1                                            # see "Mock mode"
```

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

### Mock mode
Set `MOCK_AI=1` in `.env.local` (and restart) to answer the AI routes with local
fakes — no API credit used. Useful for working on the UI or when you're out of
credit.

## Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` / `build` / `start` | Next.js dev (HTTPS) / production build / serve |
| `pnpm tun_dev` | Dev server + Cloudflare tunnel, for testing on a phone |
| `pnpm clean` | Delete `.next` — fixes a dev server serving stale styles after restarts |
| `pnpm tun_dev:clean` | `clean`, then `tun_dev` |
| `pnpm lint` | ESLint |
| `pnpm midjourney:auth` | One-time Midjourney OAuth login (saves tokens to `.mcp-auth/`) |
| `pnpm midjourney:probe` | List the MCP tools + run a sample image generation |
| `node scripts/e2e.mjs` | Playwright walkthrough (input → confirm → dishes → cook → finish) |

## Demo path

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
- No accounts, inventory, history or shopping lists, by design: you describe what
  you have when you're about to cook, and nothing needs keeping up to date.
