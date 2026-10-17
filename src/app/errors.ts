import { modelOf, PROVIDER_LABEL, type AiEffort, type AiFailure, type AiSettings } from "@/lib/ai";
import type { PrefKey } from "@/lib/prefs";
import type { CaptureFailure } from "@/lib/voice";
import { hostOf } from "./components/aiDraft";
import type { VoiceContext } from "./hooks/useScrappy";

/* Everything a failure says, wherever it happens — the voice sheet, the
   dishes screen in place of its spinner, a swapped card, the Settings
   heads-up — so the same failure reads the same everywhere. Grouped by what
   the person can do about it:
   - try again: service, busy, timeout (+ fewer dishes / a faster model)
   - say it differently: noisy, nofood
   - their connection: offline (before listening, or after sending)
   - their AI settings: refused, modelNotFound, unreachable (custom service)
   - their AI account: credit
   - their device: permission (the mic) */

export type FailureKind = CaptureFailure | "nofood" | AiFailure;

/* What an error button does.
   record: listen again · type: open the text box · pick: back to the pref
   options · resend: send the kept text again · edit: fix the kept text ·
   close · settings: open AI service · faster: open AI service at the model
   picker · effort: open AI service at its Advanced section · fewer: one
   dish fewer, then generate again · retry: generate again · backToList:
   back to the confirm screen. */
export type ErrorAction =
  | "record"
  | "type"
  | "pick"
  | "resend"
  | "edit"
  | "close"
  | "settings"
  | "faster"
  | "effort"
  | "fewer"
  | "retry"
  | "backToList";

interface ErrorButton {
  label: string;
  act: ErrorAction;
  mic?: boolean;
}

export interface ErrorView {
  title: string;
  body: string;
  icon: "mic" | "cloud" | "key";
  primary: ErrorButton;
  secondary: ErrorButton | null;
  /* Small extra ways out, under the buttons (a timeout's "fewer dishes"). */
  links: ErrorButton[];
}

/* Where it failed: a voice-sheet context, or recipe generation ("gen"). */
export type ErrorPlace = VoiceContext | "gen";

/* How the person's AI service is named in the copy. */
export interface AiNames {
  /* "Claude", "OpenAI", or a custom service's host (api.deepseek.com). */
  name: string;
  custom: boolean;
  /* Where an official service is topped up. */
  billing: string;
  model: string;
  /* A custom service's reasoning effort (null = Auto). */
  effort: AiEffort | null;
}

const BILLING = { claude: "platform.claude.com", openai: "platform.openai.com" };

export function aiNames(ai: AiSettings | null | undefined): AiNames {
  if (!ai) return { name: "your AI service", custom: false, billing: "", model: "", effort: null };
  const custom = ai.provider === "custom";
  return {
    name: custom ? hostOf(ai.baseURL) || "your AI service" : PROVIDER_LABEL[ai.provider],
    custom,
    billing: custom ? "" : BILLING[ai.provider as keyof typeof BILLING],
    model: modelOf(ai),
    effort: custom ? ai.effort : null,
  };
}

export const isPref = (ctx: ErrorPlace | null): ctx is PrefKey =>
  ctx === "servings" || ctx === "courses" || ctx === "diet" || ctx === "allergy";

/* The ones fixed in Settings → AI service. An official service that can't
   be reached just needs a moment; a custom one may have the wrong address. */
export const needsSettings = (kind: FailureKind, ai: AiNames) =>
  kind === "refused" || kind === "modelNotFound" || (kind === "unreachable" && ai.custom);

/* `keptText`: it failed after sending text we still have, so it can be
   resent or edited. `backOnline`: the connection came back while the
   offline message was showing. `courses`: for "try N dishes instead". */
export function errorView(
  kind: FailureKind,
  place: ErrorPlace,
  { keptText, backOnline, courses }: { keptText: boolean; backOnline: boolean; courses: number },
  ai: AiNames,
): ErrorView {
  const gen = place === "gen";
  const pref = isPref(place);
  const listy = place === "input" || place === "add";
  const keep = gen
    ? " Your list is safe."
    : place === "input"
      ? " I kept your list."
      : place === "add"
        ? " I kept what you said."
        : "";
  const second: ErrorButton = gen
    ? { label: "Back to my list", act: "backToList" }
    : listy
      ? { label: "Edit as text", act: "edit" }
      : { label: "Not now", act: "close" };
  const exit: ErrorButton = gen
    ? { label: "Back to my list", act: "backToList" }
    : { label: "Not now", act: "close" };
  const retry: ErrorButton = { label: "Try again", act: gen ? "retry" : "resend" };
  const view = (
    title: string,
    body: string,
    icon: ErrorView["icon"],
    primary: ErrorButton,
    secondary: ErrorButton | null,
    links: ErrorButton[] = [],
  ): ErrorView => ({ title, body, icon, primary, secondary, links });
  const { name } = ai;

  switch (kind) {
    case "permission":
      return pref
        ? view(
            "I can’t hear you",
            "Mic access is off for Scrappy. Turn it on in your browser settings — or just pick from the list.",
            "mic",
            { label: "Pick from the list", act: "pick" },
            { label: "Try again", act: "record" },
          )
        : view(
            "I can’t hear you",
            "Mic access is off for Scrappy. Turn it on in your browser settings, then try again — or just type it.",
            "mic",
            { label: "Type instead", act: "type" },
            { label: "Try again", act: "record" },
          );

    case "nofood":
      return view(
        "Heard you — but no food?",
        "I couldn’t spot any ingredients in that. Try naming what’s in the fridge — like “two eggs, half a cabbage.”",
        "mic",
        { label: "Say it again", act: "record", mic: true },
        { label: "Edit as text", act: "edit" },
      );

    case "noisy":
      return view(
        "Hmm — one more time?",
        "A bit noisy in there — I only caught static. Mind saying it once more?",
        "mic",
        { label: "Try again", act: "record", mic: true },
        pref ? { label: "Pick from the list", act: "pick" } : { label: "Type it instead", act: "type" },
      );

    case "offline":
      // Before listening: nothing was said yet, so the mic is the way back.
      if (!keptText && !gen)
        return view(
          backOnline ? "You’re back online" : "You’re offline",
          backOnline
            ? "Connection’s back — tap to try again."
            : "Your phone’s lost its connection, and I need one to listen. Hop back on Wi-Fi or data, then tap the mic.",
          "cloud",
          { label: "Try again", act: "record", mic: true },
          null,
        );
      return view(
        backOnline ? "You’re back online" : "You’re offline",
        (backOnline
          ? "Connection’s back — try again."
          : "Your phone’s lost its connection. Hop back on Wi-Fi or data, then try again.") + keep,
        "cloud",
        retry,
        second,
      );

    case "busy":
      return view(
        "Your AI’s swamped",
        `${name} says it’s getting too many requests right now. Give it a minute, then try again.${keep}`,
        "cloud",
        retry,
        second,
      );

    case "timeout": {
      const links: ErrorButton[] = [];
      if (gen && courses > 1)
        links.push({
          label: `Try ${courses - 1} ${courses - 1 === 1 ? "dish" : "dishes"} instead`,
          act: "fewer",
        });
      // A high effort on a custom service can be what's slow.
      if (ai.effort === "medium" || ai.effort === "high")
        links.push({ label: "Try a lower reasoning effort", act: "effort" });
      links.push({ label: "Pick a faster model", act: "faster" });
      return view(
        "That took too long",
        gen
          ? `${name} didn’t answer within 2 minutes. Fewer dishes usually helps — or a faster model.`
          : `${name} didn’t answer within 2 minutes. A faster model can help.${keep}`,
        "cloud",
        retry,
        second,
        links,
      );
    }

    case "credit":
      return view(
        "Out of credit",
        `Your ${name} account is out of credit. Top it up ${ai.custom || !ai.billing ? "with your provider" : `at ${ai.billing}`}, then try again.${keep}`,
        "key",
        retry,
        exit,
      );

    case "refused":
      return view(
        "Your AI key was refused",
        `${name} turned down your key — it may have expired or been revoked. Add a fresh one and we’re back in business.${keep}`,
        "key",
        { label: "Open AI settings", act: "settings" },
        exit,
      );

    case "modelNotFound":
      return view(
        "Model not found",
        `${name} doesn’t offer “${ai.model}” to your key anymore. Pick another and I’ll carry on.${keep}`,
        "key",
        { label: "Open AI settings", act: "settings" },
        exit,
      );

    case "unreachable":
      return ai.custom
        ? view(
            `Can’t reach ${name}`,
            `Your connection’s fine — ${name} just isn’t answering. Check the address in AI settings, and that the server’s running.${keep}`,
            "key",
            { label: "Open AI settings", act: "settings" },
            exit,
          )
        : view(
            `Can’t reach ${name}`,
            `Your connection’s fine — ${name} just isn’t answering right now. It’s usually back in a few minutes.${keep}`,
            "cloud",
            retry,
            second,
          );

    default:
      return view(
        "That didn’t come back right",
        `Something went wrong between me and ${name} — usually a one-off. Give it another go.${keep}`,
        "cloud",
        retry,
        second,
      );
  }
}

/* The one line on a card whose swap failed; the card keeps its old dish. */
export function swapErrorLine(kind: FailureKind, ai: AiNames): string {
  const why: Partial<Record<FailureKind, string>> = {
    busy: "your AI’s swamped. Give it a minute.",
    credit: "your AI account’s out of credit.",
    refused: "your AI key was refused.",
    modelNotFound: `“${ai.model}” isn’t available anymore.`,
    unreachable: `can’t reach ${ai.name}.`,
    timeout: "that took too long.",
    offline: "you’re offline.",
    service: "that one didn’t come back right.",
  };
  return `Couldn’t swap — ${why[kind] ?? "something went wrong."}`;
}

/* The Settings heads-up after a failure fixed there (or at the provider). */
export function headsUpText(kind: FailureKind, ai: AiNames): string {
  if (kind === "refused") return "Your key was refused. Open AI service to add a fresh one.";
  if (kind === "modelNotFound")
    return `“${ai.model}” isn’t offered anymore. Open AI service to pick another model.`;
  if (kind === "unreachable") return `Couldn’t reach ${ai.name}. Check the address under AI service.`;
  return `Your ${ai.name} account was out of credit. Top up ${ai.custom || !ai.billing ? "with your provider" : `at ${ai.billing}`} — nothing to change here.`;
}

/* Worth a Settings heads-up: what's fixed there, plus running out of credit
   (fixed at the provider, but that's where people will look). */
export const headsUpWorthy = (kind: FailureKind, ai: AiNames) =>
  kind === "credit" || needsSettings(kind, ai);
