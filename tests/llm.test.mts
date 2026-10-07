/* LLM layer tests: the real route handlers against a fake server, in both API
   formats. Checks the exact requests we send and that bad replies become the
   routes' normal 502 — no API key or credits needed. Run: pnpm test */
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { startFakeLlm } from "./fake-llm.mjs";
import * as ingredients from "../src/app/api/ingredients/route";
import * as preference from "../src/app/api/preference/route";
import * as recipes from "../src/app/api/recipes/route";
import { llmConfig } from "../src/lib/server/llm";

type Fake = Awaited<ReturnType<typeof startFakeLlm>>;
let fake: Fake;

const VARS = ["LLM_API_FORMAT", "LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL", "LLM_EFFORT", "LLM_JSON_MODE", "MOCK_AI", "ANTHROPIC_API_KEY"];
function setEnv(vars: Record<string, string>) {
  for (const k of VARS) delete process.env[k];
  Object.assign(process.env, vars);
}

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
  // The routes log failures on purpose; keep test output readable.
  console.error = () => {};
  console.warn = () => {};
});
after(() => fake.close());
beforeEach(() => {
  fake.state.mode = "ok";
  fake.state.requests.length = 0;
});

describe("anthropic format", () => {
  beforeEach(() =>
    setEnv({ LLM_API_FORMAT: "anthropic", LLM_API_KEY: "test-key", LLM_BASE_URL: fake.url, LLM_MODEL: "claude-sonnet-5" }),
  );

  test("ingredients: request shape and mapped reply", async () => {
    fake.state.reply = ING_REPLY;
    const { status, json } = await post(ingredients, { transcript: "half a cabbage going bad and eggs" });
    assert.equal(status, 200);
    assert.deepEqual(
      json.ingredients.map((i: { name: string; amount: number | null; tag: string | null }) => [i.name, i.amount, i.tag]),
      [["Cabbage", 0.5, "going bad"], ["Eggs", null, null]],
    );
    const req = lastRequest();
    assert.equal(req.path, "/v1/messages");
    assert.equal(req.headers["x-api-key"], "test-key");
    assert.equal(req.body.model, "claude-sonnet-5");
    assert.equal(req.body.max_tokens, 2000);
    assert.equal(req.body.thinking, undefined, "no thinking when LLM_EFFORT is unset");
    assert.equal(req.body.output_config.effort, undefined);
    assert.equal(req.body.output_config.format.type, "json_schema");
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

  test("LLM_EFFORT turns on adaptive thinking + effort", async () => {
    process.env.LLM_EFFORT = "low";
    fake.state.reply = { dishes: [DISH] };
    const { status, json } = await post(recipes, RECIPE_BODY);
    assert.equal(status, 200);
    assert.equal(json.dishes[0].steps[0].imagePrompt, "a knife shredding cabbage");
    assert.equal(json.dishes[0].steps[1].cap, undefined);
    assert.deepEqual(lastRequest().body.thinking, { type: "adaptive" });
    assert.equal(lastRequest().body.output_config.effort, "low");
  });

  test("preference never sends reasoning params", async () => {
    process.env.LLM_EFFORT = "low";
    fake.state.reply = { value: "4" };
    const { json } = await post(preference, { key: "servings", transcript: "four of us" });
    assert.equal(json.value, 4);
    assert.equal(lastRequest().body.thinking, undefined);
    assert.equal(lastRequest().body.output_config.effort, undefined);
  });
});

describe("openai-chat format", () => {
  beforeEach(() =>
    setEnv({ LLM_API_FORMAT: "openai-chat", LLM_API_KEY: "test-key", LLM_BASE_URL: `${fake.url}/v1`, LLM_MODEL: "vendor-model" }),
  );

  test("recipes: request shape for a non-OpenAI vendor", async () => {
    fake.state.reply = { dishes: [DISH] };
    const { status, json } = await post(recipes, RECIPE_BODY);
    assert.equal(status, 200);
    assert.equal(json.dishes[0].name, DISH.name);
    const req = lastRequest();
    assert.equal(req.path, "/v1/chat/completions");
    assert.equal(req.headers.authorization, "Bearer test-key");
    assert.equal(req.body.max_tokens, 8000, "other vendors get max_tokens");
    assert.equal(req.body.max_completion_tokens, undefined);
    assert.equal(req.body.reasoning_effort, undefined);
    assert.deepEqual(req.body.messages.map((m: { role: string }) => m.role), ["system", "user"]);
  });

  test("strict json_schema: every property required, optional ones nullable", async () => {
    fake.state.reply = { dishes: [DISH] };
    await post(recipes, RECIPE_BODY);
    const format = lastRequest().body.response_format;
    assert.equal(format.type, "json_schema");
    assert.equal(format.json_schema.strict, true);
    const step = format.json_schema.schema.properties.dishes.items.properties.steps.items;
    assert.deepEqual(step.required, ["text", "needsImage", "cap", "imagePrompt"]);
    assert.deepEqual(step.properties.cap, { anyOf: [{ type: "string" }, { type: "null" }] });
  });

  test("nulls for optional fields are dropped", async () => {
    fake.state.reply = { dishes: [{ ...DISH, steps: [{ text: "Fry.", needsImage: false, cap: null, imagePrompt: null }] }] };
    const { status, json } = await post(recipes, RECIPE_BODY);
    assert.equal(status, 200);
    assert.deepEqual(json.dishes[0].steps[0], { text: "Fry.", img: false });
  });

  test("LLM_JSON_MODE=object puts the schema in the prompt; fenced JSON still parses", async () => {
    process.env.LLM_JSON_MODE = "object";
    process.env.LLM_EFFORT = "high";
    fake.state.mode = "fenced";
    fake.state.reply = ING_REPLY;
    const { status, json } = await post(ingredients, { transcript: "cabbage" });
    assert.equal(status, 200);
    assert.equal(json.ingredients.length, 2);
    const req = lastRequest();
    assert.deepEqual(req.body.response_format, { type: "json_object" });
    assert.match(req.body.messages[0].content, /JSON Schema/);
    assert.match(req.body.messages[0].content, /"freshness"/);
    assert.equal(req.body.reasoning_effort, "high");
  });
});

describe("config", () => {
  test("defaults on the official URLs", () => {
    setEnv({ LLM_API_KEY: "k" });
    const c = llmConfig();
    assert.deepEqual([c.format, c.model, c.effort, c.baseURL], ["anthropic", "claude-sonnet-5", undefined, undefined]);
    setEnv({ LLM_API_KEY: "k", LLM_API_FORMAT: "openai-chat" });
    assert.deepEqual([llmConfig().model, llmConfig().effort], ["gpt-6-luna", "low"]);
    setEnv({ LLM_API_KEY: "k", LLM_API_FORMAT: "openai-chat", LLM_BASE_URL: "https://api.openai.com/v1/" });
    assert.equal(llmConfig().model, "gpt-6-luna", "official URL written out still counts");
  });

  test("your own model gets only the effort you set", () => {
    setEnv({ LLM_API_KEY: "k", LLM_API_FORMAT: "openai-chat", LLM_MODEL: "gpt-4.1" });
    assert.equal(llmConfig().effort, undefined);
    setEnv({ LLM_API_KEY: "k", LLM_API_FORMAT: "openai-chat", LLM_EFFORT: "none" });
    assert.equal(llmConfig().effort, "none");
  });

  test("clear errors for missing or wrong settings", () => {
    setEnv({});
    assert.throws(llmConfig, /LLM_API_KEY is not set/);
    setEnv({ ANTHROPIC_API_KEY: "old" });
    assert.throws(llmConfig, /LLM_API_KEY is not set/, "the old name is not a fallback");
    setEnv({ LLM_API_KEY: "k", LLM_BASE_URL: "http://x" });
    assert.throws(llmConfig, /LLM_MODEL is required/);
    setEnv({ LLM_API_KEY: "k", LLM_API_FORMAT: "openai" });
    assert.throws(llmConfig, /LLM_API_FORMAT must be/);
  });
});

describe("failures become a 502, never a crash", () => {
  for (const format of ["anthropic", "openai-chat"]) {
    for (const mode of ["badjson", "wrongshape", "truncated", "refusal", "400", "401"]) {
      test(`${format}: ${mode}`, async () => {
        setEnv({
          LLM_API_FORMAT: format, LLM_API_KEY: "k", LLM_MODEL: "m",
          LLM_BASE_URL: format === "anthropic" ? fake.url : `${fake.url}/v1`,
        });
        fake.state.mode = mode;
        fake.state.reply = ING_REPLY;
        const { status, json } = await post(ingredients, { transcript: "x" });
        assert.equal(status, 502);
        assert.equal(typeof json.error, "string");
      });
    }
  }

  test("missing key names the variable", async () => {
    setEnv({});
    const { status, json } = await post(ingredients, { transcript: "x" });
    assert.equal(status, 502);
    assert.equal(json.error, "LLM_API_KEY is not set");
  });

  test("mock mode answers without a key or any call", async () => {
    setEnv({ MOCK_AI: "1" });
    const { status } = await post(ingredients, { transcript: "two eggs" });
    assert.equal(status, 200);
    assert.equal(fake.state.requests.length, 0);
  });
});
