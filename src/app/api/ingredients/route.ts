import { NextResponse } from "next/server";
import { z } from "zod";
import { aiErrorResponse } from "@/lib/server/aiResponse";
import { generateJson, llmConfig } from "@/lib/server/llm";
import { mockAI, mockDelay, mockFailure, mockIngredients } from "@/lib/server/mock";
import type { FreshnessTag, Ingredient } from "@/lib/types";

export const runtime = "nodejs";
// Above the AI call's own 120 s deadline (lib/server/llm.ts), so ours fires first.
export const maxDuration = 150;

/* Structured-output schema: the model must return exactly this shape.
   `freshness` is a string enum (JSON-schema-friendly) mapped back to the
   nullable FreshnessTag below; `hasAmount` says whether `amount` means anything. */
const SCHEMA = z.object({
  ingredients: z.array(
    z.object({
      name: z.string(),
      hasAmount: z.boolean(),
      amount: z.number(),
      unit: z.string(),
      freshness: z.enum(["going bad", "use soon", "fresh", "not sure"]),
    }),
  ),
});

const SYSTEM = `You extract a kitchen ingredient list for an anti-food-waste cooking app.

From the user's description of what's in their fridge, list each distinct edible ingredient with:
- name: a short, title-case food name (e.g. "Tomatoes", "Leftover rice").
- amount and unit, only as the user stated them — never invent an amount:
  - hasAmount: false when no amount was given (then amount = 0 and unit = "pcs"); true otherwise.
  - amount: a number ("half" = 0.5, "a couple" = 2, "a dozen" = 12).
  - unit: "pcs" for a plain count ("3 eggs", "half a cabbage"); otherwise the unit they used, as one of g, kg, ml, L, oz, lb, cups, or a singular kitchen word (bunch, clove, can, slice, block, bowl, head, pack…). Keep their unit even if it mixes metric and imperial; don't convert.
- freshness — only what the user told you. Don't guess from the kind of food:
  - "going bad": they said it's spoiling/wilting/expiring.
  - "use soon": leftovers, opened or cut items, or vague hints like "bought last week" or "a bit old".
  - "fresh": they said it's fresh or just bought.
  - "not sure": they said nothing about its freshness. This is the default.

Only list ingredients actually mentioned. Do not add staples (oil, salt, etc.) or anything not stated.`;

export async function POST(req: Request) {
  let body: { transcript?: string; ai?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const transcript = body.transcript?.trim();
  if (!transcript) {
    return NextResponse.json({ error: "provide a transcript" }, { status: 400 });
  }

  if (mockAI()) {
    await mockDelay();
    const failure = mockFailure(transcript);
    if (failure) return failure;
    return NextResponse.json({
      ingredients: mockIngredients(transcript),
    });
  }

  try {
    const parsed = await generateJson(llmConfig(body.ai), {
      system: SYSTEM,
      user: `Here is what the user said is in their fridge: "${transcript}". Extract the ingredient list.`,
      schema: SCHEMA,
      // Thinking models deliberate over vague lists ("a handful", "a splash",
      // eggs named twice) — deepseek-flash ran out at 2000. Kept under the
      // common 8K output cap; only what's used is billed.
      maxTokens: 6000,
    });

    const tagFor = (f: string): FreshnessTag =>
      f === "going bad" || f === "use soon" || f === "fresh" ? f : null;

    const ingredients: Ingredient[] = parsed.ingredients.map((it, i) => ({
      id: `ing-${i}-${it.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name: it.name,
      amount: it.hasAmount && it.amount > 0 ? it.amount : null,
      unit: it.unit.trim() || "pcs",
      saidUnit: it.unit.trim() || "pcs",
      tag: tagFor(it.freshness),
    }));

    return NextResponse.json({ ingredients });
  } catch (err) {
    return aiErrorResponse("/api/ingredients", err);
  }
}
