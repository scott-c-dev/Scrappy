import { NextResponse } from "next/server";
import { midjourneyAuthorized } from "@/lib/server/mcp-oauth";
import { mockAI } from "@/lib/server/mock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* What this Scrappy server can do, so the app can adapt. Step pictures need
   a Midjourney login by whoever runs the server (mock mode fakes them). */
export function GET() {
  return NextResponse.json({ images: mockAI() || midjourneyAuthorized() });
}
