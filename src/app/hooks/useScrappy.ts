"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Dish, Ingredient, Prefs } from "@/lib/types";
import {
  ApiError,
  generateImage,
  generateRecipes,
  getCapabilities,
  parseIngredients,
  parsePref,
  swapDish,
} from "@/lib/api";
import type { AiSettings, CheckFailure } from "@/lib/ai";
import { clearAi, getAi, getServerAi, storeAi, subscribeAi } from "@/lib/aiStore";
import {
  startVoiceCapture,
  VoiceCaptureError,
  type VoiceSession,
} from "@/lib/voice";
import { PREF_OPTIONS, PREF_TITLES, type PrefKey } from "@/lib/prefs";
import { defaultUnitSystem, type UnitSystem } from "@/lib/units";
import { onTheClock } from "../components/freshness";
import {
  aiNames,
  headsUpWorthy,
  isPref,
  needsSettings,
  type ErrorAction,
  type FailureKind,
} from "../errors";

export type Screen = "input" | "settings" | "aiSetup" | "confirm" | "dishes" | "cook";
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
  voiceError: FailureKind | null;
  /* The error happened after sending reviewText, which is still there. */
  errorKeptText: boolean;
  /* The connection came back while the offline message was showing. */
  backOnline: boolean;
  ingredients: Ingredient[];
  /* Ingredient whose adjust card (amount, unit, freshness) is open. */
  adjustId: string | null;
  /* Which units the adjust card offers and recipes are written in. */
  units: UnitSystem;
  /* Step and finale pictures; off means they're never generated. */
  stepPics: boolean;
  /* What the server can do: step pictures need an image service set up by
     whoever runs the server. */
  caps: { images: boolean };
  /* The "One thing before we cook" card, shown when there's no key yet. */
  keySheetOpen: boolean;
  /* The home hint says "All set" once after connecting from home. */
  justConnected: boolean;
  /* Where Settings → AI service goes back to. */
  setupReturn: Screen;
  /* Opened from a failed request: what to show as wrong there, and whether
     to bring the model picker into view. */
  setupFix: { reason: CheckFailure | null; model: boolean } | null;
  /* The last AI request failed in a way fixed in Settings (or at the
     provider): the heads-up there. Cleared by the next one that works. */
  lastFail: FailureKind | null;
  prefs: Prefs;
  dishes: Dish[];
  dishesLoading: boolean;
  /* Generating dishes failed: shown in place of the spinner. */
  genError: FailureKind | null;
  /* Still generating after 30 s, or still swapping. */
  genSlow: boolean;
  swapSlow: boolean;
  replacingId: string | null;
  /* A swap that failed: its card keeps the old dish and says why. */
  swapError: { id: string; kind: FailureKind; note?: string } | null;
  /* Dish whose "Swap this dish?" choice sheet is open. */
  swapSheetId: string | null;
  /* Dish a guided (spoken or typed) swap applies to. */
  swapTargetId: string | null;
  cookDish: number;
  cookStep: number;
  /* The step each dish was left on, so switching dishes picks up where
     that dish was (dish index → step). */
  stepMem: Record<number, number>;
  imgState: Record<string, "loading" | "ready" | "failed">;
  imgUrls: Record<string, string>;
  finaleUrl: string | null;
  finaleLoading: boolean;
  prefOpen: boolean;
  prefKey: PrefKey | null;
  /* The last value said or typed that isn't a preset ("No spicy"), kept so
     its sheet can still show it and pick it again after another choice. */
  customPrefs: Partial<Record<PrefKey, string>>;
  finishOpen: boolean;
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
  adjustId: null,
  units: "metric",
  stepPics: true,
  caps: { images: true },
  keySheetOpen: false,
  justConnected: false,
  setupReturn: "settings",
  setupFix: null,
  lastFail: null,
  prefs: { servings: 2, courses: 3, diet: "No restrictions", allergy: "None" },
  dishes: [],
  dishesLoading: false,
  genError: null,
  genSlow: false,
  swapSlow: false,
  replacingId: null,
  swapError: null,
  swapSheetId: null,
  swapTargetId: null,
  cookDish: 0,
  cookStep: 0,
  stepMem: {},
  imgState: {},
  imgUrls: {},
  finaleUrl: null,
  finaleLoading: false,
  prefOpen: false,
  prefKey: null,
  customPrefs: {},
  finishOpen: false,
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

const TYPED_TITLES: Record<"input" | "add" | "swap", string> = {
  input: "What's in your fridge?",
  add: "What else have you got?",
  swap: "What should change?",
};
const typedTitle = (ctx: VoiceContext) =>
  isPref(ctx) ? PREF_TITLES[ctx] : TYPED_TITLES[ctx];

const HEARD_TITLE = "Here’s what I heard";

const UNITS_KEY = "scrappy.units";
const PICS_KEY = "scrappy.stepPics";

// The unit system is remembered on this device; until it's set, it follows
// the phone's region.
function savedUnits(): UnitSystem {
  if (typeof window === "undefined") return "metric";
  try {
    const saved = localStorage.getItem(UNITS_KEY);
    if (saved === "metric" || saved === "imperial") return saved;
  } catch {}
  return defaultUnitSystem();
}

// Step pictures are on unless this device turned them off.
function savedPics(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(PICS_KEY) !== "off";
  } catch {
    return true;
  }
}

// Why a request failed: what the server said about the AI call, or the
// connection if the browser says it's offline, or else the service.
const requestFailure = (err: unknown): FailureKind => {
  if (err instanceof ApiError && err.kind) return err.kind;
  return navigator.onLine ? "service" : "offline";
};

// After this long, the waiting copy admits it's slow (the AI call itself
// gives up at 2 minutes).
const SLOW_MS = 30_000;
const SLOW_LABEL = "Still on it — your AI’s taking its time…";

// What a failed request shows on the AI service screen.
const FIX_REASON: Partial<Record<FailureKind, CheckFailure>> = {
  refused: "wrongKey",
  modelNotFound: "modelNotFound",
  unreachable: "unreachable",
};

export function useScrappy() {
  // Nothing on the first screen shows these settings, so reading them here
  // can't make the server and browser render differently.
  const [state, setRaw] = useState<ScrappyState>(() => ({
    ...INITIAL,
    units: savedUnits(),
    stepPics: savedPics(),
  }));

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
  // The same for recipe generation (its "Back to my list" or the header's
  // back drop a late reply) and for swaps.
  const genTurn = useRef(0);
  const swapTurn = useRef(0);
  // Text to bring back after fixing something in AI settings.
  const resume = useRef<{ ctx: VoiceContext; text: string } | null>(null);

  useEffect(() => {
    return () => {
      ctimers.current.forEach(clearTimeout);
      voiceRef.current?.cancel();
    };
  }, []);

  const setUnits = (units: UnitSystem) => {
    try {
      localStorage.setItem(UNITS_KEY, units);
    } catch {}
    setState({ units });
  };

  const setStepPics = (stepPics: boolean) => {
    try {
      localStorage.setItem(PICS_KEY, stepPics ? "on" : "off");
    } catch {}
    setState({ stepPics });
  };

  const openSettings = () => setState({ screen: "settings", justConnected: false });

  // ── AI service (bring your own key) ──────────────────────────────────────

  // The user's AI settings (their own key) live on this device. undefined
  // until the browser has read them — the server can't know them.
  const ai = useSyncExternalStore(subscribeAi, getAi, getServerAi);

  useEffect(() => {
    getCapabilities()
      .then((caps) => setState({ caps }))
      .catch(() => {});
  }, [setState]);

  const saveAi = (settings: AiSettings) => storeAi(settings);

  const removeAi = () => {
    clearAi();
    setState({ screen: "settings" });
  };

  // Mock mode asks for a key too, so the setup can be tried; its check
  // accepts any key.
  const aiReady = () => !!getAi();

  const openKeySheet = () => setState({ keySheetOpen: true });
  const closeKeySheet = () => setState({ keySheetOpen: false });

  const openAiSetup = (from: "input" | "settings") =>
    setState({
      screen: "aiSetup",
      setupReturn: from,
      setupFix: null,
      keySheetOpen: false,
      justConnected: false,
    });

  // From a failed request: AI service opens showing what's wrong (or at the
  // model picker, for "pick a faster model"), and comes back here after.
  const openAiFix = (kind: FailureKind | "faster") => {
    closeVoice();
    setState((s) => ({
      screen: "aiSetup",
      setupReturn: s.screen,
      setupFix: {
        reason: kind === "faster" ? null : (FIX_REASON[kind] ?? null),
        model: kind === "faster" || kind === "modelNotFound",
      },
      justConnected: false,
    }));
  };

  // Back to where it was opened from. After connecting from home, the hint
  // there says "All set — tap and tell me" once. Text a failed request left
  // behind comes back in the text box, ready to send again.
  const closeAiSetup = (connected = false) => {
    const r = resume.current;
    resume.current = null;
    setState((s) => ({
      screen: s.setupReturn,
      setupFix: null,
      justConnected: connected && s.setupReturn === "input" && !r,
    }));
    if (r) openTyped(r.ctx, r.text);
  };

  // Failures fixed in Settings (or at the provider) leave a heads-up there,
  // until a request works again.
  const recordFail = (kind: FailureKind) => {
    if (headsUpWorthy(kind, aiNames(getAi()))) setState({ lastFail: kind });
  };
  const requestOk = () => {
    if (stateRef.current.lastFail) setState({ lastFail: null });
  };

  // The home screen's mic and "type it instead": without a key, they open
  // the "Connect an AI" sheet instead of starting.
  const homeVoice = () => {
    if (!aiReady()) return openKeySheet();
    setState({ justConnected: false });
    startVoice("input");
  };
  const homeType = () => {
    if (!aiReady()) return openKeySheet();
    setState({ justConnected: false });
    openTyped("input");
  };

  // Let the offline message say so when the connection comes back.
  useEffect(() => {
    const onOnline = () =>
      setState((s) =>
        (s.voiceState === "error" && s.voiceError === "offline") || s.genError === "offline"
          ? { backOnline: true }
          : {},
      );
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [setState]);

  // ── Dish swap ───────────────────────────────────────────────────────────

  const swap = async (id: string, note?: string) => {
    const dish = stateRef.current.dishes.find((d) => d.id === id);
    if (!dish) return;
    const my = ++swapTurn.current;
    setState({ replacingId: id, swapError: null, swapSlow: false });
    const slow = window.setTimeout(() => {
      if (my === swapTurn.current) setState({ swapSlow: true });
    }, SLOW_MS);
    try {
      const { dish: alt } = await swapDish({
        ingredients: stateRef.current.ingredients,
        prefs: stateRef.current.prefs,
        units: stateRef.current.units,
        swapDishId: id,
        keep: stateRef.current.ingredients
          .filter((i) => dish.uses.includes(i.id) && onTheClock(i.tag))
          .map((i) => i.id),
        exclude: stateRef.current.dishes.map((d) => d.name),
        note,
      });
      if (my !== swapTurn.current) return;
      requestOk();
      setState((s) => ({
        dishes: s.dishes.map((d) => (d.id === id ? alt : d)),
        replacingId: null,
        swapSlow: false,
      }));
    } catch (err) {
      if (my !== swapTurn.current) return;
      const kind = requestFailure(err);
      recordFail(kind);
      // The card keeps its dish and says why; the other dishes stay put.
      setState({ replacingId: null, swapSlow: false, swapError: { id, kind, note } });
    } finally {
      window.clearTimeout(slow);
    }
  };

  // The failed card's button: fix it in Settings, or just try again.
  const swapErrorAction = () => {
    const e = stateRef.current.swapError;
    if (!e) return;
    if (needsSettings(e.kind, aiNames(getAi()))) return openAiFix(e.kind);
    swap(e.id, e.note);
  };

  // ── Voice ───────────────────────────────────────────────────────────────

  const showVoiceError = (kind: FailureKind, keptText = false) => {
    recordFail(kind);
    setState({
      voiceState: "error",
      voiceError: kind,
      errorKeptText: keptText,
      backOnline: false,
      voicePartial: "",
      reviewEditing: false,
    });
  };

  // While a sent turn is still processing after 30 s, its label says so.
  const slowLabel = (my: number) =>
    window.setTimeout(() => {
      if (my === turn.current && stateRef.current.voiceState === "processing")
        setState({ processingLabel: SLOW_LABEL });
    }, SLOW_MS);

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
      processingLabel:
        ctx === "input" ? "Spotting what needs using up first…" : "One sec…",
      voicePartial: "",
      reviewText: text,
      reviewEditing: false,
    });
    if (!navigator.onLine) return showVoiceError("offline", true);
    const slow = slowLabel(my);
    try {
      const { ingredients } = await parseIngredients({ transcript: text });
      if (my !== turn.current) return;
      requestOk();
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
    } catch (err) {
      if (my === turn.current) showVoiceError(requestFailure(err), true);
    } finally {
      window.clearTimeout(slow);
    }
  };

  const sendPref = async (key: PrefKey, text: string) => {
    const my = ++turn.current;
    setState({
      voiceState: "processing",
      voiceTitle: "Got it…",
      processingLabel: "One sec…",
      voicePartial: "",
      reviewText: text,
      reviewEditing: false,
    });
    if (!navigator.onLine) return showVoiceError("offline", true);
    const slow = slowLabel(my);
    try {
      const { value } = await parsePref(key, text);
      if (my !== turn.current) return;
      requestOk();
      const custom = !PREF_OPTIONS[key].includes(value);
      setState((s) => ({
        prefs: { ...s.prefs, [key]: value },
        ...(custom && { customPrefs: { ...s.customPrefs, [key]: String(value) } }),
        voiceOpen: false,
        voiceState: "idle",
        prefOpen: false,
      }));
    } catch (err) {
      if (my === turn.current) showVoiceError(requestFailure(err), true);
    } finally {
      window.clearTimeout(slow);
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

  // Opens the voice sheet straight into a text box: empty, or with text a
  // failed request left behind.
  const openTyped = (ctx: VoiceContext, text = "") => {
    voiceRef.current?.cancel();
    turn.current++;
    setState({
      voiceOpen: true,
      prefOpen: false,
      voiceContext: ctx,
      voiceState: "review",
      voiceTitle: typedTitle(ctx),
      reviewText: text,
      reviewEditing: true,
      reviewTyped: true,
      voicePartial: "",
    });
  };

  const typedInput = () => openTyped("input");
  // "or type it" under a voice button (add more, a preference).
  const typeIn = (ctx: VoiceContext) => openTyped(ctx);

  const reviewChange = (text: string) => setState({ reviewText: text });
  const reviewEdit = () => setState({ reviewEditing: true });

  const reviewSend = () => {
    const { voiceContext: ctx, reviewText } = stateRef.current;
    const t = reviewText.trim();
    if (!t) return;
    if (ctx === "swap") sendSwap(t);
    else if (ctx === "input" || ctx === "add") sendIngredients(ctx, t);
    else if (isPref(ctx)) sendPref(ctx, t);
  };

  const voiceErrorAction = (act: ErrorAction) => {
    const { voiceContext: ctx, reviewTyped, reviewText, voiceError } = stateRef.current;
    switch (act) {
      case "record":
        return voiceRetry();
      case "type":
        if (ctx) openTyped(ctx);
        return;
      case "pick":
        closeVoice();
        setState({ prefOpen: true });
        return;
      case "resend":
        return reviewSend();
      case "edit": {
        // A preference phrase is short, so fixing it reads like typing it.
        const typed = reviewTyped || isPref(ctx);
        setState({
          voiceState: "review",
          voiceTitle: typed && ctx ? typedTitle(ctx) : HEARD_TITLE,
          reviewEditing: true,
          reviewTyped: typed,
        });
        return;
      }
      case "settings":
      case "faster":
        // What they said comes back in the text box once it's fixed.
        if (ctx && ctx !== "swap" && reviewText.trim()) resume.current = { ctx, text: reviewText };
        return openAiFix(act === "faster" ? "faster" : (voiceError ?? "service"));
      case "close":
        return voiceCancel();
    }
  };

  // ── Ingredients (confirm screen) ────────────────────────────────────────

  const removeIng = (id: string) =>
    setState((s) => ({
      ingredients: s.ingredients.filter((i) => i.id !== id),
      adjustId: s.adjustId === id ? null : s.adjustId,
    }));

  const openAdjust = (id: string) => setState({ adjustId: id });
  const closeAdjust = () => setState({ adjustId: null });

  const updateIng = (id: string, patch: Partial<Ingredient>) =>
    setState((s) => ({
      ingredients: s.ingredients.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    }));

  // ── Preferences ─────────────────────────────────────────────────────────

  const openPref = (key: PrefKey) => setState({ prefOpen: true, prefKey: key });
  const pickPref = (key: PrefKey, val: string | number) =>
    setState((s) => ({ prefs: { ...s.prefs, [key]: val }, prefOpen: false }));
  const closePref = () => setState({ prefOpen: false });

  // ── Recipe generation ────────────────────────────────────────────────────

  const generate = () => runGen(stateRef.current.prefs);

  const runGen = async (prefs: Prefs) => {
    const my = ++genTurn.current;
    setState({
      screen: "dishes",
      dishesLoading: true,
      dishes: [],
      genError: null,
      genSlow: false,
      swapError: null,
      backOnline: false,
    });
    const slow = window.setTimeout(() => {
      if (my === genTurn.current) setState({ genSlow: true });
    }, SLOW_MS);
    try {
      const { dishes } = await generateRecipes({
        ingredients: stateRef.current.ingredients,
        prefs,
        units: stateRef.current.units,
      });
      if (my !== genTurn.current) return;
      requestOk();
      setState({ dishes, dishesLoading: false, genSlow: false });
    } catch (err) {
      if (my !== genTurn.current) return;
      const kind = requestFailure(err);
      recordFail(kind);
      // Shown in place of the spinner; the list is still on the confirm screen.
      setState({ dishesLoading: false, genSlow: false, genError: kind });
    } finally {
      window.clearTimeout(slow);
    }
  };

  // "Back to my list", while waiting or after a failure: a late reply is dropped.
  const cancelGen = () => {
    genTurn.current++;
    setState({ screen: "confirm", dishesLoading: false, genSlow: false, genError: null });
  };

  const genErrorAction = (act: ErrorAction) => {
    const kind = stateRef.current.genError;
    switch (act) {
      case "retry":
        return generate();
      case "backToList":
        return cancelGen();
      case "settings":
        return openAiFix(kind ?? "service");
      case "faster":
        return openAiFix("faster");
      case "fewer": {
        const prefs = { ...stateRef.current.prefs };
        prefs.courses = Math.max(1, prefs.courses - 1);
        setState({ prefs });
        return runGen(prefs);
      }
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

  // Pictures need the setting on and an image service on this server.
  const picturesOn = () => stateRef.current.stepPics && stateRef.current.caps.images;

  // Kicks off step image generation for a dish, staggered so images arrive
  // roughly as the cook reaches each step. Failed generations degrade
  // gracefully to the caption card.
  const genImages = (di: number) => {
    if (!picturesOn()) return;
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
            setState((st) => ({ imgState: { ...st.imgState, [k]: "failed" } })),
          );
      }, delay);
      delay += 1500;
    });
  };

  // "Retry" under a picture that didn't load.
  const retryPic = (k: string) => {
    const [di, si] = k.split("-").map(Number);
    const step = stateRef.current.dishes[di]?.steps[si];
    if (!step) return;
    setState((st) => ({ imgState: { ...st.imgState, [k]: "loading" } }));
    generateImage({ prompt: step.imagePrompt?.trim() || step.text, kind: "step" })
      .then(({ url }) =>
        setState((st) => ({
          imgState: { ...st.imgState, [k]: "ready" },
          imgUrls: { ...st.imgUrls, [k]: url },
        })),
      )
      .catch(() => setState((st) => ({ imgState: { ...st.imgState, [k]: "failed" } })));
  };

  const startCook = () => {
    setState({ screen: "cook", cookDish: 0, cookStep: 0, stepMem: {} });
    genImages(0);
  };

  const setCookDish = (i: number) => {
    setState((s) => {
      const stepMem = { ...s.stepMem, [s.cookDish]: s.cookStep };
      return { cookDish: i, cookStep: stepMem[i] ?? 0, stepMem };
    });
    genImages(i);
  };

  const openFinish = () => {
    setState({ finishOpen: true });
    if (!picturesOn()) return;
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
    if (sc === "aiSetup") return closeAiSetup();
    const map: Partial<Record<Screen, Screen>> = {
      settings: "input",
      confirm: "input",
      dishes: "confirm",
      cook: "dishes",
    };
    if (sc === "dishes") genTurn.current++; // a reply still on its way is dropped
    if (map[sc]) setState({ screen: map[sc]!, finishOpen: false, genError: null, genSlow: false });
  };

  const restart = () => {
    turn.current++;
    genTurn.current++;
    swapTurn.current++;
    resume.current = null;
    voiceRef.current?.cancel();
    clearCt();
    const { units, stepPics, caps, lastFail } = stateRef.current;
    setRaw({ ...INITIAL, units, stepPics, caps, lastFail });
  };

  return {
    state,
    ai,
    // Voice
    startVoice,
    voiceDone,
    voiceCancel,
    voiceErrorAction,
    reviewChange,
    reviewEdit,
    reviewSend,
    // Ingredients
    typedInput,
    typeIn,
    removeIng,
    openAdjust,
    closeAdjust,
    updateIng,
    // Preferences
    openPref,
    pickPref,
    closePref,
    // Recipes
    generate,
    cancelGen,
    genErrorAction,
    swapErrorAction,
    openSwap,
    closeSwap,
    swapNow,
    swapByVoice,
    swapByText,
    // Cook
    startCook,
    retryPic,
    setCookDish,
    nextStep,
    prevStep,
    // Settings
    openSettings,
    setUnits,
    setStepPics,
    // AI service
    homeVoice,
    homeType,
    saveAi,
    removeAi,
    closeKeySheet,
    openAiSetup,
    closeAiSetup,
    // Navigation
    back,
    restart,
    setState,
  };
}
