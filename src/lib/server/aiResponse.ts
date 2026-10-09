import "server-only";
import { NextResponse } from "next/server";
import type { AiFailure } from "@/lib/ai";
import { classify } from "./llm";

/* The 502 an AI route returns when its LLM call fails. `kind` tells the app
   which message to show: out of credit, key refused, or a generic failure. */
export function aiErrorResponse(route: string, err: unknown) {
  const e = classify(err);
  console.error(`[${route}] ${e.kind}: ${e.message}`);
  const kind: AiFailure = e.kind === "credit" || e.kind === "refused" ? e.kind : "service";
  return NextResponse.json({ error: e.message, kind }, { status: 502 });
}
