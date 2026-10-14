import "server-only";
import { NextResponse } from "next/server";
import type { AiFailure } from "@/lib/ai";
import { classify } from "./llm";

/* The 502 an AI route returns when its LLM call fails. `kind` tells the app
   why: out of credit, too busy, key refused, model not offered, address
   unreachable, no answer in time, or anything else. */
export function aiErrorResponse(route: string, err: unknown) {
  const e = classify(err);
  console.error(`[${route}] ${e.kind}: ${e.message}${e.detail ? ` — vendor said: ${e.detail}` : ""}`);
  // A private address is caught when the settings are saved; if one gets
  // here anyway, to the user it's just an address that can't be reached.
  const kind: AiFailure = e.kind === "privateAddress" ? "unreachable" : e.kind;
  return NextResponse.json({ error: e.message, kind }, { status: 502 });
}
