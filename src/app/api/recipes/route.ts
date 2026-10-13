import { NextResponse } from "next/server";
import { z } from "zod";
import { aiErrorResponse } from "@/lib/server/aiResponse";
import { generateJson, llmConfig, type LlmConfig } from "@/lib/server/llm";
import { mockAI, mockDelay, mockDishes, mockSwap } from "@/lib/server/mock";
import { isStaple, normalize, STAPLES } from "@/lib/staples";
import type { Dish, Ingredient, Prefs, Step } from "@/lib/types";
import { amountText, type UnitSystem } from "@/lib/units";

export const runtime = "nodejs";
// Above the AI call's own 120 s deadline (lib/server/llm.ts), so ours fires first.
export const maxDuration = 150;

interface Body {
  ingredients: Ingredient[];
  prefs: Prefs;
  /* Which units to write recipe quantities in. */
  units?: UnitSystem;
  /* Swap mode: replace this dish with one alternative... */
  swapDishId?: string;
  /* ...while still using these expiring ingredients (ids) (§2). */
  keep?: string[];
  /* Dish names to avoid repeating on a swap. */
  exclude?: string[];
  /* Optional spoken ad-hoc preference for this swap (e.g. "make it spicier"). */
  note?: string;
  /* The user's AI settings. */
  ai?: unknown;
}

/* The model names the user's ingredients by a short ref ("i1", "i2"…) from
   the prompt, never by name, so the app knows exactly which item it means
   and can show it under the user's own name and freshness. */
const refOf = (index: number) => `i${index + 1}`;

/* `wire` is what the model is told to produce: refs and staples as enums,
   which vendors with strict structured output enforce while generating.
   We parse with plain strings so a vendor that only reads the schema as a
   hint can't fail the whole reply over one bad item; clean() drops those. */
function dishSchema(refs: string[], wire: boolean) {
  const fridge = wire ? z.array(z.enum(refs as [string, ...string[]])) : z.array(z.string());
  const pantry = wire ? z.array(z.enum(STAPLES)) : z.array(z.string());
  return z.object({
    dishes: z.array(
      z.object({
        name: z.string(),
        short: z.string(),
        blurb: z.string(),
        fridge,
        pantry,
        steps: z.array(
          z.object({
            text: z.string(),
            // Optional: in plain JSON mode some models (DeepSeek) leave it
            // out when it's false. A missing one means no picture.
            needsImage: z.boolean().optional(),
            cap: z.string().optional(),
            imagePrompt: z.string().optional(),
          }),
        ),
      }),
    ),
  });
}

type RawDish = z.output<ReturnType<typeof dishSchema>>["dishes"][number];

function ingredientLines(ings: Ingredient[]): string {
  return ings
    .map((i, idx) => {
      const tier =
        i.tag === "going bad"
          ? " [GOING BAD — rescue first]"
          : i.tag === "use soon"
            ? " [use soon]"
            : i.tag === "fresh"
              ? " [fresh]"
              : " [freshness not stated]";
      return `- [${refOf(idx)}] ${i.name} (${amountText(i)})${tier}`;
    })
    .join("\n");
}

function systemPrompt(prefs: Prefs, units: UnitSystem): string {
  return `You are Scrappy, a recipe generator whose entire job is to cook what is about to go bad using ONLY what the user already has — no shopping trip.

HARD CONSTRAINT (non-negotiable):
- You may use ONLY the ingredients in the user's list PLUS this basic pantry-staples whitelist: ${STAPLES.join(", ")}.
- Do NOT introduce any other ingredient. If a classic version of a dish would need something the user doesn't have, adapt the dish so it doesn't, or pick a different dish. Never silently add an ingredient.
- Every ingredient a dish uses MUST be listed in its "fridge" (the user's items) or "pantry" (whitelist staples) array.

WASTE-PREVENTION PRIORITY (the whole point):
- Build dishes around ingredients marked [GOING BAD] first, then [use soon], then the rest.
- For ingredients marked [freshness not stated], judge by how quickly that food usually spoils (leafy greens, herbs, berries, fish and dairy go before rice, potatoes or onions) and favour the more perishable ones.
- Across the dishes, use EVERY [GOING BAD] ingredient, then every [use soon] one, as far as the number of dishes allows. Don't leave one out just because another dish would be easier.

AMOUNTS:
- Respect the amounts listed; don't use more than the user has. "as needed" means the amount wasn't given — use a sensible quantity.
- Write quantities in the steps in ${units === "imperial" ? "imperial units (oz, lb, cups, tbsp, tsp, °F)" : "metric units (g, kg, ml, L, °C)"}.

Per dish provide:
- name: an appetising dish name.
- short: a 1-2 word tab label.
- blurb: one warm sentence (no emoji).
- fridge: the refs (like "i1") of every item from the user's list the dish uses. Always use the ref, never a name. If the user listed something that is also a staple (e.g. scallions), it goes here by its ref, not in pantry.
- pantry: the whitelist staples it uses that the user did NOT list, written exactly as in the whitelist.
- steps: ordered cooking steps, naming ingredients in plain words (not refs). Set needsImage=true ONLY for steps where a visual is genuinely indispensable (knife technique, a doneness/heat state); everything else needsImage=false. Keep steps concise and practical. For each needsImage step, ALSO provide:
  - cap: a short caption like "reference · the golden side".
  - imagePrompt: a concrete, one-sentence VISUAL description of the ACTION this step performs — the technique in progress: what the hands / knife / pan are doing and what the ingredient looks like AT THIS MOMENT (raw, half-cooked, browning, etc.). Example: for "Dice the bacon", write "a chef's knife dicing raw bacon strips into small even cubes on a wooden cutting board, hands guiding the blade". Describe the in-progress action ONLY — never the finished or plated dish, no dish name, no final result, no serving plate.

Honour preferences: cook for ${prefs.servings} ${prefs.servings === 1 ? "person" : "people"}; diet: ${prefs.diet}; allergies to avoid: ${prefs.allergy}.`;
}

async function generate(
  config: LlmConfig,
  body: Body,
  count: number,
  extra: string,
): Promise<RawDish[]> {
  const userText = `Ingredients I have:
${ingredientLines(body.ingredients)}

Design ${count} ${count === 1 ? "dish" : "distinct dishes"} under the hard constraint.${extra}`;

  const { dishes } = await generateJson(config, {
    system: systemPrompt(body.prefs, body.units === "imperial" ? "imperial" : "metric"),
    user: userText,
    schema: dishSchema([], false),
    wireSchema: dishSchema(body.ingredients.map((_, i) => refOf(i)), true),
    maxTokens: 8000,
  });
  return dishes;
}

/* The §7 validation pass. Maps each dish's refs back to ingredient ids and
   keeps only whitelist staples; a staple the user also listed counts as
   their item. Returns what had to be dropped (not on the list or the
   whitelist), so the caller can re-prompt once before accepting the rest. */
function clean(dishes: RawDish[], ings: Ingredient[]): { dishes: Dish[]; dropped: string[] } {
  const byRef = new Map(ings.map((ing, i) => [refOf(i), ing.id]));
  const byName = new Map(ings.map((ing) => [normalize(ing.name), ing.id]));
  const dropped = new Set<string>();
  const out = dishes.map((d, idx) => {
    const uses = new Set<string>();
    const pantry = new Set<string>();
    for (const r of d.fridge) {
      const id = byRef.get(r.trim()) ?? byName.get(normalize(r));
      if (id) uses.add(id);
      else dropped.add(r);
    }
    for (const p of d.pantry) {
      const id = byName.get(normalize(p));
      if (id) uses.add(id);
      else if (isStaple(p)) pantry.add(STAPLES.find((st) => normalize(st) === normalize(p))!);
      else dropped.add(p);
    }
    return toDish(d, idx, [...uses], [...pantry]);
  });
  return { dishes: out, dropped: [...dropped] };
}

function toDish(raw: RawDish, idx: number, uses: string[], pantry: string[]): Dish {
  const steps: Step[] = raw.steps.map((s) => ({
    text: s.text,
    img: !!s.needsImage,
    cap: s.cap,
    imagePrompt: s.imagePrompt,
  }));
  return {
    id: `dish-${idx}-${raw.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name: raw.name,
    short: raw.short || raw.name,
    blurb: raw.blurb,
    uses,
    pantry,
    steps,
  };
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!Array.isArray(body.ingredients) || body.ingredients.length === 0) {
    return NextResponse.json({ error: "no ingredients provided" }, { status: 400 });
  }

  const isSwap = !!body.swapDishId;
  const count = isSwap ? 1 : Math.max(1, Math.min(5, body.prefs.courses || 3));

  const note = body.note?.trim();

  if (mockAI()) {
    await mockDelay(1500);
    return isSwap
      ? NextResponse.json({
          dish: mockSwap(body.ingredients, body.keep ?? [], body.exclude ?? [], note),
        })
      : NextResponse.json({ dishes: mockDishes(body.ingredients, count) });
  }
  const keep = body.ingredients.filter((i) => body.keep?.includes(i.id)).map((i) => i.name);
  const extra = isSwap
    ? `\n\nThis replaces a previous dish. Pick something different${
        body.exclude?.length ? ` from: ${body.exclude.join(", ")}` : ""
      }, but it MUST still use up these expiring ingredients: ${keep.join(", ") || "the ones marked GOING BAD"}.${
        note
          ? ` The user also asked: "${note}". Honour this preference as far as the hard ingredient constraint and the rescue requirement allow; if it conflicts (e.g. asks to drop an expiring ingredient), keep the rescue and adapt the rest.`
          : ""
      }`
    : "";

  try {
    const config = llmConfig(body.ai);
    let { dishes, dropped } = clean(await generate(config, body, count, extra), body.ingredients);

    // §7 validation: one corrective re-prompt, then drop what's left over.
    if (dropped.length) {
      console.warn("[/api/recipes] not on the list or whitelist, re-prompting:", dropped);
      ({ dishes, dropped } = clean(
        await generate(
          config,
          body,
          count,
          `${extra}\n\nYour previous attempt used ingredients NOT in my list or the whitelist: ${dropped.join(", ")}. Regenerate using ONLY my ingredients (by ref) plus the whitelist — drop or substitute those items.`,
        ),
        body.ingredients,
      ));
      if (dropped.length) console.warn("[/api/recipes] dropped:", dropped);
    }

    // Models sometimes over-deliver; never show more than were asked for.
    dishes = dishes.slice(0, count);
    return isSwap
      ? NextResponse.json({ dish: dishes[0] })
      : NextResponse.json({ dishes });
  } catch (err) {
    return aiErrorResponse("/api/recipes", err);
  }
}
