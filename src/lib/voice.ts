/* Browser-side speech capture. Records a short clip with MediaRecorder and, on
   stop, uploads it to /api/transcribe (which calls Deepgram server-side and
   returns the transcript). Imported only by the client component.

   Note: we proxy the audio rather than streaming live partials from the browser
   because that needs a short-lived Deepgram token, which the provided key isn't
   permissioned to mint. The trade-off is no interim transcript while speaking. */

import { transcribe } from "./api";

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
