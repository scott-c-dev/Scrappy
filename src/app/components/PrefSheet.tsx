import type { Prefs } from "@/lib/types";
import { PREF_OPTIONS, PREF_TITLES, type PrefKey } from "@/lib/prefs";
import type { VoiceContext } from "../hooks/useScrappy";
import { Mic } from "./Mic";
import { Chip, Sheet } from "./ui";

interface PrefSheetProps {
  prefKey: PrefKey;
  prefs: Prefs;
  onPick: (key: PrefKey, val: string | number) => void;
  onClose: () => void;
  onVoice: (ctx: VoiceContext) => void;
}

export function PrefSheet({
  prefKey,
  prefs,
  onPick,
  onClose,
  onVoice,
}: PrefSheetProps) {
  const opts = PREF_OPTIONS[prefKey] ?? [];
  const cur = prefs[prefKey];

  const options = opts.map((o) => {
    const active = o === cur;
    const label =
      String(o) +
      (prefKey === "servings"
        ? o === 1
          ? " person"
          : " people"
        : prefKey === "courses"
          ? o === 1
            ? " dish"
            : " dishes"
          : "");
    return { label, value: o, active };
  });

  return (
    <Sheet onClose={onClose} className="gap-16 px-22 pt-22 pb-26">
      <div className="font-display text-[21px] font-extrabold text-ink">
        {PREF_TITLES[prefKey]}
      </div>
      <div className="flex flex-wrap gap-8">
        {options.map((o, oi) => (
          <Chip
            key={oi}
            on={o.active}
            onClick={() => onPick(prefKey, o.value)}
            className="px-16 py-11 text-14"
          >
            {o.label}
          </Chip>
        ))}
      </div>
      <button
        onClick={() => onVoice(prefKey)}
        className="inline-flex cursor-pointer items-center gap-7 self-start bg-transparent p-2 font-body text-13 font-bold text-accent"
      >
        <Mic size={14} sw={2.2} />
        …or just say it
      </button>
    </Sheet>
  );
}
