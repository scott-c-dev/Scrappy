import type Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { claude, MODEL } from "@/lib/server/claude";
import { allowedSet, normalize, STAPLES } from "@/lib/staples";
import type { Dish, Ingredient, Prefs, Step } from "@/lib/types";

export const runtime = "nodejs";

interface Body {
  ingredients: Ingredient[];
  prefs: Prefs;
  /* Swap mode: replace this dish with one alternative... */
  swapDishId?: string;
  /* ...while still rescuing these expiring ingredients (§2). */
  keepRescue?: string[];
  /* Dish names to avoid repeating on a swap. */
  exclude?: string[];
  /* Optional spoken ad-hoc preference for this swap (e.g. "make it spicier"). */
  note?: string;
}

const DISH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    short: { type: "string" },
    blurb: { type: "string" },
    rescue: { type: "array", items: { type: "string" } },
    uses: { type: "array", items: { type: "string" } },
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string" },
          needsImage: { type: "boolean" },
          cap: { type: "string" },
          imagePrompt: { type: "string" },
        },
        required: ["text", "needsImage"],
      },
    },
  },
  required: ["name", "short", "blurb", "rescue", "uses", "steps"],
};

const SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: { dishes: { type: "array", items: DISH_SCHEMA } },
  required: ["dishes"],
};

interface RawDish {
  name: string;
  short: string;
  blurb: string;
  rescue: string[];
  uses: string[];
  steps: {
    text: string;
    needsImage: boolean;
    cap?: string;
    imagePrompt?: string;
  }[];
}

function ingredientLines(ings: Ingredient[]): string {
  return ings
    .map((i) => {
      const tier =
        i.tag === "going bad"
          ? " [GOING BAD — rescue first]"
          : i.tag === "use soon"
            ? " [use soon]"
            : "";
      return `- ${i.name} (${i.qty})${tier}`;
    })
    .join("\n");
}

function systemPrompt(prefs: Prefs): string {
  return `You are Scrappy, a recipe generator whose entire job is to cook what is about to go bad using ONLY what the user already has — no shopping trip.

HARD CONSTRAINT (non-negotiable):
- You may use ONLY the ingredients in the user's list PLUS this basic pantry-staples whitelist: ${STAPLES.join(", ")}.
- Do NOT introduce any other ingredient. If a classic version of a dish would need something the user doesn't have, adapt the dish so it doesn't, or pick a different dish. Never silently add an ingredient.
- Every ingredient named in a recipe's "uses" list MUST be either in the user's list or in the whitelist.

WASTE-PREVENTION PRIORITY (the whole point):
- Build dishes around ingredients marked [GOING BAD] first, then [use soon], then fresh.
- Each dish's "rescue" array = the GOING BAD / use-soon ingredients that dish actually uses up. It must be a subset of "uses".

Per dish provide:
- name: an appetising dish name.
- short: a 1-2 word tab label.
- blurb: one warm sentence (no emoji).
- uses: the user-list/whitelist ingredients the dish draws on (title-case names).
- rescue: the expiring ingredients it uses up.
- steps: ordered cooking steps. Set needsImage=true ONLY for steps where a visual is genuinely indispensable (knife technique, a doneness/heat state); everything else needsImage=false. Keep steps concise and practical. For each needsImage step, ALSO provide:
  - cap: a short caption like "reference · the golden side".
  - imagePrompt: a concrete, one-sentence VISUAL description of the ACTION this step performs — the technique in progress: what the hands / knife / pan are doing and what the ingredient looks like AT THIS MOMENT (raw, half-cooked, browning, etc.). Example: for "Dice the bacon", write "a chef's knife dicing raw bacon strips into small even cubes on a wooden cutting board, hands guiding the blade". Describe the in-progress action ONLY — never the finished or plated dish, no dish name, no final result, no serving plate.

Honour preferences: cook for ${prefs.servings} ${prefs.servings === 1 ? "person" : "people"}; diet: ${prefs.diet}; allergies to avoid: ${prefs.allergy}.`;
}

async function generate(
  body: Body,
  count: number,
  extra: string,
): Promise<RawDish[]> {
  const userText = `Ingredients I have:
${ingredientLines(body.ingredients)}

Design ${count} ${count === 1 ? "dish" : "distinct dishes"} under the hard constraint.${extra}`;

  const res = await claude().messages.create({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system: systemPrompt(body.prefs),
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: userText }],
  });

  const text =
    res.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ??
    "{}";
  return (JSON.parse(text) as { dishes: RawDish[] }).dishes ?? [];
}

/* The §7 validation pass: find ingredients a dish claims to use that are
   outside (user list ∪ staples). Returns the offending names per dish. */
function findViolations(dishes: RawDish[], allowed: Set<string>): string[] {
  const bad = new Set<string>();
  for (const d of dishes) {
    for (const u of [...d.uses, ...d.rescue]) {
      if (!allowed.has(normalize(u))) bad.add(u);
    }
  }
  return [...bad];
}

/* Last-resort cleanup if the model still won't comply: strip out-of-set
   ingredients and log what was removed. */
function strip(dishes: RawDish[], allowed: Set<string>): RawDish[] {
  return dishes.map((d) => {
    const removed = [...d.uses, ...d.rescue].filter((u) => !allowed.has(normalize(u)));
    if (removed.length) {
      console.warn(
        `[/api/recipes] stripped non-allowed ingredients from "${d.name}":`,
        removed,
      );
    }
    return {
      ...d,
      uses: d.uses.filter((u) => allowed.has(normalize(u))),
      rescue: d.rescue.filter((u) => allowed.has(normalize(u))),
    };
  });
}

function toDish(raw: RawDish, idx: number): Dish {
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
    rescue: raw.rescue,
    uses: raw.uses,
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

  const allowed = allowedSet(body.ingredients.map((i) => i.name));
  const isSwap = !!body.swapDishId;
  const count = isSwap ? 1 : Math.max(1, Math.min(5, body.prefs.courses || 3));

  const note = body.note?.trim();
  const extra = isSwap
    ? `\n\nThis replaces a previous dish. Pick something different${
        body.exclude?.length ? ` from: ${body.exclude.join(", ")}` : ""
      }, but it MUST still use up these expiring ingredients: ${(body.keepRescue ?? []).join(", ") || "the ones marked GOING BAD"}.${
        note
          ? ` The user also asked: "${note}". Honour this preference as far as the hard ingredient constraint and the rescue requirement allow; if it conflicts (e.g. asks to drop an expiring ingredient), keep the rescue and adapt the rest.`
          : ""
      }`
    : "";

  try {
    let dishes = await generate(body, count, extra);

    // §7 validation: one corrective re-prompt, then strip as a backstop.
    let violations = findViolations(dishes, allowed);
    if (violations.length) {
      console.warn("[/api/recipes] violations, re-prompting:", violations);
      dishes = await generate(
        body,
        count,
        `${extra}\n\nYour previous attempt used ingredients NOT in my list or the whitelist: ${violations.join(", ")}. Regenerate using ONLY my ingredients plus the whitelist — drop or substitute those items.`,
      );
      violations = findViolations(dishes, allowed);
      if (violations.length) dishes = strip(dishes, allowed);
    }

    const mapped = dishes.map(toDish);
    return isSwap
      ? NextResponse.json({ dish: mapped[0] })
      : NextResponse.json({ dishes: mapped });
  } catch (err) {
    console.error("[/api/recipes]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "recipe generation failed" },
      { status: 502 },
    );
  }
}
