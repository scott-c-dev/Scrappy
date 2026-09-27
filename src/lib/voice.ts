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

interface Handlers {
  onFinal: (text: string) => void;
  onError: (err: Error) => void;
}

export async function startVoiceCapture(h: Handlers): Promise<VoiceSession> {
  const Recognition = getSpeechRecognition();
  if (Recognition) return startWebSpeech(Recognition, h);
  if (DEEPGRAM_FALLBACK_ENABLED) return startDeepgram(h);
  throw new Error("speech recognition is not supported in this browser");
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

function startWebSpeech(
  Recognition: SpeechRecognitionCtor,
  h: Handlers,
): VoiceSession {
  const rec = new Recognition();
  rec.lang = navigator.language || "en-US";
  rec.continuous = true;
  rec.interimResults = true;

  // Text from earlier runs of `rec` (we restart it after browser-initiated ends).
  let committed = "";
  // Text of the current run, rebuilt from its full results list on each event.
  let current = "";
  let stopped = false;
  let cancelled = false;
  let failed = false;

  rec.onresult = (e) => {
    current = mergeResults(e.results);
    // TODO: temporary — remove with voiceDebug.ts.
    const raw = Array.from(e.results, (r, i) =>
      `${i}${r.isFinal ? "F" : "i"}: ${r[0].transcript}`,
    ).join("\n");
    voiceDebug(
      `[listening] committed: ${committed}\ncurrent: ${current}\n--- raw (idx ${e.resultIndex}) ---\n${raw}`,
    );
  };

  rec.onerror = (e) => {
    // "no-speech" just means silence; let onend resolve with an empty transcript.
    if (e.error === "no-speech" || e.error === "aborted") return;
    failed = true;
    voiceDebug(`[error] ${e.error}`, true);
    if (!cancelled) h.onError(new Error(`speech recognition: ${e.error}`));
  };

  rec.onend = () => {
    if (cancelled || failed) return;
    // Browsers end continuous sessions on their own after a pause; keep
    // listening until the user taps Done.
    if (!stopped) {
      committed = joinText(committed, current);
      current = "";
      voiceDebug(`[restart] committed: ${committed}`);
      rec.start();
      return;
    }
    voiceDebug(`[final] ${joinText(committed, current) || "(empty)"}`);
    h.onFinal(joinText(committed, current));
  };

  rec.start();

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      rec.stop();
    },
    cancel() {
      cancelled = true;
      rec.abort();
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

function joinText(a: string, b: string): string {
  return `${a} ${b}`.trim();
}

// ── Deepgram fallback ───────────────────────────────────────────────────────

async function startDeepgram(h: Handlers): Promise<VoiceSession> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
      h.onError(err instanceof Error ? err : new Error("transcription failed"));
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
