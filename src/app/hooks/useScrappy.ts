"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dish, Ingredient, Prefs } from "@/lib/types";
import {
  generateImage,
  generateRecipes,
  parseIngredients,
  parsePref,
  swapDish,
} from "@/lib/api";
import { startVoiceCapture, type VoiceSession } from "@/lib/voice";
import type { PrefKey } from "@/lib/prefs";

export type Screen = "input" | "confirm" | "dishes" | "cook";
export type VoiceState = "idle" | "listening" | "processing" | "error";
export type VoiceContext =
  | "input"
  | "add"
  | "swap"
  | "servings"
  | "courses"
  | "diet"
  | "allergy";

export interface ScrappyState {
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
  imgState: Record<string, "loading" | "ready">;
  imgUrls: Record<string, string>;
  finaleUrl: string | null;
  finaleLoading: boolean;
  prefOpen: boolean;
  prefKey: PrefKey | null;
  finishOpen: boolean;
  error: string | null;
}

const INITIAL: ScrappyState = {
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

const VOICE_TITLES: Record<VoiceContext, string> = {
  input: "I'm listening",
  add: "Go on…",
  swap: "What should change?",
  servings: "How many?",
  courses: "How many dishes?",
  diet: "Any preference?",
  allergy: "Anything to avoid?",
};

export function useScrappy() {
  const [state, setRaw] = useState<ScrappyState>(INITIAL);

  // Mirror of the latest committed state so async callbacks can read fresh
  // values without being re-bound on every render.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const setState = useCallback(
    (u: Partial<ScrappyState> | ((s: ScrappyState) => Partial<ScrappyState>)) => {
      setRaw((prev) => ({
        ...prev,
        ...(typeof u === "function" ? u(prev) : u),
      }));
    },
    [],
  );

  // Cook-image stagger timers — cleared on unmount / restart.
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

  const voiceRef = useRef<VoiceSession | null>(null);

  useEffect(() => {
    return () => {
      ctimers.current.forEach(clearTimeout);
      voiceRef.current?.cancel();
    };
  }, []);

  // ── Ingredient ingestion ────────────────────────────────────────────────

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

  // ── Dish swap ───────────────────────────────────────────────────────────

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

  // ── Voice ───────────────────────────────────────────────────────────────

  // Turns a final transcript into ingredients (input/add), a swap pref, or
  // a preference value, depending on the current voice context.
  const resolveVoice = async (ctx: VoiceContext, transcript: string) => {
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

  const startVoice = async (ctx: VoiceContext) => {
    voiceRef.current?.cancel();
    setState({
      voiceOpen: true,
      prefOpen: false,
      voiceContext: ctx,
      voiceState: "listening",
      voiceTitle: VOICE_TITLES[ctx],
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

  // ── Ingredients (confirm screen) ────────────────────────────────────────

  const removeIng = (id: string) =>
    setState((s) => ({ ingredients: s.ingredients.filter((i) => i.id !== id) }));

  // Cycles three-tier freshness: fresh → use soon → going bad → fresh.
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

  // ── Preferences ─────────────────────────────────────────────────────────

  const openPref = (key: PrefKey) => setState({ prefOpen: true, prefKey: key });
  const pickPref = (key: PrefKey, val: string | number) =>
    setState((s) => ({ prefs: { ...s.prefs, [key]: val }, prefOpen: false }));
  const closePref = () => setState({ prefOpen: false });

  // ── Recipe generation ────────────────────────────────────────────────────

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

  // Tapping Swap opens the voice sheet so the user can steer the alternative;
  // saying nothing just swaps.
  const startSwapVoice = (id: string) => {
    setState({ swapTargetId: id });
    startVoice("swap");
  };

  // ── Cook + image generation ──────────────────────────────────────────────

  // Kicks off step image generation for a dish, staggered so images arrive
  // roughly as the cook reaches each step. Failed generations degrade
  // gracefully to the caption card.
  const genImages = (di: number) => {
    const dish = stateRef.current.dishes[di];
    const steps = dish?.steps ?? [];
    const loads: Record<string, "loading" | "ready"> = {};
    steps.forEach((s, si) => {
      if (s.img) {
        const k = `${di}-${si}`;
        if (stateRef.current.imgState[k] !== "ready") loads[k] = "loading";
      }
    });
    if (Object.keys(loads).length)
      setState((s) => ({ imgState: { ...s.imgState, ...loads } }));
    let delay = 1100;
    steps.forEach((s, si) => {
      if (!s.img) return;
      const k = `${di}-${si}`;
      if (!loads[k]) return;
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
            setState((st) => ({ imgState: { ...st.imgState, [k]: "ready" } })),
          );
      }, delay);
      delay += 1500;
    });
  };

  const startCook = () => {
    setState({ screen: "cook", cookDish: 0, cookStep: 0 });
    genImages(0);
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

  // ── Navigation ───────────────────────────────────────────────────────────

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
    setRaw(INITIAL);
  };

  return {
    state,
    // Voice
    startVoice,
    voiceDone,
    voiceCancel,
    voiceRetry,
    voiceType,
    // Ingredients
    onPhoto,
    typedInput,
    removeIng,
    cycleFreshness,
    // Preferences
    openPref,
    pickPref,
    closePref,
    // Recipes
    generate,
    startSwapVoice,
    // Cook
    startCook,
    setCookDish,
    nextStep,
    prevStep,
    // Navigation
    back,
    restart,
    setState,
  };
}
