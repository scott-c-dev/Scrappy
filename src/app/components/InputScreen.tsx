import { Mic } from "./Mic";
import { TextButton } from "./ui";

interface InputScreenProps {
  onVoice: () => void;
  onType: () => void;
}

export function InputScreen({ onVoice, onType }: InputScreenProps) {
  return (
    <div className="flex min-h-full flex-col px-22 pt-14 pb-26">
      <div className="flex flex-1 flex-col justify-center gap-8 pt-14 pb-4">
        <span className="label-caps text-accent">Cook what&apos;s about to go bad</span>
        <h1 className="font-display text-37 leading-[1.06] font-extrabold tracking-[-.01em] text-ink">
          What&apos;s in your fridge right now?
        </h1>
        <p className="mt-8 max-w-300 text-16 leading-[1.5] text-ink-soft">
          Just say what you&apos;ve got — and roughly how much. I&apos;ll cook
          around it. No shopping trip.
        </p>
      </div>
      <div className="flex flex-col items-center gap-15 pt-10 pb-4">
        <button
          onClick={onVoice}
          aria-label="Start talking"
          className="flex size-106 cursor-pointer items-center justify-center rounded-full bg-accent text-accent-ink shadow-raised animate-mic-pulse"
        >
          <Mic size={40} sw={2} />
        </button>
        <div className="text-center">
          <div className="font-body text-15 font-bold text-ink">Tap and tell me</div>
          <div className="mt-3 text-13 text-muted">
            e.g. “half a cabbage that&apos;s wilting, three eggs, leftover rice”
          </div>
          <div className="mt-7 max-w-260 text-13 leading-[1.4] text-ink-soft">
            Mention anything that needs using up — I&apos;ll bump it to the
            front.
          </div>
        </div>
        <TextButton onClick={onType} className="text-13 text-ink-soft">
          or type it instead
        </TextButton>
      </div>
    </div>
  );
}
