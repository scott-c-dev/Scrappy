/* TEMPORARY on-screen log of speech recognition, for phones where the devtools
   console isn't reachable. Shown only when the page was opened with
   `?voicedebug` (remembered for the tab). Delete this file and its calls in
   voice.ts once mobile STT is verified. */

const HUD_ID = "__voice_debug";
const FLAG_KEY = "voicedebug";

function enabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).has(FLAG_KEY)) {
      sessionStorage.setItem(FLAG_KEY, "1");
      return true;
    }
    return sessionStorage.getItem(FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function voiceDebug(text: string, isError = false): void {
  console.log("[voice]", text);
  if (!enabled()) return;
  let el = document.getElementById(HUD_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = HUD_ID;
    el.style.cssText =
      "position:fixed;top:12px;left:12px;right:12px;padding:10px 12px;" +
      "background:rgba(15,23,42,0.92);font:12px/1.5 monospace;" +
      "border-radius:10px;z-index:999999;word-break:break-word;" +
      "white-space:pre-wrap;pointer-events:none;";
    document.body.appendChild(el);
  }
  el.style.color = isError ? "#f87171" : "#4ade80";
  el.innerText = text;
}
