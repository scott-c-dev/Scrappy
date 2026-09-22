import { css } from "@/lib/css";
import type { Ingredient, Prefs } from "@/lib/types";
import type { PrefKey } from "@/lib/prefs";
import { Mic } from "./Mic";

interface ConfirmScreenProps {
  ingredients: Ingredient[];
  prefs: Prefs;
  onAddVoice: () => void;
  onRemove: (id: string) => void;
  onCycleFreshness: (id: string) => void;
  onOpenPref: (key: PrefKey) => void;
  onGenerate: () => void;
}

export function ConfirmScreen({
  ingredients,
  prefs,
  onAddVoice,
  onRemove,
  onCycleFreshness,
  onOpenPref,
  onGenerate,
}: ConfirmScreenProps) {
  const enriched = ingredients.map((i) => {
    const strong = i.tag === "going bad";
    const soon = i.tag === "use soon";
    const chipStyle =
      "display:flex;align-items:flex-start;gap:9px;padding:9px 11px 9px 13px;border-radius:14px;" +
      (strong
        ? "background:var(--rescue-bg);border:1.5px solid var(--rescue);"
        : soon
          ? "background:var(--card);border:1px solid var(--accent-soft);"
          : "background:var(--card);border:1px solid var(--line);");
    const tagStyle =
      "display:inline-flex;align-items:center;gap:5px;font-family:var(--font-label);font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;font-weight:700;" +
      (strong ? "color:var(--rescue);" : "color:var(--muted);");
    const dotStyle =
      "width:5px;height:5px;border-radius:50%;display:inline-block;background:" +
      (strong ? "var(--rescue)" : "var(--muted)");
    return { ...i, chipStyle, tagStyle, dotStyle };
  });

  const perishNames = ingredients
    .filter((i) => i.tag === "going bad")
    .map((i) => i.name);
  const perishClaim = perishNames.length
    ? perishNames.join(" and ") +
      " are on their way out — I’ll build around them first."
    : "Nothing urgent in here — I’ll just cook you something good.";

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
      <div
        style={css(
          "padding:10px 18px 8px;display:flex;flex-direction:column;gap:15px;animation:risein .4s ease",
        )}
      >
        <div>
          <span
            style={css(
              "font-family:var(--font-label);font-size:11px;letter-spacing:var(--label-tracking);text-transform:var(--label-transform);color:var(--accent);font-weight:700",
            )}
          >
            Here&apos;s what I heard
          </span>
          <h2
            style={css(
              "font-family:var(--font-display);font-weight:800;font-size:27px;margin:4px 0 0;color:var(--ink)",
            )}
          >
            Sound about right?
          </h2>
          <p
            style={css(
              "font-size:13.5px;color:var(--ink-soft);margin:6px 0 0;line-height:1.45",
            )}
          >
            Tap × to drop anything. Amounts are a guess — “as needed” is
            fine.
          </p>
        </div>
        <div style={css("display:flex;flex-wrap:wrap;gap:8px")}>
          {enriched.map((ing) => (
            <div key={ing.id} style={css(ing.chipStyle)}>
              <div
                onClick={() => onCycleFreshness(ing.id)}
                title="Tap to change freshness"
                style={css(
                  "cursor:pointer;display:flex;flex-direction:column;gap:2px;min-width:0",
                )}
              >
                <span style={css("font-size:14px;font-weight:700;color:var(--ink)")}>
                  {ing.name}
                </span>
                <span style={css("display:flex;align-items:center;gap:7px")}>
                  <span style={css("font-size:12px;color:var(--muted)")}>
                    {ing.qty}
                  </span>
                  {ing.tag ? (
                    <span style={css(ing.tagStyle)}>
                      <span style={css(ing.dotStyle)} />
                      {ing.tag}
                    </span>
                  ) : (
                    <span
                      style={css(
                        "font-family:var(--font-label);font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;font-weight:700;color:var(--muted);opacity:.7",
                      )}
                    >
                      fresh
                    </span>
                  )}
                </span>
              </div>
              <button
                onClick={() => onRemove(ing.id)}
                aria-label="Remove"
                style={css(
                  "cursor:pointer;border:none;background:none;color:var(--muted);font-size:17px;line-height:1;padding:2px 0 4px;align-self:flex-start",
                )}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        {perishNames.length > 0 && (
          <div
            style={css(
              "display:flex;gap:11px;align-items:flex-start;background:var(--rescue-bg);border:1px solid var(--rescue);border-radius:var(--radius-sm);padding:13px 14px",
            )}
          >
            <span
              style={css(
                "width:9px;height:9px;border-radius:50%;background:var(--rescue);margin-top:4px;flex:none;box-shadow:0 0 0 4px rgba(192,122,27,.16)",
              )}
            />
            <div>
              <div
                style={css(
                  "font-size:14px;font-weight:700;color:var(--ink);line-height:1.35",
                )}
              >
                {perishClaim}
              </div>
              <div
                style={css("font-size:12px;color:var(--ink-soft);margin-top:3px")}
              >
                No waste, no guilt trip — just first in line.
              </div>
            </div>
          </div>
        )}
        <button
          onClick={onAddVoice}
          style={css(
            "align-self:flex-start;cursor:pointer;display:inline-flex;align-items:center;gap:7px;border:1px dashed var(--accent);background:none;color:var(--accent);font-family:var(--font-body);font-weight:700;font-size:13px;padding:8px 14px;border-radius:999px",
          )}
        >
          <Mic size={14} sw={2.2} />
          Add more by voice
        </button>
        <div style={css("height:1px;background:var(--line);margin:2px 0")} />
        <div>
          <span
            style={css(
              "font-family:var(--font-label);font-size:11px;letter-spacing:var(--label-tracking);text-transform:var(--label-transform);color:var(--muted);font-weight:700",
            )}
          >
            A few defaults — tap to change
          </span>
          <div style={css("display:flex;flex-wrap:wrap;gap:8px;margin-top:11px")}>
            {prefChips.map((pc) => (
              <button
                key={pc.key}
                onClick={() => onOpenPref(pc.key)}
                style={css(
                  "cursor:pointer;display:inline-flex;align-items:center;gap:7px;font-family:var(--font-body);font-weight:600;font-size:13px;padding:9px 13px;border-radius:999px;color:var(--ink);border:1px " +
                    (pc.emph ? "solid var(--accent)" : "solid var(--line)") +
                    ";background:" +
                    (pc.emph ? "var(--accent-soft)" : "var(--card)"),
                )}
              >
                {pc.label}
                <span style={css("color:var(--muted);font-size:11px;font-weight:600")}>
                  edit
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div
        style={css(
          "position:sticky;bottom:0;padding:12px 18px 16px;background:linear-gradient(to top,var(--paper),var(--paper) 66%,transparent)",
        )}
      >
        <button
          onClick={onGenerate}
          style={css(
            "width:100%;cursor:pointer;border:none;background:var(--accent);color:var(--accent-ink);font-family:var(--font-body);font-weight:700;font-size:16px;padding:15px;border-radius:var(--radius-sm);box-shadow:var(--shadow-sm)",
          )}
        >
          Find me recipes
        </button>
      </div>
    </>
  );
}
