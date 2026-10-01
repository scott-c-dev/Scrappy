/* Shared domain types — used by both the client (Scrappy.tsx) and the server
   route handlers, so the AI proxy and the UI agree on one shape. */

/* Freshness as the user described it: `going bad` (rescue first), `use soon`,
   `fresh`, or null — "not sure", the default when they didn't say. We never
   show a guess; for not-sure items the recipe step falls back on how quickly
   that food usually spoils. */
export type FreshnessTag = "going bad" | "use soon" | "fresh" | null;

export interface Ingredient {
  id: string;
  name: string;
  /* null = "as needed" (no amount given). */
  amount: number | null;
  /* "pcs" for a plain count, a standard unit (g, lb, cups…), or a kitchen
     word the user said (bunch, block, bowl…). See lib/units.ts. */
  unit: string;
  /* The unit as originally said, so a custom one ("block") stays on offer
     after switching to another unit. */
  saidUnit?: string;
  tag: FreshnessTag;
}

export interface Step {
  text: string;
  /* True only when a visual is indispensable — knife skills / heat states
     (PRD §6). Plain-text steps get no image. */
  img: boolean;
  cap?: string;
  /* A concrete visual description of the ACTION this step performs (the
     technique in progress — hands/knife/pan mid-action, ingredient as it looks
     right now), NOT the finished plated dish. Drives step image generation so
     the picture matches the instruction (e.g. dicing bacon, not bacon pasta). */
  imagePrompt?: string;
}

export interface Dish {
  id: string;
  name: string;
  short: string;
  blurb: string;
  /* Expiring ingredients this dish uses up — drives the "Uses up · …" tag. */
  rescue: string[];
  /* All listed ingredients the dish draws on (used for the chips). */
  uses: string[];
  steps: Step[];
}

export interface Prefs {
  servings: number;
  courses: number;
  diet: string;
  allergy: string;
}
