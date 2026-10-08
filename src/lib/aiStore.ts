/* Where the user's AI settings live on the device: localStorage when
   "Remember on this device" is on, otherwise sessionStorage, which the
   browser clears when the tab closes.

   It's a small store for useSyncExternalStore: the server has no settings,
   so the first render says "not loaded" (undefined) and the browser then
   reads them — no hydration mismatch. Other tabs' changes come through too. */

import type { AiSettings } from "./ai";

const KEY = "scrappy.ai";
const listeners = new Set<() => void>();
let cached: AiSettings | null | undefined;

function read(store: Storage): AiSettings | null {
  try {
    const v = JSON.parse(store.getItem(KEY) || "null");
    return v && typeof v === "object" && typeof v.provider === "string" ? (v as AiSettings) : null;
  } catch {
    return null;
  }
}

/* The saved settings, or null when there are none. */
export function getAi(): AiSettings | null {
  if (cached === undefined) {
    try {
      cached = read(localStorage) ?? read(sessionStorage);
    } catch {
      cached = null;
    }
  }
  return cached;
}

/* Before the browser has read them. */
export const getServerAi = (): AiSettings | null | undefined => undefined;

export function subscribeAi(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    cached = undefined;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function changed(ai: AiSettings | null) {
  cached = ai;
  listeners.forEach((l) => l());
}

export function storeAi(ai: AiSettings): void {
  try {
    (ai.remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(ai));
    (ai.remember ? sessionStorage : localStorage).removeItem(KEY);
  } catch {}
  changed(ai);
}

export function clearAi(): void {
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch {}
  changed(null);
}
