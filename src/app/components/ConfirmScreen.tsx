import { cx } from "@/lib/cx";
import type { Ingredient, Prefs } from "@/lib/types";
import type { PrefKey } from "@/lib/prefs";
import { amountText } from "@/lib/units";
import { onTheClock, tierOf } from "./freshness";
import { Mic } from "./Mic";
import { Chip, PrimaryButton, StickyBar, TextButton } from "./ui";

interface ConfirmScreenProps {
  ingredients: Ingredient[];
  prefs: Prefs;
  onAddVoice: () => void;
  onAddType: () => void;
  onRemove: (id: string) => void;
  /* Opens the adjust card (amount, unit, freshness) for an ingredient. */
  onAdjust: (id: string) => void;
  onOpenPref: (key: PrefKey) => void;
  onGenerate: () => void;
}

export function ConfirmScreen({
  ingredients,
  prefs,
  onAddVoice,
  onAddType,
  onRemove,
  onAdjust,
  onOpenPref,
  onGenerate,
}: ConfirmScreenProps) {
  // Only freshness the user stated gets a label; "not sure" shows nothing.
  const enriched = ingredients.map((i) => {
    const tier = tierOf(i.tag);
    const chipLook =
      i.tag === "going bad"
        ? "border-[1.5px] border-rescue bg-rescue-bg"
        : i.tag === "use soon"
          ? "border-[1.5px] border-soon bg-card"
          : "border border-line bg-card";
    return { ...i, tier, chipLook, amount: amountText(i) };
  });

  const urgent = ingredients
    .filter((i) => onTheClock(i.tag))
    .map((i) => i.name.toLowerCase());
  const perishClaim =
    urgent.length === 1
      ? `Your ${urgent[0]} is on the clock — I’ll cook it first.`
      : `Your ${urgent.slice(0, -1).join(", ")} and ${urgent[urgent.length - 1]} are on the clock — I’ll cook them first.`;

  const prefChips: { key: PrefKey; label: string; emph: boolean }[] = [
    {
      key: "servings",
      label: prefs.servings + " " + (prefs.servings === 1 ? "person" : "people"),
      emph: false,
    },
    {
      key: "courses",
      label: prefs.courses + " " + (prefs.courses === 1 ? "dish" : "dishes"),
      emph: false,
    },
    { key: "diet", label: prefs.diet, emph: false },
    { key: "allergy", label: "Allergies: " + prefs.allergy, emph: true },
  ];

  return (
    <>
      <div className="flex animate-risein flex-col gap-15 px-18 pt-10 pb-8">
        <div>
          <span className="label-caps text-accent">Here&apos;s what I heard</span>
          <h2 className="mt-4 font-display text-26 font-extrabold text-ink">
            Sound about right?
          </h2>
          <p className="mt-6 text-14 leading-[1.45] text-ink-soft">
            Tap × to drop anything. Tap an item to change its amount or
            freshness — totally optional.
          </p>
        </div>
        <div className="flex flex-wrap gap-8">
          {enriched.map((ing) => (
            <div
              key={ing.id}
              role="button"
              tabIndex={0}
              onClick={() => onAdjust(ing.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onAdjust(ing.id);
              }}
              className={cx(
                "press flex cursor-pointer items-start gap-10 rounded-tile py-9 pr-11 pl-13 select-none",
                ing.chipLook,
              )}
            >
              <div className="flex min-w-0 flex-col gap-4">
                <span className="text-14 font-bold text-ink">{ing.name}</span>
                <span className="flex flex-wrap items-center gap-8">
                  <span className="border-b border-dashed border-muted text-12 leading-[1.25] font-semibold text-ink-soft">
                    {ing.amount}
                  </span>
                  {ing.tier && (
                    <span
                      className={cx(
                        "inline-flex items-center gap-5 font-label text-10 font-bold tracking-[.05em] uppercase",
                        ing.tier.ink,
                      )}
                    >
                      <span className={cx("inline-block size-6 flex-none rounded-full", ing.tier.dot)} />
                      {ing.tier.label}
                    </span>
                  )}
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(ing.id);
                }}
                aria-label="Remove"
                className="cursor-pointer self-start bg-transparent pt-2 pb-4 text-16 leading-none text-muted"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        {urgent.length > 0 && (
          <div className="flex items-start gap-11 rounded-tile border border-rescue bg-rescue-bg px-14 py-13">
            <span className="mt-4 size-9 flex-none rounded-full bg-rescue shadow-[0_0_0_4px_rgba(192,122,27,.16)]" />
            <div>
              <div className="text-14 leading-[1.35] font-bold text-ink">{perishClaim}</div>
              <div className="mt-3 text-12 text-ink-soft">
                No waste, no guilt trip — just first in line.
              </div>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-14">
          <button
            onClick={onAddVoice}
            className="inline-flex cursor-pointer items-center gap-7 rounded-full border border-dashed border-accent bg-transparent px-14 py-8 font-body text-13 font-bold text-accent"
          >
            <Mic size={14} sw={2.2} />
            Add more by voice
          </button>
          <TextButton onClick={onAddType} className="p-2 text-13 text-muted">
            or type it
          </TextButton>
        </div>
        <div className="my-2 h-1 bg-line" />
        <div>
          <span className="label-caps text-muted">A few defaults — tap to change</span>
          <div className="mt-11 flex flex-wrap gap-8">
            {prefChips.map((pc) => (
              <Chip
                key={pc.key}
                on={pc.emph}
                onClick={() => onOpenPref(pc.key)}
                className="inline-flex items-center gap-7 px-13 py-9 text-13"
              >
                {pc.label}
                <span className="text-11 font-semibold text-muted">edit</span>
              </Chip>
            ))}
          </div>
        </div>
      </div>
      <StickyBar className="px-18 pt-12 pb-16">
        <PrimaryButton onClick={onGenerate} className="w-full p-15 text-16 shadow-raised">
          Find me recipes
        </PrimaryButton>
      </StickyBar>
    </>
  );
}
