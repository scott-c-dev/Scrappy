/* Browser-side speech capture. Imported only by the client component.

   Primary path: the Web Speech API (SpeechRecognition / webkitSpeechRecognition),
   which transcribes on-device or via the browser vendor with no round trip
   through our server.

   Fallback path: record a short clip with MediaRecorder and, on stop, upload it
   to /api/transcribe (which calls Deepgram server-side). We proxy the audio
   rather than streaming live partials because that needs a short-lived Deepgram
   token, which the provided key isn't permissioned to mint. */

import { transcribe } from "./api";

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

  let finalText = "";
  let interimText = "";
  let stopped = false;
  let cancelled = false;
  let failed = false;

  rec.onresult = (e) => {
    interimText = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interimText += r[0].transcript;
    }
    // TODO: remove before end of day — debug logging of recognition results.
    console.log("[voice] final:", finalText, "| interim:", interimText);
  };

  rec.onerror = (e) => {
    // "no-speech" just means silence; let onend resolve with an empty transcript.
    if (e.error === "no-speech" || e.error === "aborted") return;
    failed = true;
    if (!cancelled) h.onError(new Error(`speech recognition: ${e.error}`));
  };

  rec.onend = () => {
    if (cancelled || failed) return;
    // Browsers end continuous sessions on their own after a pause; keep
    // listening until the user taps Done.
    if (!stopped) {
      rec.start();
      return;
    }
    h.onFinal(`${finalText} ${interimText}`.trim());
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
