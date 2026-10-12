/* LLM layer tests: the real route handlers against a fake server, in both API
   formats, with the user's AI settings sent in each request ("bring your own
   key"). Checks the exact requests we send, the key check before saving, the
   private-address guard, and that failures come back with the right kind — no
   API key or credits needed. Run: pnpm test */
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { startFakeLlm } from "./fake-llm.mjs";
import type { AiSettings } from "../src/lib/ai";
import * as check from "../src/app/api/ai/check/route";
import * as ingredients from "../src/app/api/ingredients/route";
import * as preference from "../src/app/api/preference/route";
import * as recipes from "../src/app/api/recipes/route";
import { llmConfig } from "../src/lib/server/llm";
import { isPrivateIp } from "../src/lib/server/netguard";

type Fake = Awaited<ReturnType<typeof startFakeLlm>>;
let fake: Fake;

const OFFICIAL = ["https://api.anthropic.com", "https://api.openai.com"];
const realFetch = globalThis.fetch;

const claude = (over: Partial<AiSettings> = {}): AiSettings => ({
  provider: "claude", key: "sk-ant-test", model: null, format: "anthropic",
  baseURL: "", effort: null, jsonMode: false, remember: true, ...over,
});
const openai = (over: Partial<AiSettings> = {}): AiSettings =>
  claude({ provider: "openai", key: "sk-proj-test", format: "openai-chat", ...over });
const custom = (over: Partial<AiSettings> = {}): AiSettings =>
  claude({ provider: "custom", key: "vendor-key", model: "vendor-model", format: "openai-chat", baseURL: `${fake.url}/v1`, ...over });

async function post(route: { POST: (r: Request) => Promise<Response> }, body: unknown) {
  const res = await route.POST(
    new Request("http://test", { method: "POST", body: JSON.stringify(body) }),
  );
  return { status: res.status, json: await res.json() };
}
const lastRequest = () => fake.state.requests.at(-1)!;

const ING_REPLY = {
  ingredients: [
    { name: "Cabbage", hasAmount: true, amount: 0.5, unit: "pcs", freshness: "going bad" },
    { name: "Eggs", hasAmount: false, amount: 0, unit: "pcs", freshness: "not sure" },
  ],
};
const DISH = {
  name: "Cabbage Egg Stir-fry", short: "Stir-fry", blurb: "Quick.",
  rescue: ["Cabbage"], uses: ["Cabbage", "Eggs"],
  steps: [
    { text: "Shred the cabbage.", needsImage: true, cap: "reference · shredding", imagePrompt: "a knife shredding cabbage" },
    { text: "Fry.", needsImage: false },
  ],
};
const RECIPE_BODY = {
  ingredients: [
    { id: "a", name: "Cabbage", amount: 0.5, unit: "pcs", saidUnit: "pcs", tag: "going bad" },
    { id: "b", name: "Eggs", amount: null, unit: "pcs", saidUnit: "pcs", tag: null },
  ],
  prefs: { servings: 2, courses: 1, diet: "No restrictions", allergy: "None" },
  units: "metric",
};

before(async () => {
  fake = await startFakeLlm();
  // Send the official endpoints to the fake server too, so the default
  // Claude/OpenAI settings are tested exactly as they'd be sent.
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    let url = String(input instanceof Request ? input.url : input);
    for (const o of OFFICIAL) if (url.startsWith(o)) url = fake.url + url.slice(o.length);
    return realFetch(url, init);
  }) as typeof fetch;
  // The routes log failures on purpose; keep test output readable.
  console.error = () => {};
  console.warn = () => {};
});
after(() => {
  globalThis.fetch = realFetch;
  fake.close();
});
beforeEach(() => {
  fake.state.mode = "ok";
  fake.state.requests.length = 0;
  // The fake server is on 127.0.0.1; the guard tests turn this off again.
  process.env.ALLOW_PRIVATE_LLM_URLS = "1";
  delete process.env.MOCK_AI;
});

describe("official Claude (defaults)", () => {
  test("ingredients: request shape and mapped reply", async () => {
    fake.state.reply = ING_REPLY;
    const { status, json } = await post(ingredients, { transcript: "half a cabbage going bad and eggs", ai: claude() });
    assert.equal(status, 200);
    assert.deepEqual(
      json.ingredients.map((i: { name: string; amount: number | null; tag: string | null }) => [i.name, i.amount, i.tag]),
      [["Cabbage", 0.5, "going bad"], ["Eggs", null, null]],
    );
    const req = lastRequest();
    assert.equal(req.path, "/v1/messages");
    assert.equal(req.headers["x-api-key"], "sk-ant-test");
    assert.equal(req.body.model, "claude-sonnet-5-5", "no model saved = Scrappy's default");
    assert.equal(req.body.max_tokens, 2000);
    assert.equal(req.body.thinking, undefined);
    assert.equal(req.body.output_config.effort, undefined);
    assert.deepEqual(req.body.output_config.format.schema, {
      type: "object",
      properties: {
        ingredients: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              hasAmount: { type: "boolean" },
              amount: { type: "number" },
              unit: { type: "string" },
              freshness: { type: "string", enum: ["going bad", "use soon", "fresh", "not sure"] },
            },
            required: ["name", "hasAmount", "amount", "unit", "freshness"],
            additionalProperties: false,
          },
        },
      },
      required: ["ingredients"],
      additionalProperties: false,
    });
  });

  test("a model the user picked is sent as-is", async () => {
    fake.state.reply = ING_REPLY;
    await post(ingredients, { transcript: "eggs", ai: claude({ model: "claude-opus-5-5" }) });
    assert.equal(lastRequest().body.model, "claude-opus-5-5");
  });
});

describe("official OpenAI (defaults)", () => {
  test("default model comes with low reasoning; OpenAI's token field", async () => {
    fake.state.reply = { dishes: [DISH] };
    const { status } = await post(recipes, { ...RECIPE_BODY, ai: openai() });
    assert.equal(status, 200);
    const req = lastRequest();
    assert.equal(req.path, "/v1/chat/completions");
    assert.equal(req.headers.authorization, "Bearer sk-proj-test");
    assert.equal(req.body.model, "gpt-6-luna");
    assert.equal(req.body.reasoning_effort, "low");
    assert.equal(req.body.max_completion_tokens, 8000);
    assert.equal(req.body.max_tokens, undefined);
  });

  test("a model the user picked gets no reasoning setting", async () => {
    fake.state.reply = { value: "4" };
    await post(preference, { key: "servings", transcript: "four", ai: openai({ model: "gpt-6-sol" }) });
    assert.equal(lastRequest().body.model, "gpt-6-sol");
    assert.equal(lastRequest().body.reasoning_effort, undefined);
  });
});

describe("vendors without strict-schema output", () => {
  type Sent = { body: { response_format?: { type: string }; output_config?: { format?: unknown } } };
  const formats = (from: number): string[] =>
    (fake.state.requests.slice(from) as Sent[]).map(
      (r) => r.body.response_format?.type ?? (r.body.output_config?.format ? "json_schema" : "prompt"),
    );

  for (const mode of ["schema400", "schema422", "schemaIgnored"]) {
    test(`${mode}: one retry with the schema in the prompt, then it works`, async () => {
      fake.state.mode = mode;
      fake.state.reply = ING_REPLY;
      const from = fake.state.requests.length;
      const { status, json } = await post(ingredients, { transcript: "cabbage", ai: custom() });
      assert.equal(status, 200);
      assert.equal(json.ingredients.length, 2);
      assert.deepEqual(formats(from), ["json_schema", "json_object"]);
      assert.match(lastRequest().body.messages[0].content, /JSON Schema/);
    });
  }

  test("Claude-style vendor: retried without output_config.format, effort kept", async () => {
    fake.state.mode = "schema400";
    fake.state.reply = ING_REPLY;
    const from = fake.state.requests.length;
    const ai = custom({ format: "anthropic", baseURL: fake.url, effort: "low" });
    const { status } = await post(ingredients, { transcript: "cabbage", ai });
    assert.equal(status, 200);
    assert.deepEqual(formats(from), ["json_schema", "prompt"]);
    assert.deepEqual(lastRequest().body.output_config, { effort: "low" });
    assert.match(lastRequest().body.system, /JSON Schema/);
  });

  test("object mode chosen in settings: no second request", async () => {
    fake.state.mode = "badjson";
    const from = fake.state.requests.length;
    const { status } = await post(ingredients, { transcript: "cabbage", ai: custom({ jsonMode: true }) });
    assert.equal(status, 502);
    assert.equal(fake.state.requests.length - from, 1);
  });

  test("no object-mode retry for a key, credit or model problem", async () => {
    // (A 429 is still retried once by the SDK itself, in the same mode.)
    for (const mode of ["401", "429", "400credit", "404"]) {
      fake.state.mode = mode;
      const from = fake.state.requests.length;
      await post(ingredients, { transcript: "cabbage", ai: custom() });
      assert.ok(formats(from).every((f) => f === "json_schema"), mode);
    }
  });

  test("a 200 with no answer in it: a clean error, not a crash", async () => {
    fake.state.mode = "noanswer";
    const errors: string[] = [];
    const realError = console.error;
    console.error = (...a: unknown[]) => void errors.push(a.join(" "));
    try {
      const { status, json } = await post(ingredients, { transcript: "cabbage", ai: custom() });
      assert.equal(status, 502);
      assert.equal(json.kind, "service");
      assert.equal(json.error, "the AI service sent a reply with no answer in it");
      assert.doesNotMatch(JSON.stringify(json), /DEGRADED/, "the vendor's words stay out of the reply");
      assert.match(errors.join("\n"), /vendor said: Function is DEGRADED/, "…and go to the log");
    } finally {
      console.error = realError;
    }
  });
});

describe("custom service", () => {
  test("OpenAI-style vendor: max_tokens, strict schema, nulls dropped", async () => {
    fake.state.reply = { dishes: [{ ...DISH, steps: [{ text: "Fry.", needsImage: false, cap: null, imagePrompt: null }] }] };
    const { status, json } = await post(recipes, { ...RECIPE_BODY, ai: custom() });
    assert.equal(status, 200);
    assert.deepEqual(json.dishes[0].steps[0], { text: "Fry.", img: false });
    const req = lastRequest();
    assert.equal(req.headers.authorization, "Bearer vendor-key");
    assert.equal(req.body.model, "vendor-model");
    assert.equal(req.body.max_tokens, 8000, "other vendors get max_tokens");
    assert.equal(req.body.max_completion_tokens, undefined);
    assert.equal(req.body.reasoning_effort, undefined);
    const format = req.body.response_format;
    assert.equal(format.json_schema.strict, true);
    const step = format.json_schema.schema.properties.dishes.items.properties.steps.items;
    assert.deepEqual(step.required, ["text", "needsImage", "cap", "imagePrompt"]);
    assert.deepEqual(step.properties.cap, { anyOf: [{ type: "string" }, { type: "null" }] });
  });

  test("plain JSON mode + effort; fenced JSON still parses", async () => {
    fake.state.mode = "fenced";
    fake.state.reply = ING_REPLY;
    const { status, json } = await post(ingredients, { transcript: "cabbage", ai: custom({ jsonMode: true, effort: "high" }) });
    assert.equal(status, 200);
    assert.equal(json.ingredients.length, 2);
    const req = lastRequest();
    assert.deepEqual(req.body.response_format, { type: "json_object" });
    assert.match(req.body.messages[0].content, /JSON Schema/);
    assert.equal(req.body.reasoning_effort, "high");
  });

  test("Claude-style with effort: adaptive thinking; preference skips it", async () => {
    const ai = custom({ format: "anthropic", baseURL: fake.url, effort: "low" });
    fake.state.reply = ING_REPLY;
    await post(ingredients, { transcript: "cabbage", ai });
    assert.deepEqual(lastRequest().body.thinking, { type: "adaptive" });
    assert.equal(lastRequest().body.output_config.effort, "low");
    fake.state.reply = { value: "4" };
    const { json } = await post(preference, { key: "servings", transcript: "four of us", ai });
    assert.equal(json.value, 4);
    assert.equal(lastRequest().body.thinking, undefined);
  });

  test("a server that needs no key", async () => {
    fake.state.reply = ING_REPLY;
    const { status } = await post(ingredients, { transcript: "eggs", ai: custom({ key: "" }) });
    assert.equal(status, 200);
  });
});

describe("settings validation", () => {
  test("clear errors for missing or incomplete settings", () => {
    assert.throws(() => llmConfig(undefined), /isn't set up/);
    assert.throws(() => llmConfig(claude({ key: " " })), /no API key/);
    assert.throws(() => llmConfig(custom({ baseURL: "not a url" })), /no valid address/);
    assert.throws(() => llmConfig(custom({ model: null })), /no model/);
  });

  test("no settings → a 502 the app treats as a generic failure", async () => {
    const { status, json } = await post(ingredients, { transcript: "x" });
    assert.equal(status, 502);
    assert.equal(json.kind, "service");
  });
});

describe("failures come back with the right kind", () => {
  const cases: [string, string][] = [
    ["401", "refused"],
    ["402", "credit"],
    ["429", "credit"],
    ["400credit", "credit"],
    ["400", "service"],
    ["404", "service"],
    ["badjson", "service"],
    ["wrongshape", "service"],
    ["truncated", "service"],
    ["refusal", "service"],
    ["redirect", "service"],
  ];
  for (const [provider, make] of [["claude", claude], ["custom", custom]] as const) {
    for (const [mode, kind] of cases) {
      test(`${provider}: ${mode} → ${kind}`, async () => {
        fake.state.mode = mode;
        fake.state.reply = ING_REPLY;
        const { status, json } = await post(ingredients, { transcript: "x", ai: make() });
        assert.equal(status, 502);
        assert.equal(json.kind, kind);
        assert.doesNotMatch(json.error, /sk-ant-test|vendor-key/, "never echoes the key");
      });
    }
  }
});

describe("check before saving (free: model list only)", () => {
  test("official key: ok, with chat models only", async () => {
    const { json } = await post(check, { ai: claude() });
    assert.deepEqual(json, { ok: true, models: ["claude-sonnet-5-5", "gpt-6-luna", "vendor-model"] });
    const req = lastRequest();
    assert.equal(req.method, "GET");
    assert.match(req.path, /^\/v1\/models/);
    assert.equal(fake.state.requests.length, 1, "no paid call");
  });

  test("default model missing from the key's list → modelNotFound", async () => {
    fake.state.models = ["claude-haiku-4-5"];
    try {
      const { json } = await post(check, { ai: claude() });
      assert.deepEqual(json, { ok: false, reason: "modelNotFound" });
      const listed = await post(check, { ai: claude(), listOnly: true });
      assert.deepEqual(listed.json, { ok: true, models: ["claude-haiku-4-5"] }, "the picker still gets the list");
    } finally {
      fake.state.models = ["claude-sonnet-5-5", "gpt-6-luna", "vendor-model", "text-embedding-3-small"];
    }
  });

  test("wrong key → wrongKey", async () => {
    fake.state.mode = "401";
    const { json } = await post(check, { ai: openai() });
    assert.deepEqual(json, { ok: false, reason: "wrongKey" });
  });

  test("nothing listening → unreachable", async () => {
    const { json } = await post(check, { ai: custom({ baseURL: "http://127.0.0.1:9/v1" }) });
    assert.deepEqual(json, { ok: false, reason: "unreachable" });
  });

  test("a service without a model list → ok, unchecked", async () => {
    fake.state.mode = "models404";
    const { json } = await post(check, { ai: custom() });
    assert.deepEqual(json, { ok: true, models: null });
  });

  test("custom picker lists models before one is chosen", async () => {
    const { json } = await post(check, { ai: custom({ model: null }), listOnly: true });
    assert.equal(json.ok, true);
  });
});

describe("private addresses", () => {
  test("blocked by default, for checks and requests", async () => {
    delete process.env.ALLOW_PRIVATE_LLM_URLS;
    const checked = await post(check, { ai: custom() });
    assert.deepEqual(checked.json, { ok: false, reason: "privateAddress" });
    const { status } = await post(ingredients, { transcript: "x", ai: custom() });
    assert.equal(status, 502);
    assert.equal(fake.state.requests.length, 0, "the private server was never contacted");
    for (const url of ["http://localhost:11434/v1", "http://192.168.1.20:11434/v1", "http://[::1]:8080", "http://169.254.169.254/"]) {
      const r = await post(check, { ai: custom({ baseURL: url }) });
      assert.equal(r.json.reason, "privateAddress", url);
    }
  });

  test("which addresses count as private", () => {
    for (const ip of ["10.0.0.1", "127.0.0.1", "172.16.5.4", "192.168.0.10", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
      assert.equal(isPrivateIp(ip), true, ip);
    }
    for (const ip of ["8.8.8.8", "172.32.0.1", "104.18.0.1", "2606:4700::1111"]) {
      assert.equal(isPrivateIp(ip), false, ip);
    }
  });
});

describe("mock mode", () => {
  test("answers without settings or any call, and can show each failure", async () => {
    process.env.MOCK_AI = "1";
    assert.equal((await post(ingredients, { transcript: "two eggs" })).status, 200);
    const credit = await post(ingredients, { transcript: "out of credit" });
    assert.deepEqual([credit.status, credit.json.kind], [502, "credit"]);
    const refused = await post(preference, { key: "servings", transcript: "key refused" });
    assert.deepEqual([refused.status, refused.json.kind], [502, "refused"]);
    assert.equal((await post(check, { ai: claude({ key: "sk-ant-wrong" }) })).json.reason, "wrongKey");
    assert.equal(fake.state.requests.length, 0);
  });
});
