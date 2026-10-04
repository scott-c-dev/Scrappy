import type { FreshnessTag } from "@/lib/types";

/* The three freshness tiers a user can state, most urgent first. "Not sure"
   (a null tag) is deliberately not a tier: it shows no label on the chip. */
export interface Tier {
  tag: Exclude<FreshnessTag, null>;
  label: string;
  /* Class names (kept whole so Tailwind finds them): the dot, the label
     text, and the border + background of a selected tier. */
  dot: string;
  ink: string;
  picked: string;
}

export const TIERS: Tier[] = [
  { tag: "going bad", label: "Going bad", dot: "bg-rescue", ink: "text-rescue", picked: "border-rescue bg-rescue-bg" },
  { tag: "use soon", label: "Use soon", dot: "bg-soon", ink: "text-soon-ink", picked: "border-soon bg-soon-bg" },
  { tag: "fresh", label: "Fresh", dot: "bg-fresh", ink: "text-fresh", picked: "border-fresh bg-fresh-bg" },
];

export const tierOf = (tag: FreshnessTag) => TIERS.find((t) => t.tag === tag);

// Going bad or use soon: what the recipes should use up first.
export const onTheClock = (tag: FreshnessTag) => tag === "going bad" || tag === "use soon";
