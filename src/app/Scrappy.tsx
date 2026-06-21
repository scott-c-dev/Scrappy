"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

/* ──────────────────────────────────────────────────────────────────────────
   Scrappy — cook what's about to go bad.

   A faithful React/TypeScript recreation of the Scrappy interactive prototype.
   The flow is near-linear: input → confirm → dishes → cook, with voice,
   preference, and finish sheets layered over the phone frame. Anti-waste
   ("use up what's going bad first") is the driver throughout, not a footnote.

   Styling mirrors the prototype's CSS-variable theming (4 directions) and exact
   pixel values; `css()` converts the prototype's inline style strings into the
   React style objects this app renders with, so values stay 1:1.
─────────────────────────────────────────────────────────────────────────── */

type Theme = "clay" | "market" | "diner" | "garden";
type Screen = "input" | "confirm" | "dishes" | "cook";
type VoiceState = "idle" | "listening" | "processing" | "error";
type VoiceContext =
  | "input"
  | "add"
  | "servings"
  | "courses"
  | "diet"
  | "allergy";
type PrefKey = "servings" | "courses" | "diet" | "allergy";

interface Ingredient {
  id: string;
  name: string;
  qty: string;
  tag: string | null;
}
interface Dish {
  id: string;
  name: string;
  short: string;
  blurb: string;
  rescue: string[];
  uses: string[];
}
type DishAlt = Omit<Dish, "id">;
interface Prefs {
  servings: number;
  courses: number;
  diet: string;
  allergy: string;
}
interface Step {
  text: string;
  img: boolean;
  cap?: string;
}
type ImgState = Record<string, "loading" | "ready">;

interface State {
  theme: Theme;
  screen: Screen;
  voiceOpen: boolean;
  voiceContext: VoiceContext | null;
  voiceState: VoiceState;
  voicePartial: string;
  voiceTitle: string;
  inputVoiceFailed: boolean;
  ingredients: Ingredient[];
  prefs: Prefs;
  addedGarlic: boolean;
  dishes: Dish[];
  dishesLoading: boolean;
  replacingId: string | null;
  swapIdx: number;
  cookDish: number;
  cookStep: number;
  imgState: ImgState;
  prefOpen: boolean;
  prefKey: PrefKey | null;
  finishOpen: boolean;
}

/* ── Static content (ported from the prototype's class fields) ───────────── */

const ING: Ingredient[] = [
  { id: "tom", name: "Tomatoes", qty: "2", tag: "use soon" },
  { id: "cab", name: "Cabbage", qty: "½", tag: "going bad" },
  { id: "egg", name: "Eggs", qty: "3", tag: null },
  { id: "tofu", name: "Tofu", qty: "1 block", tag: "going bad" },
  { id: "sca", name: "Scallions", qty: "as needed", tag: null },
  { id: "rice", name: "Leftover rice", qty: "1 bowl", tag: "use soon" },
];

const DISHES0: Dish[] = [
  {
    id: "d1",
    name: "Cabbage & Tofu Braise",
    short: "Braise",
    blurb: "Silky tofu, sweet cabbage, a glossy little sauce.",
    rescue: ["Cabbage", "Tofu"],
    uses: ["Cabbage", "Tofu", "Scallions"],
  },
  {
    id: "d2",
    name: "Tomato & Egg Scramble",
    short: "Tomato Egg",
    blurb: "The three-minute classic. No notes.",
    rescue: ["Tomatoes"],
    uses: ["Tomatoes", "Eggs", "Scallions"],
  },
  {
    id: "d3",
    name: "Scallion Egg Fried Rice",
    short: "Fried Rice",
    blurb: "Yesterday’s rice, reporting for duty.",
    rescue: ["Leftover rice"],
    uses: ["Rice", "Eggs", "Scallions"],
  },
];

const ALTS: DishAlt[] = [
  {
    name: "Charred Cabbage Wedges",
    short: "Cabbage",
    blurb: "Crispy edges, tender middle, salty finish.",
    rescue: ["Cabbage"],
    uses: ["Cabbage", "Scallions"],
  },
  {
    name: "Tomato Tofu Stew",
    short: "Stew",
    blurb: "Brothy, comforting, ready in ten.",
    rescue: ["Tomatoes", "Tofu"],
    uses: ["Tomatoes", "Tofu", "Scallions"],
  },
  {
    name: "Soy-Glazed Eggs",
    short: "Soy Eggs",
    blurb: "Jammy yolks under a sticky glaze.",
    rescue: ["Eggs"],
    uses: ["Eggs", "Scallions"],
  },
];

const STEPS: Step[][] = [
  [
    {
      text: "Tear the cabbage into rough, palm-sized pieces. Rougher than feels right.",
      img: true,
      cap: "reference · tearing cabbage",
    },
    {
      text: "Cut the tofu into ~2 cm cubes and pat them dry, so they brown instead of steam.",
      img: true,
      cap: "reference · tofu cubes",
    },
    {
      text: "Medium-high heat. A little oil, then the scallion whites until they smell good.",
      img: false,
    },
    {
      text: "Tofu in. Leave it alone 2–3 min to get one golden side before you stir.",
      img: true,
      cap: "reference · the golden side",
    },
    {
      text: "Cabbage in, a pinch of salt, a splash of water. Lid on, 4 minutes.",
      img: false,
    },
    {
      text: "Lid off, toss, taste. Scallion greens over the top. That’s dinner.",
      img: false,
    },
  ],
  [
    {
      text: "Beat 3 eggs with a small pinch of salt until completely smooth.",
      img: false,
    },
    {
      text: "Hot pan, scramble the eggs soft and just-set, then slide them out.",
      img: true,
      cap: "reference · soft scramble",
    },
    {
      text: "Tomato wedges in until juicy, eggs back, fold once, scallions. Done.",
      img: false,
    },
  ],
  [
    {
      text: "Break up the cold rice with wet hands so no clumps survive.",
      img: true,
      cap: "reference · loosened rice",
    },
    {
      text: "Screaming-hot pan. Eggs first, then rice, then keep everything moving.",
      img: false,
    },
    {
      text: "Scallions, a little salt, toss until every grain looks shiny.",
      img: false,
    },
  ],
];

const PREFOPTS: Record<PrefKey, (string | number)[]> = {
  servings: [1, 2, 3, 4, 5, 6],
  courses: [1, 2, 3, 4, 5],
  diet: ["No restrictions", "Vegetarian", "Low-oil", "High-protein"],
  allergy: ["None", "Peanuts", "Shellfish", "Gluten", "Dairy"],
};

/* ── Style helper: CSS string → React style object (mirrors cssToObj) ────── */
function css(s: string): React.CSSProperties {
  const o: Record<string, string> = {};
  for (const decl of s.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    if (!prop) continue;
    const val = decl.slice(i + 1).trim();
    o[
      prop.startsWith("--")
        ? prop
        : prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
    ] = val;
  }
  return o as React.CSSProperties;
}

/* ── Mic glyph (reused at several sizes throughout the flow) ─────────────── */
function Mic({ size, sw }: { size: number; sw: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="2" width="6" height="11" rx="3" fill="currentColor" stroke="none" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="8" y1="21" x2="16" y2="21" />
    </svg>
  );
}

const INITIAL: State = {
  theme: "garden",
  screen: "input",
  voiceOpen: false,
  voiceContext: null,
  voiceState: "idle",
  voicePartial: "",
  voiceTitle: "",
  inputVoiceFailed: false,
  ingredients: [],
  prefs: { servings: 2, courses: 3, diet: "No restrictions", allergy: "None" },
  addedGarlic: false,
  dishes: [],
  dishesLoading: false,
  replacingId: null,
  swapIdx: 0,
  cookDish: 0,
  cookStep: 0,
  imgState: {},
  prefOpen: false,
  prefKey: null,
  finishOpen: false,
};

export default function Scrappy() {
  const [state, setRaw] = useState<State>(INITIAL);
  // Mirror of the latest committed state, so the async timer/event callbacks
  // below can read fresh values without re-binding. Synced after each commit;
  // every reader runs after a render has committed, so it never goes stale.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  /* React-class-style setState: shallow-merge a patch or updater result. */
  const setState = useCallback(
    (u: Partial<State> | ((s: State) => Partial<State>)) => {
      setRaw((prev) => ({
        ...prev,
        ...(typeof u === "function" ? u(prev) : u),
      }));
    },
    [],
  );

  /* Timer buckets — general, voice, and cook-image, each independently
     clearable just like the prototype. */
  const timers = useRef<number[]>([]);
  const vtimers = useRef<number[]>([]);
  const ctimers = useRef<number[]>([]);
  const t = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
    return id;
  };
  const vt = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    vtimers.current.push(id);
    return id;
  };
  const ct = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    ctimers.current.push(id);
    return id;
  };
  const clearV = () => {
    vtimers.current.forEach(clearTimeout);
    vtimers.current = [];
  };

  useEffect(() => {
    return () => {
      [...timers.current, ...vtimers.current, ...ctimers.current].forEach(
        clearTimeout,
      );
    };
  }, []);

  /* ── Behaviour ─────────────────────────────────────────────────────── */

  const voicePlan = (ctx: VoiceContext) => {
    if (ctx === "input")
      return {
        title: "I'm listening",
        partials: [
          "",
          "two tomatoes…",
          "two tomatoes, half a cabbage, three eggs…",
          "two tomatoes, half a cabbage, three eggs, a block of tofu, scallions and some leftover rice",
        ],
      };
    if (ctx === "add")
      return {
        title: "Go on…",
        partials: ["", "umm, and a…", "and a few cloves of garlic"],
      };
    if (ctx === "servings")
      return { title: "How many?", partials: ["", "make it for four"] };
    if (ctx === "courses")
      return { title: "How many dishes?", partials: ["", "just two is plenty"] };
    if (ctx === "diet")
      return { title: "Any preference?", partials: ["", "keep it vegetarian"] };
    if (ctx === "allergy")
      return { title: "Anything to avoid?", partials: ["", "peanuts, please"] };
    return { title: "Listening…", partials: ["", "…"] };
  };

  const startVoice = (ctx: VoiceContext) => {
    clearV();
    const plan = voicePlan(ctx);
    setState({
      voiceOpen: true,
      prefOpen: false,
      voiceContext: ctx,
      voiceState: "listening",
      voicePartial: "",
      voiceTitle: plan.title,
    });
    plan.partials.forEach((p, i) =>
      vt(() => setState({ voicePartial: p }), 300 + i * 650),
    );
    const end = 300 + plan.partials.length * 650 + 250;
    vt(() => setState({ voiceState: "processing" }), end);
    vt(() => resolveVoice(ctx), end + 950);
  };

  const voiceDone = () => {
    const ctx = stateRef.current.voiceContext;
    clearV();
    setState({ voiceState: "processing" });
    if (ctx) vt(() => resolveVoice(ctx), 800);
  };
  const voiceCancel = () => {
    clearV();
    setState({ voiceOpen: false, voiceState: "idle" });
  };
  const voiceRetry = () => {
    if (stateRef.current.voiceContext) startVoice(stateRef.current.voiceContext);
  };
  const voiceType = () => {
    clearV();
    setState({ voiceOpen: false, voiceState: "idle" });
    typedInput();
  };

  const resolveVoice = (ctx: VoiceContext) => {
    if (ctx === "input") {
      if (!stateRef.current.inputVoiceFailed) {
        setState({
          voiceState: "error",
          voiceTitle: "Hmm — one more time?",
          voicePartial: "",
          inputVoiceFailed: true,
        });
        return;
      }
      setState({
        ingredients: ING.map((x) => ({ ...x })),
        screen: "confirm",
        voiceOpen: false,
        voiceState: "idle",
      });
      return;
    }
    if (ctx === "add") {
      if (!stateRef.current.addedGarlic) {
        setState((s) => ({
          ingredients: [
            ...s.ingredients,
            { id: "garlic", name: "Garlic", qty: "a few cloves", tag: null },
          ],
          addedGarlic: true,
        }));
      }
      setState({ voiceOpen: false, voiceState: "idle" });
      return;
    }
    const map: Record<PrefKey, string | number> = {
      servings: 4,
      courses: 2,
      diet: "Vegetarian",
      allergy: "Peanuts",
    };
    setState((s) => ({
      prefs: { ...s.prefs, [ctx]: map[ctx as PrefKey] },
      voiceOpen: false,
      voiceState: "idle",
      prefOpen: false,
    }));
  };

  const typedInput = () =>
    setState({ ingredients: ING.map((x) => ({ ...x })), screen: "confirm" });
  const removeIng = (id: string) =>
    setState((s) => ({ ingredients: s.ingredients.filter((i) => i.id !== id) }));
  const openPref = (key: PrefKey) => setState({ prefOpen: true, prefKey: key });
  const pickPref = (key: PrefKey, val: string | number) =>
    setState((s) => ({ prefs: { ...s.prefs, [key]: val }, prefOpen: false }));
  const closePref = () => setState({ prefOpen: false });

  const generate = () => {
    setState({
      screen: "dishes",
      dishesLoading: true,
      dishes: DISHES0.map((d) => ({ ...d })),
    });
    t(() => setState({ dishesLoading: false }), 2400);
  };

  const swap = (id: string) => {
    setState({ replacingId: id });
    t(() => {
      setState((s) => {
        const alt = ALTS[s.swapIdx % ALTS.length];
        const dishes = s.dishes.map((d) =>
          d.id === id ? { ...alt, id: "alt-" + s.swapIdx } : d,
        );
        return { dishes, replacingId: null, swapIdx: s.swapIdx + 1 };
      });
    }, 1600);
  };

  const startCook = () => {
    setState({ screen: "cook", cookDish: 0, cookStep: 0 });
    genImages(0);
  };

  const genImages = (di: number) => {
    const steps = STEPS[di] || [];
    const loads: ImgState = {};
    steps.forEach((s, si) => {
      if (s.img) {
        const k = di + "-" + si;
        if (stateRef.current.imgState[k] !== "ready") loads[k] = "loading";
      }
    });
    if (Object.keys(loads).length)
      setState((s) => ({ imgState: { ...s.imgState, ...loads } }));
    let delay = 1100;
    steps.forEach((s, si) => {
      if (s.img) {
        const k = di + "-" + si;
        if (loads[k]) {
          ct(
            () => setState((st) => ({ imgState: { ...st.imgState, [k]: "ready" } })),
            delay,
          );
          delay += 1500;
        }
      }
    });
  };

  const setCookDish = (i: number) => {
    setState({ cookDish: i, cookStep: 0 });
    genImages(i);
  };

  const nextStep = () => {
    const di = stateRef.current.cookDish;
    const n = STEPS[di].length;
    if (stateRef.current.cookStep >= n - 1) {
      if (di < STEPS.length - 1) setCookDish(di + 1);
      else setState({ finishOpen: true });
    } else {
      setState((s) => ({ cookStep: s.cookStep + 1 }));
    }
  };
  const prevStep = () =>
    setState((s) => ({ cookStep: Math.max(0, s.cookStep - 1) }));

  const back = () => {
    const sc = stateRef.current.screen;
    const map: Partial<Record<Screen, Screen>> = {
      confirm: "input",
      dishes: "confirm",
      cook: "dishes",
    };
    if (map[sc]) setState({ screen: map[sc]!, finishOpen: false });
  };

  const restart = () => {
    clearV();
    timers.current.forEach(clearTimeout);
    timers.current = [];
    ctimers.current.forEach(clearTimeout);
    ctimers.current = [];
    setState({
      screen: "input",
      voiceOpen: false,
      voiceState: "idle",
      inputVoiceFailed: false,
      ingredients: [],
      addedGarlic: false,
      dishes: [],
      dishesLoading: false,
      replacingId: null,
      swapIdx: 0,
      cookDish: 0,
      cookStep: 0,
      imgState: {},
      prefOpen: false,
      finishOpen: false,
      prefs: { servings: 2, courses: 3, diet: "No restrictions", allergy: "None" },
    });
  };

  const prefTitle = (k: PrefKey | null) =>
    k
      ? {
          servings: "How many people?",
          courses: "How many dishes?",
          diet: "Any way you like to eat?",
          allergy: "Anything to keep out?",
        }[k]
      : "";

  /* ── Derived values (renderVals) ───────────────────────────────────── */
  const s = state;

  const ingredients = s.ingredients.map((i) => {
    const strong = i.tag === "going bad";
    const soon = i.tag === "use soon";
    const chipStyle =
      "display:flex;align-items:flex-start;gap:9px;padding:9px 11px 9px 13px;border-radius:14px;" +
      (strong
        ? "background:var(--rescue-bg);border:1.5px solid var(--rescue);"
        : soon
          ? "background:var(--card);border:1px solid var(--accent-soft);"
          : "background:var(--card);border:1px solid var(--line);");
    const tagStyle =
      "display:inline-flex;align-items:center;gap:5px;font-family:var(--font-label);font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;font-weight:700;" +
      (strong ? "color:var(--rescue);" : "color:var(--muted);");
    const dotStyle =
      "width:5px;height:5px;border-radius:50%;display:inline-block;background:" +
      (strong ? "var(--rescue)" : "var(--muted)");
    return { ...i, chipStyle, tagStyle, dotStyle };
  });

  const perishNames = s.ingredients
    .filter((i) => i.tag === "going bad")
    .map((i) => i.name);
  const perishClaim = perishNames.length
    ? perishNames.join(" and ") +
      " are on their way out — I’ll build around them first."
    : "Nothing urgent in here — I’ll just cook you something good.";

  const prefs = s.prefs;
  const prefChips = [
    {
      key: "servings" as PrefKey,
      label: prefs.servings + " " + (prefs.servings === 1 ? "person" : "people"),
      emph: false,
    },
    {
      key: "courses" as PrefKey,
      label: prefs.courses + " " + (prefs.courses === 1 ? "dish" : "dishes"),
      emph: false,
    },
    { key: "diet" as PrefKey, label: prefs.diet, emph: false },
    { key: "allergy" as PrefKey, label: "Allergies: " + prefs.allergy, emph: true },
  ].map((c) => ({
    ...c,
    style:
      "cursor:pointer;display:inline-flex;align-items:center;gap:7px;font-family:var(--font-body);font-weight:600;font-size:13px;padding:9px 13px;border-radius:999px;color:var(--ink);border:1px " +
      (c.emph ? "solid var(--accent)" : "solid var(--line)") +
      ";background:" +
      (c.emph ? "var(--accent-soft)" : "var(--card)"),
  }));

  const dishes = s.dishes.map((d) => ({
    ...d,
    rescueText: (d.rescue || []).join(" · "),
    replacing: s.replacingId === d.id,
  }));

  const tagSet = new Set<string>();
  s.ingredients.forEach((i) => {
    if (i.tag) tagSet.add(i.name);
  });
  const rescueCount = tagSet.size;
  const goingBad = s.ingredients
    .filter((i) => i.tag === "going bad")
    .map((i) => i.name);
  const topClaim = goingBad.length
    ? "These lean on your " +
      goingBad.join(" & ").toLowerCase() +
      " first — the stuff on the clock."
    : "Three quick things from what you’ve got.";
  const rescueLine =
    "That’s " + rescueCount + " things saved from the bin today. Not bad.";

  const di = s.cookDish;
  const stepsArr = STEPS[di] || [];
  const step = stepsArr[s.cookStep] || { text: "", img: false };
  const imgKey = di + "-" + s.cookStep;
  const imgSt = s.imgState[imgKey];
  const tabsSource = s.dishes.length ? s.dishes : DISHES0;
  const cookDishTabs = tabsSource.map((d, idx) => ({
    id: d.id,
    label: d.short || d.name,
    idx,
    style:
      "cursor:pointer;white-space:nowrap;flex:none;font-family:var(--font-body);font-weight:600;font-size:13px;padding:8px 14px;border-radius:999px;border:1px solid " +
      (idx === di ? "var(--accent)" : "var(--line)") +
      ";background:" +
      (idx === di ? "var(--accent)" : "var(--card)") +
      ";color:" +
      (idx === di ? "var(--accent-ink)" : "var(--ink)"),
  }));
  const stepDots = stepsArr.map((_, idx) => ({
    style:
      "height:4px;border-radius:2px;flex:1;background:" +
      (idx <= s.cookStep ? "var(--accent)" : "var(--line)"),
  }));
  const curDish = s.dishes[di] || DISHES0[di] || ({} as Dish);
  const finishText = goingBad.length
    ? "You used up your " +
      goingBad.join(", ").toLowerCase() +
      (rescueCount > goingBad.length ? " (and more)" : "") +
      " before they turned."
    : "Good cooking.";

  const nextLabel =
    s.cookStep < stepsArr.length - 1
      ? "Next step"
      : di >= STEPS.length - 1
        ? "I’m done"
        : "Next dish →";

  const prefOptions = (() => {
    const k = s.prefKey;
    if (!k) return [];
    const opts = PREFOPTS[k] || [];
    const cur = s.prefs[k];
    return opts.map((o) => {
      const active = o === cur;
      return {
        label:
          String(o) +
          (k === "servings"
            ? o === 1
              ? " person"
              : " people"
            : k === "courses"
              ? o === 1
                ? " dish"
                : " dishes"
              : ""),
        value: o,
        style:
          "cursor:pointer;font-family:var(--font-body);font-weight:600;font-size:14px;padding:11px 16px;border-radius:999px;color:var(--ink);border:1px solid " +
          (active ? "var(--accent)" : "var(--line)") +
          ";background:" +
          (active ? "var(--accent-soft)" : "var(--card)"),
      };
    });
  })();

  const cur = { input: 0, confirm: 1, dishes: 2, cook: 3 }[s.screen];
  const showBack = s.screen !== "input";
  const isInput = s.screen === "input";
  const isConfirm = s.screen === "confirm";
  const dishesLoading = s.screen === "dishes" && s.dishesLoading;
  const dishesReady = s.screen === "dishes" && !s.dishesLoading;
  const isCook = s.screen === "cook";

  /* ── Render ────────────────────────────────────────────────────────── */
  return (
    <div
      className="scrappy-root"
      data-theme={s.theme}
      style={css(
        "height:100dvh;background:var(--page);font-family:var(--font-body);color:var(--ink);display:flex;flex-direction:column;overflow:hidden",
      )}
    >
      {/* Full-bleed card — fixed shell, only the inner area scrolls */}
      <div
        style={css(
          "width:100%;flex:1;min-height:0;background:var(--paper);position:relative;overflow:hidden;display:flex;flex-direction:column",
        )}
      >
        {/* Header */}
        <div
          style={css(
            "display:flex;align-items:center;justify-content:space-between;padding:16px 18px 10px;flex:none",
          )}
        >
          <div style={css("display:flex;align-items:center;gap:10px;min-width:0")}>
            {showBack && (
              <button
                onClick={back}
                aria-label="Back"
                style={css(
                  "cursor:pointer;border:1px solid var(--line);background:var(--card);width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--ink);font-size:18px;flex:none;padding-bottom:2px",
                )}
              >
                ‹
              </button>
            )}
            <span
              style={css(
                "font-family:var(--font-display);font-weight:800;font-size:20px;color:var(--ink)",
              )}
            >
              Scrappy
            </span>
          </div>
          <div style={css("display:flex;gap:5px;align-items:center")}>
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                style={css(
                  "width:7px;height:7px;border-radius:50%;background:" +
                    (i <= cur ? "var(--accent)" : "var(--line)"),
                )}
              />
            ))}
          </div>
        </div>

        {/* Scroll area */}
        <div
          className="noscroll"
          style={css(
            "flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;position:relative",
          )}
        >
          {/* ── Screen 1: input ── */}
          {isInput && (
            <div
              style={css(
                "min-height:100%;display:flex;flex-direction:column;padding:14px 22px 26px",
              )}
            >
              <div
                style={css(
                  "flex:1;display:flex;flex-direction:column;justify-content:center;gap:8px;padding:14px 0 4px",
                )}
              >
                <span
                  style={css(
                    "font-family:var(--font-label);font-size:11px;letter-spacing:var(--label-tracking);text-transform:var(--label-transform);color:var(--accent);font-weight:700",
                  )}
                >
                  Cook what&apos;s about to go bad
                </span>
                <h1
                  style={css(
                    "font-family:var(--font-display);font-weight:800;font-size:37px;line-height:1.06;margin:0;color:var(--ink);letter-spacing:-.01em",
                  )}
                >
                  What&apos;s in your fridge right now?
                </h1>
                <p
                  style={css(
                    "font-size:16px;line-height:1.5;color:var(--ink-soft);margin:8px 0 0;max-width:300px",
                  )}
                >
                  Just say what you&apos;ve got — and roughly how much. I&apos;ll
                  cook around it. No shopping trip.
                </p>
              </div>
              <div
                style={css(
                  "display:flex;flex-direction:column;align-items:center;gap:15px;padding:10px 0 4px",
                )}
              >
                <button
                  onClick={() => startVoice("input")}
                  aria-label="Start talking"
                  style={css(
                    "cursor:pointer;border:none;width:106px;height:106px;border-radius:50%;background:var(--accent);color:var(--accent-ink);display:flex;align-items:center;justify-content:center;animation:pulse 2.4s infinite;box-shadow:var(--shadow-sm)",
                  )}
                >
                  <Mic size={40} sw={2} />
                </button>
                <div style={css("text-align:center")}>
                  <div
                    style={css(
                      "font-family:var(--font-body);font-weight:700;font-size:15px;color:var(--ink)",
                    )}
                  >
                    Tap and tell me
                  </div>
                  <div style={css("font-size:13px;color:var(--muted);margin-top:3px")}>
                    e.g. “two tomatoes, half a cabbage, three eggs”
                  </div>
                </div>
                <button
                  onClick={typedInput}
                  style={css(
                    "cursor:pointer;border:none;background:none;color:var(--ink-soft);font-family:var(--font-body);font-size:13px;font-weight:600;text-decoration:underline;text-underline-offset:3px",
                  )}
                >
                  or type it instead
                </button>
              </div>
            </div>
          )}

          {/* ── Screen 2: confirm ── */}
          {isConfirm && (
            <>
              <div
                style={css(
                  "padding:10px 18px 8px;display:flex;flex-direction:column;gap:15px;animation:risein .4s ease",
                )}
              >
                <div>
                  <span
                    style={css(
                      "font-family:var(--font-label);font-size:11px;letter-spacing:var(--label-tracking);text-transform:var(--label-transform);color:var(--accent);font-weight:700",
                    )}
                  >
                    Here&apos;s what I heard
                  </span>
                  <h2
                    style={css(
                      "font-family:var(--font-display);font-weight:800;font-size:27px;margin:4px 0 0;color:var(--ink)",
                    )}
                  >
                    Sound about right?
                  </h2>
                  <p
                    style={css(
                      "font-size:13.5px;color:var(--ink-soft);margin:6px 0 0;line-height:1.45",
                    )}
                  >
                    Tap × to drop anything. Amounts are a guess — “as needed” is
                    fine.
                  </p>
                </div>
                <div style={css("display:flex;flex-wrap:wrap;gap:8px")}>
                  {ingredients.map((ing) => (
                    <div key={ing.id} style={css(ing.chipStyle)}>
                      <div
                        style={css(
                          "display:flex;flex-direction:column;gap:2px;min-width:0",
                        )}
                      >
                        <span
                          style={css(
                            "font-size:14px;font-weight:700;color:var(--ink)",
                          )}
                        >
                          {ing.name}
                        </span>
                        <span
                          style={css("display:flex;align-items:center;gap:7px")}
                        >
                          <span style={css("font-size:12px;color:var(--muted)")}>
                            {ing.qty}
                          </span>
                          {ing.tag && (
                            <span style={css(ing.tagStyle)}>
                              <span style={css(ing.dotStyle)} />
                              {ing.tag}
                            </span>
                          )}
                        </span>
                      </div>
                      <button
                        onClick={() => removeIng(ing.id)}
                        aria-label="Remove"
                        style={css(
                          "cursor:pointer;border:none;background:none;color:var(--muted);font-size:17px;line-height:1;padding:2px 0 4px;align-self:flex-start",
                        )}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                {perishNames.length > 0 && (
                  <div
                    style={css(
                      "display:flex;gap:11px;align-items:flex-start;background:var(--rescue-bg);border:1px solid var(--rescue);border-radius:var(--radius-sm);padding:13px 14px",
                    )}
                  >
                    <span
                      style={css(
                        "width:9px;height:9px;border-radius:50%;background:var(--rescue);margin-top:4px;flex:none;box-shadow:0 0 0 4px rgba(192,122,27,.16)",
                      )}
                    />
                    <div>
                      <div
                        style={css(
                          "font-size:14px;font-weight:700;color:var(--ink);line-height:1.35",
                        )}
                      >
                        {perishClaim}
                      </div>
                      <div
                        style={css(
                          "font-size:12px;color:var(--ink-soft);margin-top:3px",
                        )}
                      >
                        No waste, no guilt trip — just first in line.
                      </div>
                    </div>
                  </div>
                )}
                <button
                  onClick={() => startVoice("add")}
                  style={css(
                    "align-self:flex-start;cursor:pointer;display:inline-flex;align-items:center;gap:7px;border:1px dashed var(--accent);background:none;color:var(--accent);font-family:var(--font-body);font-weight:700;font-size:13px;padding:8px 14px;border-radius:999px",
                  )}
                >
                  <Mic size={14} sw={2.2} />
                  Add more by voice
                </button>
                <div style={css("height:1px;background:var(--line);margin:2px 0")} />
                <div>
                  <span
                    style={css(
                      "font-family:var(--font-label);font-size:11px;letter-spacing:var(--label-tracking);text-transform:var(--label-transform);color:var(--muted);font-weight:700",
                    )}
                  >
                    A few defaults — tap to change
                  </span>
                  <div
                    style={css(
                      "display:flex;flex-wrap:wrap;gap:8px;margin-top:11px",
                    )}
                  >
                    {prefChips.map((pc) => (
                      <button
                        key={pc.key}
                        onClick={() => openPref(pc.key)}
                        style={css(pc.style)}
                      >
                        {pc.label}
                        <span
                          style={css(
                            "color:var(--muted);font-size:11px;font-weight:600",
                          )}
                        >
                          edit
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div
                style={css(
                  "position:sticky;bottom:0;padding:12px 18px 16px;background:linear-gradient(to top,var(--paper),var(--paper) 66%,transparent)",
                )}
              >
                <button
                  onClick={generate}
                  style={css(
                    "width:100%;cursor:pointer;border:none;background:var(--accent);color:var(--accent-ink);font-family:var(--font-body);font-weight:700;font-size:16px;padding:15px;border-radius:var(--radius-sm);box-shadow:var(--shadow-sm)",
                  )}
                >
                  Find me recipes
                </button>
              </div>
            </>
          )}

          {/* ── Screen 4a: dishes loading ── */}
          {dishesLoading && (
            <div
              style={css(
                "min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:40px 30px;text-align:center",
              )}
            >
              <div
                style={css(
                  "width:62px;height:62px;border-radius:50%;border:4px solid var(--accent-soft);border-top-color:var(--accent);animation:spin .9s linear infinite",
                )}
              />
              <div>
                <div
                  style={css(
                    "font-family:var(--font-display);font-weight:800;font-size:23px;color:var(--ink)",
                  )}
                >
                  Raiding your fridge…
                </div>
                <div
                  style={css(
                    "font-size:14px;color:var(--ink-soft);margin-top:8px;max-width:250px;line-height:1.45",
                  )}
                >
                  Putting the cabbage and tofu at the front of the queue. Two
                  seconds.
                </div>
              </div>
            </div>
          )}

          {/* ── Screen 4b: dishes ready ── */}
          {dishesReady && (
            <>
              <div
                style={css(
                  "padding:10px 18px 8px;display:flex;flex-direction:column;gap:13px;animation:risein .4s ease",
                )}
              >
                <div
                  style={css(
                    "background:var(--fresh-bg);border-radius:var(--radius-sm);padding:13px 14px;display:flex;gap:11px;align-items:flex-start",
                  )}
                >
                  <span
                    style={css(
                      "width:9px;height:9px;border-radius:50%;background:var(--fresh);margin-top:4px;flex:none",
                    )}
                  />
                  <div
                    style={css(
                      "font-size:14px;font-weight:700;color:var(--ink);line-height:1.35",
                    )}
                  >
                    {topClaim}
                  </div>
                </div>
                <span
                  style={css(
                    "font-family:var(--font-label);font-size:11px;letter-spacing:var(--label-tracking);text-transform:var(--label-transform);color:var(--muted);font-weight:700",
                  )}
                >
                  3 dishes · no extra shopping
                </span>
                {dishes.map((d) => (
                  <div
                    key={d.id}
                    style={css(
                      "position:relative;background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:16px;box-shadow:var(--shadow-sm);display:flex;flex-direction:column;gap:11px",
                    )}
                  >
                    <div
                      style={css(
                        "display:flex;justify-content:space-between;align-items:flex-start;gap:10px",
                      )}
                    >
                      <div style={css("min-width:0")}>
                        <h3
                          style={css(
                            "font-family:var(--font-display);font-weight:800;font-size:21px;margin:0;color:var(--ink);line-height:1.1",
                          )}
                        >
                          {d.name}
                        </h3>
                        <p
                          style={css(
                            "font-size:13px;color:var(--ink-soft);margin:5px 0 0;line-height:1.4",
                          )}
                        >
                          {d.blurb}
                        </p>
                      </div>
                      <button
                        onClick={() => swap(d.id)}
                        style={css(
                          "flex:none;cursor:pointer;display:inline-flex;align-items:center;gap:5px;border:1px solid var(--line);background:var(--paper);color:var(--ink);font-family:var(--font-body);font-weight:600;font-size:12px;padding:7px 11px;border-radius:999px",
                        )}
                      >
                        <Mic size={12} sw={2.4} />
                        Swap
                      </button>
                    </div>
                    <div
                      style={css(
                        "display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:var(--rescue-bg);border-radius:10px;padding:7px 11px",
                      )}
                    >
                      <span
                        style={css(
                          "font-family:var(--font-label);font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;font-weight:700;color:var(--rescue)",
                        )}
                      >
                        Uses up
                      </span>
                      <span
                        style={css(
                          "font-size:12.5px;font-weight:700;color:var(--ink)",
                        )}
                      >
                        {d.rescueText}
                      </span>
                    </div>
                    <div style={css("display:flex;flex-wrap:wrap;gap:6px")}>
                      {d.uses.map((u, ui) => (
                        <span
                          key={ui}
                          style={css(
                            "font-size:11.5px;color:var(--ink-soft);background:var(--paper);border:1px solid var(--line);padding:4px 9px;border-radius:999px",
                          )}
                        >
                          {u}
                        </span>
                      ))}
                    </div>
                    {d.replacing && (
                      <div
                        style={css(
                          "position:absolute;inset:0;background:var(--card);border-radius:var(--radius);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:11px",
                        )}
                      >
                        <div
                          style={css(
                            "width:32px;height:32px;border-radius:50%;border:3px solid var(--accent-soft);border-top-color:var(--accent);animation:spin .8s linear infinite",
                          )}
                        />
                        <div
                          style={css(
                            "font-size:13px;color:var(--ink-soft);font-weight:600",
                          )}
                        >
                          Finding another one…
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <div
                  style={css(
                    "display:flex;align-items:center;gap:8px;justify-content:center;color:var(--muted);font-size:12.5px;padding:4px 0 2px;text-align:center",
                  )}
                >
                  <span
                    style={css(
                      "width:6px;height:6px;border-radius:50%;background:var(--fresh);flex:none",
                    )}
                  />
                  {rescueLine}
                </div>
              </div>
              <div
                style={css(
                  "position:sticky;bottom:0;padding:12px 18px 16px;background:linear-gradient(to top,var(--paper),var(--paper) 66%,transparent)",
                )}
              >
                <button
                  onClick={startCook}
                  style={css(
                    "width:100%;cursor:pointer;border:none;background:var(--accent);color:var(--accent-ink);font-family:var(--font-body);font-weight:700;font-size:16px;padding:15px;border-radius:var(--radius-sm);box-shadow:var(--shadow-sm)",
                  )}
                >
                  Let&apos;s cook these
                </button>
              </div>
            </>
          )}

          {/* ── Screen 5: cook ── */}
          {isCook && (
            <div
              style={css(
                "padding:8px 16px 6px;display:flex;flex-direction:column;gap:14px;min-height:100%",
              )}
            >
              <div
                className="noscroll"
                style={css(
                  "display:flex;gap:7px;overflow-x:auto;padding-bottom:2px",
                )}
              >
                {cookDishTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setCookDish(tab.idx)}
                    style={css(tab.style)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div style={css("display:flex;flex-direction:column;gap:9px")}>
                <div
                  style={css(
                    "display:flex;justify-content:space-between;align-items:baseline;gap:10px",
                  )}
                >
                  <span
                    style={css(
                      "font-family:var(--font-label);font-size:11px;letter-spacing:.06em;text-transform:uppercase;font-weight:700;color:var(--accent);white-space:nowrap",
                    )}
                  >
                    {"Step " + (s.cookStep + 1) + " of " + stepsArr.length}
                  </span>
                  <span
                    style={css(
                      "font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis",
                    )}
                  >
                    {curDish.name || ""}
                  </span>
                </div>
                <div style={css("display:flex;gap:4px")}>
                  {stepDots.map((sd, sdi) => (
                    <span key={sdi} style={css(sd.style)} />
                  ))}
                </div>
              </div>
              <div style={css("padding:2px 0")}>
                <p
                  style={css(
                    "font-family:var(--font-display);font-weight:700;font-size:26px;line-height:1.22;color:var(--ink);margin:0",
                  )}
                >
                  {step.text}
                </p>
              </div>
              {step.img && (
                <div>
                  {imgSt !== "ready" ? (
                    <div
                      style={css(
                        "position:relative;width:100%;height:184px;border-radius:var(--radius-sm);background:var(--accent-soft);overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:11px",
                      )}
                    >
                      <div
                        style={css(
                          "position:absolute;top:0;bottom:0;left:0;width:55%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent);animation:shimmer 1.4s infinite",
                        )}
                      />
                      <div
                        style={css(
                          "width:30px;height:30px;border-radius:50%;border:3px solid rgba(255,255,255,.65);border-top-color:var(--accent);animation:spin .8s linear infinite;position:relative",
                        )}
                      />
                      <div
                        style={css(
                          "font-family:var(--font-label);font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--rescue);font-weight:700;position:relative",
                        )}
                      >
                        Sketching this step…
                      </div>
                    </div>
                  ) : (
                    <div
                      style={css(
                        "width:100%;height:184px;border-radius:var(--radius-sm);background:linear-gradient(135deg,var(--accent-soft),var(--rescue-bg));position:relative;overflow:hidden;display:flex;align-items:flex-end;padding:12px",
                      )}
                    >
                      <span
                        style={css(
                          "font-family:var(--font-label);font-size:10px;letter-spacing:.04em;text-transform:uppercase;font-weight:700;color:var(--ink);background:rgba(255,255,255,.78);padding:5px 9px;border-radius:8px",
                        )}
                      >
                        {step.cap || "reference shot"}
                      </span>
                    </div>
                  )}
                </div>
              )}
              {!step.img && (
                <div
                  style={css(
                    "display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12px;padding:2px 0",
                  )}
                >
                  <span
                    style={css(
                      "width:5px;height:5px;border-radius:50%;background:var(--fresh);flex:none",
                    )}
                  />
                  No photo needed here — you&apos;ve got this.
                </div>
              )}
              <div style={css("flex:1")} />
              <div
                style={css(
                  "position:sticky;bottom:0;display:flex;gap:10px;padding:12px 0 14px;background:linear-gradient(to top,var(--paper),var(--paper) 66%,transparent)",
                )}
              >
                <button
                  onClick={prevStep}
                  style={css(
                    "flex:none;cursor:pointer;border:1px solid var(--line);background:var(--card);color:var(--ink);font-family:var(--font-body);font-weight:700;font-size:15px;padding:14px 18px;border-radius:var(--radius-sm)",
                  )}
                >
                  Back
                </button>
                <button
                  onClick={nextStep}
                  style={css(
                    "flex:1;cursor:pointer;border:none;background:var(--accent);color:var(--accent-ink);font-family:var(--font-body);font-weight:700;font-size:16px;padding:14px;border-radius:var(--radius-sm);box-shadow:var(--shadow-sm)",
                  )}
                >
                  {nextLabel}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Voice sheet ── */}
        {s.voiceOpen && (
          <div
            style={css(
              "position:absolute;inset:0;z-index:30;display:flex;flex-direction:column;justify-content:flex-end",
            )}
          >
            <div
              onClick={voiceCancel}
              style={css("position:absolute;inset:0;background:rgba(30,20,12,.34)")}
            />
            <div
              style={css(
                "position:relative;background:var(--paper);border-radius:26px 26px 0 0;padding:24px 22px 26px;display:flex;flex-direction:column;align-items:center;gap:16px;animation:sheetin .32s cubic-bezier(.2,.8,.2,1);box-shadow:0 -10px 40px rgba(0,0,0,.18)",
              )}
            >
              <div
                style={css(
                  "font-family:var(--font-display);font-weight:800;font-size:22px;color:var(--ink)",
                )}
              >
                {s.voiceTitle}
              </div>
              {s.voiceState === "listening" && (
                <div
                  style={css(
                    "display:flex;align-items:center;justify-content:center;gap:5px;height:40px",
                  )}
                >
                  {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                    <span
                      key={i}
                      style={css(
                        "width:6px;border-radius:3px;background:var(--accent);height:14px;animation:wave 0.9s ease-in-out " +
                          i * 0.09 +
                          "s infinite",
                      )}
                    />
                  ))}
                </div>
              )}
              {s.voiceState === "processing" && (
                <div
                  style={css("display:flex;align-items:center;gap:10px;height:40px")}
                >
                  <div
                    style={css(
                      "width:24px;height:24px;border-radius:50%;border:3px solid var(--accent-soft);border-top-color:var(--accent);animation:spin .8s linear infinite",
                    )}
                  />
                  <span
                    style={css(
                      "font-size:14px;color:var(--ink-soft);font-weight:600",
                    )}
                  >
                    Got it — sorting that out…
                  </span>
                </div>
              )}
              {!!s.voicePartial && (
                <div
                  style={css(
                    "background:var(--card);border:1px solid var(--line);border-radius:var(--radius-sm);padding:13px 15px;width:100%;text-align:center;font-size:15px;color:var(--ink);line-height:1.4",
                  )}
                >
                  “{s.voicePartial}”
                </div>
              )}
              {s.voiceState === "listening" && (
                <div style={css("display:flex;gap:10px;width:100%")}>
                  <button
                    onClick={voiceCancel}
                    style={css(
                      "flex:none;cursor:pointer;border:1px solid var(--line);background:none;color:var(--ink-soft);font-family:var(--font-body);font-weight:600;font-size:14px;padding:13px 18px;border-radius:var(--radius-sm)",
                    )}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={voiceDone}
                    style={css(
                      "flex:1;cursor:pointer;border:none;background:var(--accent);color:var(--accent-ink);font-family:var(--font-body);font-weight:700;font-size:15px;padding:13px;border-radius:var(--radius-sm)",
                    )}
                  >
                    That&apos;s everything
                  </button>
                </div>
              )}
              {s.voiceState === "error" && (
                <div
                  style={css(
                    "display:flex;flex-direction:column;align-items:center;gap:15px;width:100%",
                  )}
                >
                  <div
                    style={css(
                      "width:46px;height:46px;border-radius:50%;background:var(--rescue-bg);display:flex;align-items:center;justify-content:center;color:var(--rescue)",
                    )}
                  >
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="4" y1="4" x2="20" y2="20" />
                      <rect
                        x="9"
                        y="2"
                        width="6"
                        height="11"
                        rx="3"
                        fill="currentColor"
                        stroke="none"
                      />
                      <path d="M5 10a7 7 0 0 0 14 0" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                  </div>
                  <div
                    style={css(
                      "font-size:14.5px;color:var(--ink-soft);line-height:1.45;text-align:center;max-width:262px",
                    )}
                  >
                    A bit noisy in there — I only caught static. Mind saying it
                    once more?
                  </div>
                  <div style={css("display:flex;gap:10px;width:100%")}>
                    <button
                      onClick={voiceType}
                      style={css(
                        "flex:none;cursor:pointer;border:1px solid var(--line);background:none;color:var(--ink-soft);font-family:var(--font-body);font-weight:600;font-size:14px;padding:13px 16px;border-radius:var(--radius-sm)",
                      )}
                    >
                      Type instead
                    </button>
                    <button
                      onClick={voiceRetry}
                      style={css(
                        "flex:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:7px;border:none;background:var(--accent);color:var(--accent-ink);font-family:var(--font-body);font-weight:700;font-size:15px;padding:13px;border-radius:var(--radius-sm)",
                      )}
                    >
                      <Mic size={15} sw={2.2} />
                      Try again
                    </button>
                  </div>
                </div>
              )}
              {s.voiceState === "listening" && (
                <div
                  style={css(
                    "font-size:11.5px;color:var(--muted);text-align:center",
                  )}
                >
                  Speak normally — I&apos;ll catch the amounts.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Preference sheet ── */}
        {s.prefOpen && (
          <div
            style={css(
              "position:absolute;inset:0;z-index:30;display:flex;flex-direction:column;justify-content:flex-end",
            )}
          >
            <div
              onClick={closePref}
              style={css("position:absolute;inset:0;background:rgba(30,20,12,.34)")}
            />
            <div
              style={css(
                "position:relative;background:var(--paper);border-radius:26px 26px 0 0;padding:22px 22px 26px;display:flex;flex-direction:column;gap:16px;animation:sheetin .32s cubic-bezier(.2,.8,.2,1);box-shadow:0 -10px 40px rgba(0,0,0,.18)",
              )}
            >
              <div
                style={css(
                  "font-family:var(--font-display);font-weight:800;font-size:21px;color:var(--ink)",
                )}
              >
                {prefTitle(s.prefKey)}
              </div>
              <div style={css("display:flex;flex-wrap:wrap;gap:8px")}>
                {prefOptions.map((o, oi) => (
                  <button
                    key={oi}
                    onClick={() => s.prefKey && pickPref(s.prefKey, o.value)}
                    style={css(o.style)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => s.prefKey && startVoice(s.prefKey)}
                style={css(
                  "align-self:flex-start;cursor:pointer;display:inline-flex;align-items:center;gap:7px;border:none;background:none;color:var(--accent);font-family:var(--font-body);font-weight:700;font-size:13px;padding:2px",
                )}
              >
                <Mic size={14} sw={2.2} />
                …or just say it
              </button>
            </div>
          </div>
        )}

        {/* ── Finish sheet ── */}
        {s.finishOpen && (
          <div
            style={css(
              "position:absolute;inset:0;z-index:40;display:flex;flex-direction:column;justify-content:flex-end",
            )}
          >
            <div
              style={css("position:absolute;inset:0;background:rgba(30,20,12,.40)")}
            />
            <div
              style={css(
                "position:relative;background:var(--paper);border-radius:26px 26px 0 0;padding:28px 24px 28px;display:flex;flex-direction:column;gap:14px;align-items:flex-start;animation:sheetin .34s cubic-bezier(.2,.8,.2,1);box-shadow:0 -10px 40px rgba(0,0,0,.2)",
              )}
            >
              <span
                style={css(
                  "font-family:var(--font-label);font-size:11px;letter-spacing:var(--label-tracking);text-transform:var(--label-transform);color:var(--fresh);font-weight:700",
                )}
              >
                Plates down
              </span>
              <h2
                style={css(
                  "font-family:var(--font-display);font-weight:800;font-size:30px;margin:0;color:var(--ink);line-height:1.08",
                )}
              >
                Dinner&apos;s handled.
              </h2>
              <div
                style={css(
                  "display:flex;gap:11px;align-items:flex-start;background:var(--rescue-bg);border-radius:var(--radius-sm);padding:14px 15px;width:100%",
                )}
              >
                <span
                  style={css(
                    "width:9px;height:9px;border-radius:50%;background:var(--rescue);margin-top:4px;flex:none",
                  )}
                />
                <div
                  style={css(
                    "font-size:14.5px;font-weight:700;color:var(--ink);line-height:1.4",
                  )}
                >
                  {finishText}
                </div>
              </div>
              <div style={css("display:flex;gap:10px;width:100%;margin-top:2px")}>
                <button
                  onClick={() => setState({ finishOpen: false })}
                  style={css(
                    "flex:none;cursor:pointer;border:1px solid var(--line);background:var(--card);color:var(--ink);font-family:var(--font-body);font-weight:700;font-size:15px;padding:14px 18px;border-radius:var(--radius-sm)",
                  )}
                >
                  The steps
                </button>
                <button
                  onClick={restart}
                  style={css(
                    "flex:1;cursor:pointer;border:none;background:var(--accent);color:var(--accent-ink);font-family:var(--font-body);font-weight:700;font-size:16px;padding:14px;border-radius:var(--radius-sm);box-shadow:var(--shadow-sm)",
                  )}
                >
                  Cook again
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
