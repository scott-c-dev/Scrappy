import { cx } from "@/lib/cx";
import type { UnitSystem } from "@/lib/units";

interface SettingsScreenProps {
  units: UnitSystem;
  onUnits: (units: UnitSystem) => void;
}

const SYSTEMS: [UnitSystem, string][] = [
  ["metric", "Metric"],
  ["imperial", "Imperial"],
];

/* Reached only from the home screen: units shape the amounts on the list and
   the recipes, so they shouldn't change mid-flow. */
export function SettingsScreen({ units, onUnits }: SettingsScreenProps) {
  return (
    <div className="flex animate-slidein flex-col gap-22 px-18 pt-6 pb-24">
      <div className="flex flex-col gap-8">
        <span className="label-caps px-4 text-muted">Cooking</span>
        <div className="overflow-hidden rounded-tile border border-line bg-card">
          <div className="flex flex-col gap-12 px-16 py-15">
            <div className="flex min-w-0 flex-col gap-2">
              <span className="text-15 font-bold text-ink">Units</span>
              <span className="text-13 leading-[1.4] text-ink-soft">
                {units === "metric"
                  ? "Amounts in g, kg, ml and L"
                  : "Amounts in oz, lb and cups"}
              </span>
            </div>
            <div
              role="radiogroup"
              aria-label="Units"
              className="flex gap-4 rounded-full border border-line bg-paper p-4"
            >
              {SYSTEMS.map(([key, label]) => {
                const on = units === key;
                return (
                  <button
                    key={key}
                    role="radio"
                    aria-checked={on}
                    onClick={() => onUnits(key)}
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
        </div>
        <span className="px-4 text-12 leading-[1.45] text-muted">
          Saved on this device. You can still pick any unit for a single item.
        </span>
      </div>
    </div>
  );
}
