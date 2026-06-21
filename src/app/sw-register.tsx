"use client";

import { useEffect } from "react";

/* Registers the service worker so the app is installable ("Add to Home
   Screen"). No UI. */
export default function SwRegister() {
  useEffect(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registration failure is non-fatal */
      });
    }
  }, []);
  return null;
}
