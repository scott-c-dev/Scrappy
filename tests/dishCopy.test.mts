/* The dishes-screen copy rules: chip order, footer, top claim, loading, swap
   and finish lines all come from the same ingredient list. Run: pnpm test */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Dish, FreshnessTag, Ingredient } from "../src/lib/types";
import {
  countLabel, finishLine, footerLine, itemsOf, loadingLine, nameList, pantryLine, swapLine, topClaim,
} from "../src/app/components/dishCopy";

const ing = (id: string, name: string, tag: FreshnessTag): Ingredient => ({ id, name, amount: null, unit: "pcs", tag });
const dish = (name: string, uses: string[]): Dish => ({ id: name, name, short: name, blurb: "", uses, pantry: [], steps: [] });

// Said in this order: eggs (not sure), cabbage (going bad), rice (use soon), tofu (going bad), tomato (fresh).
const ALL = [
  ing("e", "Eggs", null), ing("c", "Cabbage", "going bad"), ing("r", "Leftover rice", "use soon"),
  ing("t", "Tofu", "going bad"), ing("m", "Tomatoes", "fresh"),
];
const UNTAGGED = ALL.map((i) => ({ ...i, tag: null }));

describe("chip order", () => {
  test("going bad → use soon → fresh → not sure, said order within a tier", () => {
    const names = itemsOf(dish("All", ["e", "m", "t", "r", "c"]), ALL).map((i) => i.name);
    assert.deepEqual(names, ["Cabbage", "Tofu", "Leftover rice", "Tomatoes", "Eggs"]);
  });
  test("nothing tagged: the order they were said", () => {
    const names = itemsOf(dish("All", ["m", "e", "c"]), UNTAGGED).map((i) => i.name);
    assert.deepEqual(names, ["Eggs", "Cabbage", "Tomatoes"]);
  });
  test("an id no longer on the list is skipped", () => {
    assert.deepEqual(itemsOf(dish("X", ["gone", "c"]), ALL).map((i) => i.id), ["c"]);
  });
});

describe("copy", () => {
  test("name lists", () => {
    assert.equal(nameList(["a"]), "a");
    assert.equal(nameList(["a", "b"]), "a & b");
    assert.equal(nameList(["a", "b", "c"]), "a, b & c");
    assert.equal(nameList(["a", "b", "c", "d", "e"]), "a, b & 3 more");
    assert.equal(pantryLine(["oil"]), "Plus oil");
    assert.equal(pantryLine(["oil", "soy sauce", "salt"]), "Plus oil, soy sauce & salt");
  });

  test("count label", () => {
    assert.equal(countLabel(1), "1 dish · no extra shopping");
    assert.equal(countLabel(2), "2 dishes · no extra shopping");
  });

  test("top claim names only on-the-clock items the dishes use", () => {
    const dishes = [dish("A", ["c", "e"]), dish("B", ["r", "m"])];
    assert.equal(topClaim(dishes, ALL), "These lean on your cabbage & leftover rice first — they’re on the clock.");
    assert.equal(topClaim([dish("A", ["c"])], ALL), "This one leans on your cabbage — it’s on the clock.");
    assert.equal(topClaim(dishes, UNTAGGED), "Nothing sounded urgent, so I just went for tasty.");
  });

  test("footer counts distinct fridge items across dishes", () => {
    assert.equal(footerLine([dish("A", ["c", "e"]), dish("B", ["c", "m"])], ALL), "3 things from your fridge, 1 of them on the clock.");
    assert.equal(footerLine([dish("A", ["e"])], ALL), "1 thing from your fridge.");
    assert.equal(footerLine([dish("A", ["e", "m"])], ALL), "2 things from your fridge.");
    assert.equal(footerLine([dish("A", ["c"])], ALL), "1 thing from your fridge — the one on the clock.");
    assert.equal(footerLine([dish("A", ["c", "t"])], ALL), "2 things from your fridge — every one on the clock.");
  });

  test("footer recounts after a swap drops an item", () => {
    const before = [dish("A", ["c", "t"]), dish("B", ["e"])];
    const after = [dish("A2", ["c"]), dish("B", ["e"])];
    assert.equal(footerLine(before, ALL), "3 things from your fridge, 2 of them on the clock.");
    assert.equal(footerLine(after, ALL), "2 things from your fridge, 1 of them on the clock.");
  });

  test("loading names everything on the clock, before dishes exist", () => {
    assert.equal(loadingLine(ALL), "Putting your cabbage, tofu & leftover rice at the front of the queue.");
    assert.equal(loadingLine(UNTAGGED), "Sizing up what you’ve got.");
  });

  test("swap line promises the priority, not specific items", () => {
    assert.equal(swapLine(dish("Braise", ["c"]), ALL), "Braise — the next one will still lean on what’s on the clock.");
    assert.equal(swapLine(dish("Scramble", ["e"]), ALL), "Scramble — I’ll find something else from what you’ve got.");
  });

  test("finish line covers every dish cooked", () => {
    assert.deepEqual(finishLine([dish("A", ["c"]), dish("B", ["t", "e"])], ALL), { text: "Your cabbage & tofu didn’t go to waste. Nice.", urgent: true });
    assert.deepEqual(finishLine([dish("A", ["e"])], ALL), { text: "Your eggs, off the shelf and onto a plate.", urgent: false });
    assert.deepEqual(finishLine([dish("A", ["e", "m"])], ALL), { text: "2 things from your fridge, now dinner.", urgent: false });
  });
});
