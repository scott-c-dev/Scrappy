/* Browser-side speech capture. Imported only by the client component.

   Primary path: the Web Speech API (SpeechRecognition / webkitSpeechRecognition),
   which transcribes on-device or via the browser vendor with no round trip
   through our server.

   Fallback path: record a short clip with MediaRecorder and, on stop, upload it
   to /api/transcribe (which calls Deepgram server-side). We proxy the audio
   rather than streaming live partials because that needs a short-lived Deepgram
   token, which the provided key isn't permissioned to mint. */

import { transcribe } from "./api";
import { voiceDebug } from "./voiceDebug";

/* Deepgram fallback is switched off for now: browsers without the Web Speech
   API get a mic error instead of the server round trip. Flip to re-enable. */
const DEEPGRAM_FALLBACK_ENABLED = false;

export interface VoiceSession {
  /* Stop recording and resolve the transcript via onFinal. */
  stop(): void;
  /* Abort with no transcript. */
  cancel(): void;
}

/* Why capture failed, in the terms the UI explains to the user: the mic is
   blocked or missing, there's no connection, or we just didn't get words. */
export type CaptureFailure = "permission" | "offline" | "noisy";

export class VoiceCaptureError extends Error {
  constructor(
    readonly kind: CaptureFailure,
    message: string,
  ) {
    super(message);
  }
}

interface Handlers {
  /* The transcript so far, while the user is still talking. */
  onPartial?: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (err: VoiceCaptureError) => void;
}

/* Throws a VoiceCaptureError if capture can't start at all. */
export async function startVoiceCapture(h: Handlers): Promise<VoiceSession> {
  const Recognition = getSpeechRecognition();
  if (Recognition) return startWebSpeech(Recognition, h);
  if (DEEPGRAM_FALLBACK_ENABLED) return startDeepgram(h);
  throw new VoiceCaptureError(
    "permission",
    "speech recognition is not supported in this browser",
  );
}

// ── Web Speech API ──────────────────────────────────────────────────────────

type SpeechRecognitionCtor = new () => SpeechRecognition;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  // @types/dom-speech-recognition declares both globals as always present,
  // but either (or both) may be missing at runtime.
  const w = window as Partial<
    Pick<typeof window, "SpeechRecognition" | "webkitSpeechRecognition">
  >;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/* One recognizer for the whole page, reused by every voice turn.

   iOS Safari gives a second SpeechRecognition object on the same page a
   silent microphone: it fires start and audiostart, then never hears a word,
   until the page is reloaded (issue #9). Restarting the same object works
   (we already do that mid-turn), so every turn shares this one. */
let shared: SpeechRecognition | null = null;
// The turn whose start() the shared recognizer is serving; its events go to it.
let owner: Run | null = null;
// A newer turn waiting for the previous one's `end` before it can start().
let pending: Run | null = null;

interface Run {
  id: number;
  start(): void;
  onResult(e: SpeechRecognitionEvent): void;
  onError(e: SpeechRecognitionErrorEvent): void;
  onEnd(): void;
}

// Numbers voice turns in the debug log, so they can be told apart.
let runCount = 0;

function sharedRecognizer(Recognition: SpeechRecognitionCtor): SpeechRecognition {
  if (shared) return shared;
  const rec = new Recognition();
  rec.continuous = true;
  rec.interimResults = true;
  // TODO: temporary — remove with voiceDebug.ts.
  for (const ev of [
    "start",
    "audiostart",
    "soundstart",
    "speechstart",
    "speechend",
    "soundend",
    "audioend",
    "nomatch",
  ] as const) {
    rec.addEventListener(ev, () => voiceDebug(`#${owner?.id ?? "?"} ${ev}`));
  }
  rec.onresult = (e) => owner?.onResult(e);
  rec.onerror = (e) => owner?.onError(e);
  rec.onend = () => {
    const ended = owner;
    owner = null;
    ended?.onEnd(); // may restart itself, making it the owner again
    if (!owner && pending) {
      const next = pending;
      pending = null;
      next.start();
    }
  };
  shared = rec;
  return rec;
}

function startWebSpeech(
  Recognition: SpeechRecognitionCtor,
  h: Handlers,
): VoiceSession {
  const rec = sharedRecognizer(Recognition);
  const id = ++runCount;
  // TODO: temporary — remove with voiceDebug.ts.
  const log = (msg: string, isError = false) => voiceDebug(`#${id} ${msg}`, isError);

  // Text from earlier runs of `rec` (we restart it after browser-initiated ends).
  let committed = "";
  // Text of the current run, rebuilt from its full results list on each event.
  let current = "";
  let stopped = false;
  let cancelled = false;
  let failed = false;

  const run: Run = {
    id,
    start() {
      if (cancelled) return;
      owner = run;
      rec.lang = navigator.language || "en-US";
      log("start()");
      try {
        rec.start();
      } catch (err) {
        owner = null;
        failed = true;
        log(`start() threw: ${err instanceof Error ? err.message : err}`, true);
        h.onError(new VoiceCaptureError("noisy", "speech recognition failed to start"));
      }
    },
    onResult(e) {
      current = mergeResults(e.results);
      log(`result: ${current}`);
      h.onPartial?.(joinText(committed, current));
    },
    onError(e) {
      log(`error: ${e.error}`, true);
      // "no-speech" just means silence; let onend resolve with an empty transcript.
      if (e.error === "no-speech" || e.error === "aborted") return;
      failed = true;
      if (!cancelled)
        h.onError(
          new VoiceCaptureError(failureFor(e.error), `speech recognition: ${e.error}`),
        );
    },
    onEnd() {
      log(`end (stopped=${stopped} cancelled=${cancelled} failed=${failed})`);
      if (cancelled || failed) return;
      // Browsers end continuous sessions on their own after a pause; keep
      // listening until the user taps Done.
      if (!stopped) {
        committed = joinText(committed, current);
        current = "";
        log("restart");
        run.start();
        return;
      }
      h.onFinal(joinText(committed, current));
    },
  };

  // The previous turn is still winding down (its `end` hasn't fired yet):
  // start right after it. Otherwise start now, inside the user's tap.
  if (owner) {
    log("waiting for previous turn to end");
    pending = run;
  } else {
    run.start();
  }

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      if (pending === run) {
        pending = null;
        h.onFinal("");
        return;
      }
      log("stop()");
      if (owner === run) rec.stop();
    },
    cancel() {
      if (cancelled) return;
      cancelled = true;
      if (pending === run) pending = null;
      if (owner !== run) return;
      log("cancel() → stop()");
      // stop(), not abort(): it ends the turn the same way "That's everything"
      // does, and `cancelled` drops the transcript.
      rec.stop();
    },
  };
}

/* Flatten a run's results (final and interim, in order) into one string.

   Chrome on Android doesn't emit one result per phrase: it emits a growing
   series — "is", "is it", "is it working" — each marked final, so naively
   concatenating repeats every prefix. When a result starts with the one before
   it, it supersedes it instead of being appended. Other browsers never produce
   such prefixes, so this is a no-op there. Rebuilding from the full list (not
   from resultIndex) also makes re-delivered results harmless. */
function mergeResults(results: SpeechRecognitionResultList): string {
  const segments: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const text = results[i][0].transcript.trim();
    if (!text) continue;
    const prev = segments[segments.length - 1];
    if (prev !== undefined && text.toLowerCase().startsWith(prev.toLowerCase())) {
      segments[segments.length - 1] = text;
    } else {
      segments.push(text);
    }
  }
  return segments.join(" ");
}

function failureFor(error: SpeechRecognitionErrorCode): CaptureFailure {
  if (
    error === "not-allowed" ||
    error === "service-not-allowed" ||
    error === "audio-capture"
  )
    return "permission";
  // Chrome's recognizer runs server-side, so losing the connection surfaces here.
  if (error === "network") return "offline";
  return "noisy";
}

function joinText(a: string, b: string): string {
  return `${a} ${b}`.trim();
}

// ── Deepgram fallback ───────────────────────────────────────────────────────

async function startDeepgram(h: Handlers): Promise<VoiceSession> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    throw new VoiceCaptureError(
      "permission",
      err instanceof Error ? err.message : "microphone unavailable",
    );
  }
  const mimeType = MediaRecorder.isTypeSupported("audio/webm")
    ? "audio/webm"
    : "";
  const recorder = mimeType
    ? new MediaRecorder(stream, { mimeType })
    : new MediaRecorder(stream);
  const chunks: Blob[] = [];
  let cancelled = false;
  let stopped = false;

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop());
    if (cancelled) return;
    const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
    try {
      const { transcript } = await transcribe(blob);
      h.onFinal(transcript);
    } catch (err) {
      h.onError(
        new VoiceCaptureError(
          navigator.onLine ? "noisy" : "offline",
          err instanceof Error ? err.message : "transcription failed",
        ),
      );
    }
  };

  recorder.start();

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      if (recorder.state !== "inactive") recorder.stop();
    },
    cancel() {
      cancelled = true;
      if (recorder.state !== "inactive") recorder.stop();
      else stream.getTracks().forEach((t) => t.stop());
    },
  };
}
