import { cx } from "@/lib/cx";
import type { Dish, FreshnessTag, Ingredient } from "@/lib/types";
import { countLabel, footerLine, itemsOf, loadingLine, pantryLine, topClaim } from "./dishCopy";
import { onTheClock } from "./freshness";
import { SwapIcon } from "./SwapSheet";
import { PrimaryButton, Spinner, StickyBar } from "./ui";

interface DishesScreenProps {
  loading: boolean;
  dishes: Dish[];
  replacingId: string | null;
  ingredients: Ingredient[];
  onSwap: (id: string) => void;
  onStartCook: () => void;
}

export function DishesScreen({
  loading,
  dishes,
  replacingId,
  ingredients,
  onSwap,
  onStartCook,
}: DishesScreenProps) {
  if (loading) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-20 px-30 py-40 text-center">
        <Spinner className="size-62 border-4" />
        <div>
          <div className="font-display text-22 font-extrabold text-ink">
            Raiding your fridge…
          </div>
          <div className="mt-8 max-w-250 text-14 leading-[1.45] text-ink-soft">
            {loadingLine(ingredients)}
          </div>
        </div>
      </div>
    );
  }

  const urgent = dishes.some((d) => itemsOf(d, ingredients).some((i) => onTheClock(i.tag)));
  const dot = urgent ? "bg-rescue" : "bg-fresh";

  return (
    <>
      <div className="flex animate-risein flex-col gap-13 px-18 pt-10 pb-8">
        <div className="flex items-start gap-11 rounded-tile bg-fresh-bg px-14 py-13">
          <span className={cx("mt-4 size-9 flex-none rounded-full", dot)} />
          <div className="text-14 leading-[1.35] font-bold text-ink">
            {topClaim(dishes, ingredients)}
          </div>
        </div>
        <span className="label-caps text-muted">{countLabel(dishes.length)}</span>
        {dishes.map((d) => (
          <div
            key={d.id}
            className="relative flex flex-col gap-11 rounded-card border border-line bg-card p-16 shadow-raised"
          >
            <div className="flex items-start justify-between gap-10">
              <div className="min-w-0">
                <h3 className="font-display text-22 leading-[1.1] font-extrabold text-ink">
                  {d.name}
                </h3>
                <p className="mt-5 text-13 leading-[1.4] text-ink-soft">{d.blurb}</p>
              </div>
              <button
                onClick={() => onSwap(d.id)}
                className="inline-flex flex-none cursor-pointer items-center gap-5 rounded-full border border-line bg-paper px-11 py-7 font-body text-12 font-semibold text-ink"
              >
                <SwapIcon size={12} />
                Swap
              </button>
            </div>
            <div className="flex flex-col gap-7">
              <div className="flex flex-wrap gap-6">
                {itemsOf(d, ingredients).map((i) => (
                  <span key={i.id} className={cx(CHIP_BASE, CHIP[tierKey(i.tag)])}>
                    {i.tag && <span className={cx("size-6 flex-none rounded-full", DOT[i.tag])} />}
                    {i.name}
                  </span>
                ))}
              </div>
              {d.pantry.length > 0 && (
                <span className="text-12 leading-[1.4] text-muted">{pantryLine(d.pantry)}</span>
              )}
            </div>
            {replacingId === d.id && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-11 rounded-card bg-card">
                <Spinner className="size-32 border-3" />
                <div className="text-13 font-semibold text-ink-soft">Finding another one…</div>
              </div>
            )}
          </div>
        ))}
        {/* Faded while a swap is out, so it never shows a count that's about to change. */}
        <div
          className={cx(
            "flex items-center justify-center gap-8 pt-4 pb-2 text-center text-13 text-muted transition-opacity duration-200",
            replacingId && "opacity-45",
          )}
        >
          <span className={cx("size-6 flex-none rounded-full", dot)} />
          {footerLine(dishes, ingredients)}
        </div>
      </div>
      <StickyBar className="px-18 pt-12 pb-16">
        <PrimaryButton onClick={onStartCook} className="w-full p-15 text-16 shadow-raised">
          Let&apos;s cook these
        </PrimaryButton>
      </StickyBar>
    </>
  );
}

/* Chip weight follows urgency: going bad keeps the confirm screen's fill and
   heavier border; fresh gets only its dot, so cards don't turn green; not
   sure is the plainest chip. */
const CHIP_BASE = "inline-flex items-center gap-5 rounded-full text-12 leading-[1.2]";
const CHIP = {
  "going bad": "border-[1.5px] border-rescue bg-rescue-bg px-8.5 py-3.5 font-bold text-ink",
  "use soon": "border border-soon bg-soon-bg px-9 py-4 font-semibold text-ink",
  fresh: "border border-line bg-paper px-9 py-4 font-medium text-ink",
  "not sure": "border border-line bg-paper px-9 py-4 text-ink-soft",
};
const DOT = { "going bad": "bg-rescue", "use soon": "bg-soon", fresh: "bg-fresh" };
const tierKey = (tag: FreshnessTag) => tag ?? "not sure";
