import type Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { claude, MODEL } from "@/lib/server/claude";
import type { FreshnessTag, Ingredient } from "@/lib/types";

export const runtime = "nodejs";

/* Structured-output schema: Claude must return exactly this shape. `freshness`
   is a string enum (JSON-schema-friendly) that we map back to the nullable
   FreshnessTag below. */
const SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    ingredients: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          qty: { type: "string" },
          freshness: { type: "string", enum: ["going bad", "use soon", "fresh"] },
        },
        required: ["name", "qty", "freshness"],
      },
    },
  },
  required: ["ingredients"],
};

const SYSTEM = `You extract a kitchen ingredient list for an anti-food-waste cooking app.

From the user's spoken description and/or a fridge photo, list each distinct edible ingredient with:
- name: a short, title-case food name (e.g. "Tomatoes", "Leftover rice").
- qty: a rough amount in the user's own words ("2", "half a cabbage", "1 block", "as needed"). Never invent precise weights.
- freshness, using exactly one of three tiers:
  - "going bad": the user said it is spoiling/wilting/expiring, OR the photo clearly shows it past its best (browning, wilting, soft). These get rescued first.
  - "use soon": leftovers or perishables that should be eaten soon but are still fine (e.g. "leftover rice", cut/opened items).
  - "fresh": anything with no spoilage signal. This is the default when unsure.

Only list ingredients actually mentioned or visibly present. Do not add staples (oil, salt, etc.) or anything not stated/shown.`;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ImageMediaType = (typeof IMAGE_TYPES)[number];

function imageBlock(imageBase64: string): Anthropic.ImageBlockParam {
  // Accept a bare base64 string or a full data URL.
  const m = imageBase64.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]*)$/);
  const declared = m?.[1];
  const media_type: ImageMediaType =
    declared && (IMAGE_TYPES as readonly string[]).includes(declared)
      ? (declared as ImageMediaType)
      : "image/jpeg";
  const data = m ? m[2] : imageBase64;
  return { type: "image", source: { type: "base64", media_type, data } };
}

export async function POST(req: Request) {
  let body: { transcript?: string; imageBase64?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { transcript, imageBase64 } = body;
  if (!transcript && !imageBase64) {
    return NextResponse.json(
      { error: "provide a transcript or an imageBase64" },
      { status: 400 },
    );
  }

  const content: Anthropic.ContentBlockParam[] = [];
  if (imageBase64) content.push(imageBlock(imageBase64));
  content.push({
    type: "text",
    text: transcript
      ? `Here is what the user said is in their fridge: "${transcript}". Extract the ingredient list.`
      : "Extract the ingredient list from this fridge photo.",
  });

  try {
    const res = await claude().messages.create({
      model: MODEL,
      max_tokens: 2000,
      thinking: { type: "adaptive" },
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content }],
    });

    const text =
      res.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ??
      "{}";
    const parsed = JSON.parse(text) as {
      ingredients: { name: string; qty: string; freshness: string }[];
    };

    const tagFor = (f: string): FreshnessTag =>
      f === "going bad" ? "going bad" : f === "use soon" ? "use soon" : null;

    const ingredients: Ingredient[] = parsed.ingredients.map((it, i) => ({
      id: `ing-${i}-${it.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name: it.name,
      qty: it.qty,
      tag: tagFor(it.freshness),
    }));

    return NextResponse.json({ ingredients });
  } catch (err) {
    console.error("[/api/ingredients]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "ingredient parsing failed" },
      { status: 502 },
    );
  }
}
