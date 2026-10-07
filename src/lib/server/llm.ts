/* Server-only LLM client. Imported exclusively by route handlers so the API key
   never reaches the client bundle.

   Every call Scrappy makes has the same shape — a system prompt, one user
   message, and a JSON reply matching a schema — so one function covers both
   API formats: Anthropic's Messages API, and OpenAI's Chat Completions, which
   most other vendors (and local servers) also speak.

   Configured in .env.local (see .env.example):
     LLM_API_FORMAT   anthropic (default) | openai-chat
     LLM_API_KEY      required
     LLM_BASE_URL     default: the format's official URL
     LLM_MODEL        default: a cheap current model, on the official URL only
     LLM_EFFORT       unset = no reasoning params sent (cheapest, works anywhere)
     LLM_JSON_MODE    openai-chat only: schema (default) | object */

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { z } from "zod";

type ApiFormat = "anthropic" | "openai-chat";

export interface LlmConfig {
  format: ApiFormat;
  apiKey: string;
  /* Unset = the format's official endpoint. */
  baseURL: string | undefined;
  model: string;
  /* Sent as-is: Anthropic `effort` (with adaptive thinking) or OpenAI
     `reasoning_effort`. Unset = neither is sent. */
  effort: string | undefined;
  jsonMode: "schema" | "object";
}

/* Used only when talking to the official endpoint and no model is set. The
   OpenAI default model's own reasoning default is medium, so it comes with a
   known-good effort; a model you pick yourself gets only the effort you set. */
const DEFAULTS: Record<ApiFormat, { model: string; effort?: string }> = {
  anthropic: { model: "claude-sonnet-5" },
  "openai-chat": { model: "gpt-6-luna", effort: "low" },
};

const OFFICIAL_URL: Record<ApiFormat, string> = {
  anthropic: "https://api.anthropic.com",
  "openai-chat": "https://api.openai.com/v1",
};

const env = (name: string) => process.env[name]?.trim() || undefined;

export function llmConfig(): LlmConfig {
  const format = env("LLM_API_FORMAT") ?? "anthropic";
  if (format !== "anthropic" && format !== "openai-chat") {
    throw new Error(`LLM_API_FORMAT must be "anthropic" or "openai-chat" (got "${format}")`);
  }
  const apiKey = env("LLM_API_KEY");
  if (!apiKey) throw new Error("LLM_API_KEY is not set");

  const baseURL = env("LLM_BASE_URL")?.replace(/\/+$/, "");
  const official = !baseURL || baseURL === OFFICIAL_URL[format];
  let model = env("LLM_MODEL");
  let effort = env("LLM_EFFORT");
  if (!model) {
    if (!official) throw new Error("LLM_MODEL is required when LLM_BASE_URL is set");
    model = DEFAULTS[format].model;
    effort ??= DEFAULTS[format].effort;
  }
  const jsonMode = env("LLM_JSON_MODE") === "object" ? "object" : "schema";
  return { format, apiKey, baseURL, model, effort, jsonMode };
}

/* A reply we couldn't use. Routes turn it into their normal 502. */
export class LlmReplyError extends Error {}

interface JsonRequest<T extends z.ZodType> {
  system: string;
  user: string;
  schema: T;
  maxTokens: number;
  /* false for trivial calls where thinking only adds latency. */
  reasoning?: boolean;
}

export async function generateJson<T extends z.ZodType>(
  req: JsonRequest<T>,
): Promise<z.output<T>> {
  const config = llmConfig();
  // Our zod schemas produce plain JSON Schema: objects closed with
  // additionalProperties:false, optional fields left out of `required`.
  const jsonSchema = z.toJSONSchema(req.schema) as Record<string, unknown>;
  delete jsonSchema.$schema;
  const text =
    config.format === "anthropic"
      ? await viaAnthropic(config, req, jsonSchema)
      : await viaOpenAIChat(config, req, jsonSchema);

  let data: unknown;
  try {
    data = JSON.parse(extractJson(text));
  } catch {
    throw new LlmReplyError("the model's reply wasn't valid JSON");
  }
  const parsed = req.schema.safeParse(dropNulls(data));
  if (!parsed.success) {
    console.error("[llm] reply didn't match the schema:", parsed.error.issues);
    throw new LlmReplyError("the model's reply didn't match the expected shape");
  }
  return parsed.data;
}

// ── Anthropic Messages ─────────────────────────────────────────────────────

let anthropic: { key: string; client: Anthropic } | null = null;

async function viaAnthropic(
  config: LlmConfig,
  req: JsonRequest<z.ZodType>,
  schema: Record<string, unknown>,
): Promise<string> {
  const key = `${config.apiKey}|${config.baseURL ?? ""}`;
  // Reuse one client across requests (keeps connection pooling warm). Passing
  // the key and URL explicitly stops the SDK falling back to ANTHROPIC_* vars.
  if (anthropic?.key !== key) {
    anthropic = {
      key,
      client: new Anthropic({
        apiKey: config.apiKey,
        baseURL: config.baseURL ?? OFFICIAL_URL.anthropic,
      }),
    };
  }
  const effort = req.reasoning === false ? undefined : config.effort;
  const res = await anthropic.client.messages.create({
    model: config.model,
    max_tokens: req.maxTokens,
    ...(effort && { thinking: { type: "adaptive" } }),
    system: req.system,
    output_config: {
      format: { type: "json_schema", schema },
      ...(effort && { effort: effort as Anthropic.OutputConfig["effort"] }),
    },
    messages: [{ role: "user", content: req.user }],
  });
  if (res.stop_reason === "refusal") throw new LlmReplyError("the model declined to answer");
  if (res.stop_reason === "max_tokens") throw new LlmReplyError("the model ran out of tokens");
  const block = res.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!block) throw new LlmReplyError("the model returned no text");
  return block.text;
}

// ── OpenAI Chat Completions ────────────────────────────────────────────────

let openai: { key: string; client: OpenAI } | null = null;

async function viaOpenAIChat(
  config: LlmConfig,
  req: JsonRequest<z.ZodType>,
  schema: Record<string, unknown>,
): Promise<string> {
  const key = `${config.apiKey}|${config.baseURL ?? ""}`;
  if (openai?.key !== key) {
    openai = {
      key,
      client: new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL ?? OFFICIAL_URL["openai-chat"],
      }),
    };
  }
  const official = !config.baseURL || config.baseURL === OFFICIAL_URL["openai-chat"];
  const effort = req.reasoning === false ? undefined : config.effort;

  // Vendors without json_schema support get the schema in the prompt instead.
  // json_object mode requires the word "JSON" in the messages; this adds it.
  const system =
    config.jsonMode === "object"
      ? `${req.system}\n\nReply with only a JSON object that matches this JSON Schema:\n${JSON.stringify(schema)}`
      : req.system;

  const res = await openai.client.chat.completions.create({
    model: config.model,
    // OpenAI deprecated max_tokens (its reasoning models reject it); most
    // other vendors still only know max_tokens.
    ...(official ? { max_completion_tokens: req.maxTokens } : { max_tokens: req.maxTokens }),
    ...(effort && { reasoning_effort: effort as OpenAI.ReasoningEffort }),
    response_format:
      config.jsonMode === "object"
        ? { type: "json_object" }
        : {
            type: "json_schema",
            json_schema: { name: "reply", strict: true, schema: toStrict(schema) as Record<string, unknown> },
          },
    messages: [
      { role: "system", content: system },
      { role: "user", content: req.user },
    ],
  });
  const choice = res.choices[0];
  if (choice?.message.refusal) throw new LlmReplyError("the model declined to answer");
  if (choice?.finish_reason === "length") throw new LlmReplyError("the model ran out of tokens");
  const text = choice?.message.content;
  if (!text) throw new LlmReplyError("the model returned no text");
  return text;
}

/* OpenAI's strict mode needs every property listed in `required`, so optional
   fields become required-but-nullable. dropNulls() undoes it on the reply. */
function toStrict(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toStrict);
  if (!schema || typeof schema !== "object") return schema;
  const node = Object.fromEntries(
    Object.entries(schema).map(([k, v]) => [k, toStrict(v)]),
  ) as Record<string, unknown>;
  const props = node.properties as Record<string, unknown> | undefined;
  if (node.type === "object" && props) {
    const required = new Set((node.required as string[] | undefined) ?? []);
    for (const [name, prop] of Object.entries(props)) {
      if (!required.has(name)) props[name] = { anyOf: [prop, { type: "null" }] };
    }
    node.required = Object.keys(props);
  }
  return node;
}

function dropNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropNulls);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => v !== null)
      .map(([k, v]) => [k, dropNulls(v)]),
  );
}

/* Some vendors wrap JSON in a ```json fence or add a sentence around it. */
function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}
