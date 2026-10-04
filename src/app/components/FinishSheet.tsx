import { PrimaryButton, SecondaryButton, Sheet, Spinner } from "./ui";

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
    <Sheet finale className="items-start gap-14 px-24 py-28">
      <span className="label-caps text-fresh">Plates down</span>
      <h2 className="font-display text-30 leading-[1.08] font-extrabold text-ink">
        Dinner&apos;s handled.
      </h2>
      {(finaleLoading || finaleUrl) && (
        <div className="relative flex h-190 w-full items-center justify-center overflow-hidden rounded-tile bg-accent-soft">
          {finaleUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={finaleUrl} alt="The finished dish" className="size-full object-cover" />
          ) : (
            <Spinner light className="size-30 border-3" />
          )}
        </div>
      )}
      <div className="flex w-full items-start gap-11 rounded-tile bg-rescue-bg px-15 py-14">
        <span className="mt-4 size-9 flex-none rounded-full bg-rescue" />
        <div className="text-15 leading-[1.4] font-bold text-ink">{finishText}</div>
      </div>
      <div className="mt-2 flex w-full gap-10">
        <SecondaryButton tone="solid" onClick={onBack} className="px-18 py-14 text-15">
          The steps
        </SecondaryButton>
        <PrimaryButton onClick={onRestart} className="flex-1 p-14 text-16 shadow-raised">
          Cook again
        </PrimaryButton>
      </div>
    </Sheet>
  );
}
