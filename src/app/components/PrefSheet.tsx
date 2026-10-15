import type { Prefs } from "@/lib/types";
import { PREF_OPTIONS, PREF_TITLES, type PrefKey } from "@/lib/prefs";
import type { VoiceContext } from "../hooks/useScrappy";
import { Mic } from "./Mic";
import { Chip, Sheet, TextButton } from "./ui";

interface PrefSheetProps {
  prefKey: PrefKey;
  prefs: Prefs;
  /* A value said or typed that isn't a preset; offered as a chip of its own. */
  custom?: string;
  onPick: (key: PrefKey, val: string | number) => void;
  onClose: () => void;
  onVoice: (ctx: VoiceContext) => void;
  onType: (ctx: VoiceContext) => void;
}

export function PrefSheet({
  prefKey,
  prefs,
  custom,
  onPick,
  onClose,
  onVoice,
  onType,
}: PrefSheetProps) {
  const presets = PREF_OPTIONS[prefKey] ?? [];
  const cur = prefs[prefKey];
  // Their own words, after the presets (which keep their places): the
  // current value if it isn't a preset, or the last one they said this
  // cook, so it can be picked again.
  const own = !presets.includes(cur) ? cur : custom;
  const opts = own !== undefined && !presets.includes(own) ? [...presets, own] : presets;

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
      <div className="font-display text-22 font-extrabold text-ink">
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
      <div className="flex items-center justify-between gap-10">
        <button
          onClick={() => onVoice(prefKey)}
          className="inline-flex cursor-pointer items-center gap-7 bg-transparent p-2 font-body text-13 font-bold text-accent"
        >
          <Mic size={14} sw={2.2} />
          …or just say it
        </button>
        {/* Anything not in the list — "no mushrooms", "pescatarian". */}
        <TextButton onClick={() => onType(prefKey)} className="p-2 text-13 text-muted">
          or type it
        </TextButton>
      </div>
    </Sheet>
  );
}
