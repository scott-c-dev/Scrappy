import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { css } from "@/lib/css";
import type { Ingredient } from "@/lib/types";
import {
  fitsUnit,
  formatNumber,
  KITCHEN_UNITS,
  otherSystem,
  snapAmount,
  SYSTEM_UNITS,
  unitSpec,
  unitWord,
  type UnitSystem,
} from "@/lib/units";
import { TIERS } from "./freshness";

interface AdjustSheetProps {
  ingredient: Ingredient;
  units: UnitSystem;
  onChange: (patch: Partial<Ingredient>) => void;
  onClose: () => void;
}

// Width of one ruler tick, in px.
const TICK = 14;

const round2 = (v: number) => Math.round(v * 100) / 100;

const pill = (on: boolean) =>
  "cursor:pointer;font-family:var(--font-body);font-weight:600;font-size:13px;padding:8px 13px;border-radius:999px;color:var(--ink);border:1px solid " +
  (on ? "var(--accent)" : "var(--line)") +
  ";background:" +
  (on ? "var(--accent-soft)" : "var(--card)");

const sectionLabel = css(
  "font-family:var(--font-label);font-size:11px;letter-spacing:var(--label-tracking);text-transform:var(--label-transform);color:var(--muted);font-weight:700",
);

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
    const left = Math.round((v - spec.step) / spec.step) * TICK;
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
    const v = Math.min(spec.max, round2(spec.step + idx * spec.step));
    if (v !== ing.amount) onChange({ amount: v });
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
  if (!unitRow.includes(ing.unit)) unitRow.push(ing.unit);

  const unitText =
    ing.amount == null ? "" : ing.unit === "pcs" ? "pcs" : unitWord(ing.unit, ing.amount);

  return (
    <div
      style={css(
        "position:absolute;inset:0;z-index:30;display:flex;flex-direction:column;justify-content:flex-end",
      )}
    >
      <div
        onClick={onClose}
        style={css("position:absolute;inset:0;background:rgba(30,20,12,.34)")}
      />
      <div
        className="noscroll"
        style={css(
          "position:relative;max-height:90%;overflow-y:auto;background:var(--paper);border-radius:26px 26px 0 0;padding:14px 20px 22px;display:flex;flex-direction:column;gap:18px;animation:sheetin .32s cubic-bezier(.2,.8,.2,1);box-shadow:0 -10px 40px rgba(0,0,0,.18)",
        )}
      >
        <div
          style={css(
            "width:38px;height:4px;border-radius:2px;background:var(--line);align-self:center",
          )}
        />
        <div
          style={css("display:flex;align-items:center;justify-content:space-between;gap:12px")}
        >
          <div
            style={css(
              "font-family:var(--font-display);font-weight:800;font-size:23px;color:var(--ink)",
            )}
          >
            {ing.name}
          </div>
          <button
            onClick={onClose}
            style={css(
              "cursor:pointer;border:none;background:var(--accent-soft);color:var(--accent);font-family:var(--font-body);font-weight:700;font-size:14px;padding:8px 16px;border-radius:999px",
            )}
          >
            Done
          </button>
        </div>

        <div style={css("display:flex;flex-direction:column;gap:12px")}>
          <span style={sectionLabel}>Amount</span>
          <div style={css("display:flex;flex-direction:column;gap:6px")}>
            <div
              style={css(
                "display:flex;align-items:baseline;justify-content:center;gap:7px;height:48px",
              )}
            >
              <span
                style={css(
                  "font-family:var(--font-display);font-weight:800;font-size:40px;line-height:1;color:var(--ink);font-variant-numeric:tabular-nums",
                )}
              >
                {ing.amount == null ? "As needed" : formatNumber(ing.amount)}
              </span>
              <span style={css("font-size:16px;font-weight:700;color:var(--ink-soft)")}>
                {unitText}
              </span>
            </div>
            <div
              style={css(
                "position:relative;background:var(--card);border:1px solid var(--line);border-radius:var(--radius-sm);overflow:hidden",
              )}
            >
              <div
                ref={rulerRef}
                onScroll={onRulerScroll}
                onPointerDown={onUserScroll}
                onTouchStart={onUserScroll}
                onWheel={onUserScroll}
                aria-label={`Amount in ${ing.unit}`}
                className="noscroll"
                style={css(
                  "display:flex;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-mask-image:linear-gradient(90deg,transparent,#000 22%,#000 78%,transparent);mask-image:linear-gradient(90deg,transparent,#000 22%,#000 78%,transparent);transition:opacity .2s;opacity:" +
                    (ing.amount == null ? ".45" : "1"),
                )}
              >
                <div style={css(`flex:none;width:calc(50% - ${TICK / 2}px)`)} />
                {ticks.map((t) => (
                  <div
                    key={t.v}
                    style={css(
                      `flex:none;width:${TICK}px;height:66px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:5px;padding-bottom:10px;scroll-snap-align:center`,
                    )}
                  >
                    <span
                      style={css(
                        "font-size:11px;font-weight:700;height:13px;line-height:13px;white-space:nowrap;color:" +
                          (t.on ? "var(--accent)" : "var(--muted)"),
                      )}
                    >
                      {t.major ? formatNumber(t.v) : ""}
                    </span>
                    <span
                      style={css(
                        "display:block;width:2px;border-radius:1px;height:" +
                          (t.major ? 24 : 13) +
                          "px;background:" +
                          (t.on ? "var(--accent)" : t.major ? "var(--muted)" : "var(--line)"),
                      )}
                    />
                  </div>
                ))}
                <div style={css(`flex:none;width:calc(50% - ${TICK / 2}px)`)} />
              </div>
              <div
                style={css(
                  "position:absolute;left:50%;bottom:6px;width:3px;height:32px;margin-left:-1.5px;border-radius:2px;background:var(--accent);pointer-events:none",
                )}
              />
              <div
                style={css(
                  "position:absolute;left:50%;top:0;margin-left:-6px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid var(--accent);pointer-events:none",
                )}
              />
            </div>
          </div>
          <div style={css("display:flex;flex-wrap:wrap;gap:7px")}>
            {spec.quick.map((v) => {
              const w = unitWord(ing.unit, v);
              return (
                <button
                  key={v}
                  onClick={() => setAmount(v)}
                  style={css(pill(ing.amount != null && Math.abs(ing.amount - v) < 1e-6))}
                >
                  {formatNumber(v) + (w ? ` ${w}` : "")}
                </button>
              );
            })}
            <button
              onClick={() => setAmount(null)}
              style={css(
                pill(ing.amount == null) +
                  ";border-style:" +
                  (ing.amount == null ? "solid" : "dashed"),
              )}
            >
              As needed
            </button>
          </div>
        </div>

        <div style={css("display:flex;flex-direction:column;gap:10px")}>
          <span style={sectionLabel}>Unit</span>
          <div style={css("display:flex;flex-wrap:wrap;gap:7px;align-items:center")}>
            {unitRow.map((u) => (
              <button key={u} onClick={() => setUnit(u)} style={css(pill(ing.unit === u))}>
                {u}
              </button>
            ))}
            {!moreUnits && (
              <button
                onClick={() => setMoreUnits(true)}
                style={css(
                  "cursor:pointer;border:none;background:none;color:var(--muted);font-family:var(--font-body);font-size:12.5px;font-weight:600;text-decoration:underline;text-underline-offset:3px;padding:4px 2px",
                )}
              >
                More units
              </button>
            )}
          </div>
        </div>

        <div style={css("display:flex;flex-direction:column;gap:10px")}>
          <span style={sectionLabel}>Freshness</span>
          <div style={css("display:flex;gap:7px")}>
            {TIERS.map((t) => {
              const on = ing.tag === t.tag;
              return (
                <button
                  key={t.tag}
                  onClick={() => onChange({ tag: t.tag })}
                  style={css(
                    "flex:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;font-family:var(--font-body);font-weight:700;font-size:13px;padding:11px 6px;border-radius:12px;color:var(--ink);border:" +
                      (on ? `1.5px solid ${t.color}` : "1px solid var(--line)") +
                      ";background:" +
                      (on ? t.bg : "var(--card)"),
                  )}
                >
                  <span
                    style={css(
                      "width:8px;height:8px;border-radius:50%;flex:none;background:" + t.color,
                    )}
                  />
                  {t.label}
                </button>
              );
            })}
          </div>
          <div style={css("display:flex;align-items:center;gap:10px")}>
            <button
              onClick={() => onChange({ tag: null })}
              style={css(
                "flex:none;cursor:pointer;font-family:var(--font-body);font-weight:600;font-size:13px;padding:8px 14px;border-radius:999px;background:transparent;color:" +
                  (ing.tag == null
                    ? "var(--ink);border:1.5px solid var(--ink-soft)"
                    : "var(--muted);border:1px dashed var(--muted)"),
              )}
            >
              Not sure
            </button>
            <span style={css("font-size:12px;color:var(--muted);line-height:1.4")}>
              That&apos;s fine — I&apos;ll go by what usually spoils first.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
