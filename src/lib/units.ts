/* Amount units, shared by the client (adjust card, chips) and the server
   (recipe prompt). The user's unit system decides which units are offered;
   a unit the user actually said is always kept, even if it isn't offered. */

import type { Ingredient } from "./types";

export type UnitSystem = "metric" | "imperial";

export const SYSTEM_UNITS: Record<UnitSystem, string[]> = {
  metric: ["g", "kg", "ml", "L"],
  imperial: ["oz", "lb", "cups"],
};

// Kitchen words that make sense in either system.
export const KITCHEN_UNITS = ["bunch", "clove", "can", "slice"];

/* How an amount in this unit is picked: ruler step and range, the value it
   starts at, which ticks get a number, and the quick-pick chips. */
export interface UnitSpec {
  step: number;
  max: number;
  def: number;
  label: number;
  quick: number[];
}

const SPECS: Record<string, UnitSpec> = {
  pcs: { step: 0.5, max: 24, def: 1, label: 1, quick: [0.5, 1, 2, 3, 4, 6] },
  g: { step: 50, max: 2000, def: 200, label: 200, quick: [100, 200, 250, 500, 1000] },
  kg: { step: 0.25, max: 5, def: 1, label: 1, quick: [0.5, 1, 2] },
  ml: { step: 50, max: 2000, def: 250, label: 200, quick: [100, 250, 500, 1000] },
  L: { step: 0.25, max: 4, def: 1, label: 1, quick: [0.5, 1, 2] },
  oz: { step: 1, max: 64, def: 8, label: 4, quick: [4, 8, 12, 16] },
  lb: { step: 0.25, max: 10, def: 1, label: 1, quick: [0.5, 1, 2] },
  cups: { step: 0.25, max: 8, def: 1, label: 1, quick: [0.5, 1, 2, 3] },
};

// Kitchen words, including ones the user said that we don't list (block, bowl…).
const COUNT_SPEC: UnitSpec = { step: 1, max: 20, def: 1, label: 2, quick: [1, 2, 3, 4] };

export function unitSpec(unit: string): UnitSpec {
  return SPECS[unit] ?? COUNT_SPEC;
}

export function otherSystem(system: UnitSystem): UnitSystem {
  return system === "metric" ? "imperial" : "metric";
}

/* The US (and Liberia, Myanmar) use imperial; everywhere else metric. */
export function defaultUnitSystem(): UnitSystem {
  if (typeof navigator === "undefined") return "metric";
  const loc = navigator.languages?.[0] ?? navigator.language ?? "";
  return /-(US|LR|MM)\b/i.test(loc) ? "imperial" : "metric";
}

// Nearest value on this unit's ruler.
export function snapAmount(unit: string, value: number): number {
  const s = unitSpec(unit);
  const snapped = Math.round(value / s.step) * s.step;
  return Math.min(s.max, Math.max(s.step, Math.round(snapped * 100) / 100));
}

export function fitsUnit(unit: string, value: number): boolean {
  const s = unitSpec(unit);
  return (
    value >= s.step &&
    value <= s.max &&
    Math.abs(value / s.step - Math.round(value / s.step)) < 1e-6
  );
}

// 0.5 → "½", 1.25 → "1¼", 250 → "250".
export function formatNumber(v: number): string {
  const whole = Math.floor(v + 1e-9);
  const frac = Math.round((v - whole) * 100) / 100;
  const glyph = ({ 0.25: "¼", 0.5: "½", 0.75: "¾" } as Record<number, string>)[frac];
  if (!glyph) return String(Math.round(v * 100) / 100);
  return whole ? `${whole}${glyph}` : glyph;
}

// The unit as shown after a number: nothing for a plain count, plurals for words.
export function unitWord(unit: string, v: number): string {
  if (unit === "pcs") return "";
  if (unit === "cups") return v > 1 ? "cups" : "cup";
  if (SPECS[unit]) return unit;
  if (v <= 1) return unit;
  return /(sh|ch|s|x|z)$/.test(unit) ? `${unit}es` : `${unit}s`;
}

// "3", "½", "500 g", "2 cloves", "as needed".
export function amountText(i: Pick<Ingredient, "amount" | "unit">): string {
  if (i.amount == null) return "as needed";
  const w = unitWord(i.unit, i.amount);
  return formatNumber(i.amount) + (w ? ` ${w}` : "");
}
