import { css } from "@/lib/css";

interface FinishSheetProps {
  finaleUrl: string | null;
  finaleLoading: boolean;
  finishText: string;
  onBack: () => void;
  onRestart: () => void;
}

export function FinishSheet({
  finaleUrl,
  finaleLoading,
  finishText,
  onBack,
  onRestart,
}: FinishSheetProps) {
  return (
    <div
      style={css(
        "position:absolute;inset:0;z-index:40;display:flex;flex-direction:column;justify-content:flex-end",
      )}
    >
      <div
        style={css("position:absolute;inset:0;background:rgba(30,20,12,.40)")}
      />
      <div
        style={css(
          "position:relative;background:var(--paper);border-radius:26px 26px 0 0;padding:28px 24px 28px;display:flex;flex-direction:column;gap:14px;align-items:flex-start;animation:sheetin .34s cubic-bezier(.2,.8,.2,1);box-shadow:0 -10px 40px rgba(0,0,0,.2)",
        )}
      >
        <span
          style={css(
            "font-family:var(--font-label);font-size:11px;letter-spacing:var(--label-tracking);text-transform:var(--label-transform);color:var(--fresh);font-weight:700",
          )}
        >
          Plates down
        </span>
        <h2
          style={css(
            "font-family:var(--font-display);font-weight:800;font-size:30px;margin:0;color:var(--ink);line-height:1.08",
          )}
        >
          Dinner&apos;s handled.
        </h2>
        {(finaleLoading || finaleUrl) && (
          <div
            style={css(
              "position:relative;width:100%;height:190px;border-radius:var(--radius-sm);overflow:hidden;background:var(--accent-soft);display:flex;align-items:center;justify-content:center",
            )}
          >
            {finaleUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={finaleUrl}
                alt="The finished dish"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <div
                style={css(
                  "width:30px;height:30px;border-radius:50%;border:3px solid rgba(255,255,255,.65);border-top-color:var(--accent);animation:spin .8s linear infinite",
                )}
              />
            )}
          </div>
        )}
        <div
          style={css(
            "display:flex;gap:11px;align-items:flex-start;background:var(--rescue-bg);border-radius:var(--radius-sm);padding:14px 15px;width:100%",
          )}
        >
          <span
            style={css(
              "width:9px;height:9px;border-radius:50%;background:var(--rescue);margin-top:4px;flex:none",
            )}
          />
          <div
            style={css(
              "font-size:14.5px;font-weight:700;color:var(--ink);line-height:1.4",
            )}
          >
            {finishText}
          </div>
        </div>
        <div style={css("display:flex;gap:10px;width:100%;margin-top:2px")}>
          <button
            onClick={onBack}
            style={css(
              "flex:none;cursor:pointer;border:1px solid var(--line);background:var(--card);color:var(--ink);font-family:var(--font-body);font-weight:700;font-size:15px;padding:14px 18px;border-radius:var(--radius-sm)",
            )}
          >
            The steps
          </button>
          <button
            onClick={onRestart}
            style={css(
              "flex:1;cursor:pointer;border:none;background:var(--accent);color:var(--accent-ink);font-family:var(--font-body);font-weight:700;font-size:16px;padding:14px;border-radius:var(--radius-sm);box-shadow:var(--shadow-sm)",
            )}
          >
            Cook again
          </button>
        </div>
      </div>
    </div>
  );
}
