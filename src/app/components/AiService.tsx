/* Connecting the user's own AI service ("bring your own key"):
   - AiKeyCard: what the home screen shows when there's no key yet — what's
     missing and why, with "Not now" or "Add a key". No text field.
   - AiSetupScreen: Settings → AI service, one layout for everyone: service,
     key, model, remember, and Custom services. */

import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { KEY_HELP_URL, PROVIDER_LABEL, type AiEffort, type AiSettings } from "@/lib/ai";
import { blankDraft, draftFromAi, failCopy, serviceName, useAiDraft } from "./aiDraft";
import {
  Chip,
  PrimaryButton,
  SecondaryButton,
  Segmented,
  Sheet,
  Spinner,
  StickyBar,
  TextButton,
  TextInput,
} from "./ui";

// ── Explainer card ─────────────────────────────────────────────────────────

export function AiKeyCard({ onAdd, onClose }: { onAdd: () => void; onClose: () => void }) {
  return (
    <Sheet
      onClose={onClose}
      label="Add an AI key"
      className="max-h-full gap-16 overflow-y-auto px-22 pt-22 pb-26"
    >
      <div className="flex flex-col gap-6">
        <div className="font-display text-22 font-extrabold text-ink">One thing before we cook</div>
        <div className="text-15 leading-[1.5] text-pretty text-ink-soft">
          Scrappy uses an AI to understand you and plan recipes. You connect your own AI key and pay
          that service directly — Scrappy doesn&apos;t charge.
        </div>
      </div>
      <div className="flex flex-col gap-9 rounded-tile border border-line bg-card px-14 py-12">
        <div className="flex items-center gap-10 text-14 font-semibold text-ink">
          <ClockIcon />
          About a minute, one time
        </div>
        <div className="flex items-center gap-10 text-14 font-semibold text-ink">
          <PhoneIcon />
          Saved on this phone
        </div>
      </div>
      <div className="flex w-full gap-10">
        <SecondaryButton onClick={onClose} className="px-18 py-13 text-14">
          Not now
        </SecondaryButton>
        <PrimaryButton onClick={onAdd} className="flex-1 p-13 text-15 shadow-raised">
          Add a key
        </PrimaryButton>
      </div>
    </Sheet>
  );
}

// ── Settings → AI service ──────────────────────────────────────────────────

interface AiSetupScreenProps {
  saved: AiSettings | null;
  onSave: (ai: AiSettings) => void;
  onRemove: () => void;
  /* Back to where it was opened from; `connected` after a successful save. */
  onDone: (connected: boolean) => void;
}

const EFFORTS: [AiEffort | null, string][] = [
  [null, "Default"],
  ["low", "Low"],
  ["medium", "Medium"],
  ["high", "High"],
];

export function AiSetupScreen({ saved, onSave, onRemove, onDone }: AiSetupScreenProps) {
  const { d, update, setKey, setProvider, runCheck, saveAnyway, valid, listable, modelIsDefault } =
    useAiDraft(saved ? draftFromAi(saved) : blankDraft("claude"), { saved, onSaved: onSave });

  const custom = d.provider === "custom";
  const name = serviceName(d);
  const fail = d.check === "fail" && d.reason ? failCopy(d.reason, d) : null;
  const summary = `${PROVIDER_LABEL[d.provider]} · ${d.model.trim()}`;

  return (
    <div className="flex min-h-full animate-slidein flex-col">
      <div className="flex flex-1 flex-col gap-22 px-18 pt-6 pb-8">
        <p className="px-4 text-14 leading-[1.5] text-pretty text-ink-soft">
          Pick a service and paste your key. You pay that service directly — Scrappy doesn&apos;t
          charge.
        </p>

        <Section label="Service">
          <Segmented
            label="Service"
            options={[
              ["claude", "Claude"],
              ["openai", "OpenAI"],
              ["custom", "Custom"],
            ]}
            value={d.provider}
            onPick={setProvider}
          />
        </Section>

        {!custom && (
          <Section label={`Your ${name} key`}>
            <Card className="gap-11 px-16 py-14">
              <TextInput
                type="password"
                value={d.key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={d.provider === "claude" ? "Paste your key (sk-ant-…)" : "Paste your key (sk-…)"}
                aria-label="API key"
              />
              <div className="flex flex-col gap-4">
                <KeyHelpLink provider={d.provider as "claude" | "openai"} />
                <span className="text-12 leading-[1.45] text-muted">
                  Not included in ChatGPT Plus or Claude Pro.
                </span>
              </div>
            </Card>
          </Section>
        )}

        {custom && (
          <Section label="Advanced · other services">
            <Card className="overflow-hidden">
              <Row>
                <RowTitle title="API format" caption="How the server expects requests" />
                <Segmented
                  label="API format"
                  options={[
                    ["anthropic", "Claude-style"],
                    ["openai-chat", "OpenAI-style"],
                  ]}
                  value={d.format}
                  onPick={(format) => update({ format })}
                />
              </Row>
              <Row divided tight>
                <span className="text-15 font-bold text-ink">Base URL</span>
                <TextInput
                  value={d.baseURL}
                  onChange={(e) => update({ baseURL: e.target.value })}
                  placeholder="https://api.example.com/v1"
                  inputMode="url"
                  aria-label="Base URL"
                />
              </Row>
              <Row divided tight>
                <RowTitle title="API key" caption="Leave empty if your server doesn't need one" />
                <TextInput
                  type="password"
                  value={d.key}
                  onChange={(e) => update({ key: e.target.value })}
                  placeholder="API key"
                  aria-label="API key"
                />
              </Row>
            </Card>
          </Section>
        )}

        <Section label="Model">
          <Card className="gap-12 px-16 py-14">
            {d.models === "loading" && (
              <div className="flex items-center gap-10">
                <Spinner className="size-18 flex-none border-3" />
                <span className="text-13 font-semibold text-ink-soft">Getting models from {name}…</span>
              </div>
            )}
            {d.models === null && (
              <span className="text-13 leading-[1.45] text-muted">
                {listable
                  ? "Models will show once the key works."
                  : custom
                    ? "Add the address (and key, if it needs one) to see the models it offers."
                    : "Add your key and I’ll list the models it can use."}
              </span>
            )}
            {Array.isArray(d.models) && d.models.length > 0 && (
              <div className="flex flex-col gap-8">
                <span className="text-12 text-muted">Available with this key</span>
                <div className="flex flex-wrap gap-7">
                  {d.models.map((m) => (
                    <Chip key={m} on={d.model.trim() === m} onClick={() => update({ model: m })} className="px-13 py-8 text-13">
                      {m}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
            {Array.isArray(d.models) && d.models.length === 0 && (
              <span className="text-13 leading-[1.45] text-muted">
                {name} doesn’t list its models. Type the one you want below.
              </span>
            )}
            <TextInput
              value={d.model}
              onChange={(e) => update({ model: e.target.value })}
              placeholder="Or type a model name"
              aria-label="Model name"
            />
            {modelIsDefault && (
              <span className="-mt-4 text-12 leading-[1.45] text-muted">
                Fast and low-cost — plenty for recipes. No need to change it.
              </span>
            )}
          </Card>
          <div className="flex items-center justify-between gap-12 px-4 pt-6">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-14 font-semibold text-ink">Remember on this device</span>
              <span className="text-12 leading-[1.4] text-muted">
                {d.remember ? "Kept on this phone for next time" : "Forgotten when you close Scrappy"}
              </span>
            </div>
            <Segmented
              small
              label="Remember on this device"
              options={[
                [true, "On"],
                [false, "Off"],
              ]}
              value={d.remember}
              onPick={(remember) => update({ remember })}
            />
          </div>
          <span className="px-4 text-12 leading-[1.45] text-muted">
            Your key stays on this phone. With each request it goes through Scrappy&apos;s server to{" "}
            {name} — it&apos;s never stored there.
          </span>
        </Section>

        {custom && (
          <Section label="Optional">
            <Card className="overflow-hidden">
              <Row>
                <RowTitle title="Reasoning effort" caption="Only for models that support it" />
                <div className="flex flex-wrap gap-7">
                  {EFFORTS.map(([value, label]) => (
                    <Chip key={label} on={d.effort === value} onClick={() => update({ effort: value })} className="px-13 py-8 text-13">
                      {label}
                    </Chip>
                  ))}
                </div>
              </Row>
              <Row divided>
                <RowTitle title="Plain JSON mode" caption="Turn on if the service rejects structured output" />
                <Segmented
                  label="Plain JSON mode"
                  options={[
                    [false, "Off"],
                    [true, "On"],
                  ]}
                  value={d.jsonMode}
                  onPick={(jsonMode) => update({ jsonMode })}
                />
              </Row>
            </Card>
          </Section>
        )}

        {saved && d.check !== "checking" && (
          <button
            onClick={onRemove}
            className="w-full cursor-pointer rounded-tile border border-line bg-transparent p-13 font-body text-14 font-bold text-rescue"
          >
            Remove key
          </button>
        )}
      </div>

      <StickyBar className="flex flex-col gap-10 px-18 pt-18 pb-16">
        {d.check === "checking" && (
          <div role="status" className="flex items-center justify-center gap-10 py-4">
            <Spinner className="size-20 flex-none border-3" />
            <span className="text-14 font-semibold text-ink-soft">Checking with {name}…</span>
          </div>
        )}
        {fail && (
          <div role="alert" className="flex items-start gap-11 rounded-tile bg-rescue-bg px-15 py-13">
            <span className="mt-5 size-9 flex-none rounded-full bg-rescue" />
            <div className="flex min-w-0 flex-col gap-2">
              <span className="text-14 font-bold text-ink">{fail.title}</span>
              <span className="text-13 leading-[1.45] text-pretty text-ink-soft">{fail.body}</span>
              {d.reason === "wrongKey" && d.provider === "openai" && (
                // Other vendors' keys also start with sk-.
                <TextButton onClick={() => setProvider("custom")} className="mt-4 self-start p-0 text-left text-13 text-ink-soft">
                  Using another service? Choose Custom above.
                </TextButton>
              )}
            </div>
          </div>
        )}
        {d.check === "ok" && (
          <div role="status" className="flex items-center gap-11 rounded-tile bg-fresh-bg px-15 py-13">
            <span className="flex size-26 flex-none items-center justify-center rounded-full bg-fresh text-accent-ink">
              <CheckIcon />
            </span>
            <div className="flex min-w-0 flex-col gap-2">
              <span className="text-14 font-bold text-ink">Connected</span>
              <span className="text-13 [overflow-wrap:anywhere] text-ink-soft">{summary}</span>
              {d.jsonSwitched && (
                // Placeholder copy until Claude Design writes this line.
                <span className="text-13 leading-[1.45] text-pretty text-ink-soft">
                  This service doesn&apos;t do strict JSON, so I turned on Plain JSON mode.
                </span>
              )}
            </div>
          </div>
        )}
        <PrimaryButton
          onClick={d.check === "ok" ? () => onDone(true) : runCheck}
          disabled={d.check === "checking" || (d.check !== "ok" && !valid)}
          className="w-full p-15 text-16 shadow-raised"
        >
          {d.check === "ok" ? "Done" : d.check === "fail" ? "Try again" : "Check & save"}
        </PrimaryButton>
        {d.check === "fail" && (
          <TextButton
            onClick={() => {
              saveAnyway();
              onDone(true);
            }}
            className="self-center px-0 py-4 text-13 text-muted"
          >
            Save anyway
          </TextButton>
        )}
      </StickyBar>
    </div>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────────

function KeyHelpLink({ provider }: { provider: "claude" | "openai" }) {
  return (
    <a
      href={KEY_HELP_URL[provider]}
      target="_blank"
      rel="noopener"
      className="self-start text-13 font-semibold text-muted underline underline-offset-3"
    >
      Where do I get a key?
    </a>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-8">
      <span className="label-caps px-4 text-muted">{label}</span>
      {children}
    </div>
  );
}

function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx("flex flex-col rounded-tile border border-line bg-card", className)}>{children}</div>
  );
}

/* A block inside a card; `divided` adds the line above it, `tight` is for a
   title with a field under it. */
function Row({ divided, tight, children }: { divided?: boolean; tight?: boolean; children: ReactNode }) {
  return (
    <div className={cx("flex flex-col px-16 py-15", tight ? "gap-8" : "gap-12", divided && "border-t border-line")}>
      {children}
    </div>
  );
}

function RowTitle({ title, caption }: { title: string; caption: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-15 font-bold text-ink">{title}</span>
      <span className="text-13 leading-[1.4] text-ink-soft">{caption}</span>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="2" width="12" height="20" rx="3" />
      <line x1="11" y1="18" x2="13" y2="18" />
    </svg>
  );
}
