interface ErrorToastProps {
  error: string;
  onDismiss: () => void;
}

export function ErrorToast({ error, onDismiss }: ErrorToastProps) {
  return (
    <div
      onClick={onDismiss}
      className="absolute right-14 bottom-18 left-14 z-50 flex cursor-pointer items-center gap-10 rounded-tile bg-ink px-15 py-13 font-body text-[13.5px] font-semibold text-paper shadow-[0_10px_30px_rgba(0,0,0,.25)]"
    >
      <span className="flex-1">{error}</span>
      <span className="text-12 opacity-70">tap to dismiss</span>
    </div>
  );
}
