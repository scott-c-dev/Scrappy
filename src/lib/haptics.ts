/* A light haptic tick, as a bonus: phones that can't do it just stay silent.

   Android (Chrome) supports the Vibration API; pulses are kept very short so
   they feel like a tick, not a buzz. iPhone Safari has no web haptics API.
   (The old iOS 18 trick of flipping a hidden <input switch> no longer plays a
   haptic on iOS 27, so there's no fallback.) */

export type TickStrength = "light" | "strong";

const PULSE_MS: Record<TickStrength, number> = { light: 6, strong: 14 };

// Ticks closer together than this blur into a buzz; drop the extras.
const MIN_GAP_MS = 35;
let lastTick = 0;

export function hapticTick(strength: TickStrength = "light"): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  const now = performance.now();
  if (now - lastTick < MIN_GAP_MS) return;
  lastTick = now;
  try {
    navigator.vibrate(PULSE_MS[strength]);
  } catch {}
}
