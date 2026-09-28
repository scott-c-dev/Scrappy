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
import {
  startVoiceCapture,
  VoiceCaptureError,
  type VoiceSession,
} from "@/lib/voice";
import type { PrefKey } from "@/lib/prefs";
import type { VoiceErrorAction, VoiceErrorKind } from "../voiceErrors";

export type Screen = "input" | "confirm" | "dishes" | "cook";
/* review: showing what was heard (or a text box) before it's sent to the LLM. */
export type VoiceState = "idle" | "listening" | "processing" | "review" | "error";
export type VoiceContext =
  | "input"
  | "add"
  | "swap"
  | "servings"
  | "courses"
  | "diet"
  | "allergy";
/* Contexts whose text can be typed into the voice sheet's text box. */
type TextContext = "input" | "add" | "swap";

export interface ScrappyState {
  screen: Screen;
  voiceOpen: boolean;
  voiceContext: VoiceContext | null;
  voiceState: VoiceState;
  voiceTitle: string;
  /* Live transcript while listening. */
  voicePartial: string;
  processingLabel: string;
  /* Text under review; kept after a failed send so it can be resent or edited. */
  reviewText: string;
  reviewEditing: boolean;
  /* The text box was opened to type, not to fix a transcript. */
  reviewTyped: boolean;
  voiceError: VoiceErrorKind | null;
  /* The error happened after sending reviewText, which is still there. */
  errorKeptText: boolean;
  /* The connection came back while the offline message was showing. */
  backOnline: boolean;
  ingredients: Ingredient[];
  /* The user has changed a freshness tag, so the tag hint can go. */
  tagTouched: boolean;
  prefs: Prefs;
  dishes: Dish[];
  dishesLoading: boolean;
  replacingId: string | null;
  /* Dish whose "Swap this dish?" choice sheet is open. */
  swapSheetId: string | null;
  /* Dish a guided (spoken or typed) swap applies to. */
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
  voicePartial: "",
  processingLabel: "",
  reviewText: "",
  reviewEditing: false,
  reviewTyped: false,
  voiceError: null,
  errorKeptText: false,
  backOnline: false,
  ingredients: [],
  tagTouched: false,
  prefs: { servings: 2, courses: 3, diet: "No restrictions", allergy: "None" },
  dishes: [],
  dishesLoading: false,
  replacingId: null,
  swapSheetId: null,
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

const TYPED_TITLES: Record<TextContext, string> = {
  input: "What's in your fridge?",
  add: "What else have you got?",
  swap: "What should change?",
};

const HEARD_TITLE = "Here’s what I heard";

const isTextContext = (ctx: VoiceContext | null): ctx is TextContext =>
  ctx === "input" || ctx === "add" || ctx === "swap";

// A failed request is the connection's fault if the browser says it's offline.
const requestFailure = (): VoiceErrorKind =>
  navigator.onLine ? "service" : "offline";

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
  // Bumped whenever a voice turn starts, is cancelled, or sends a request.
  // Recognizer callbacks and LLM replies from an older turn are ignored, so a
  // cancelled or restarted flow can't jump screens when a late reply lands.
  const turn = useRef(0);

  useEffect(() => {
    return () => {
      ctimers.current.forEach(clearTimeout);
      voiceRef.current?.cancel();
    };
  }, []);

  // Let the offline message say so when the connection comes back.
  useEffect(() => {
    const onOnline = () =>
      setState((s) =>
        s.voiceState === "error" && s.voiceError === "offline"
          ? { backOnline: true }
          : {},
      );
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [setState]);

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

  const showVoiceError = (kind: VoiceErrorKind, keptText = false) =>
    setState({
      voiceState: "error",
      voiceError: kind,
      errorKeptText: keptText,
      backOnline: false,
      voicePartial: "",
      reviewEditing: false,
    });

  const closeVoice = () => {
    turn.current++;
    voiceRef.current?.cancel();
    setState({ voiceOpen: false, voiceState: "idle", voicePartial: "" });
  };

  // Sends fridge text to the LLM: replaces the list (input) or appends to it
  // (add). The text stays in reviewText so a failure can resend or edit it.
  const sendIngredients = async (ctx: "input" | "add", text: string) => {
    const my = ++turn.current;
    setState({
      voiceState: "processing",
      voiceTitle: "Reading your fridge…",
      processingLabel: "Spotting what needs using up first…",
      voicePartial: "",
      reviewText: text,
      reviewEditing: false,
    });
    if (!navigator.onLine) return showVoiceError("offline", true);
    try {
      const { ingredients } = await parseIngredients({ transcript: text });
      if (my !== turn.current) return;
      if (!ingredients.length) return showVoiceError("nofood", true);
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
    } catch {
      if (my === turn.current) showVoiceError(requestFailure(), true);
    }
  };

  const sendPref = async (key: PrefKey, text: string) => {
    const my = ++turn.current;
    setState({
      voiceState: "processing",
      processingLabel: "Got it — sorting that out…",
      voicePartial: "",
    });
    if (!navigator.onLine) return showVoiceError("offline");
    try {
      const { value } = await parsePref(key, text);
      if (my !== turn.current) return;
      setState((s) => ({
        prefs: { ...s.prefs, [key]: value },
        voiceOpen: false,
        voiceState: "idle",
        prefOpen: false,
      }));
    } catch {
      if (my === turn.current) showVoiceError(requestFailure());
    }
  };

  // Applies guided-swap text to the dish it was opened for.
  const sendSwap = (text: string) => {
    const id = stateRef.current.swapTargetId;
    closeVoice();
    setState({ swapTargetId: null });
    if (id) swap(id, text);
  };

  // A finished transcript: the main fridge input stops for review; everything
  // else goes straight through.
  const handleTranscript = (ctx: VoiceContext, text: string) => {
    const t = text.trim();
    if (!t) return showVoiceError("noisy");
    if (ctx === "input") {
      setState({
        voiceState: "review",
        voiceTitle: HEARD_TITLE,
        reviewText: t,
        reviewEditing: false,
        reviewTyped: false,
        voicePartial: "",
      });
    } else if (ctx === "add") {
      sendIngredients("add", t);
    } else if (ctx === "swap") {
      sendSwap(t);
    } else {
      sendPref(ctx, t);
    }
  };

  const startVoice = async (ctx: VoiceContext) => {
    voiceRef.current?.cancel();
    const my = ++turn.current;
    setState({
      voiceOpen: true,
      prefOpen: false,
      voiceContext: ctx,
      voiceState: "listening",
      voiceTitle: VOICE_TITLES[ctx],
      voicePartial: "",
      reviewEditing: false,
      error: null,
    });
    if (!navigator.onLine) return showVoiceError("offline");
    try {
      const session = await startVoiceCapture({
        onPartial: (text) => {
          if (my === turn.current) setState({ voicePartial: text });
        },
        onFinal: (text) => {
          if (my === turn.current) handleTranscript(ctx, text);
        },
        onError: (err) => {
          if (my === turn.current) showVoiceError(err.kind);
        },
      });
      if (my !== turn.current) session.cancel();
      else voiceRef.current = session;
    } catch (err) {
      if (my === turn.current)
        showVoiceError(err instanceof VoiceCaptureError ? err.kind : "permission");
    }
  };

  const voiceDone = () => {
    const ctx = stateRef.current.voiceContext;
    setState({
      voiceState: "processing",
      processingLabel:
        ctx === "input" ? "Writing that down…" : "Got it — sorting that out…",
    });
    voiceRef.current?.stop(); // flushes the recognizer, then fires onFinal
  };

  const voiceCancel = () => {
    closeVoice();
    setState({ swapTargetId: null });
  };

  const voiceRetry = () => {
    const ctx = stateRef.current.voiceContext;
    if (ctx) startVoice(ctx);
  };

  // Opens the voice sheet straight into an empty text box.
  const openTyped = (ctx: TextContext) => {
    voiceRef.current?.cancel();
    turn.current++;
    setState({
      voiceOpen: true,
      prefOpen: false,
      voiceContext: ctx,
      voiceState: "review",
      voiceTitle: TYPED_TITLES[ctx],
      reviewText: "",
      reviewEditing: true,
      reviewTyped: true,
      voicePartial: "",
      error: null,
    });
  };

  const typedInput = () => openTyped("input");

  const reviewChange = (text: string) => setState({ reviewText: text });
  const reviewEdit = () => setState({ reviewEditing: true });

  const reviewSend = () => {
    const { voiceContext: ctx, reviewText } = stateRef.current;
    const t = reviewText.trim();
    if (!t) return;
    if (ctx === "swap") sendSwap(t);
    else if (ctx === "input" || ctx === "add") sendIngredients(ctx, t);
  };

  const voiceErrorAction = (act: VoiceErrorAction) => {
    const { voiceContext: ctx, reviewTyped } = stateRef.current;
    switch (act) {
      case "record":
        return voiceRetry();
      case "type":
        if (isTextContext(ctx)) openTyped(ctx);
        return;
      case "pick":
        closeVoice();
        setState({ prefOpen: true });
        return;
      case "resend":
        return reviewSend();
      case "edit":
        setState({
          voiceState: "review",
          voiceTitle: reviewTyped && isTextContext(ctx) ? TYPED_TITLES[ctx] : HEARD_TITLE,
          reviewEditing: true,
        });
        return;
      case "close":
        return voiceCancel();
    }
  };

  // ── Ingredients (confirm screen) ────────────────────────────────────────

  const removeIng = (id: string) =>
    setState((s) => ({ ingredients: s.ingredients.filter((i) => i.id !== id) }));

  // Cycles three-tier freshness: fresh → use soon → going bad → fresh.
  const cycleFreshness = (id: string) =>
    setState((s) => ({
      tagTouched: true,
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

  // Swap asks first ("Swap this dish?"): a plain swap, or one steered by
  // voice or text. A swap discards the dish, so a stray tap shouldn't.
  const openSwap = (id: string) => setState({ swapSheetId: id });
  const closeSwap = () => setState({ swapSheetId: null });

  const swapNow = () => {
    const id = stateRef.current.swapSheetId;
    setState({ swapSheetId: null });
    if (id) swap(id);
  };

  const swapByVoice = () => {
    setState({ swapTargetId: stateRef.current.swapSheetId, swapSheetId: null });
    startVoice("swap");
  };

  const swapByText = () => {
    setState({ swapTargetId: stateRef.current.swapSheetId, swapSheetId: null });
    openTyped("swap");
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
    turn.current++;
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
    voiceErrorAction,
    reviewChange,
    reviewEdit,
    reviewSend,
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
    openSwap,
    closeSwap,
    swapNow,
    swapByVoice,
    swapByText,
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
