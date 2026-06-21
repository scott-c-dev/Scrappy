"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Dish, Ingredient, Prefs, Step } from "@/lib/types";
import {
  generateImage,
  generateRecipes,
  parseIngredients,
  parsePref,
  swapDish,
} from "@/lib/api";
import { startVoiceCapture, type VoiceSession } from "@/lib/voice";

/* ──────────────────────────────────────────────────────────────────────────
   Scrappy — cook what's about to go bad.

   The near-linear flow (input → confirm → dishes → cook, with voice,
   preference, and finish sheets over the phone frame) is driven by real AI
   behind the /api routes: Deepgram for voice, Claude for ingredient parsing +
   recipe/constraint solving, and an image model for the step/finale shots.
   Anti-waste ("use up what's going bad first") is the driver throughout, not a
   footnote. `css()` turns the design's inline CSS strings into React style
   objects so the original pixel values stay 1:1.
─────────────────────────────────────────────────────────────────────────── */

type Screen = "input" | "confirm" | "dishes" | "cook";
type VoiceState = "idle" | "listening" | "processing" | "error";
type VoiceContext =
  | "input"
  | "add"
  | "swap"
  | "servings"
  | "courses"
  | "diet"
  | "allergy";
type PrefKey = "servings" | "courses" | "diet" | "allergy";

/* Ingredient, Dish, Step, Prefs now live in @/lib/types (shared with the
   server routes). */
type ImgState = Record<string, "loading" | "ready">;

interface State {
  screen: Screen;
  voiceOpen: boolean;
  voiceContext: VoiceContext | null;
  voiceState: VoiceState;
  voiceTitle: string;
  ingredients: Ingredient[];
  prefs: Prefs;
  dishes: Dish[];
  dishesLoading: boolean;
  replacingId: string | null;
  swapTargetId: string | null;
  cookDish: number;
  cookStep: number;
  imgState: ImgState;
  imgUrls: Record<string, string>;
  finaleUrl: string | null;
  finaleLoading: boolean;
  prefOpen: boolean;
  prefKey: PrefKey | null;
  finishOpen: boolean;
  error: string | null;
}

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
  screen: "input",
  voiceOpen: false,
  voiceContext: null,
  voiceState: "idle",
  voiceTitle: "",
  ingredients: [],
  prefs: { servings: 2, courses: 3, diet: "No restrictions", allergy: "None" },
  dishes: [],
  dishesLoading: false,
  replacingId: null,
  swapTargetId: null,
  cookDish: 0,
  cookStep: 0,
  imgState: {},
  imgUrls: {},
  finaleUrl: null,
  finaleLoading: false,
  prefOpen: false,
  prefKey: null,
  finishOpen: false,
  error: null,
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

  /* Cook-image stagger timers (§6) — start each generation a beat apart so the
     later images are ready by the time the user reaches them. Cleared on
     unmount / restart. */
  const ctimers = useRef<number[]>([]);
  const ct = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    ctimers.current.push(id);
    return id;
  };
  const clearCt = () => {
    ctimers.current.forEach(clearTimeout);
    ctimers.current = [];
  };

  /* The active live-voice session, so it can be stopped/cancelled from anywhere. */
  const voiceRef = useRef<VoiceSession | null>(null);

  useEffect(() => {
    return () => {
      ctimers.current.forEach(clearTimeout);
      voiceRef.current?.cancel();
    };
  }, []);

  /* ── Behaviour ─────────────────────────────────────────────────────── */

  const voiceTitleFor = (ctx: VoiceContext): string =>
    ({
      input: "I'm listening",
      add: "Go on…",
      swap: "What should change?",
      servings: "How many?",
      courses: "How many dishes?",
      diet: "Any preference?",
      allergy: "Anything to avoid?",
    })[ctx] ?? "Listening…";

  /* Open the voice sheet and record. The clip is transcribed on stop (proxied
     through Deepgram server-side), then resolved below. */
  const startVoice = async (ctx: VoiceContext) => {
    voiceRef.current?.cancel();
    setState({
      voiceOpen: true,
      prefOpen: false,
      voiceContext: ctx,
      voiceState: "listening",
      voiceTitle: voiceTitleFor(ctx),
      error: null,
    });
    try {
      voiceRef.current = await startVoiceCapture({
        onFinal: (text) => resolveVoice(ctx, text),
        onError: () =>
          setState({ voiceState: "error", voiceTitle: "Hmm — one more time?" }),
      });
    } catch {
      setState({ voiceState: "error", voiceTitle: "Microphone unavailable" });
    }
  };

  const voiceDone = () => {
    setState({ voiceState: "processing" });
    voiceRef.current?.stop(); // flushes Deepgram, then fires onFinal → resolveVoice
  };
  const voiceCancel = () => {
    voiceRef.current?.cancel();
    setState({ voiceOpen: false, voiceState: "idle", swapTargetId: null });
  };
  const voiceRetry = () => {
    if (stateRef.current.voiceContext) startVoice(stateRef.current.voiceContext);
  };
  const voiceType = () => {
    voiceRef.current?.cancel();
    const ctx = stateRef.current.voiceContext;
    const id = stateRef.current.swapTargetId;
    setState({ voiceOpen: false, voiceState: "idle", swapTargetId: null });
    if (ctx === "swap") {
      if (id) {
        const text = window.prompt("What should change about this dish?") ?? "";
        swap(id, text.trim() || undefined);
      }
      return;
    }
    typedInput();
  };

  /* Turn a final transcript into ingredients (input/add), a swap preference, or
     a preference value. */
  const resolveVoice = async (ctx: VoiceContext, transcript: string) => {
    // Swap: an empty note just means "swap without a preference" — not an error.
    if (ctx === "swap") {
      const id = stateRef.current.swapTargetId;
      setState({ voiceOpen: false, voiceState: "idle", swapTargetId: null });
      if (id) swap(id, transcript.trim() || undefined);
      return;
    }
    if (!transcript.trim()) {
      setState({ voiceState: "error", voiceTitle: "Didn't catch that" });
      return;
    }
    setState({ voiceState: "processing" });
    try {
      if (ctx === "input" || ctx === "add") {
        const { ingredients } = await parseIngredients({ transcript });
        if (ctx === "add") {
          setState((s) => ({
            ingredients: [...s.ingredients, ...ingredients],
            voiceOpen: false,
            voiceState: "idle",
          }));
        } else {
          setState({
            ingredients,
            screen: "confirm",
            voiceOpen: false,
            voiceState: "idle",
          });
        }
        return;
      }
      const { value } = await parsePref(ctx as PrefKey, transcript);
      setState((s) => ({
        prefs: { ...s.prefs, [ctx as PrefKey]: value },
        voiceOpen: false,
        voiceState: "idle",
        prefOpen: false,
      }));
    } catch {
      setState({ voiceState: "error", voiceTitle: "Hmm — one more time?" });
    }
  };

  /* Shared ingredient ingest for the typed / photo paths. */
  const ingestIngredients = async (input: {
    transcript?: string;
    imageBase64?: string;
  }) => {
    setState({ error: null });
    try {
      const { ingredients } = await parseIngredients(input);
      setState({ ingredients, screen: "confirm" });
    } catch {
      setState({ error: "Couldn't read those ingredients — try again." });
    }
  };

  const typedInput = () => {
    const text = window.prompt(
      "What's in your fridge? e.g. two tomatoes, half a cabbage, three eggs",
    );
    if (text && text.trim()) ingestIngredients({ transcript: text.trim() });
  };

  const onPhoto = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => ingestIngredients({ imageBase64: String(reader.result) });
    reader.readAsDataURL(file);
  };

  const removeIng = (id: string) =>
    setState((s) => ({ ingredients: s.ingredients.filter((i) => i.id !== id) }));
  /* Tap a chip to correct its three-tier freshness: fresh → use soon → going bad. */
  const cycleFreshness = (id: string) =>
    setState((s) => ({
      ingredients: s.ingredients.map((i) =>
        i.id === id
          ? {
              ...i,
              tag:
                i.tag === null
                  ? "use soon"
                  : i.tag === "use soon"
                    ? "going bad"
                    : null,
            }
          : i,
      ),
    }));
  const openPref = (key: PrefKey) => setState({ prefOpen: true, prefKey: key });
  const pickPref = (key: PrefKey, val: string | number) =>
    setState((s) => ({ prefs: { ...s.prefs, [key]: val }, prefOpen: false }));
  const closePref = () => setState({ prefOpen: false });

  const generate = async () => {
    setState({ screen: "dishes", dishesLoading: true, dishes: [], error: null });
    try {
      const { dishes } = await generateRecipes({
        ingredients: stateRef.current.ingredients,
        prefs: stateRef.current.prefs,
      });
      setState({ dishes, dishesLoading: false });
    } catch {
      setState({
        dishesLoading: false,
        screen: "confirm",
        error: "Couldn't build recipes — try again.",
      });
    }
  };

  /* Tapping Swap opens the voice sheet so the user can steer the alternative
     ("make it spicier", "no tofu"); saying nothing just swaps. */
  const startSwapVoice = (id: string) => {
    setState({ swapTargetId: id });
    startVoice("swap");
  };

  const swap = async (id: string, note?: string) => {
    const dish = stateRef.current.dishes.find((d) => d.id === id);
    if (!dish) return;
    setState({ replacingId: id });
    try {
      const { dish: alt } = await swapDish({
        ingredients: stateRef.current.ingredients,
        prefs: stateRef.current.prefs,
        swapDishId: id,
        keepRescue: dish.rescue,
        exclude: stateRef.current.dishes.map((d) => d.name),
        note,
      });
      setState((s) => ({
        dishes: s.dishes.map((d) => (d.id === id ? alt : d)),
        replacingId: null,
      }));
    } catch {
      setState({ replacingId: null, error: "Couldn't find another dish." });
    }
  };

  const startCook = () => {
    setState({ screen: "cook", cookDish: 0, cookStep: 0 });
    genImages(0);
  };

  /* Kick off real image generation for a dish's image-worthy steps, staggered
     so they arrive roughly as the cook reaches them (§6). Each slot shows a
     shimmer placeholder until its URL resolves; a failed generation degrades
     gracefully to the caption card rather than blocking the step. */
  const genImages = (di: number) => {
    const dish = stateRef.current.dishes[di];
    const steps = dish?.steps ?? [];
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
      if (!s.img) return;
      const k = di + "-" + si;
      if (!loads[k]) return;
      // Depict the step's ACTION (technique in progress), not the final dish:
      // prefer the model's per-step imagePrompt, fall back to the step text.
      // Deliberately omit the dish name, which biases toward a plated shot.
      const prompt = s.imagePrompt?.trim() || s.text;
      ct(() => {
        generateImage({ prompt, kind: "step" })
          .then(({ url }) =>
            setState((st) => ({
              imgState: { ...st.imgState, [k]: "ready" },
              imgUrls: { ...st.imgUrls, [k]: url },
            })),
          )
          .catch(() =>
            // No URL → render falls back to the caption card (never a broken img).
            setState((st) => ({ imgState: { ...st.imgState, [k]: "ready" } })),
          );
      }, delay);
      delay += 1500;
    });
  };

  const setCookDish = (i: number) => {
    setState({ cookDish: i, cookStep: 0 });
    genImages(i);
  };

  const openFinish = () => {
    setState({ finishOpen: true });
    if (stateRef.current.finaleUrl || stateRef.current.finaleLoading) return;
    const dish =
      stateRef.current.dishes[stateRef.current.cookDish] ??
      stateRef.current.dishes[0];
    if (!dish) return;
    setState({ finaleLoading: true });
    generateImage({ prompt: `${dish.name} — ${dish.blurb}`, kind: "finale" })
      .then(({ url }) => setState({ finaleUrl: url, finaleLoading: false }))
      .catch(() => setState({ finaleLoading: false }));
  };

  const nextStep = () => {
    const di = stateRef.current.cookDish;
    const steps = stateRef.current.dishes[di]?.steps ?? [];
    if (stateRef.current.cookStep >= steps.length - 1) {
      if (di < stateRef.current.dishes.length - 1) setCookDish(di + 1);
      else openFinish();
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
    if (map[sc]) setState({ screen: map[sc]!, finishOpen: false, error: null });
  };

  const restart = () => {
    voiceRef.current?.cancel();
    clearCt();
    setState({
      screen: "input",
      voiceOpen: false,
      voiceState: "idle",
      ingredients: [],
      dishes: [],
      dishesLoading: false,
      replacingId: null,
      swapTargetId: null,
      cookDish: 0,
      cookStep: 0,
      imgState: {},
      imgUrls: {},
      finaleUrl: null,
      finaleLoading: false,
      prefOpen: false,
      finishOpen: false,
      error: null,
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
  const stepsArr: Step[] = s.dishes[di]?.steps ?? [];
  const step = stepsArr[s.cookStep] || { text: "", img: false };
  const imgKey = di + "-" + s.cookStep;
  const imgSt = s.imgState[imgKey];
  const imgUrl = s.imgUrls[imgKey];
  const tabsSource = s.dishes;
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
  const curDish = s.dishes[di] || ({} as Dish);
  const finishText = goingBad.length
    ? "You used up your " +
      goingBad.join(", ").toLowerCase() +
      (rescueCount > goingBad.length ? " (and more)" : "") +
      " before they turned."
    : "Good cooking.";

  const nextLabel =
    s.cookStep < stepsArr.length - 1
      ? "Next step"
      : di >= s.dishes.length - 1
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
                <label
                  style={css(
                    "cursor:pointer;display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line);background:var(--card);color:var(--ink);font-family:var(--font-body);font-weight:600;font-size:13px;padding:9px 15px;border-radius:999px",
                  )}
                >
                  📷 Snap a fridge photo
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onPhoto(f);
                      e.target.value = "";
                    }}
                  />
                </label>
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
                        onClick={() => cycleFreshness(ing.id)}
                        title="Tap to change freshness"
                        style={css(
                          "cursor:pointer;display:flex;flex-direction:column;gap:2px;min-width:0",
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
                          {ing.tag ? (
                            <span style={css(ing.tagStyle)}>
                              <span style={css(ing.dotStyle)} />
                              {ing.tag}
                            </span>
                          ) : (
                            <span
                              style={css(
                                "font-family:var(--font-label);font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;font-weight:700;color:var(--muted);opacity:.7",
                              )}
                            >
                              fresh
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
                        onClick={() => startSwapVoice(d.id)}
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
                      {imgUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={imgUrl}
                          alt={step.cap || "reference shot"}
                          style={{
                            position: "absolute",
                            inset: 0,
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                      )}
                      <span
                        style={css(
                          "position:relative;font-family:var(--font-label);font-size:10px;letter-spacing:.04em;text-transform:uppercase;font-weight:700;color:var(--ink);background:rgba(255,255,255,.78);padding:5px 9px;border-radius:8px",
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
              {(s.finaleLoading || s.finaleUrl) && (
                <div
                  style={css(
                    "position:relative;width:100%;height:190px;border-radius:var(--radius-sm);overflow:hidden;background:var(--accent-soft);display:flex;align-items:center;justify-content:center",
                  )}
                >
                  {s.finaleUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.finaleUrl}
                      alt="The finished dish"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <div
                      style={css(
                        "width:30px;height:30px;border-radius:50%;border:3px solid rgba(255,255,255,.65);border-top-color:var(--accent);animation:spin .8s linear infinite",
                      )}
                    />
                  )}
                </div>
              )}
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

        {/* ── Error toast ── */}
        {s.error && (
          <div
            onClick={() => setState({ error: null })}
            style={css(
              "position:absolute;left:14px;right:14px;bottom:18px;z-index:50;cursor:pointer;display:flex;align-items:center;gap:10px;background:var(--ink);color:var(--paper);font-family:var(--font-body);font-weight:600;font-size:13.5px;padding:13px 15px;border-radius:var(--radius-sm);box-shadow:0 10px 30px rgba(0,0,0,.25)",
            )}
          >
            <span style={css("flex:1")}>{s.error}</span>
            <span style={css("opacity:.7;font-size:12px")}>tap to dismiss</span>
          </div>
        )}
      </div>
    </div>
  );
}
