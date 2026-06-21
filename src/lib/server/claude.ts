/* Server-only Anthropic client. Imported exclusively by route handlers so the
   API key never reaches the client bundle. */

import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/* Latest Opus — multimodal (fridge photos) + structured outputs for the recipe
   schema. The exact model string from the claude-api reference. */
export const MODEL = "claude-opus-4-8";

let cached: Anthropic | null = null;

export function claude(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  // Reuse one client across requests (keeps connection pooling warm).
  cached ??= new Anthropic();
  return cached;
}
