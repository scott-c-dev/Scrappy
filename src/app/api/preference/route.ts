import type Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { claude, MODEL } from "@/lib/server/claude";

export const runtime = "nodejs";

/* Allowed values per preference key — mirrors PREFOPTS on the client. */
const OPTIONS = {
  servings: [1, 2, 3, 4, 5, 6],
  courses: [1, 2, 3, 4, 5],
  diet: ["No restrictions", "Vegetarian", "Low-oil", "High-protein"],
  allergy: ["None", "Peanuts", "Shellfish", "Gluten", "Dairy"],
} as const;

type Key = keyof typeof OPTIONS;

export async function POST(req: Request) {
  let body: { key?: Key; transcript?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { key, transcript } = body;
  if (!key || !(key in OPTIONS) || !transcript) {
    return NextResponse.json({ error: "key and transcript required" }, { status: 400 });
  }

  const choices = OPTIONS[key].map(String);
  const schema: Record<string, unknown> = {
    type: "object",
    additionalProperties: false,
    properties: { value: { type: "string", enum: choices } },
    required: ["value"],
  };

  try {
    const res = await claude().messages.create({
      model: MODEL,
      max_tokens: 500,
      system: `Map the user's short spoken phrase to exactly one of these allowed ${key} options: ${choices.join(", ")}. Choose the closest match.`,
      output_config: { format: { type: "json_schema", schema } },
      messages: [{ role: "user", content: `They said: "${transcript}"` }],
    });

    const text =
      res.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ??
      "{}";
    const raw = (JSON.parse(text) as { value: string }).value;
    // Coerce numeric prefs back to numbers.
    const numeric = key === "servings" || key === "courses";
    const value: string | number = numeric ? Number(raw) : raw;
    return NextResponse.json({ value });
  } catch (err) {
    console.error("[/api/preference]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "preference parsing failed" },
      { status: 502 },
    );
  }
}
