import { css } from "@/lib/css";
import { Mic } from "./Mic";

interface SwapSheetProps {
  dishName: string;
  onSwap: () => void;
  onVoice: () => void;
  onType: () => void;
  onClose: () => void;
}

/* Asked before a swap, since swapping discards the dish: a plain swap, or one
   steered by voice or text. */
export function SwapSheet({ dishName, onSwap, onVoice, onType, onClose }: SwapSheetProps) {
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
        style={css(
          "position:relative;background:var(--paper);border-radius:26px 26px 0 0;padding:22px 22px 26px;display:flex;flex-direction:column;gap:16px;animation:sheetin .32s cubic-bezier(.2,.8,.2,1);box-shadow:0 -10px 40px rgba(0,0,0,.18)",
        )}
      >
        <div>
          <div
            style={css(
              "font-family:var(--font-display);font-weight:800;font-size:21px;color:var(--ink)",
            )}
          >
            Swap this dish?
          </div>
          <div style={css("font-size:13.5px;color:var(--ink-soft);margin-top:4px")}>
            {dishName} — I&apos;ll still use up what&apos;s on the clock.
          </div>
        </div>
        <button
          onClick={onSwap}
          style={css(
            "width:100%;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;border:none;background:var(--accent);color:var(--accent-ink);font-family:var(--font-body);font-weight:700;font-size:15px;padding:14px;border-radius:var(--radius-sm)",
          )}
        >
          <SwapIcon size={16} />
          Just swap it
        </button>
        <div
          style={css(
            "display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap",
          )}
        >
          <button
            onClick={onVoice}
            style={css(
              "cursor:pointer;display:inline-flex;align-items:center;gap:7px;border:none;background:none;color:var(--accent);font-family:var(--font-body);font-weight:700;font-size:13px;padding:2px",
            )}
          >
            <Mic size={14} sw={2.2} />
            Tell me what to change
          </button>
          <button
            onClick={onType}
            style={css(
              "cursor:pointer;border:none;background:none;color:var(--muted);font-family:var(--font-body);font-size:13px;font-weight:600;text-decoration:underline;text-underline-offset:3px;padding:2px",
            )}
          >
            or type it
          </button>
        </div>
      </div>
    </div>
  );
}

export function SwapIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 8h15" />
      <path d="M15 4l4 4-4 4" />
      <path d="M20 16H5" />
      <path d="M9 12l-4 4 4 4" />
    </svg>
  );
}
