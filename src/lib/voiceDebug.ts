/* TEMPORARY on-screen log of speech recognition events, for phones where the
   devtools console isn't reachable (issue #9, iOS voice input going deaf).
   Turned on by opening the page with `?voicedebug`, or — in the installed
   home-screen app, which has no URL bar — by tapping the "Scrappy" title 5
   times quickly (the same again turns it off). The setting is remembered on
   this device. Delete this file and its calls once the issue is verified. */

const HUD_ID = "__voice_debug";
const FLAG_KEY = "voicedebug";
const MAX_LINES = 40;

const lines: string[] = [];
let t0 = 0;

function enabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).has(FLAG_KEY)) {
      localStorage.setItem(FLAG_KEY, "1");
      return true;
    }
    return localStorage.getItem(FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

function render(): void {
  let el = document.getElementById(HUD_ID);
  if (!enabled()) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("div");
    el.id = HUD_ID;
    el.style.cssText =
      "position:fixed;top:max(12px,env(safe-area-inset-top));left:12px;right:12px;" +
      "max-height:45vh;overflow:hidden;padding:8px 10px;" +
      "background:rgba(15,23,42,0.92);color:#4ade80;font:11px/1.4 monospace;" +
      "border-radius:10px;z-index:999999;word-break:break-word;" +
      "white-space:pre-wrap;pointer-events:none;";
    document.body.appendChild(el);
  }
  el.innerHTML = "";
  for (const line of lines.slice(-MAX_LINES)) {
    const row = document.createElement("div");
    row.textContent = line.replace(/^!/, "");
    if (line.startsWith("!")) row.style.color = "#f87171";
    el.appendChild(row);
  }
  el.scrollTop = el.scrollHeight;
}

export function voiceDebug(text: string, isError = false): void {
  console.log("[voice]", text);
  const now = performance.now();
  if (!t0) t0 = now;
  const secs = ((now - t0) / 1000).toFixed(2).padStart(6);
  lines.push(`${isError ? "!" : ""}${secs} ${text}`);
  if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
  render();
}

let taps: number[] = [];

/* Five taps within 2 s flips the overlay on or off. */
export function voiceDebugTap(): void {
  const now = Date.now();
  taps = [...taps.filter((t) => now - t < 2000), now];
  if (taps.length < 5) return;
  taps = [];
  try {
    if (enabled()) localStorage.removeItem(FLAG_KEY);
    else localStorage.setItem(FLAG_KEY, "1");
  } catch {}
  if (enabled()) voiceDebug("voice debug on");
  else render();
}
