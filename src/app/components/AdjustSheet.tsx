import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cx } from "@/lib/cx";
import type { Ingredient } from "@/lib/types";
import {
  fitsUnit,
  formatNumber,
  isCustomUnit,
  KITCHEN_UNITS,
  otherSystem,
  snapAmount,
  SYSTEM_UNITS,
  unitSpec,
  unitWord,
  type UnitSystem,
} from "@/lib/units";
import { hapticTick } from "@/lib/haptics";
import { TIERS } from "./freshness";
import { Chip, Sheet, TextButton } from "./ui";

interface AdjustSheetProps {
  ingredient: Ingredient;
  units: UnitSystem;
  onChange: (patch: Partial<Ingredient>) => void;
  onClose: () => void;
}

// Width of one ruler tick, in px.
const TICK = 14;

const round2 = (v: number) => Math.round(v * 100) / 100;

const PILL = "px-13 py-8 text-13";

/* Amount, unit and freshness for one ingredient. Every change applies at
   once; tapping outside or Done just closes. */
export function AdjustSheet({ ingredient: ing, units, onChange, onClose }: AdjustSheetProps) {
  const [moreUnits, setMoreUnits] = useState(false);
  const spec = unitSpec(ing.unit);

  // ── Ruler ────────────────────────────────────────────────────────────────
  // The ruler is a snapping horizontal scroller; its scroll position is the
  // amount. When the amount changes from elsewhere (opening, a quick pick, a
  // new unit) we scroll it into place, and ignore scroll events until our
  // own scroll arrives — its in-between positions aren't the user's choice.
  // Any other scrolling (touch, wheel, keyboard…) sets the amount.
  const rulerRef = useRef<HTMLDivElement>(null);
  const pendingSync = useRef<"instant" | "smooth" | null>("instant");
  const scrollTarget = useRef<number | null>(null);
  const giveUpTimer = useRef<number | undefined>(undefined);
  // The mark the ruler is showing. Only moving to a different mark is a
  // choice: with "As needed" the ruler parks on the default mark, and a stray
  // scroll event there (snap settling, duplicates) must not pick it.
  const shownMark = useRef(0);
  // The user grabbing the ruler interrupts our scroll; from then on it's theirs.
  const onUserScroll = () => {
    scrollTarget.current = null;
  };

  useLayoutEffect(() => {
    const el = rulerRef.current;
    const mode = pendingSync.current;
    if (!el || !mode) return;
    pendingSync.current = null;
    const v = ing.amount ?? spec.def;
    shownMark.current = Math.round((v - spec.step) / spec.step);
    const left = shownMark.current * TICK;
    // Already there: no scroll event will come to clear the target.
    if (Math.abs(el.scrollLeft - left) < 1) return;
    scrollTarget.current = left;
    if (mode === "smooth") el.scrollTo({ left, behavior: "smooth" });
    else el.scrollLeft = left;
    // If our scroll never arrives (cancelled, or the page is hidden), stop
    // waiting so later scrolling isn't ignored.
    window.clearTimeout(giveUpTimer.current);
    giveUpTimer.current = window.setTimeout(() => {
      if (scrollTarget.current === left) scrollTarget.current = null;
    }, 1000);
  });

  useEffect(() => () => window.clearTimeout(giveUpTimer.current), []);

  const onRulerScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = scrollTarget.current;
    if (target != null) {
      // Snapping can stop a few px short of the exact target.
      if (Math.abs(e.currentTarget.scrollLeft - target) <= TICK / 2) scrollTarget.current = null;
      return;
    }
    const idx = Math.round(e.currentTarget.scrollLeft / TICK);
    if (idx === shownMark.current) return;
    shownMark.current = idx;
    const v = Math.min(spec.max, round2(spec.step + idx * spec.step));
    if (v === ing.amount) return;
    // A tick per value, a firmer one on the labelled marks, like a dial.
    const major = Math.abs(v / spec.label - Math.round(v / spec.label)) < 1e-6;
    hapticTick(major ? "strong" : "light");
    onChange({ amount: v });
  };

  const setAmount = (v: number | null) => {
    pendingSync.current = "smooth";
    onChange({ amount: v == null ? null : snapAmount(ing.unit, v) });
  };

  // A new unit keeps the number if it still makes sense, else starts from
  // that unit's usual amount (2 pcs → g gives 200 g, not 2 g).
  const setUnit = (unit: string) => {
    if (unit === ing.unit) return;
    const amount =
      ing.amount == null || fitsUnit(unit, ing.amount) ? ing.amount : unitSpec(unit).def;
    pendingSync.current = "instant";
    onChange({ unit, amount });
  };

  const tickCount = Math.round((spec.max - spec.step) / spec.step) + 1;
  const ticks = Array.from({ length: tickCount }, (_, k) => {
    const v = round2(spec.step + k * spec.step);
    const major = Math.abs(v / spec.label - Math.round(v / spec.label)) < 1e-6;
    const on = ing.amount != null && Math.abs(v - ing.amount) < 1e-6;
    return { v, major, on };
  });

  // ── Units offered ──────────────────────────────────────────────────────
  // pcs + this system's units (+ the other system's, on request) + kitchen
  // words — plus whatever unit the user actually said.
  const other = otherSystem(units);
  const unitRow = ["pcs", ...SYSTEM_UNITS[units]];
  if (moreUnits) unitRow.push(...SYSTEM_UNITS[other]);
  else if (SYSTEM_UNITS[other].includes(ing.unit)) unitRow.push(ing.unit);
  unitRow.push(...KITCHEN_UNITS);
  // A custom unit the user said stays on offer even after switching away.
  const said = isCustomUnit(ing.saidUnit) ? ing.saidUnit : null;
  if (said && !unitRow.includes(said)) unitRow.push(said);
  if (!unitRow.includes(ing.unit)) unitRow.push(ing.unit);

  const unitText =
    ing.amount == null ? "" : ing.unit === "pcs" ? "pcs" : unitWord(ing.unit, ing.amount);

  return (
    <Sheet onClose={onClose} className="noscroll max-h-[90%] gap-18 overflow-y-auto px-20 pt-14 pb-22">
      <div className="h-4 w-38 self-center rounded-[2px] bg-line" />
      <div className="flex items-center justify-between gap-12">
        <div className="font-display text-[23px] font-extrabold text-ink">{ing.name}</div>
        <button
          onClick={onClose}
          className="cursor-pointer rounded-full bg-accent-soft px-16 py-8 font-body text-14 font-bold text-accent"
        >
          Done
        </button>
      </div>

      <div className="flex flex-col gap-12">
        <span className="label-caps text-muted">Amount</span>
        <div className="flex flex-col gap-6">
          <div className="flex h-48 items-baseline justify-center gap-7">
            <span className="font-display text-[40px] leading-none font-extrabold text-ink tabular-nums">
              {ing.amount == null ? "As needed" : formatNumber(ing.amount)}
            </span>
            <span className="text-16 font-bold text-ink-soft">{unitText}</span>
          </div>
          <div className="relative overflow-hidden rounded-tile border border-line bg-card">
            <div
              ref={rulerRef}
              onScroll={onRulerScroll}
              onPointerDown={onUserScroll}
              onTouchStart={onUserScroll}
              onWheel={onUserScroll}
              aria-label={`Amount in ${ing.unit}`}
              className={cx(
                "noscroll flex snap-x snap-mandatory overflow-x-auto [transition:opacity_.2s] [mask-image:linear-gradient(90deg,transparent,#000_22%,#000_78%,transparent)]",
                ing.amount == null && "opacity-45",
              )}
            >
              <div className="flex-none" style={{ width: `calc(50% - ${TICK / 2}px)` }} />
              {ticks.map((t) => (
                <div
                  key={t.v}
                  className="flex h-66 flex-none snap-center flex-col items-center justify-end gap-5 pb-10"
                  style={{ width: TICK }}
                >
                  <span
                    className={cx(
                      "h-13 text-11 leading-[13px] font-bold whitespace-nowrap",
                      t.on ? "text-accent" : "text-muted",
                    )}
                  >
                    {t.major ? formatNumber(t.v) : ""}
                  </span>
                  <span
                    className={cx(
                      "block w-2 rounded-[1px]",
                      t.major ? "h-24" : "h-13",
                      t.on ? "bg-accent" : t.major ? "bg-muted" : "bg-line",
                    )}
                  />
                </div>
              ))}
              <div className="flex-none" style={{ width: `calc(50% - ${TICK / 2}px)` }} />
            </div>
            <div className="pointer-events-none absolute bottom-6 left-1/2 -ml-[1.5px] h-32 w-3 rounded-[2px] bg-accent" />
            <div className="pointer-events-none absolute top-0 left-1/2 -ml-6 size-0 border-x-6 border-t-7 border-x-transparent border-t-accent" />
          </div>
        </div>
        <div className="flex flex-wrap gap-7">
          {spec.quick.map((v) => {
            const w = unitWord(ing.unit, v);
            return (
              <Chip
                key={v}
                on={ing.amount != null && Math.abs(ing.amount - v) < 1e-6}
                onClick={() => setAmount(v)}
                className={PILL}
              >
                {formatNumber(v) + (w ? ` ${w}` : "")}
              </Chip>
            );
          })}
          <Chip
            on={ing.amount == null}
            onClick={() => setAmount(null)}
            className={cx(PILL, ing.amount != null && "border-dashed")}
          >
            As needed
          </Chip>
        </div>
      </div>

      <div className="flex flex-col gap-10">
        <span className="label-caps text-muted">Unit</span>
        <div className="flex flex-wrap items-center gap-7">
          {unitRow.map((u) => (
            <Chip key={u} on={ing.unit === u} onClick={() => setUnit(u)} className={PILL}>
              {u}
            </Chip>
          ))}
          {!moreUnits && (
            <TextButton
              onClick={() => setMoreUnits(true)}
              className="px-2 py-4 text-[12.5px] text-muted"
            >
              More units
            </TextButton>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-10">
        <span className="label-caps text-muted">Freshness</span>
        <div className="flex gap-7">
          {TIERS.map((t) => {
            const on = ing.tag === t.tag;
            return (
              <button
                key={t.tag}
                onClick={() => onChange({ tag: t.tag })}
                className={cx(
                  "inline-flex flex-1 cursor-pointer items-center justify-center gap-6 rounded-[12px] px-6 py-11 font-body text-13 font-bold text-ink",
                  on ? cx("border-[1.5px]", t.picked) : "border border-line bg-card",
                )}
              >
                <span className={cx("size-8 flex-none rounded-full", t.dot)} />
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-10">
          <button
            onClick={() => onChange({ tag: null })}
            className={cx(
              "flex-none cursor-pointer rounded-full bg-transparent px-14 py-8 font-body text-13 font-semibold",
              ing.tag == null
                ? "border-[1.5px] border-ink-soft text-ink"
                : "border border-dashed border-muted text-muted",
            )}
          >
            Not sure
          </button>
          <span className="text-12 leading-[1.4] text-muted">
            That&apos;s fine — I&apos;ll go by what usually spoils first.
          </span>
        </div>
      </div>
    </Sheet>
  );
}
