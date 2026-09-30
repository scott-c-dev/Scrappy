import { css } from "@/lib/css";
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
    <div
      style={css(
        "padding:6px 18px 24px;display:flex;flex-direction:column;gap:22px;animation:slidein .28s cubic-bezier(.2,.8,.2,1)",
      )}
    >
      <div style={css("display:flex;flex-direction:column;gap:8px")}>
        <span
          style={css(
            "font-family:var(--font-label);font-size:11px;letter-spacing:var(--label-tracking);text-transform:var(--label-transform);color:var(--muted);font-weight:700;padding:0 4px",
          )}
        >
          Cooking
        </span>
        <div
          style={css(
            "background:var(--card);border:1px solid var(--line);border-radius:var(--radius-sm);overflow:hidden",
          )}
        >
          <div style={css("display:flex;flex-direction:column;gap:12px;padding:15px 16px")}>
            <div style={css("display:flex;flex-direction:column;gap:2px;min-width:0")}>
              <span style={css("font-size:15px;font-weight:700;color:var(--ink)")}>Units</span>
              <span style={css("font-size:12.5px;color:var(--ink-soft);line-height:1.4")}>
                {units === "metric"
                  ? "Amounts in g, kg, ml and L"
                  : "Amounts in oz, lb and cups"}
              </span>
            </div>
            <div
              role="radiogroup"
              aria-label="Units"
              style={css(
                "display:flex;background:var(--paper);border:1px solid var(--line);border-radius:999px;padding:4px;gap:4px",
              )}
            >
              {SYSTEMS.map(([key, label]) => {
                const on = units === key;
                return (
                  <button
                    key={key}
                    role="radio"
                    aria-checked={on}
                    onClick={() => onUnits(key)}
                    style={css(
                      "flex:1;cursor:pointer;border:none;font-family:var(--font-body);font-weight:700;font-size:14px;padding:10px;border-radius:999px;color:" +
                        (on ? "var(--accent-ink)" : "var(--ink-soft)") +
                        ";background:" +
                        (on ? "var(--accent)" : "transparent"),
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <span style={css("font-size:12px;color:var(--muted);line-height:1.45;padding:0 4px")}>
          Saved on this device. You can still pick any unit for a single item.
        </span>
      </div>
    </div>
  );
}
