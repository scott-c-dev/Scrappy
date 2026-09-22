import type { CSSProperties } from "react";

/* Converts a CSS string ("display:flex;gap:8px") into a React style object.
   CSS custom properties (--foo) are kept verbatim; everything else is camelCased.
   Used throughout the app to preserve the designer's pixel values 1:1. */
export function css(s: string): CSSProperties {
  const o: Record<string, string> = {};
  for (const decl of s.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    if (!prop) continue;
    const val = decl.slice(i + 1).trim();
    o[
      prop.startsWith("--")
        ? prop
        : prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
    ] = val;
  }
  return o as CSSProperties;
}
