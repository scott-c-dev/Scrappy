/* Client-side wrappers around the server proxy routes. Every call throws on a
   non-2xx response so the UI can surface the error sheet — there is no canned
   fallback (per the build decision). */

import type { Dish, Ingredient, Prefs } from "./types";

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${url} failed (${res.status}): ${detail}`);
  }
  return res.json() as Promise<T>;
}

/* Turn a spoken transcript and/or a fridge photo into structured ingredients
   with three-tier freshness. */
export function parseIngredients(input: {
  transcript?: string;
  imageBase64?: string;
}): Promise<{ ingredients: Ingredient[] }> {
  return postJSON("/api/ingredients", input);
}

/* Map a short spoken phrase to a single preference value (servings/courses/
   diet/allergy). */
export function parsePref(
  key: keyof Prefs,
  transcript: string,
): Promise<{ value: string | number }> {
  return postJSON("/api/preference", { key, transcript });
}

/* Generate the 3-dish overview (with steps) under the hard ingredient
   constraint. */
export function generateRecipes(input: {
  ingredients: Ingredient[];
  prefs: Prefs;
}): Promise<{ dishes: Dish[] }> {
  return postJSON("/api/recipes", input);
}

/* Swap a single dish while still rescuing the expiring ingredients. */
export function swapDish(input: {
  ingredients: Ingredient[];
  prefs: Prefs;
  swapDishId: string;
  keepRescue: string[];
  exclude: string[];
}): Promise<{ dish: Dish }> {
  return postJSON("/api/recipes", input);
}

/* Generate one image (a cook step or the finale plated shot). Returns its URL. */
export function generateImage(input: {
  prompt: string;
  kind: "step" | "finale";
}): Promise<{ url: string }> {
  return postJSON("/api/images", input);
}

/* Upload a recorded audio clip for server-side Deepgram transcription. */
export async function transcribe(blob: Blob): Promise<{ transcript: string }> {
  const res = await fetch("/api/transcribe", {
    method: "POST",
    headers: { "content-type": blob.type || "audio/webm" },
    body: blob,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`/api/transcribe failed (${res.status}): ${detail}`);
  }
  return res.json() as Promise<{ transcript: string }>;
}
