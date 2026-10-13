import type { Dish, Ingredient } from "@/lib/types";
import { onTheClock } from "./freshness";

/* Everything the dishes, loading, swap and finish screens say about what's
   being used comes from here, built from the same ingredient list the chips
   show — so no sentence can contradict the cards. */

const RANK = { "going bad": 0, "use soon": 1, fresh: 2 } as const;
const rank = (i: Ingredient) => (i.tag ? RANK[i.tag] : 3);

/* Going bad → use soon → fresh → not sure; the order they were said within a tier. */
export function byFreshness(ingredients: Ingredient[], all: Ingredient[]): Ingredient[] {
  return [...ingredients].sort((a, b) => rank(a) - rank(b) || all.indexOf(a) - all.indexOf(b));
}

/* The user's ingredients a dish uses, in chip order. */
export function itemsOf(dish: Dish, all: Ingredient[]): Ingredient[] {
  return byFreshness(all.filter((i) => dish.uses.includes(i.id)), all);
}

/* Distinct user ingredients across the dishes, in chip order. */
export function usedBy(dishes: Dish[], all: Ingredient[]): Ingredient[] {
  const ids = new Set(dishes.flatMap((d) => d.uses));
  return byFreshness(all.filter((i) => ids.has(i.id)), all);
}

const lc = (i: Ingredient) => i.name.toLowerCase();

/* "a", "a & b", "a, b & c", "a, b & 3 more". */
export function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} & ${names[2]}`;
  return `${names[0]}, ${names[1]} & ${names.length - 2} more`;
}

export function topClaim(dishes: Dish[], all: Ingredient[]): string {
  const urgent = usedBy(dishes, all).filter((i) => onTheClock(i.tag)).map(lc);
  if (!urgent.length) return "Nothing sounded urgent, so I just went for tasty.";
  const lead =
    dishes.length === 1
      ? `This one leans on your ${nameList(urgent)}`
      : `These lean on your ${nameList(urgent)} first`;
  return `${lead} — ${urgent.length === 1 ? "it’s" : "they’re"} on the clock.`;
}

export function countLabel(n: number): string {
  return `${n} ${n === 1 ? "dish" : "dishes"} · no extra shopping`;
}

export function footerLine(dishes: Dish[], all: Ingredient[]): string {
  const used = usedBy(dishes, all);
  const n = used.length;
  const k = used.filter((i) => onTheClock(i.tag)).length;
  const things = `${n} ${n === 1 ? "thing" : "things"} from your fridge`;
  if (k === 0) return `${things}.`;
  if (k === n) return n === 1 ? `${things} — the one on the clock.` : `${things} — every one on the clock.`;
  return `${things}, ${k} of them on the clock.`;
}

export function loadingLine(all: Ingredient[]): string {
  const urgent = byFreshness(all.filter((i) => onTheClock(i.tag)), all).map(lc);
  return urgent.length
    ? `Putting your ${nameList(urgent)} at the front of the queue. Two seconds.`
    : "Sizing up what you’ve got. Two seconds.";
}

export function swapLine(dish: Dish, all: Ingredient[]): string {
  return itemsOf(dish, all).some((i) => onTheClock(i.tag))
    ? `${dish.name} — the next one will still lean on what’s on the clock.`
    : `${dish.name} — I’ll find something else from what you’ve got.`;
}

/* `urgent` picks the finish box's amber (something on the clock was used) or green. */
export function finishLine(dishes: Dish[], all: Ingredient[]): { text: string; urgent: boolean } {
  const used = usedBy(dishes, all);
  const urgent = used.filter((i) => onTheClock(i.tag)).map(lc);
  if (urgent.length) return { text: `Your ${nameList(urgent)} didn’t go to waste. Nice.`, urgent: true };
  if (used.length === 1) return { text: `Your ${lc(used[0])}, off the shelf and onto a plate.`, urgent: false };
  if (used.length) return { text: `${used.length} things from your fridge, now dinner.`, urgent: false };
  return { text: "Good cooking.", urgent: false };
}

/* "Plus oil, soy sauce & salt" — every staple, never shortened to "& N more". */
export function pantryLine(pantry: string[]): string {
  if (pantry.length <= 1) return `Plus ${pantry[0] ?? ""}`;
  return `Plus ${pantry.slice(0, -1).join(", ")} & ${pantry[pantry.length - 1]}`;
}
