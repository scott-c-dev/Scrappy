import type { PrefKey } from "@/lib/prefs";
import type { VoiceContext } from "./hooks/useScrappy";

/* The five ways a voice turn can fail, grouped by when they happen:
   - before listening: offline, permission
   - after listening:  noisy (no words came through)
   - after sending:    nofood (the LLM found no ingredients), service (the LLM
     call failed); offline can also land here if the connection drops. */
export type VoiceErrorKind = "noisy" | "permission" | "nofood" | "service" | "offline";

/* What an error-sheet button does.
   record: listen again · type: open the text box · pick: back to the pref
   options · resend: send the kept text again · edit: fix the kept text · close. */
export type VoiceErrorAction = "record" | "type" | "pick" | "resend" | "edit" | "close";

interface ErrorButton {
  label: string;
  act: VoiceErrorAction;
  mic?: boolean;
}

export interface VoiceErrorView {
  title: string;
  body: string;
  icon: "mic" | "cloud";
  primary: ErrorButton;
  secondary: ErrorButton | null;
}

export const isPref = (ctx: VoiceContext | null): ctx is PrefKey =>
  ctx === "servings" || ctx === "courses" || ctx === "diet" || ctx === "allergy";

/* `keptText`: the failure happened after sending text we still have, so the
   user can resend or edit it instead of starting over. `backOnline`: the
   connection returned while the offline message was showing. */
export function voiceErrorView(
  kind: VoiceErrorKind,
  ctx: VoiceContext,
  keptText: boolean,
  backOnline: boolean,
): VoiceErrorView {
  const retry: ErrorButton = keptText
    ? { label: "Try again", act: "resend" }
    : { label: "Try again", act: "record", mic: true };
  const edit: ErrorButton | null = keptText ? { label: "Edit as text", act: "edit" } : null;

  switch (kind) {
    case "noisy":
      return {
        title: "Hmm — one more time?",
        body: "A bit noisy in there — I only caught static. Mind saying it once more?",
        icon: "mic",
        primary: { label: "Try again", act: "record", mic: true },
        secondary: null,
      };

    case "permission":
      if (isPref(ctx))
        return {
          title: "I can’t hear you",
          body: "Mic access is off for Scrappy. Turn it on in your browser settings, then try again — or just pick from the list.",
          icon: "mic",
          primary: { label: "Pick from the list", act: "pick" },
          secondary: { label: "Try again", act: "record" },
        };
      return {
        title: "I can’t hear you",
        body:
          "Mic access is off for Scrappy. Turn it on in your browser settings, then try again — or just " +
          (ctx === "input" ? "type your list." : "type it."),
        icon: "mic",
        primary: { label: "Type instead", act: "type" },
        secondary: { label: "Try again", act: "record" },
      };

    case "nofood":
      return {
        title: "Heard you — but no food?",
        body: "I couldn’t spot any ingredients in that. Try naming what’s in the fridge — like “two eggs, half a cabbage.”",
        icon: "mic",
        primary: { label: "Say it again", act: "record", mic: true },
        secondary: edit ?? { label: "Type instead", act: "type" },
      };

    case "service":
      if (isPref(ctx))
        return {
          title: "My kitchen brain is out",
          body: "Something went wrong on my end, not yours. Give it a minute, then try again.",
          icon: "cloud",
          primary: retry,
          secondary: { label: "Not now", act: "close" },
        };
      return {
        title: "My kitchen brain is out",
        body:
          "Something went wrong on my end, not yours. Give it a minute, then try again" +
          (keptText ? " — I kept what you said." : "."),
        icon: "cloud",
        primary: retry,
        secondary: edit ?? { label: "Not now", act: "close" },
      };

    case "offline":
      if (backOnline)
        return {
          title: "You’re back online",
          body: keptText
            ? "Connection’s back — tap to try again. I kept what you said."
            : "Connection’s back — tap to try again.",
          icon: "cloud",
          primary: retry,
          secondary: edit,
        };
      return {
        title: "You’re offline",
        body: keptText
          ? "I need a connection to cook. Hop back online, then try again — I kept what you said."
          : "I need a connection to listen and cook. Hop back online, then tap the mic again.",
        icon: "cloud",
        primary: retry,
        secondary: edit,
      };
  }
}
