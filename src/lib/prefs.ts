import type { Prefs } from "./types";

export type PrefKey = keyof Prefs;

/* Allowed values for each preference — mirrors the OPTIONS constant in
   /api/preference/route.ts (server validates, client drives UI). */
export const PREF_OPTIONS: Record<PrefKey, (string | number)[]> = {
  servings: [1, 2, 3, 4, 5, 6],
  courses: [1, 2, 3, 4, 5],
  diet: ["No restrictions", "Vegetarian", "Low-oil", "High-protein"],
  allergy: ["None", "Peanuts", "Shellfish", "Gluten", "Dairy"],
};

export const PREF_TITLES: Record<PrefKey, string> = {
  servings: "How many people?",
  courses: "How many dishes?",
  diet: "Any way you like to eat?",
  allergy: "Anything to keep out?",
};
