import { cx } from "@/lib/cx";
import type { UnitSystem } from "@/lib/units";

interface SettingsScreenProps {
  units: UnitSystem;
  onUnits: (units: UnitSystem) => void;
  stepPics: boolean;
  onStepPics: (on: boolean) => void;
}

const SYSTEMS: [UnitSystem, string][] = [
  ["metric", "Metric"],
  ["imperial", "Imperial"],
];

const PICS: [boolean, string][] = [
  [true, "On"],
  [false, "Off"],
];

/* Reached only from the home screen: units shape the amounts on the list and
   the recipes, and pictures are generated during cooking, so neither should
   change mid-flow. */
export function SettingsScreen({ units, onUnits, stepPics, onStepPics }: SettingsScreenProps) {
  return (
    <div className="flex animate-slidein flex-col gap-22 px-18 pt-6 pb-24">
      <div className="flex flex-col gap-8">
        <span className="label-caps px-4 text-muted">Cooking</span>
        <div className="overflow-hidden rounded-tile border border-line bg-card">
          <ChoiceRow
            title="Units"
            caption={
              units === "metric" ? "Amounts in g, kg, ml and L" : "Amounts in oz, lb and cups"
            }
            options={SYSTEMS}
            value={units}
            onPick={onUnits}
          />
          <ChoiceRow
            title="Step pictures"
            caption={stepPics ? "Only for the tricky steps" : "Text only — faster, uses less data"}
            options={PICS}
            value={stepPics}
            onPick={onStepPics}
            className="border-t border-line"
          />
        </div>
        <span className="px-4 text-12 leading-[1.45] text-muted">
          Saved on this device. You can still pick any unit for a single item.
        </span>
      </div>
    </div>
  );
}

/* A setting with a title, a caption describing the current choice, and a
   two-option pill. */
function ChoiceRow<T extends string | boolean>({
  title,
  caption,
  options,
  value,
  onPick,
  className,
}: {
  title: string;
  caption: string;
  options: [T, string][];
  value: T;
  onPick: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-12 px-16 py-15", className)}>
      <div className="flex min-w-0 flex-col gap-2">
        <span className="text-15 font-bold text-ink">{title}</span>
        <span className="text-13 leading-[1.4] text-ink-soft">{caption}</span>
      </div>
      <div
        role="radiogroup"
        aria-label={title}
        className="flex gap-4 rounded-full border border-line bg-paper p-4"
      >
        {options.map(([key, label]) => {
          const on = value === key;
          return (
            <button
              key={label}
              role="radio"
              aria-checked={on}
              onClick={() => onPick(key)}
              className={cx(
                "flex-1 cursor-pointer rounded-full p-10 font-body text-14 font-bold",
                on ? "bg-accent text-accent-ink" : "bg-transparent text-ink-soft",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
