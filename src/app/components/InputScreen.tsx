import { css } from "@/lib/css";
import { Mic } from "./Mic";

interface InputScreenProps {
  onVoice: () => void;
  onPhoto: (file: File) => void;
  onType: () => void;
}

export function InputScreen({ onVoice, onPhoto, onType }: InputScreenProps) {
  return (
    <div
      style={css(
        "min-height:100%;display:flex;flex-direction:column;padding:14px 22px 26px",
      )}
    >
      <div
        style={css(
          "flex:1;display:flex;flex-direction:column;justify-content:center;gap:8px;padding:14px 0 4px",
        )}
      >
        <span
          style={css(
            "font-family:var(--font-label);font-size:11px;letter-spacing:var(--label-tracking);text-transform:var(--label-transform);color:var(--accent);font-weight:700",
          )}
        >
          Cook what&apos;s about to go bad
        </span>
        <h1
          style={css(
            "font-family:var(--font-display);font-weight:800;font-size:37px;line-height:1.06;margin:0;color:var(--ink);letter-spacing:-.01em",
          )}
        >
          What&apos;s in your fridge right now?
        </h1>
        <p
          style={css(
            "font-size:16px;line-height:1.5;color:var(--ink-soft);margin:8px 0 0;max-width:300px",
          )}
        >
          Just say what you&apos;ve got — and roughly how much. I&apos;ll cook
          around it. No shopping trip.
        </p>
      </div>
      <div
        style={css(
          "display:flex;flex-direction:column;align-items:center;gap:15px;padding:10px 0 4px",
        )}
      >
        <button
          onClick={onVoice}
          aria-label="Start talking"
          style={css(
            "cursor:pointer;border:none;width:106px;height:106px;border-radius:50%;background:var(--accent);color:var(--accent-ink);display:flex;align-items:center;justify-content:center;animation:pulse 2.4s infinite;box-shadow:var(--shadow-sm)",
          )}
        >
          <Mic size={40} sw={2} />
        </button>
        <div style={css("text-align:center")}>
          <div
            style={css(
              "font-family:var(--font-body);font-weight:700;font-size:15px;color:var(--ink)",
            )}
          >
            Tap and tell me
          </div>
          <div style={css("font-size:13px;color:var(--muted);margin-top:3px")}>
            e.g. “two tomatoes, half a cabbage, three eggs”
          </div>
        </div>
        <label
          style={css(
            "cursor:pointer;display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line);background:var(--card);color:var(--ink);font-family:var(--font-body);font-weight:600;font-size:13px;padding:9px 15px;border-radius:999px",
          )}
        >
          📷 Snap a fridge photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPhoto(f);
              e.target.value = "";
            }}
          />
        </label>
        <button
          onClick={onType}
          style={css(
            "cursor:pointer;border:none;background:none;color:var(--ink-soft);font-family:var(--font-body);font-size:13px;font-weight:600;text-decoration:underline;text-underline-offset:3px",
          )}
        >
          or type it instead
        </button>
      </div>
    </div>
  );
}
