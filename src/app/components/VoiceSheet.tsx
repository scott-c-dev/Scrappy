import { css } from "@/lib/css";
import type { VoiceState } from "../hooks/useScrappy";
import { Mic } from "./Mic";

interface VoiceSheetProps {
  voiceState: VoiceState;
  voiceTitle: string;
  onDone: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onType: () => void;
}

export function VoiceSheet({
  voiceState,
  voiceTitle,
  onDone,
  onCancel,
  onRetry,
  onType,
}: VoiceSheetProps) {
  return (
    <div
      style={css(
        "position:absolute;inset:0;z-index:30;display:flex;flex-direction:column;justify-content:flex-end",
      )}
    >
      <div
        onClick={onCancel}
        style={css("position:absolute;inset:0;background:rgba(30,20,12,.34)")}
      />
      <div
        style={css(
          "position:relative;background:var(--paper);border-radius:26px 26px 0 0;padding:24px 22px 26px;display:flex;flex-direction:column;align-items:center;gap:16px;animation:sheetin .32s cubic-bezier(.2,.8,.2,1);box-shadow:0 -10px 40px rgba(0,0,0,.18)",
        )}
      >
        <div
          style={css(
            "font-family:var(--font-display);font-weight:800;font-size:22px;color:var(--ink)",
          )}
        >
          {voiceTitle}
        </div>

        {voiceState === "listening" && (
          <div
            style={css(
              "display:flex;align-items:center;justify-content:center;gap:5px;height:40px",
            )}
          >
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <span
                key={i}
                style={css(
                  "width:6px;border-radius:3px;background:var(--accent);height:14px;animation:wave 0.9s ease-in-out " +
                    i * 0.09 +
                    "s infinite",
                )}
              />
            ))}
          </div>
        )}

        {voiceState === "processing" && (
          <div
            style={css("display:flex;align-items:center;gap:10px;height:40px")}
          >
            <div
              style={css(
                "width:24px;height:24px;border-radius:50%;border:3px solid var(--accent-soft);border-top-color:var(--accent);animation:spin .8s linear infinite",
              )}
            />
            <span
              style={css("font-size:14px;color:var(--ink-soft);font-weight:600")}
            >
              Got it — sorting that out…
            </span>
          </div>
        )}

        {voiceState === "listening" && (
          <div style={css("display:flex;gap:10px;width:100%")}>
            <button
              onClick={onCancel}
              style={css(
                "flex:none;cursor:pointer;border:1px solid var(--line);background:none;color:var(--ink-soft);font-family:var(--font-body);font-weight:600;font-size:14px;padding:13px 18px;border-radius:var(--radius-sm)",
              )}
            >
              Cancel
            </button>
            <button
              onClick={onDone}
              style={css(
                "flex:1;cursor:pointer;border:none;background:var(--accent);color:var(--accent-ink);font-family:var(--font-body);font-weight:700;font-size:15px;padding:13px;border-radius:var(--radius-sm)",
              )}
            >
              That&apos;s everything
            </button>
          </div>
        )}

        {voiceState === "error" && (
          <div
            style={css(
              "display:flex;flex-direction:column;align-items:center;gap:15px;width:100%",
            )}
          >
            <div
              style={css(
                "width:46px;height:46px;border-radius:50%;background:var(--rescue-bg);display:flex;align-items:center;justify-content:center;color:var(--rescue)",
              )}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="4" y1="4" x2="20" y2="20" />
                <rect
                  x="9"
                  y="2"
                  width="6"
                  height="11"
                  rx="3"
                  fill="currentColor"
                  stroke="none"
                />
                <path d="M5 10a7 7 0 0 0 14 0" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <div
              style={css(
                "font-size:14.5px;color:var(--ink-soft);line-height:1.45;text-align:center;max-width:262px",
              )}
            >
              A bit noisy in there — I only caught static. Mind saying it once
              more?
            </div>
            <div style={css("display:flex;gap:10px;width:100%")}>
              <button
                onClick={onType}
                style={css(
                  "flex:none;cursor:pointer;border:1px solid var(--line);background:none;color:var(--ink-soft);font-family:var(--font-body);font-weight:600;font-size:14px;padding:13px 16px;border-radius:var(--radius-sm)",
                )}
              >
                Type instead
              </button>
              <button
                onClick={onRetry}
                style={css(
                  "flex:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:7px;border:none;background:var(--accent);color:var(--accent-ink);font-family:var(--font-body);font-weight:700;font-size:15px;padding:13px;border-radius:var(--radius-sm)",
                )}
              >
                <Mic size={15} sw={2.2} />
                Try again
              </button>
            </div>
          </div>
        )}

        {voiceState === "listening" && (
          <div style={css("font-size:11.5px;color:var(--muted);text-align:center")}>
            Speak normally — I&apos;ll catch the amounts.
          </div>
        )}
      </div>
    </div>
  );
}
