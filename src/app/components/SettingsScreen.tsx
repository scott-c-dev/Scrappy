import { cx } from "@/lib/cx";
import { modelOf, PROVIDER_LABEL, type AiSettings } from "@/lib/ai";
import type { UnitSystem } from "@/lib/units";
import { Segmented } from "./ui";

interface SettingsScreenProps {
  ai: AiSettings | null;
  onAiService: () => void;
  /* The last AI request failed in a way fixed here (or at the provider). */
  headsUp: string | null;
  units: UnitSystem;
  onUnits: (units: UnitSystem) => void;
  /* Step pictures need an image service on this server; without one the
     setting is hidden and cooking is text only. */
  images: boolean;
  stepPics: boolean;
  onStepPics: (on: boolean) => void;
}

const SYSTEMS: [UnitSystem, string][] = [
  ["metric", "Metric"],
  ["imperial", "Imperial"],
];

const PICS: [boolean, string][] = [
  [true, "On"],
  [false, "Off"],
];

/* Reached only from the home screen: the AI service and units shape the
   list and the recipes, and pictures are generated during cooking, so none
   of them should change mid-flow. */
export function SettingsScreen({
  ai,
  onAiService,
  headsUp,
  units,
  onUnits,
  images,
  stepPics,
  onStepPics,
}: SettingsScreenProps) {
  return (
    <div className="flex animate-slidein flex-col gap-22 px-18 pt-6 pb-24">
      <div className="flex flex-col gap-8">
        <span className="label-caps px-4 text-muted">Connection</span>
        <button
          onClick={onAiService}
          className="flex w-full cursor-pointer items-center justify-between gap-12 rounded-tile border border-line bg-card px-16 py-15 text-left font-body text-ink"
        >
          <div className="flex min-w-0 flex-col gap-2">
            <span className="text-15 font-bold text-ink">AI service</span>
            <span className="flex items-center gap-7 text-13 leading-[1.4] text-ink-soft">
              {ai && <span className="size-8 flex-none rounded-full bg-fresh" />}
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {ai
                  ? `${PROVIDER_LABEL[ai.provider]} · ${modelOf(ai)}`
                  : "Not set up — needed to start cooking"}
              </span>
            </span>
          </div>
          {ai ? (
            <span aria-hidden="true" className="flex-none pb-2 text-22 leading-none text-muted">
              ›
            </span>
          ) : (
            <span className="flex-none rounded-full bg-accent px-14 py-8 text-13 font-bold text-accent-ink">
              Set up
            </span>
          )}
        </button>
        {headsUp && (
          <div role="status" className="flex items-start gap-10 rounded-tile bg-rescue-bg px-14 py-12">
            <span className="mt-5 size-8 flex-none rounded-full bg-rescue" />
            <div className="flex min-w-0 flex-col gap-2">
              <span className="text-13 font-bold text-ink">Last request failed</span>
              <span className="text-13 leading-[1.45] text-pretty text-ink-soft">{headsUp}</span>
            </div>
          </div>
        )}
        {ai && !ai.remember && (
          <span className="px-4 text-12 leading-[1.45] text-muted">
            Not remembered — you&apos;ll add the key again next time you open Scrappy.
          </span>
        )}
      </div>

      <div className="flex flex-col gap-8">
        <span className="label-caps px-4 text-muted">Cooking</span>
        <div className="overflow-hidden rounded-tile border border-line bg-card">
          <ChoiceRow
            title="Units"
            caption={
              units === "metric" ? "Amounts in g, kg, ml and L" : "Amounts in oz, lb and cups"
            }
            options={SYSTEMS}
            value={units}
            onPick={onUnits}
          />
          {images && (
            <ChoiceRow
              title="Step pictures"
              caption={stepPics ? "Only for the tricky steps" : "Text only — faster, uses less data"}
              options={PICS}
              value={stepPics}
              onPick={onStepPics}
              className="border-t border-line"
            />
          )}
        </div>
        <span className="px-4 text-12 leading-[1.45] text-muted">
          Saved on this device. You can still pick any unit for a single item.
        </span>
      </div>
    </div>
  );
}

/* A setting with a title, a caption describing the current choice, and a
   two-option pill. */
export function ChoiceRow<T extends string | boolean>({
  title,
  caption,
  options,
  value,
  onPick,
  className,
}: {
  title: string;
  caption: string;
  options: [T, string][];
  value: T;
  onPick: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-12 px-16 py-15", className)}>
      <div className="flex min-w-0 flex-col gap-2">
        <span className="text-15 font-bold text-ink">{title}</span>
        <span className="text-13 leading-[1.4] text-ink-soft">{caption}</span>
      </div>
      <Segmented label={title} options={options} value={value} onPick={onPick} />
    </div>
  );
}
