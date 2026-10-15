import { NextResponse } from "next/server";
import { modelOf, type AiSettings, type CheckFailure } from "@/lib/ai";
import { chatModels, listModels, llmConfig, LlmError, probeJsonMode, type LlmFailureKind } from "@/lib/server/llm";
import { mockAI, mockCheck, mockDelay } from "@/lib/server/mock";
import { assertPublicUrl } from "@/lib/server/netguard";

export const runtime = "nodejs";
// Above the AI call's own 120 s deadline (lib/server/llm.ts), so ours fires first.
export const maxDuration = 150;

/* Checks AI settings before they're saved, and lists the models the key can
   use for the model picker. The check itself uses only the (free) model list;
   running out of credit shows up at first use instead. For a custom service
   it also sends one tiny request to learn which JSON mode it needs — that
   answer never fails the check.

   → { ok: true, models: string[] | null, jsonMode?: "schema" | "object" }
       models null = the service has no list; no jsonMode = couldn't tell
   → { ok: false, reason: CheckFailure } */

const REASON: Record<LlmFailureKind, CheckFailure> = {
  refused: "wrongKey",
  credit: "wrongKey",
  busy: "unreachable",
  modelNotFound: "modelNotFound",
  unreachable: "unreachable",
  timeout: "unreachable",
  privateAddress: "privateAddress",
  service: "unreachable",
};

export async function POST(req: Request) {
  let body: { ai?: Partial<AiSettings>; listOnly?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const ai = body.ai;

  if (mockAI()) {
    await mockDelay(700);
    // The address guard needs no network, so it applies here too.
    if (ai?.provider === "custom" && ai.baseURL) {
      try {
        await assertPublicUrl(ai.baseURL);
      } catch {
        return NextResponse.json({ ok: false, reason: "privateAddress" });
      }
    }
    const res = mockCheck(ai?.key ?? "");
    return NextResponse.json("reason" in res ? { ok: false, ...res } : { ok: true, ...res });
  }

  try {
    // The picker lists models before one is chosen; any placeholder will do.
    const config = llmConfig(body.listOnly && ai ? { ...ai, model: ai.model || "-" } : ai);
    const all = await listModels(config);
    const model = ai ? modelOf(ai as AiSettings) : "";
    if (!body.listOnly && all && model && !all.includes(model)) {
      return NextResponse.json({ ok: false, reason: "modelNotFound" });
    }
    const jsonMode =
      !body.listOnly && ai?.provider === "custom" ? await probeJsonMode(config) : null;
    return NextResponse.json({
      ok: true,
      models: all && chatModels(all),
      ...(jsonMode && { jsonMode }),
    });
  } catch (err) {
    const kind = err instanceof LlmError ? err.kind : "service";
    return NextResponse.json({ ok: false, reason: REASON[kind] });
  }
}
