/* Shared domain types — used by both the client (Scrappy.tsx) and the server
   route handlers, so the AI proxy and the UI agree on one shape. */

/* Three-tier freshness (PRD §3): `going bad` (rescue first), `use soon`
   (light prompt), or null (fresh, unlabelled). */
export type FreshnessTag = "going bad" | "use soon" | null;

export interface Ingredient {
  id: string;
  name: string;
  qty: string;
  tag: FreshnessTag;
}

export interface Step {
  text: string;
  /* True only when a visual is indispensable — knife skills / heat states
     (PRD §6). Plain-text steps get no image. */
  img: boolean;
  cap?: string;
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
