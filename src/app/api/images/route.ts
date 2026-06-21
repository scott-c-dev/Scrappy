import { NextResponse } from "next/server";
import { generateImage } from "@/lib/server/midjourney";

export const runtime = "nodejs";
// Midjourney jobs are slow (async generation + polling); allow a long request.
export const maxDuration = 120;

/* Image generation behind the `{ prompt, kind } -> { url }` contract the client
   already consumes (PRD §9). Provider: Midjourney via its MCP server (see
   src/lib/server/midjourney.ts). */

const STYLE: Record<"step" | "finale", string> = {
  step: "instructional close-up cooking reference photo, overhead, warm natural kitchen light, clean and clear, appetising, shallow depth of field",
  finale:
    "beautifully plated finished home-cooked dish, warm natural light, overhead food photography, cosy, appetising, rich detail",
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
    const url = await generateImage(`${prompt}. ${STYLE[kind]}`, ASPECT[kind]);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[/api/images]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "image generation failed" },
      { status: 502 },
    );
  }
}
