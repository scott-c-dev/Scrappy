/* The §7 "basic pantry staples" whitelist. The hard anti-waste constraint is:
   a recipe may use ONLY the user's listed ingredients plus these staples; any
   other ingredient must be flagged optional and omitted. The server validation
   pass in /api/recipes scans against (listed ingredients ∪ this set). */

export const STAPLES = [
  "oil",
  "salt",
  "soy sauce",
  "vinegar",
  "scallions",
  "ginger",
  "garlic",
  "water",
  "sugar",
  "pepper",
] as const;

/* Loose normalisation so "Tomatoes", "tomato", " Tomato " all compare equal.
   Strips a trailing plural "s"/"es"; not linguistically perfect, but enough to
   match spoken/LLM variants against the listed set. */
export function normalize(name: string): string {
  let s = name.toLowerCase().trim().replace(/\s+/g, " ");
  if (s.endsWith("es")) s = s.slice(0, -2);
  else if (s.endsWith("s")) s = s.slice(0, -1);
  return s;
}

const STAPLE_SET = new Set(STAPLES.map(normalize));

/* True when `name` is one of the always-available staples. */
export function isStaple(name: string): boolean {
  return STAPLE_SET.has(normalize(name));
}

/* Build the allowed-ingredient set for a given user ingredient list:
   the staples plus every name the user actually has. */
export function allowedSet(ingredientNames: string[]): Set<string> {
  const s = new Set(STAPLE_SET);
  for (const n of ingredientNames) s.add(normalize(n));
  return s;
}
