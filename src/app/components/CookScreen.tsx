import { css } from "@/lib/css";
import type { Dish } from "@/lib/types";

interface CookScreenProps {
  dishes: Dish[];
  cookDish: number;
  cookStep: number;
  imgState: Record<string, "loading" | "ready">;
  imgUrls: Record<string, string>;
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
    <div
      style={css(
        "padding:8px 16px 6px;display:flex;flex-direction:column;gap:14px;min-height:100%",
      )}
    >
      <div
        className="noscroll"
        style={css("display:flex;gap:7px;overflow-x:auto;padding-bottom:2px")}
      >
        {cookDishTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onSetDish(tab.idx)}
            style={css(
              "cursor:pointer;white-space:nowrap;flex:none;font-family:var(--font-body);font-weight:600;font-size:13px;padding:8px 14px;border-radius:999px;border:1px solid " +
                (tab.active ? "var(--accent)" : "var(--line)") +
                ";background:" +
                (tab.active ? "var(--accent)" : "var(--card)") +
                ";color:" +
                (tab.active ? "var(--accent-ink)" : "var(--ink)"),
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div style={css("display:flex;flex-direction:column;gap:9px")}>
        <div
          style={css(
            "display:flex;justify-content:space-between;align-items:baseline;gap:10px",
          )}
        >
          <span
            style={css(
              "font-family:var(--font-label);font-size:11px;letter-spacing:.06em;text-transform:uppercase;font-weight:700;color:var(--accent);white-space:nowrap",
            )}
          >
            {"Step " + (cookStep + 1) + " of " + stepsArr.length}
          </span>
          <span
            style={css(
              "font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis",
            )}
          >
            {curDish.name || ""}
          </span>
        </div>
        <div style={css("display:flex;gap:4px")}>
          {stepsArr.map((_, idx) => (
            <span
              key={idx}
              style={css(
                "height:4px;border-radius:2px;flex:1;background:" +
                  (idx <= cookStep ? "var(--accent)" : "var(--line)"),
              )}
            />
          ))}
        </div>
      </div>
      <div style={css("padding:2px 0")}>
        <p
          style={css(
            "font-family:var(--font-display);font-weight:700;font-size:26px;line-height:1.22;color:var(--ink);margin:0",
          )}
        >
          {step.text}
        </p>
      </div>
      {step.img && (
        <div>
          {imgSt !== "ready" ? (
            <div
              style={css(
                "position:relative;width:100%;height:184px;border-radius:var(--radius-sm);background:var(--accent-soft);overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:11px",
              )}
            >
              <div
                style={css(
                  "position:absolute;top:0;bottom:0;left:0;width:55%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent);animation:shimmer 1.4s infinite",
                )}
              />
              <div
                style={css(
                  "width:30px;height:30px;border-radius:50%;border:3px solid rgba(255,255,255,.65);border-top-color:var(--accent);animation:spin .8s linear infinite;position:relative",
                )}
              />
              <div
                style={css(
                  "font-family:var(--font-label);font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--rescue);font-weight:700;position:relative",
                )}
              >
                Sketching this step…
              </div>
            </div>
          ) : (
            <div
              style={css(
                "width:100%;height:184px;border-radius:var(--radius-sm);background:linear-gradient(135deg,var(--accent-soft),var(--rescue-bg));position:relative;overflow:hidden;display:flex;align-items:flex-end;padding:12px",
              )}
            >
              {imgUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imgUrl}
                  alt={step.cap || "reference shot"}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              )}
              <span
                style={css(
                  "position:relative;font-family:var(--font-label);font-size:10px;letter-spacing:.04em;text-transform:uppercase;font-weight:700;color:var(--ink);background:rgba(255,255,255,.78);padding:5px 9px;border-radius:8px",
                )}
              >
                {step.cap || "reference shot"}
              </span>
            </div>
          )}
        </div>
      )}
      {!step.img && (
        <div
          style={css(
            "display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12px;padding:2px 0",
          )}
        >
          <span
            style={css(
              "width:5px;height:5px;border-radius:50%;background:var(--fresh);flex:none",
            )}
          />
          No photo needed here — you&apos;ve got this.
        </div>
      )}
      <div style={css("flex:1")} />
      <div
        style={css(
          "position:sticky;bottom:0;display:flex;gap:10px;padding:12px 0 14px;background:linear-gradient(to top,var(--paper),var(--paper) 66%,transparent)",
        )}
      >
        <button
          onClick={onPrev}
          style={css(
            "flex:none;cursor:pointer;border:1px solid var(--line);background:var(--card);color:var(--ink);font-family:var(--font-body);font-weight:700;font-size:15px;padding:14px 18px;border-radius:var(--radius-sm)",
          )}
        >
          Back
        </button>
        <button
          onClick={onNext}
          style={css(
            "flex:1;cursor:pointer;border:none;background:var(--accent);color:var(--accent-ink);font-family:var(--font-body);font-weight:700;font-size:16px;padding:14px;border-radius:var(--radius-sm);box-shadow:var(--shadow-sm)",
          )}
        >
          {nextLabel}
        </button>
      </div>
    </div>
  );
}
