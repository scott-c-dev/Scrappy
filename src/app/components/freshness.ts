import type { FreshnessTag } from "@/lib/types";

/* The three freshness tiers a user can state, most urgent first. "Not sure"
   (a null tag) is deliberately not a tier: it shows no label on the chip. */
export interface Tier {
  tag: Exclude<FreshnessTag, null>;
  label: string;
  /* Dot and border colour, label colour, selected background. */
  color: string;
  ink: string;
  bg: string;
}

export const TIERS: Tier[] = [
  { tag: "going bad", label: "Going bad", color: "var(--rescue)", ink: "var(--rescue)", bg: "var(--rescue-bg)" },
  { tag: "use soon", label: "Use soon", color: "var(--soon)", ink: "var(--soon-ink)", bg: "var(--soon-bg)" },
  { tag: "fresh", label: "Fresh", color: "var(--fresh)", ink: "var(--fresh)", bg: "var(--fresh-bg)" },
];

export const tierOf = (tag: FreshnessTag) => TIERS.find((t) => t.tag === tag);

// Going bad or use soon: what the recipes should use up first.
export const onTheClock = (tag: FreshnessTag) => tag === "going bad" || tag === "use soon";
