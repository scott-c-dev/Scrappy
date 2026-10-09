/* Offline stand-ins for the AI routes, switched on with MOCK_AI=1 in
   .env.local. They make no network calls and cost no credit, so the whole
   flow can be tested when the Anthropic account is out of credit or
   Midjourney isn't set up.

   The fakes respond to what was actually said, so every UI path is reachable:
   naming foods gives an ingredient list, saying no known food gives an empty
   one (the "no food" message), and saying "out of credit", "key refused" or
   "server error" shows that message. The AI key check answers too: a key
   containing "wrong", "nomodel" or "down" fails that way; anything else
   connects. The README's "Mock mode" section lists all of these. */

import "server-only";
import { NextResponse } from "next/server";
import type { CheckFailure } from "@/lib/ai";
import type { FreshnessTag, Ingredient, Dish, Prefs, Step } from "@/lib/types";

export function mockAI(): boolean {
  const v = process.env.MOCK_AI?.trim().toLowerCase();
  return !!v && v !== "0" && v !== "false";
}

// A short pause so loading states are visible, as with the real APIs.
export const mockDelay = (ms = 900) => new Promise((r) => setTimeout(r, ms));

// ── AI key failures ──────────────────────────────────────────────────────────

/* A 502 like a real failed AI call, when the text asks for one. */
export function mockFailure(text: string) {
  const t = text.toLowerCase();
  const kind = /out of credit/.test(t)
    ? "credit"
    : /key refused/.test(t)
      ? "refused"
      : /server error/.test(t)
        ? "service"
        : null;
  return kind && NextResponse.json({ error: `mock: ${kind}`, kind }, { status: 502 });
}

export function mockCheck(key: string): { reason: CheckFailure } | { models: string[] } {
  const k = key.toLowerCase();
  if (k.includes("wrong")) return { reason: "wrongKey" };
  if (k.includes("nomodel")) return { reason: "modelNotFound" };
  if (k.includes("down")) return { reason: "unreachable" };
  return {
    models: k.startsWith("sk-ant-")
      ? ["claude-haiku-4-5", "claude-opus-5-5", "claude-sonnet-5-5"]
      : ["gpt-6-astra", "gpt-6-luna", "gpt-6-sol"],
  };
}

// ── Ingredients ──────────────────────────────────────────────────────────────

// [display name, pattern]. Patterns accept the usual plurals.
const FOODS: [string, RegExp][] = [
  ["Curry sauce", /\bcurry sauce\b/],
  ["Soy sauce", /\bsoy sauce\b/],
  ["Leftover rice", /\bleftover rice\b/],
  ["Rice", /\brice\b/],
  ["Tomatoes", /\btomato(e?s)?\b/],
  ["Potatoes", /\bpotato(e?s)?\b/],
  ["Cabbage", /\bcabbages?\b/],
  ["Eggs", /\beggs?\b/],
  ["Tofu", /\btofu\b/],
  ["Scallions", /\b(scallions?|spring onions?|green onions?)\b/],
  ["Onions", /\bonions?\b/],
  ["Garlic", /\bgarlic\b/],
  ["Carrots", /\bcarrots?\b/],
  ["Apples", /\bapples?\b/],
  ["Bananas", /\bbananas?\b/],
  ["Chicken", /\bchicken\b/],
  ["Beef", /\bbeef\b/],
  ["Pork", /\bpork\b/],
  ["Bacon", /\bbacon\b/],
  ["Sausages", /\bsausages?\b/],
  ["Salmon", /\bsalmon\b/],
  ["Shrimp", /\b(shrimps?|prawns?)\b/],
  ["Milk", /\bmilk\b/],
  ["Cheese", /\bcheeses?\b/],
  ["Yogurt", /\by(o|og)gh?urts?\b/],
  ["Butter", /\bbutter\b/],
  ["Bread", /\bbread\b/],
  ["Spinach", /\bspinach\b/],
  ["Lettuce", /\blettuces?\b/],
  ["Broccoli", /\bbroccoli\b/],
  ["Mushrooms", /\bmushrooms?\b/],
  ["Bell peppers", /\b(bell )?peppers\b/],
  ["Cucumber", /\bcucumbers?\b/],
  ["Zucchini", /\bzucchinis?\b/],
  ["Eggplant", /\beggplants?\b/],
  ["Corn", /\bcorn\b/],
  ["Beans", /\bbeans\b/],
  ["Pasta", /\bpasta\b/],
  ["Noodles", /\bnoodles?\b/],
  ["Lemons", /\blemons?\b/],
];

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, to: 2, too: 2, three: 3, four: 4, for: 4,
  five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

const GOING_BAD = /\b(wilt|going bad|gone soft|soft|expir|old|brown|last week|turning|about to go)/;
const USE_SOON = /\b(leftover|opened|half[- ]used|use soon|yesterday)/;
const FRESH = /\b(fresh|just bought|new)\b/;

// Spoken unit → the unit we store (see lib/units.ts).
const UNIT_ALIASES: [RegExp, string][] = [
  [/^(g|grams?)$/, "g"],
  [/^(kg|kilos?|kilograms?)$/, "kg"],
  [/^(ml|millilit(er|re)s?)$/, "ml"],
  [/^(l|lit(er|re)s?)$/, "L"],
  [/^(oz|ounces?)$/, "oz"],
  [/^(lbs?|pounds?)$/, "lb"],
  [/^cups?$/, "cups"],
  [/^(bunch|bunches)$/, "bunch"],
  [/^(clove|can|slice|block|bowl|head|pack|bag)s?$/, ""],
];

function numberFrom(word: string): number | null {
  if (/^\d+(\.\d+)?$/.test(word)) return Number(word);
  if (word === "half") return 0.5;
  return word in NUMBER_WORDS ? NUMBER_WORDS[word] : null;
}

function unitFrom(word: string): string | null {
  for (const [re, unit] of UNIT_ALIASES) {
    if (re.test(word)) return unit || word.replace(/s$/, "");
  }
  return null;
}

// "500 g of chicken" → 500 g; "two tomatoes" → 2 pcs; "half a cabbage" → ½ pcs.
function amountFrom(clause: string, food: RegExp): Pick<Ingredient, "amount" | "unit"> {
  const words = clause.split(/\s+/).filter(Boolean);
  const at = words.findIndex((w) => food.test(w));
  const end = at === -1 ? words.length : at;
  for (let i = 0; i < end - 1; i++) {
    const n = numberFrom(words[i]);
    const unit = unitFrom(words[i + 1]);
    if (n != null && unit) return { amount: n, unit };
  }
  if (/\bhalf\b/.test(clause)) return { amount: 0.5, unit: "pcs" };
  // Look at the few words just before the food name ("I got two tomatoes").
  for (let i = end - 1; i >= Math.max(0, end - 3); i--) {
    const w = words[i];
    const n = w === "a" || w === "an" ? null : numberFrom(w);
    if (n != null) return { amount: n, unit: "pcs" };
  }
  return { amount: null, unit: "pcs" };
}

function tagFrom(clause: string): FreshnessTag {
  if (GOING_BAD.test(clause)) return "going bad";
  if (USE_SOON.test(clause)) return "use soon";
  if (FRESH.test(clause)) return "fresh";
  return null; // not sure
}

export function mockIngredients(transcript: string): Ingredient[] {
  const text = transcript.toLowerCase();
  const seen = new Set<string>();
  const out: Ingredient[] = [];
  // Freshness and amounts belong to the phrase a food was mentioned in.
  for (const clause of text.split(/[,.;]|\band\b|\bthen\b/)) {
    for (const [name, re] of FOODS) {
      if (seen.has(name) || !re.test(clause)) continue;
      // "leftover rice" also matches "rice"; keep only the more specific one.
      if (name === "Rice" && seen.has("Leftover rice")) continue;
      seen.add(name);
      const amount = amountFrom(clause.trim(), re);
      out.push({
        id: `ing-${out.length}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        name,
        ...amount,
        saidUnit: amount.unit,
        tag: name === "Leftover rice" ? "use soon" : tagFrom(clause),
      });
    }
  }
  return out;
}

// ── Preferences ──────────────────────────────────────────────────────────────

export function mockPref(key: keyof Prefs, transcript: string): string | number {
  const t = transcript.toLowerCase();
  if (key === "servings" || key === "courses") {
    const max = key === "servings" ? 6 : 5;
    const digit = t.match(/\d+/)?.[0];
    const word = t.split(/\W+/).find((w) => w in NUMBER_WORDS && w !== "a" && w !== "an");
    const n = digit ? Number(digit) : word ? NUMBER_WORDS[word] : key === "servings" ? 2 : 3;
    return Math.min(max, Math.max(1, n));
  }
  if (key === "diet") {
    if (/veg/.test(t)) return "Vegetarian";
    if (/oil|light|lean/.test(t)) return "Low-oil";
    if (/protein|gym|muscle/.test(t)) return "High-protein";
    return "No restrictions";
  }
  if (/peanut|nut/.test(t)) return "Peanuts";
  if (/shellfish|shrimp|prawn|crab/.test(t)) return "Shellfish";
  if (/gluten|wheat/.test(t)) return "Gluten";
  if (/dairy|milk|lactose/.test(t)) return "Dairy";
  return "None";
}

// ── Recipes ──────────────────────────────────────────────────────────────────

const STYLES: { name: (a: string, b: string) => string; short: string; blurb: string }[] = [
  { name: (a, b) => `${a} & ${b} Stir-fry`, short: "Stir-fry", blurb: "Hot pan, five minutes, everything glossy." },
  { name: (a) => `Brothy ${a} Soup`, short: "Soup", blurb: "Comforting, forgiving, ready in fifteen." },
  { name: (a, b) => `${a} & ${b} Hash`, short: "Hash", blurb: "Crispy bits and soft middles, one pan." },
  { name: (a) => `Charred ${a}`, short: "Charred", blurb: "Blistered edges, salty finish." },
  { name: (a, b) => `${a} & ${b} Braise`, short: "Braise", blurb: "Low and slow, with a glossy little sauce." },
  { name: (a) => `${a} Fritters`, short: "Fritters", blurb: "Golden, crunchy, better than they sound." },
];

function steps(uses: string[]): Step[] {
  const [a, b] = uses;
  return [
    { text: `Prep the ${a.toLowerCase()}${b ? ` and ${b.toLowerCase()}` : ""} into bite-sized pieces.`, img: true, cap: `reference · prepping ${a.toLowerCase()}`, imagePrompt: `chopping ${a.toLowerCase()} on a board` },
    { text: "Medium-high heat, a little oil, and a pinch of salt.", img: false },
    { text: `Cook the ${a.toLowerCase()} until it takes on some colour, then add the rest.`, img: true, cap: "reference · getting colour", imagePrompt: `${a.toLowerCase()} browning in a pan` },
    { text: "Taste, adjust the salt, and serve hot.", img: false },
  ];
}

function mockDish(ingredients: Ingredient[], style: number, rescue: string[], idx: number, note?: string): Dish {
  const s = STYLES[style % STYLES.length];
  // Lead with what needs rescuing, then fill in from the rest of the list.
  const names = [...rescue, ...ingredients.map((i) => i.name).filter((n) => !rescue.includes(n))];
  const rotated = [...names.slice(idx % names.length), ...names.slice(0, idx % names.length)];
  const lead = rescue.length ? [rescue[idx % rescue.length], ...rotated.filter((n) => n !== rescue[idx % rescue.length])] : rotated;
  const uses = lead.slice(0, 3);
  const [a, b = "Scallions"] = uses;
  const name = s.name(a, b);
  return {
    id: `dish-${idx}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name,
    short: s.short,
    blurb: note ? `${s.blurb} (You asked: “${note}”.)` : s.blurb,
    rescue: uses.filter((u) => rescue.includes(u)),
    uses,
    steps: steps(uses),
  };
}

const onTheClock = (ingredients: Ingredient[]) =>
  ingredients
    .filter((i) => i.tag === "going bad" || i.tag === "use soon")
    .map((i) => i.name);

export function mockDishes(ingredients: Ingredient[], count: number): Dish[] {
  const rescue = onTheClock(ingredients);
  return Array.from({ length: count }, (_, i) => mockDish(ingredients, i, rescue, i));
}

export function mockSwap(
  ingredients: Ingredient[],
  keepRescue: string[],
  exclude: string[],
  note?: string,
): Dish {
  const rescue = keepRescue.length
    ? keepRescue
    : onTheClock(ingredients);
  // First style whose dish name isn't already on screen.
  for (let i = 0; i < STYLES.length * 2; i++) {
    const d = mockDish(ingredients, i, rescue, i + exclude.length, note);
    if (!exclude.includes(d.name)) return { ...d, id: `${d.id}-swap-${Date.now()}` };
  }
  return mockDish(ingredients, exclude.length, rescue, exclude.length, note);
}

// ── Images ───────────────────────────────────────────────────────────────────

// An inline SVG placeholder, so no image service is needed.
export function mockImage(prompt: string, kind: "step" | "finale"): string {
  const [w, h] = kind === "finale" ? [600, 600] : [800, 600];
  const label = prompt.split(/[.—]/)[0].slice(0, 60).replace(/[<>&"]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#DCE7C5"/><stop offset="1" stop-color="#F5EBC8"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="50%" y="46%" text-anchor="middle" font-family="sans-serif" font-size="28" fill="#505A3F">mock image</text><text x="50%" y="56%" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#8A9172">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
