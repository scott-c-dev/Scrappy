/* Client-side wrappers around the server proxy routes. Every call throws on a
   non-2xx response so the UI can surface the error sheet — there is no canned
   fallback (per the build decision). */

import type { AiFailure, AiSettings, CheckFailure } from "./ai";
import { getAi } from "./aiStore";
import type { Dish, Ingredient, Prefs } from "./types";
import type { UnitSystem } from "./units";

/* A failed request. `kind` says why, when an AI call failed: out of credit,
   key refused, or anything else. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: AiFailure | null,
  ) {
    super(message);
  }
}

async function postJSON<T>(url: string, body: object, withAi = false): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // The user's AI settings travel with every AI request.
    body: JSON.stringify(withAi ? { ...body, ai: getAi() } : body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new ApiError(`${url} failed (${res.status})`, detail?.kind ?? null);
  }
  return res.json() as Promise<T>;
}

/* Checks AI settings before saving (lists the key's models; for a custom
   service, also which JSON mode it needs). With listOnly, just lists them
   for the model picker. */
export async function checkAi(
  ai: AiSettings,
  listOnly = false,
): Promise<
  | { ok: true; models: string[] | null; jsonMode?: "schema" | "object" }
  | { ok: false; reason: CheckFailure }
> {
  try {
    return await postJSON("/api/ai/check", { ai, listOnly });
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

/* What this server can do: whether it can make step pictures. */
export async function getCapabilities(): Promise<{ images: boolean }> {
  const res = await fetch("/api/capabilities");
  return res.json();
}

/* Turn what the user said (or typed) into structured ingredients with
   three-tier freshness. */
export function parseIngredients(input: {
  transcript: string;
}): Promise<{ ingredients: Ingredient[] }> {
  return postJSON("/api/ingredients", input, true);
}

/* Map a short spoken phrase to a single preference value (servings/courses/
   diet/allergy). */
export function parsePref(
  key: keyof Prefs,
  transcript: string,
): Promise<{ value: string | number }> {
  return postJSON("/api/preference", { key, transcript }, true);
}

/* Generate the 3-dish overview (with steps) under the hard ingredient
   constraint. */
export function generateRecipes(input: {
  ingredients: Ingredient[];
  prefs: Prefs;
  units: UnitSystem;
}): Promise<{ dishes: Dish[] }> {
  return postJSON("/api/recipes", input, true);
}

/* Swap a single dish while still rescuing the expiring ingredients. `note` is an
   optional spoken ad-hoc preference (e.g. "make it spicier", "no tofu"). */
export function swapDish(input: {
  ingredients: Ingredient[];
  prefs: Prefs;
  units: UnitSystem;
  swapDishId: string;
  /* Ids of the old dish's on-the-clock ingredients the new one should keep. */
  keep: string[];
  exclude: string[];
  note?: string;
}): Promise<{ dish: Dish }> {
  return postJSON("/api/recipes", input, true);
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
