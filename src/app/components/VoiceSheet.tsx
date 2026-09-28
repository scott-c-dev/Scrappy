import { css } from "@/lib/css";
import type { VoiceContext, VoiceState } from "../hooks/useScrappy";
import type { VoiceErrorAction, VoiceErrorView } from "../voiceErrors";
import { Mic } from "./Mic";

interface VoiceSheetProps {
  voiceState: VoiceState;
  voiceContext: VoiceContext | null;
  voiceTitle: string;
  voicePartial: string;
  processingLabel: string;
  reviewText: string;
  reviewEditing: boolean;
  reviewTyped: boolean;
  error: VoiceErrorView | null;
  onDone: () => void;
  onCancel: () => void;
  onReviewChange: (text: string) => void;
  onReviewEdit: () => void;
  onReviewRedo: () => void;
  onReviewSend: () => void;
  onErrorAction: (act: VoiceErrorAction) => void;
}

const SECONDARY_BTN =
  "flex:none;cursor:pointer;border:1px solid var(--line);background:none;color:var(--ink-soft);font-family:var(--font-body);font-weight:600;font-size:14px;padding:13px 16px;border-radius:var(--radius-sm)";
const PRIMARY_BTN =
  "flex:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:7px;border:none;background:var(--accent);color:var(--accent-ink);font-family:var(--font-body);font-weight:700;font-size:15px;padding:13px;border-radius:var(--radius-sm)";

export function VoiceSheet({
  voiceState,
  voiceContext,
  voiceTitle,
  voicePartial,
  processingLabel,
  reviewText,
  reviewEditing,
  reviewTyped,
  error,
  onDone,
  onCancel,
  onReviewChange,
  onReviewEdit,
  onReviewRedo,
  onReviewSend,
  onErrorAction,
}: VoiceSheetProps) {
  const isSwap = voiceContext === "swap";
  // Tapping outside only dismisses when nothing would be lost or left running.
  const dismissable = voiceState === "listening" || voiceState === "error";
  const showPartial =
    !!voicePartial && (voiceState === "listening" || voiceState === "processing");
  const canSend = !!reviewText.trim();

  const reviewHint = !reviewEditing
    ? "Look right? If I misheard anything, fix it before I start cooking."
    : !reviewTyped
      ? "Fix anything I misheard — amounts are optional."
      : isSwap
        ? "Tell me what to change — like “make it spicier” or “no tofu.”"
        : "List what you’ve got — amounts are optional.";

  return (
    <div
      style={css(
        "position:absolute;inset:0;z-index:30;display:flex;flex-direction:column;justify-content:flex-end",
      )}
    >
      <div
        onClick={dismissable ? onCancel : undefined}
        style={css("position:absolute;inset:0;background:rgba(30,20,12,.34)")}
      />
      <div
        style={css(
          "position:relative;background:var(--paper);border-radius:26px 26px 0 0;padding:24px 22px 26px;display:flex;flex-direction:column;align-items:center;gap:16px;animation:sheetin .32s cubic-bezier(.2,.8,.2,1);box-shadow:0 -10px 40px rgba(0,0,0,.18)",
        )}
      >
        <div
          style={css(
            "font-family:var(--font-display);font-weight:800;font-size:22px;color:var(--ink);text-align:center",
          )}
        >
          {voiceState === "error" && error ? error.title : voiceTitle}
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
              {processingLabel}
            </span>
          </div>
        )}

        {showPartial && (
          <div
            style={css(
              "background:var(--card);border:1px solid var(--line);border-radius:var(--radius-sm);padding:13px 15px;width:100%;text-align:center;font-size:15px;color:var(--ink);line-height:1.4",
            )}
          >
            “{voicePartial}”
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

        {voiceState === "processing" && (
          <button
            onClick={onCancel}
            style={css(
              "cursor:pointer;border:none;background:none;color:var(--muted);font-family:var(--font-body);font-size:13px;font-weight:600;text-decoration:underline;text-underline-offset:3px",
            )}
          >
            Cancel
          </button>
        )}

        {voiceState === "review" && (
          <div style={css("display:flex;flex-direction:column;gap:14px;width:100%")}>
            {reviewEditing ? (
              <textarea
                value={reviewText}
                onChange={(e) => onReviewChange(e.target.value)}
                autoFocus
                rows={4}
                placeholder={
                  isSwap
                    ? "make it spicier, no tofu…"
                    : "half a cabbage that's wilting, three eggs, leftover rice…"
                }
                style={css(
                  "width:100%;resize:none;background:var(--card);border:1.5px solid var(--accent);border-radius:var(--radius-sm);padding:13px 15px;font-family:var(--font-body);font-size:15.5px;color:var(--ink);line-height:1.5;outline:none",
                )}
              />
            ) : (
              <div
                style={css(
                  "background:var(--card);border:1px solid var(--line);border-radius:var(--radius-sm);padding:14px 16px;width:100%;font-size:15.5px;color:var(--ink);line-height:1.5;text-wrap:pretty",
                )}
              >
                “{reviewText}”
              </div>
            )}
            <div
              style={css(
                "font-size:12.5px;color:var(--muted);text-align:center;line-height:1.45",
              )}
            >
              {reviewHint}
            </div>
            <div style={css("display:flex;gap:10px;width:100%")}>
              <button
                onClick={reviewEditing ? onReviewRedo : onReviewEdit}
                style={css(SECONDARY_BTN)}
              >
                {!reviewEditing
                  ? "Edit as text"
                  : reviewTyped
                    ? "Say it instead"
                    : "Say it again"}
              </button>
              <button
                onClick={onReviewSend}
                disabled={!canSend}
                style={css(
                  PRIMARY_BTN + (canSend ? "" : ";opacity:.45;cursor:default"),
                )}
              >
                {isSwap ? "Swap it →" : "Cook with this →"}
              </button>
            </div>
          </div>
        )}

        {voiceState === "error" && error && (
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
              {error.icon === "mic" ? <MicOff /> : <CloudAlert />}
            </div>
            <div
              style={css(
                "font-size:14.5px;color:var(--ink-soft);line-height:1.45;text-align:center;max-width:280px;text-wrap:pretty",
              )}
            >
              {error.body}
            </div>
            <div style={css("display:flex;gap:10px;width:100%")}>
              {error.secondary && (
                <button
                  onClick={() => onErrorAction(error.secondary!.act)}
                  style={css(SECONDARY_BTN)}
                >
                  {error.secondary.label}
                </button>
              )}
              <button
                onClick={() => onErrorAction(error.primary.act)}
                style={css(PRIMARY_BTN)}
              >
                {error.primary.mic && <Mic size={15} sw={2.2} />}
                {error.primary.label}
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

function MicOff() {
  return (
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
      <rect x="9" y="2" width="6" height="11" rx="3" fill="currentColor" stroke="none" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function CloudAlert() {
  return (
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
      <path d="M17.5 19H8a5 5 0 1 1 1.4-9.8A6 6 0 0 1 20.5 12 3.5 3.5 0 0 1 17.5 19z" />
      <line x1="12" y1="10" x2="12" y2="13.5" />
      <circle cx="12" cy="16.2" r=".6" fill="currentColor" />
    </svg>
  );
}
