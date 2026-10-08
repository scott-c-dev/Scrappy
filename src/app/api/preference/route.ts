import { NextResponse } from "next/server";
import { z } from "zod";
import { aiErrorResponse } from "@/lib/server/aiResponse";
import { generateJson, llmConfig } from "@/lib/server/llm";
import { mockAI, mockDelay, mockFailure, mockPref } from "@/lib/server/mock";

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
  let body: { key?: Key; transcript?: string; ai?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { key, transcript } = body;
  if (!key || !(key in OPTIONS) || !transcript) {
    return NextResponse.json({ error: "key and transcript required" }, { status: 400 });
  }

  if (mockAI()) {
    await mockDelay(500);
    const failure = mockFailure(transcript);
    if (failure) return failure;
    return NextResponse.json({ value: mockPref(key, transcript) });
  }

  const choices = OPTIONS[key].map(String) as [string, ...string[]];

  try {
    const { value: raw } = await generateJson(llmConfig(body.ai), {
      system: `Map the user's short spoken phrase to exactly one of these allowed ${key} options: ${choices.join(", ")}. Choose the closest match.`,
      user: `They said: "${transcript}"`,
      schema: z.object({ value: z.enum(choices) }),
      maxTokens: 500,
      reasoning: false,
    });
    // Coerce numeric prefs back to numbers.
    const numeric = key === "servings" || key === "courses";
    const value: string | number = numeric ? Number(raw) : raw;
    return NextResponse.json({ value });
  } catch (err) {
    return aiErrorResponse("/api/preference", err);
  }
}
