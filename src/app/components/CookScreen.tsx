import { cx } from "@/lib/cx";
import { PrimaryButton, SecondaryButton, StickyBar, Spinner } from "./ui";
import type { Dish } from "@/lib/types";

interface CookScreenProps {
  dishes: Dish[];
  cookDish: number;
  cookStep: number;
  imgState: Record<string, "loading" | "ready">;
  imgUrls: Record<string, string>;
  /* The Step pictures setting. Off: text only, and no "no photo needed" note. */
  pictures: boolean;
  onSetDish: (i: number) => void;
  onNext: () => void;
  onPrev: () => void;
}

export function CookScreen({
  dishes,
  cookDish,
  cookStep,
  imgState,
  imgUrls,
  pictures,
  onSetDish,
  onNext,
  onPrev,
}: CookScreenProps) {
  const di = cookDish;
  const stepsArr = dishes[di]?.steps ?? [];
  const step = stepsArr[cookStep] || { text: "", img: false };
  const imgKey = `${di}-${cookStep}`;
  const imgSt = imgState[imgKey];
  const imgUrl = imgUrls[imgKey];
  const curDish = dishes[di] || ({} as Dish);
  const showImage = pictures && step.img;

  const nextLabel =
    cookStep < stepsArr.length - 1
      ? "Next step"
      : di >= dishes.length - 1
        ? "I’m done"
        : "Next dish →";

  const cookDishTabs = dishes.map((d, idx) => ({
    id: d.id,
    label: d.short || d.name,
    idx,
    active: idx === di,
  }));

  return (
    <div className="flex min-h-full flex-col gap-14 px-16 pt-8 pb-6">
      <div className="noscroll flex gap-7 overflow-x-auto pb-2">
        {cookDishTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onSetDish(tab.idx)}
            className={cx(
              "flex-none cursor-pointer rounded-full border px-14 py-8 font-body text-13 font-semibold whitespace-nowrap",
              tab.active
                ? "border-accent bg-accent text-accent-ink"
                : "border-line bg-card text-ink",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-9">
        <div className="flex items-baseline justify-between gap-10">
          <span className="font-label text-11 font-bold tracking-[.06em] whitespace-nowrap text-accent uppercase">
            {"Step " + (cookStep + 1) + " of " + stepsArr.length}
          </span>
          <span className="truncate text-12 text-muted">{curDish.name || ""}</span>
        </div>
        <div className="flex gap-4">
          {stepsArr.map((_, idx) => (
            <span
              key={idx}
              className={cx(
                "h-4 flex-1 rounded-full",
                idx <= cookStep ? "bg-accent" : "bg-line",
              )}
            />
          ))}
        </div>
      </div>
      <div className="py-2">
        <p className="font-display text-26 leading-[1.22] font-bold text-ink">{step.text}</p>
      </div>
      {showImage && (
        <div>
          {imgSt !== "ready" ? (
            <div className="relative flex h-184 w-full flex-col items-center justify-center gap-11 overflow-hidden rounded-tile bg-accent-soft">
              <div className="absolute top-0 bottom-0 left-0 w-[55%] animate-shimmer bg-[linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent)]" />
              <Spinner light className="relative size-30 border-3" />
              <div className="relative font-label text-11 font-bold tracking-[.04em] text-rescue uppercase">
                Sketching this step…
              </div>
            </div>
          ) : (
            <div className="relative flex h-184 w-full items-end overflow-hidden rounded-tile bg-[linear-gradient(135deg,var(--accent-soft),var(--rescue-bg))] p-12">
              {imgUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imgUrl}
                  alt={step.cap || "reference shot"}
                  className="absolute inset-0 size-full object-cover"
                />
              )}
              <span className="relative rounded-inner bg-[rgba(255,255,255,.78)] px-9 py-5 font-label text-10 font-bold tracking-[.04em] text-ink uppercase">
                {step.cap || "reference shot"}
              </span>
            </div>
          )}
        </div>
      )}
      {pictures && !step.img && (
        <div className="flex items-center gap-8 py-2 text-12 text-muted">
          <span className="size-5 flex-none rounded-full bg-fresh" />
          No photo needed here — you&apos;ve got this.
        </div>
      )}
      <div className="flex-1" />
      <StickyBar className="flex gap-10 pt-12 pb-14">
        <SecondaryButton tone="solid" onClick={onPrev} className="px-18 py-14 text-15">
          Back
        </SecondaryButton>
        <PrimaryButton onClick={onNext} className="flex-1 p-14 text-16 shadow-raised">
          {nextLabel}
        </PrimaryButton>
      </StickyBar>
    </div>
  );
}
