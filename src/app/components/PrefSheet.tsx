import { css } from "@/lib/css";
import type { Prefs } from "@/lib/types";
import { PREF_OPTIONS, PREF_TITLES, type PrefKey } from "@/lib/prefs";
import type { VoiceContext } from "../hooks/useScrappy";
import { Mic } from "./Mic";

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
        <div
          style={css(
            "font-family:var(--font-display);font-weight:800;font-size:21px;color:var(--ink)",
          )}
        >
          {PREF_TITLES[prefKey]}
        </div>
        <div style={css("display:flex;flex-wrap:wrap;gap:8px")}>
          {options.map((o, oi) => (
            <button
              key={oi}
              onClick={() => onPick(prefKey, o.value)}
              style={css(
                "cursor:pointer;font-family:var(--font-body);font-weight:600;font-size:14px;padding:11px 16px;border-radius:999px;color:var(--ink);border:1px solid " +
                  (o.active ? "var(--accent)" : "var(--line)") +
                  ";background:" +
                  (o.active ? "var(--accent-soft)" : "var(--card)"),
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => onVoice(prefKey)}
          style={css(
            "align-self:flex-start;cursor:pointer;display:inline-flex;align-items:center;gap:7px;border:none;background:none;color:var(--accent);font-family:var(--font-body);font-weight:700;font-size:13px;padding:2px",
          )}
        >
          <Mic size={14} sw={2.2} />
          …or just say it
        </button>
      </div>
    </div>
  );
}
