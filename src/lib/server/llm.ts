/* Server-only LLM client. The user's AI settings (their own key — "bring your
   own key") arrive with each request; nothing is stored or logged here.

   Every call Scrappy makes has the same shape — a system prompt, one user
   message, and a JSON reply matching a schema — so one function covers both
   API formats: Anthropic's Messages API, and OpenAI's Chat Completions, which
   most other vendors (and local servers) also speak. */

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { z } from "zod";
import { DEFAULT_MODEL, type ApiFormat } from "@/lib/ai";
import { assertPublicUrl, PrivateAddressError } from "./netguard";

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

const OFFICIAL_URL: Record<ApiFormat, string> = {
  anthropic: "https://api.anthropic.com",
  "openai-chat": "https://api.openai.com/v1",
};

/* What went wrong, in the terms the app shows people. */
export type LlmFailureKind =
  | "refused" // key rejected
  | "credit" // out of credit, or rate-limited
  | "modelNotFound"
  | "unreachable"
  | "privateAddress"
  | "service"; // anything else, incl. a reply we couldn't use

export class LlmError extends Error {
  constructor(
    readonly kind: LlmFailureKind,
    message: string,
  ) {
    super(message);
  }
}

const SETTINGS = z.object({
  provider: z.enum(["claude", "openai", "custom"]),
  key: z.string().max(1000),
  model: z.string().max(200).nullable(),
  format: z.enum(["anthropic", "openai-chat"]),
  baseURL: z.string().max(1000),
  effort: z.enum(["low", "medium", "high"]).nullable(),
  jsonMode: z.boolean(),
});

/* Turns the settings sent from the device into a request config. */
export function llmConfig(input: unknown): LlmConfig {
  const parsed = SETTINGS.safeParse(input);
  if (!parsed.success) throw new LlmError("service", "the AI service isn't set up");
  const s = parsed.data;
  const key = s.key.trim();
  const model = s.model?.trim() || null;

  if (s.provider !== "custom") {
    if (!key) throw new LlmError("refused", "no API key");
    const format = s.provider === "claude" ? "anthropic" : "openai-chat";
    return {
      format,
      apiKey: key,
      baseURL: undefined,
      model: model ?? DEFAULT_MODEL[s.provider],
      // OpenAI's default model reasons at medium unless told otherwise, so it
      // comes with low; a model someone picked gets no reasoning setting.
      effort: s.provider === "openai" && !model ? "low" : undefined,
      jsonMode: "schema",
    };
  }

  const baseURL = s.baseURL.trim().replace(/\/+$/, "");
  if (!/^https?:\/\/\S+$/i.test(baseURL)) throw new LlmError("unreachable", "no valid address");
  if (!model) throw new LlmError("modelNotFound", "no model chosen");
  return {
    format: s.format,
    apiKey: key,
    baseURL,
    model,
    effort: s.effort ?? undefined,
    jsonMode: s.jsonMode ? "object" : "schema",
  };
}

// Never follow redirects: a public address could otherwise bounce the
// request to a private one after the address check.
const noRedirectFetch: typeof fetch = (url, init) => fetch(url, { ...init, redirect: "error" });

async function clientFor(config: LlmConfig, timeout: number) {
  if (config.baseURL) await assertPublicUrl(config.baseURL);
  const common = {
    // Some local servers need no key; the SDKs still want a string.
    apiKey: config.apiKey || "none",
    baseURL: config.baseURL ?? OFFICIAL_URL[config.format],
    fetch: noRedirectFetch,
    timeout,
    maxRetries: 1,
  };
  return config.format === "anthropic"
    ? ({ format: "anthropic", client: new Anthropic(common) } as const)
    : ({ format: "openai-chat", client: new OpenAI(common) } as const);
}

/* Maps SDK and network errors to what the app shows. Messages never include
   the key: the SDKs don't echo it, and we don't add it. */
export function classify(err: unknown): LlmError {
  if (err instanceof LlmError) return err;
  if (err instanceof PrivateAddressError) return new LlmError("privateAddress", "private address");
  if (err instanceof Anthropic.APIConnectionError || err instanceof OpenAI.APIConnectionError) {
    return new LlmError("unreachable", "couldn't reach the AI service");
  }
  if (err instanceof Anthropic.APIError || err instanceof OpenAI.APIError) {
    const { status, message } = err;
    if (status === 401 || status === 403) return new LlmError("refused", "the AI key was refused");
    // OpenAI: 429 insufficient_quota (no credit) or a rate limit.
    // Anthropic: 400 "credit balance is too low", or 429 rate limit.
    if (status === 402 || status === 429 || (status === 400 && /credit|billing|quota/i.test(message))) {
      return new LlmError("credit", "the AI account is out of credit or busy");
    }
    if (status === 404) return new LlmError("modelNotFound", "the AI service doesn't offer that model");
    return new LlmError("service", `the AI service returned ${status ?? "an error"}`);
  }
  return new LlmError("service", err instanceof Error ? err.message : "the AI request failed");
}

// ── Generating JSON ────────────────────────────────────────────────────────

interface JsonRequest<T extends z.ZodType> {
  system: string;
  user: string;
  schema: T;
  maxTokens: number;
  /* false for trivial calls where thinking only adds latency. */
  reasoning?: boolean;
}

export async function generateJson<T extends z.ZodType>(
  config: LlmConfig,
  req: JsonRequest<T>,
): Promise<z.output<T>> {
  // Our zod schemas produce plain JSON Schema: objects closed with
  // additionalProperties:false, optional fields left out of `required`.
  const jsonSchema = z.toJSONSchema(req.schema) as Record<string, unknown>;
  delete jsonSchema.$schema;

  let text: string;
  try {
    const api = await clientFor(config, 120_000);
    text =
      api.format === "anthropic"
        ? await viaAnthropic(api.client, config, req, jsonSchema)
        : await viaOpenAIChat(api.client, config, req, jsonSchema);
  } catch (err) {
    throw classify(err);
  }

  let data: unknown;
  try {
    data = JSON.parse(extractJson(text));
  } catch {
    throw new LlmError("service", "the model's reply wasn't valid JSON");
  }
  const parsed = req.schema.safeParse(dropNulls(data));
  if (!parsed.success) {
    console.error("[llm] reply didn't match the schema:", parsed.error.issues);
    throw new LlmError("service", "the model's reply didn't match the expected shape");
  }
  return parsed.data;
}

async function viaAnthropic(
  client: Anthropic,
  config: LlmConfig,
  req: JsonRequest<z.ZodType>,
  schema: Record<string, unknown>,
): Promise<string> {
  const effort = req.reasoning === false ? undefined : config.effort;
  const res = await client.messages.create({
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
  if (res.stop_reason === "refusal") throw new LlmError("service", "the model declined to answer");
  if (res.stop_reason === "max_tokens") throw new LlmError("service", "the model ran out of tokens");
  const block = res.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!block) throw new LlmError("service", "the model returned no text");
  return block.text;
}

async function viaOpenAIChat(
  client: OpenAI,
  config: LlmConfig,
  req: JsonRequest<z.ZodType>,
  schema: Record<string, unknown>,
): Promise<string> {
  const official = !config.baseURL;
  const effort = req.reasoning === false ? undefined : config.effort;

  // Vendors without json_schema support get the schema in the prompt instead.
  // json_object mode requires the word "JSON" in the messages; this adds it.
  const system =
    config.jsonMode === "object"
      ? `${req.system}\n\nReply with only a JSON object that matches this JSON Schema:\n${JSON.stringify(schema)}`
      : req.system;

  const res = await client.chat.completions.create({
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
            json_schema: {
              name: "reply",
              strict: true,
              schema: toStrict(schema) as Record<string, unknown>,
            },
          },
    messages: [
      { role: "system", content: system },
      { role: "user", content: req.user },
    ],
  });
  const choice = res.choices[0];
  if (choice?.message.refusal) throw new LlmError("service", "the model declined to answer");
  if (choice?.finish_reason === "length") throw new LlmError("service", "the model ran out of tokens");
  const text = choice?.message.content;
  if (!text) throw new LlmError("service", "the model returned no text");
  return text;
}

// ── Listing models (free; used to check a key before saving) ───────────────

/* The models this key can use. null = the service has no model list, so it
   can't be checked; the key will be tried on first use instead. */
export async function listModels(config: LlmConfig): Promise<string[] | null> {
  try {
    const api = await clientFor(config, 15_000);
    const ids =
      api.format === "anthropic"
        ? (await api.client.models.list({ limit: 1000 })).data.map((m) => m.id)
        : (await api.client.models.list()).data.map((m) => m.id);
    return ids;
  } catch (err) {
    if ((err instanceof Anthropic.APIError || err instanceof OpenAI.APIError) && err.status === 404) {
      return null;
    }
    throw classify(err);
  }
}

// Model lists also hold speech, image and embedding models; none can write
// recipes, so they're left out of the picker.
const NOT_CHAT = /embed|whisper|tts|dall-e|image|audio|realtime|moderation|transcribe|search|davinci|babbage|sora|computer-use|rerank/i;
export const chatModels = (ids: string[]) => ids.filter((id) => !NOT_CHAT.test(id)).sort();

// ── Helpers ────────────────────────────────────────────────────────────────

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
