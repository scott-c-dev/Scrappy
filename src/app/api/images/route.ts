import { NextResponse } from "next/server";

export const runtime = "nodejs";

/* Image generation behind the teammate's `{ step_id: image_url }` contract
   (PRD §9). The provider is isolated in `generate()` below so it can be swapped
   (fal.ai / Replicate / Midjourney-for-finale) without touching the client.

   Default provider: fal.ai FLUX schnell — a fast hosted model, the right fit
   for the §6 staggered-generation strategy (never call a slow model live). */

const FAL_MODEL: Record<"step" | "finale", string> = {
  // schnell = fast (~1-2s), good enough for in-flow step shots.
  step: "fal-ai/flux/schnell",
  // dev = higher fidelity for the grand-finale plated dish.
  finale: "fal-ai/flux/dev",
};

const STYLE: Record<"step" | "finale", string> = {
  step: "instructional close-up cooking reference photo, overhead, warm natural kitchen light, clean and clear, appetising, shallow depth of field",
  finale:
    "beautifully plated finished home-cooked dish, warm natural light, overhead food photography, cosy, appetising, rich detail",
};

const SIZE: Record<"step" | "finale", string> = {
  step: "landscape_4_3",
  finale: "square_hd",
};

async function generate(prompt: string, kind: "step" | "finale"): Promise<string> {
  const key = process.env.IMAGE_API_KEY;
  if (!key) throw new Error("IMAGE_API_KEY is not set");

  const fullPrompt = `${prompt}. ${STYLE[kind]}`;
  const res = await fetch(`https://fal.run/${FAL_MODEL[kind]}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      prompt: fullPrompt,
      image_size: SIZE[kind],
      num_images: 1,
      enable_safety_checker: true,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`image provider ${res.status}: ${detail}`);
  }
  const data = (await res.json()) as { images?: { url: string }[] };
  const url = data.images?.[0]?.url;
  if (!url) throw new Error("image provider returned no url");
  return url;
}

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
    const url = await generate(prompt, kind);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[/api/images]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "image generation failed" },
      { status: 502 },
    );
  }
}
