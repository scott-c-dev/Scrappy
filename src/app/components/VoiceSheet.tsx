import type { VoiceContext, VoiceState } from "../hooks/useScrappy";
import { isPref, type VoiceErrorAction, type VoiceErrorView } from "../voiceErrors";
import { Mic } from "./Mic";
import { PrimaryButton, SecondaryButton, Sheet, Spinner, TextButton } from "./ui";

// The review and error actions can carry an icon next to the label.
const PRIMARY_LAYOUT = "inline-flex flex-1 items-center justify-center gap-7 p-13 text-15";

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
  const isPrefCtx = isPref(voiceContext);
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
        : isPrefCtx
          ? "Say it how you’d say it — I’ll sort it out."
          : "List what you’ve got — amounts are optional.";

  return (
    <Sheet
      onClose={dismissable ? onCancel : undefined}
      className="items-center gap-16 px-22 pt-24 pb-26"
    >
      <div className="text-center font-display text-[22px] font-extrabold text-ink">
        {voiceState === "error" && error ? error.title : voiceTitle}
      </div>

      {voiceState === "listening" && (
        <div className="flex h-40 items-center justify-center gap-5">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <span
              key={i}
              className="h-14 w-6 animate-wave rounded-[3px] bg-accent"
              style={{ animationDelay: `${i * 0.09}s` }}
            />
          ))}
        </div>
      )}

      {voiceState === "processing" && (
        <div className="flex h-40 items-center gap-10">
          <Spinner className="size-24 border-3" />
          <span className="text-14 font-semibold text-ink-soft">{processingLabel}</span>
        </div>
      )}

      {showPartial && (
        <div className="w-full rounded-tile border border-line bg-card px-15 py-13 text-center text-15 leading-[1.4] text-ink">
          “{voicePartial}”
        </div>
      )}

      {voiceState === "listening" && (
        <div className="flex w-full gap-10">
          <SecondaryButton onClick={onCancel} className="px-18 py-13 text-14">
            Cancel
          </SecondaryButton>
          <PrimaryButton onClick={onDone} className="flex-1 p-13 text-15">
            That&apos;s everything
          </PrimaryButton>
        </div>
      )}

      {voiceState === "processing" && (
        <TextButton onClick={onCancel} className="text-13 text-muted">
          Cancel
        </TextButton>
      )}

      {voiceState === "review" && (
        <div className="flex w-full flex-col gap-14">
          {reviewEditing ? (
            <textarea
              value={reviewText}
              onChange={(e) => onReviewChange(e.target.value)}
              autoFocus
              rows={4}
              placeholder={
                isSwap
                  ? "make it spicier, no tofu…"
                  : isPrefCtx
                    ? "e.g. make it for four"
                    : "half a cabbage that's wilting, three eggs, leftover rice…"
              }
              className="w-full resize-none rounded-tile border-[1.5px] border-accent bg-card px-15 py-13 font-body text-[15.5px] leading-[1.5] text-ink outline-none"
            />
          ) : (
            <div className="w-full rounded-tile border border-line bg-card px-16 py-14 text-[15.5px] leading-[1.5] text-pretty text-ink">
              “{reviewText}”
            </div>
          )}
          <div className="text-center text-[12.5px] leading-[1.45] text-muted">{reviewHint}</div>
          <div className="flex w-full gap-10">
            <SecondaryButton
              onClick={reviewEditing ? onReviewRedo : onReviewEdit}
              className="px-16 py-13 text-14"
            >
              {!reviewEditing
                ? "Edit as text"
                : reviewTyped
                  ? "Say it instead"
                  : "Say it again"}
            </SecondaryButton>
            <PrimaryButton
              onClick={onReviewSend}
              disabled={!canSend}
              className={PRIMARY_LAYOUT}
            >
              {isSwap ? "Swap it →" : isPrefCtx ? "Use this →" : "Cook with this →"}
            </PrimaryButton>
          </div>
        </div>
      )}

      {voiceState === "error" && error && (
        <div className="flex w-full flex-col items-center gap-15">
          <div className="flex size-46 items-center justify-center rounded-full bg-rescue-bg text-rescue">
            {error.icon === "mic" ? <MicOff /> : <CloudAlert />}
          </div>
          <div className="max-w-280 text-center text-[14.5px] leading-[1.45] text-pretty text-ink-soft">
            {error.body}
          </div>
          <div className="flex w-full gap-10">
            {error.secondary && (
              <SecondaryButton
                onClick={() => onErrorAction(error.secondary!.act)}
                className="px-16 py-13 text-14"
              >
                {error.secondary.label}
              </SecondaryButton>
            )}
            <PrimaryButton
              onClick={() => onErrorAction(error.primary.act)}
              className={PRIMARY_LAYOUT}
            >
              {error.primary.mic && <Mic size={15} sw={2.2} />}
              {error.primary.label}
            </PrimaryButton>
          </div>
        </div>
      )}

      {voiceState === "listening" && (
        <div className="text-center text-[11.5px] text-muted">
          Speak normally — I&apos;ll catch the amounts.
        </div>
      )}
    </Sheet>
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
