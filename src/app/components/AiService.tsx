/* Connecting the user's own AI service ("bring your own key"):
   - AiKeySheet: the first-time sheet from the home screen. Claude or OpenAI,
     paste a key, check, done; everything else uses the defaults.
   - AiSetupScreen: Settings → AI service, with every option (model, Custom,
     remember) for changing things later or using another service. */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { KEY_HELP_URL, PROVIDER_LABEL, type AiEffort, type AiSettings } from "@/lib/ai";
import {
  blankDraft,
  draftFromAi,
  failCopy,
  serviceName,
  useAiDraft,
  type Draft,
  type DraftSeed,
} from "./aiDraft";
import { Chip, PrimaryButton, Segmented, Sheet, Spinner, StickyBar, TextButton, TextInput } from "./ui";

// ── First-time sheet ───────────────────────────────────────────────────────

interface AiKeySheetProps {
  onSave: (ai: AiSettings) => void;
  /* Closes the sheet after connecting; home then says "All set" once. */
  onDone: () => void;
  onClose: () => void;
  /* Opens Settings → AI service, e.g. for another service. */
  onSettings: (seed: DraftSeed) => void;
}

export function AiKeySheet({ onSave, onDone, onClose, onSettings }: AiKeySheetProps) {
  const lift = useKeyboardInset();
  const doneTimer = useRef(0);
  const { d, setKey, setProvider, runCheck, saveAnyway, valid } = useAiDraft(blankDraft("claude"), {
    saved: null,
    withModels: false,
    onSaved: (ai) => {
      onSave(ai);
      // "Connected" shows for a moment, then the sheet closes on its own.
      doneTimer.current = window.setTimeout(onDone, 1100);
    },
  });
  useEffect(() => () => window.clearTimeout(doneTimer.current), []);

  const fail = d.check === "fail" && d.reason ? failCopy(d.reason, d) : null;
  const provider = d.provider === "openai" ? "openai" : "claude";

  return (
    <Sheet onClose={onClose} lift={lift} label="Connect an AI" className="gap-14 px-20 pt-20 pb-22">
      <div className="flex items-start justify-between gap-12">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="font-display text-22 font-extrabold text-ink">Connect an AI to start</div>
          <div className="text-14 leading-[1.45] text-pretty text-ink-soft">
            Scrappy uses an AI to understand you and plan recipes. You pay it directly — Scrappy
            doesn&apos;t charge. One time, about a minute.
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Not now"
          className="flex size-34 flex-none cursor-pointer items-center justify-center rounded-full border border-line bg-card p-0 text-ink-soft"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="flex flex-col gap-8">
        <div role="radiogroup" aria-label="AI service" className="flex gap-7">
          {(["claude", "openai"] as const).map((p) => (
            <Chip
              key={p}
              on={provider === p}
              role="radio"
              aria-checked={provider === p}
              onClick={() => setProvider(p)}
              className="px-13 py-8 text-13"
            >
              {PROVIDER_LABEL[p]}
            </Chip>
          ))}
        </div>
        <TextButton
          onClick={() => onSettings({ ...blankDraft("custom") })}
          className="self-start p-0 text-13 text-muted"
        >
          Another service? Set it up in Settings
        </TextButton>
      </div>

      <div className="flex flex-col gap-7">
        <TextInput
          on="paper"
          type="password"
          value={d.key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={provider === "claude" ? "Paste your key (sk-ant-…)" : "Paste your key (sk-…)"}
          aria-label="API key"
        />
        <div className="flex flex-wrap items-baseline justify-between gap-10">
          <KeyHelpLink provider={provider} />
          {d.switched && (
            <span className="text-12 font-semibold text-ink-soft">
              Looks like {provider === "openai" ? "an OpenAI" : "a Claude"} key — switched
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-5 text-12 leading-[1.45] text-pretty text-muted">
        <span>
          A ChatGPT Plus or Claude Pro subscription doesn&apos;t include this — API keys are billed
          separately.
        </span>
        <span>
          Saved on this phone. Each request goes through Scrappy&apos;s server to {serviceName(d)} —
          the key is never stored there.
        </span>
      </div>

      {d.check === "checking" && <Checking name={serviceName(d)} />}
      {fail && (
        <FailNote title={fail.title}>
          {d.reason === "modelNotFound"
            ? `Your key can’t use ${d.model.trim()}, the model Scrappy picks by default.`
            : fail.body}
          {d.reason === "modelNotFound" ? (
            <FailLink onClick={() => onSettings({ ...d, check: "idle", reason: null, modelOpen: true })}>
              Choose another model in Settings
            </FailLink>
          ) : (
            d.reason === "wrongKey" &&
            provider === "openai" && (
              <FailLink onClick={() => onSettings({ ...blankDraft("custom") })}>
                Using another service? Set it up in Settings.
              </FailLink>
            )
          )}
        </FailNote>
      )}
      {d.check === "ok" && <Connected summary={`${PROVIDER_LABEL[provider]} · ${d.model}`} />}

      {d.check !== "ok" && (
        <PrimaryButton
          onClick={runCheck}
          disabled={d.check === "checking" || !valid}
          className="w-full p-14 text-16 shadow-raised"
        >
          {d.check === "fail" ? "Try again" : "Check & save"}
        </PrimaryButton>
      )}
      {d.check === "fail" && <SaveAnyway onClick={saveAnyway} />}
    </Sheet>
  );
}

// ── Settings → AI service ──────────────────────────────────────────────────

interface AiSetupScreenProps {
  saved: AiSettings | null;
  /* How it opens, e.g. with Custom picked from the sheet. */
  seed: DraftSeed | null;
  onSave: (ai: AiSettings) => void;
  onRemove: () => void;
  /* Back to where it was opened from. */
  onDone: () => void;
}

const EFFORTS: [AiEffort | null, string][] = [
  [null, "Default"],
  ["low", "Low"],
  ["medium", "Medium"],
  ["high", "High"],
];

export function AiSetupScreen({ saved, seed, onSave, onRemove, onDone }: AiSetupScreenProps) {
  const start: Draft = seed
    ? { ...blankDraft(seed.provider ?? "claude"), ...seed }
    : saved
      ? draftFromAi(saved)
      : blankDraft("claude");
  const { d, update, setKey, setProvider, runCheck, saveAnyway, valid } = useAiDraft(start, {
    saved,
    withModels: true,
    onSaved: onSave,
  });

  const custom = d.provider === "custom";
  const name = serviceName(d);
  const fail = d.check === "fail" && d.reason ? failCopy(d.reason, d) : null;
  const summary = `${PROVIDER_LABEL[d.provider]} · ${d.model.trim()}`;

  return (
    <div className="flex min-h-full animate-slidein flex-col">
      <div className="flex flex-1 flex-col gap-22 px-18 pt-6 pb-8">
        <p className="px-4 text-14 leading-[1.5] text-pretty text-ink-soft">
          Scrappy uses an AI to understand what you say and plan recipes. Connect your own key once
          — you pay the AI service directly. Scrappy doesn&apos;t charge.
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
              <KeyHelpLink provider={d.provider as "claude" | "openai"} />
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
          {!custom && !d.modelOpen ? (
            <Card className="gap-4 px-16 py-14">
              <div className="flex items-center justify-between gap-12">
                <span className="min-w-0 text-14 [overflow-wrap:anywhere] text-ink-soft">
                  Uses <span className="font-bold text-ink">{d.model}</span>
                </span>
                <TextButton onClick={() => update({ modelOpen: true })} className="flex-none p-0 text-13 text-muted">
                  Change
                </TextButton>
              </div>
              <span className="text-12 leading-[1.45] text-muted">
                Fast and low-cost — plenty for recipes. No need to change it.
              </span>
            </Card>
          ) : (
            <Card className="gap-12 px-16 py-14">
              {d.models === "loading" && (
                <div className="flex items-center gap-10">
                  <Spinner className="size-18 flex-none border-3" />
                  <span className="text-13 font-semibold text-ink-soft">Getting models from {name}…</span>
                </div>
              )}
              {d.models === null && (
                <span className="text-13 leading-[1.45] text-muted">
                  {custom
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
            </Card>
          )}
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

        <div className="flex flex-col gap-8">
          <Card>
            <Row>
              <RowTitle
                title="Remember on this device"
                caption={d.remember ? "Kept on this phone for next time" : "Forgotten when you close Scrappy"}
              />
              <Segmented
                label="Remember on this device"
                options={[
                  [true, "On"],
                  [false, "Off"],
                ]}
                value={d.remember}
                onPick={(remember) => update({ remember })}
              />
            </Row>
          </Card>
          <span className="px-4 text-12 leading-[1.45] text-muted">
            Your key stays on this phone. With each request it goes through Scrappy&apos;s server to{" "}
            {name} — it&apos;s never stored there.
          </span>
        </div>

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
        {d.check === "checking" && <Checking name={name} />}
        {fail && <FailNote title={fail.title}>{fail.body}</FailNote>}
        {d.check === "ok" && <Connected summary={summary} />}
        <PrimaryButton
          onClick={d.check === "ok" ? onDone : runCheck}
          disabled={d.check === "checking" || (d.check !== "ok" && !valid)}
          className="w-full p-15 text-16 shadow-raised"
        >
          {d.check === "ok" ? "Done" : d.check === "fail" ? "Try again" : "Check & save"}
        </PrimaryButton>
        {d.check === "fail" && (
          <SaveAnyway
            onClick={() => {
              saveAnyway();
              onDone();
            }}
          />
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

function Checking({ name }: { name: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-10 py-2">
      <Spinner className="size-20 flex-none border-3" />
      <span className="text-14 font-semibold text-ink-soft">Checking with {name}…</span>
    </div>
  );
}

function FailNote({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-11 rounded-tile bg-rescue-bg px-14 py-12">
      <span className="mt-5 size-9 flex-none rounded-full bg-rescue" />
      <div className="flex min-w-0 flex-col gap-2">
        <span className="text-14 font-bold text-ink">{title}</span>
        <span className="flex flex-col items-start text-13 leading-[1.45] text-pretty text-ink-soft">{children}</span>
      </div>
    </div>
  );
}

function FailLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <TextButton onClick={onClick} className="mt-4 p-0 text-left text-13 text-ink-soft">
      {children}
    </TextButton>
  );
}

function Connected({ summary }: { summary: string }) {
  return (
    <div role="status" className="flex items-center gap-11 rounded-tile bg-fresh-bg px-14 py-12">
      <span className="flex size-26 flex-none items-center justify-center rounded-full bg-fresh text-accent-ink">
        <CheckIcon />
      </span>
      <div className="flex min-w-0 flex-col gap-2">
        <span className="text-14 font-bold text-ink">Connected</span>
        <span className="text-13 [overflow-wrap:anywhere] text-ink-soft">{summary}</span>
      </div>
    </div>
  );
}

function SaveAnyway({ onClick }: { onClick: () => void }) {
  return (
    <TextButton onClick={onClick} className="self-center px-0 py-4 text-13 text-muted">
      Save anyway
    </TextButton>
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

/* How far the on-screen keyboard covers the page, so a sheet with a text
   field can sit above it. */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const measure = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    vv.addEventListener("resize", measure);
    vv.addEventListener("scroll", measure);
    return () => {
      vv.removeEventListener("resize", measure);
      vv.removeEventListener("scroll", measure);
    };
  }, []);
  return inset;
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

