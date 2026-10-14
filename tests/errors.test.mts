/* What each failure says and offers, per place — the design's error system.
   Run: pnpm test */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AiSettings } from "../src/lib/ai";
import {
  aiNames, errorView, headsUpText, headsUpWorthy, needsSettings, swapErrorLine,
} from "../src/app/errors";

const base: AiSettings = {
  provider: "claude", key: "k", model: null, format: "anthropic", baseURL: "",
  effort: null, jsonMode: false, remember: true,
};
const claude = aiNames(base);
const deepseek = aiNames({ ...base, provider: "custom", model: "deepseek-chat", format: "openai-chat", baseURL: "https://api.deepseek.com/v1" });
const opts = { keptText: true, backOnline: false, courses: 3 };

describe("error copy", () => {
  test("names the person's service: label, or a custom service's host", () => {
    assert.equal(claude.name, "Claude");
    assert.equal(deepseek.name, "api.deepseek.com");
    assert.match(errorView("busy", "input", opts, deepseek).body, /^api\.deepseek\.com says it’s getting too many requests/);
  });

  test("recipe generation: 'Back to my list', and the list is safe", () => {
    const v = errorView("service", "gen", opts, claude);
    assert.deepEqual([v.primary.act, v.secondary?.act], ["retry", "backToList"]);
    assert.match(v.body, /Your list is safe\.$/);
  });

  test("timeout while generating offers fewer dishes and a faster model", () => {
    const v = errorView("timeout", "gen", opts, claude);
    assert.deepEqual(v.links.map((l) => [l.act, l.label]), [["fewer", "Try 2 dishes instead"], ["faster", "Pick a faster model"]]);
    assert.deepEqual(errorView("timeout", "gen", { ...opts, courses: 1 }, claude).links.map((l) => l.act), ["faster"]);
    assert.deepEqual(errorView("timeout", "input", opts, claude).links.map((l) => l.act), ["faster"]);
  });

  test("credit: where to top up", () => {
    assert.match(errorView("credit", "input", opts, claude).body, /Top it up at platform\.claude\.com/);
    assert.match(errorView("credit", "input", opts, deepseek).body, /Top it up with your provider/);
  });

  test("settings problems open AI settings; an official service that's down just waits", () => {
    for (const kind of ["refused", "modelNotFound"] as const) {
      assert.equal(errorView(kind, "add", opts, claude).primary.act, "settings", kind);
    }
    assert.equal(errorView("unreachable", "input", opts, deepseek).primary.act, "settings");
    assert.equal(errorView("unreachable", "input", opts, claude).primary.act, "resend");
    assert.equal(needsSettings("unreachable", claude), false);
    assert.equal(needsSettings("unreachable", deepseek), true);
  });

  test("offline before listening vs after sending", () => {
    const pre = errorView("offline", "input", { ...opts, keptText: false }, claude);
    assert.deepEqual([pre.primary.act, pre.secondary], ["record", null]);
    const sent = errorView("offline", "input", opts, claude);
    assert.deepEqual([sent.primary.act, sent.secondary?.act], ["resend", "edit"]);
    assert.equal(errorView("offline", "input", { ...opts, backOnline: true }, claude).title, "You’re back online");
  });

  test("preferences: pick from the list instead of typing", () => {
    assert.equal(errorView("permission", "diet", opts, claude).primary.act, "pick");
    assert.equal(errorView("noisy", "servings", opts, claude).secondary?.act, "pick");
    assert.equal(errorView("noisy", "input", opts, claude).secondary?.act, "type");
  });

  test("a failed swap's line, and the Settings heads-up", () => {
    assert.equal(swapErrorLine("busy", claude), "Couldn’t swap — your AI’s swamped. Give it a minute.");
    assert.equal(swapErrorLine("modelNotFound", deepseek), "Couldn’t swap — “deepseek-chat” isn’t available anymore.");
    assert.equal(headsUpWorthy("credit", claude), true);
    assert.equal(headsUpWorthy("busy", claude), false);
    assert.equal(headsUpWorthy("unreachable", claude), false);
    assert.equal(headsUpText("unreachable", deepseek), "Couldn’t reach api.deepseek.com. Check the address under AI service.");
  });
});
