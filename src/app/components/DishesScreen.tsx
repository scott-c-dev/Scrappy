import type { Dish } from "@/lib/types";
import { SwapIcon } from "./SwapSheet";
import { PrimaryButton, Spinner, StickyBar } from "./ui";

interface DishesScreenProps {
  loading: boolean;
  dishes: Dish[];
  replacingId: string | null;
  goingBad: string[];
  rescueCount: number;
  onSwap: (id: string) => void;
  onStartCook: () => void;
}

export function DishesScreen({
  loading,
  dishes,
  replacingId,
  goingBad,
  rescueCount,
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
            Putting the cabbage and tofu at the front of the queue. Two seconds.
          </div>
        </div>
      </div>
    );
  }

  const topClaim = goingBad.length
    ? "These lean on your " +
      goingBad.join(" & ").toLowerCase() +
      " first — the stuff on the clock."
    : "Three quick things from what you’ve got.";
  const rescueLine =
    "That’s " + rescueCount + " things saved from the bin today. Not bad.";

  return (
    <>
      <div className="flex animate-risein flex-col gap-13 px-18 pt-10 pb-8">
        <div className="flex items-start gap-11 rounded-tile bg-fresh-bg px-14 py-13">
          <span className="mt-4 size-9 flex-none rounded-full bg-fresh" />
          <div className="text-14 leading-[1.35] font-bold text-ink">{topClaim}</div>
        </div>
        <span className="label-caps text-muted">3 dishes · no extra shopping</span>
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
            <div className="flex flex-wrap items-center gap-8 rounded-inner bg-rescue-bg px-11 py-7">
              <span className="font-label text-10 font-bold tracking-[.05em] text-rescue uppercase">
                Uses up
              </span>
              <span className="text-13 font-bold text-ink">
                {(d.rescue || []).join(" · ")}
              </span>
            </div>
            <div className="flex flex-wrap gap-6">
              {d.uses.map((u, ui) => (
                <span
                  key={ui}
                  className="rounded-full border border-line bg-paper px-9 py-4 text-12 text-ink-soft"
                >
                  {u}
                </span>
              ))}
            </div>
            {replacingId === d.id && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-11 rounded-card bg-card">
                <Spinner className="size-32 border-3" />
                <div className="text-13 font-semibold text-ink-soft">Finding another one…</div>
              </div>
            )}
          </div>
        ))}
        <div className="flex items-center justify-center gap-8 pt-4 pb-2 text-center text-13 text-muted">
          <span className="size-6 flex-none rounded-full bg-fresh" />
          {rescueLine}
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
