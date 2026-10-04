import { Mic } from "./Mic";
import { PrimaryButton, Sheet, TextButton } from "./ui";

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
    <Sheet onClose={onClose} className="gap-16 px-22 pt-22 pb-26">
      <div>
        <div className="font-display text-22 font-extrabold text-ink">Swap this dish?</div>
        <div className="mt-4 text-14 text-ink-soft">
          {dishName} — I&apos;ll still use up what&apos;s on the clock.
        </div>
      </div>
      <PrimaryButton
        onClick={onSwap}
        className="inline-flex w-full items-center justify-center gap-8 p-14 text-15"
      >
        <SwapIcon size={16} />
        Just swap it
      </PrimaryButton>
      <div className="flex flex-wrap items-center justify-between gap-12">
        <button
          onClick={onVoice}
          className="inline-flex cursor-pointer items-center gap-7 bg-transparent p-2 font-body text-13 font-bold text-accent"
        >
          <Mic size={14} sw={2.2} />
          Tell me what to change
        </button>
        <TextButton onClick={onType} className="p-2 text-13 text-muted">
          or type it
        </TextButton>
      </div>
    </Sheet>
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
