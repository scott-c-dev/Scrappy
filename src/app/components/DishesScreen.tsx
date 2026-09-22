import { css } from "@/lib/css";
import type { Dish } from "@/lib/types";
import { Mic } from "./Mic";

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
      <div
        style={css(
          "min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:40px 30px;text-align:center",
        )}
      >
        <div
          style={css(
            "width:62px;height:62px;border-radius:50%;border:4px solid var(--accent-soft);border-top-color:var(--accent);animation:spin .9s linear infinite",
          )}
        />
        <div>
          <div
            style={css(
              "font-family:var(--font-display);font-weight:800;font-size:23px;color:var(--ink)",
            )}
          >
            Raiding your fridge…
          </div>
          <div
            style={css(
              "font-size:14px;color:var(--ink-soft);margin-top:8px;max-width:250px;line-height:1.45",
            )}
          >
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
      <div
        style={css(
          "padding:10px 18px 8px;display:flex;flex-direction:column;gap:13px;animation:risein .4s ease",
        )}
      >
        <div
          style={css(
            "background:var(--fresh-bg);border-radius:var(--radius-sm);padding:13px 14px;display:flex;gap:11px;align-items:flex-start",
          )}
        >
          <span
            style={css(
              "width:9px;height:9px;border-radius:50%;background:var(--fresh);margin-top:4px;flex:none",
            )}
          />
          <div
            style={css(
              "font-size:14px;font-weight:700;color:var(--ink);line-height:1.35",
            )}
          >
            {topClaim}
          </div>
        </div>
        <span
          style={css(
            "font-family:var(--font-label);font-size:11px;letter-spacing:var(--label-tracking);text-transform:var(--label-transform);color:var(--muted);font-weight:700",
          )}
        >
          3 dishes · no extra shopping
        </span>
        {dishes.map((d) => (
          <div
            key={d.id}
            style={css(
              "position:relative;background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:16px;box-shadow:var(--shadow-sm);display:flex;flex-direction:column;gap:11px",
            )}
          >
            <div
              style={css(
                "display:flex;justify-content:space-between;align-items:flex-start;gap:10px",
              )}
            >
              <div style={css("min-width:0")}>
                <h3
                  style={css(
                    "font-family:var(--font-display);font-weight:800;font-size:21px;margin:0;color:var(--ink);line-height:1.1",
                  )}
                >
                  {d.name}
                </h3>
                <p
                  style={css(
                    "font-size:13px;color:var(--ink-soft);margin:5px 0 0;line-height:1.4",
                  )}
                >
                  {d.blurb}
                </p>
              </div>
              <button
                onClick={() => onSwap(d.id)}
                style={css(
                  "flex:none;cursor:pointer;display:inline-flex;align-items:center;gap:5px;border:1px solid var(--line);background:var(--paper);color:var(--ink);font-family:var(--font-body);font-weight:600;font-size:12px;padding:7px 11px;border-radius:999px",
                )}
              >
                <Mic size={12} sw={2.4} />
                Swap
              </button>
            </div>
            <div
              style={css(
                "display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:var(--rescue-bg);border-radius:10px;padding:7px 11px",
              )}
            >
              <span
                style={css(
                  "font-family:var(--font-label);font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;font-weight:700;color:var(--rescue)",
                )}
              >
                Uses up
              </span>
              <span
                style={css("font-size:12.5px;font-weight:700;color:var(--ink)")}
              >
                {(d.rescue || []).join(" · ")}
              </span>
            </div>
            <div style={css("display:flex;flex-wrap:wrap;gap:6px")}>
              {d.uses.map((u, ui) => (
                <span
                  key={ui}
                  style={css(
                    "font-size:11.5px;color:var(--ink-soft);background:var(--paper);border:1px solid var(--line);padding:4px 9px;border-radius:999px",
                  )}
                >
                  {u}
                </span>
              ))}
            </div>
            {replacingId === d.id && (
              <div
                style={css(
                  "position:absolute;inset:0;background:var(--card);border-radius:var(--radius);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:11px",
                )}
              >
                <div
                  style={css(
                    "width:32px;height:32px;border-radius:50%;border:3px solid var(--accent-soft);border-top-color:var(--accent);animation:spin .8s linear infinite",
                  )}
                />
                <div
                  style={css("font-size:13px;color:var(--ink-soft);font-weight:600")}
                >
                  Finding another one…
                </div>
              </div>
            )}
          </div>
        ))}
        <div
          style={css(
            "display:flex;align-items:center;gap:8px;justify-content:center;color:var(--muted);font-size:12.5px;padding:4px 0 2px;text-align:center",
          )}
        >
          <span
            style={css(
              "width:6px;height:6px;border-radius:50%;background:var(--fresh);flex:none",
            )}
          />
          {rescueLine}
        </div>
      </div>
      <div
        style={css(
          "position:sticky;bottom:0;padding:12px 18px 16px;background:linear-gradient(to top,var(--paper),var(--paper) 66%,transparent)",
        )}
      >
        <button
          onClick={onStartCook}
          style={css(
            "width:100%;cursor:pointer;border:none;background:var(--accent);color:var(--accent-ink);font-family:var(--font-body);font-weight:700;font-size:16px;padding:15px;border-radius:var(--radius-sm);box-shadow:var(--shadow-sm)",
          )}
        >
          Let&apos;s cook these
        </button>
      </div>
    </>
  );
}
