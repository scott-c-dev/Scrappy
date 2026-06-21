import { NextResponse } from "next/server";
import { generateImage } from "@/lib/server/midjourney";

export const runtime = "nodejs";
// Midjourney jobs are slow (async generation + polling); allow a long request.
export const maxDuration = 120;

/* Image generation behind the `{ prompt, kind } -> { url }` contract the client
   already consumes (PRD §9). Provider: Midjourney via its MCP server (see
   src/lib/server/midjourney.ts). */

const STYLE: Record<"step" | "finale", string> = {
  // Step shots must show the technique mid-action (the verb of the step), not
  // the finished plate — see NEGATIVE below for the matching exclusions.
  step: "a cooking technique caught mid-action: hands and utensils performing this exact step, ingredients in their in-progress state on a cutting board or in the pan, overhead close-up, warm natural kitchen light, clear and instructional, documentary process photo",
  finale:
    "beautifully plated finished home-cooked dish, warm natural light, overhead food photography, cosy, appetising, rich detail",
};

// Midjourney negative prompt (`--no`) per kind — keep step images on the
// action and away from a finished/plated result.
const NEGATIVE: Partial<Record<"step" | "finale", string>> = {
  step: "plated finished dish, full plated meal, restaurant plating, garnish styling, serving plate, text, watermark",
};

// Midjourney aspect ratios per image kind.
const ASPECT: Record<"step" | "finale", string> = {
  step: "4:3",
  finale: "1:1",
};

export async function POST(req: Request) {
  let body: { prompt?: string; kind?: "step" | "finale" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { prompt } = body;
  const kind = body.kind === "finale" ? "finale" : "step";
  if (!prompt) {
    return NextResponse.json({ error: "prompt required" }, { status: 400 });
  }

  try {
    const styled = `${prompt}. ${STYLE[kind]}`;
    const full = NEGATIVE[kind] ? `${styled} --no ${NEGATIVE[kind]}` : styled;
    const url = await generateImage(full, ASPECT[kind]);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[/api/images]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "image generation failed" },
      { status: 502 },
    );
  }
}
