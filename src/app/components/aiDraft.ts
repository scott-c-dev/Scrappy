/* The state of Settings → AI service: what's typed, the model list, and the
   check that runs before saving. */

import { useEffect, useRef, useState } from "react";
import { checkAi } from "@/lib/api";
import {
  DEFAULT_MODEL,
  modelOf,
  PROVIDER_LABEL,
  type AiEffort,
  type AiProvider,
  type AiSettings,
  type ApiFormat,
  type CheckFailure,
} from "@/lib/ai";

export interface Draft {
  provider: AiProvider;
  key: string;
  model: string;
  baseURL: string;
  format: ApiFormat;
  effort: AiEffort | null;
  jsonMode: boolean;
  remember: boolean;
  /* The key's models; null = not fetched (or no list), "loading". */
  models: string[] | null | "loading";
  check: "idle" | "checking" | "ok" | "fail";
  reason: CheckFailure | null;
}

export function blankDraft(provider: AiProvider): Draft {
  return {
    provider,
    key: "",
    model: provider === "custom" ? "" : DEFAULT_MODEL[provider],
    baseURL: "",
    format: "openai-chat",
    effort: null,
    jsonMode: false,
    remember: true,
    models: null,
    check: "idle",
    reason: null,
  };
}

export function draftFromAi(ai: AiSettings): Draft {
  const { provider, key, baseURL, format, effort, jsonMode, remember } = ai;
  return {
    ...blankDraft(provider),
    ...{ key, baseURL, format, effort, jsonMode, remember },
    model: modelOf(ai),
  };
}

/* An official service's default model is saved as "Scrappy's default", so a
   newer default in the code reaches this device too. */
export function toSettings(d: Draft): AiSettings {
  const model = d.model.trim();
  return {
    provider: d.provider,
    key: d.key.trim(),
    model: d.provider !== "custom" && model === DEFAULT_MODEL[d.provider] ? null : model || null,
    format: d.format,
    baseURL: d.baseURL.trim(),
    effort: d.effort,
    jsonMode: d.jsonMode,
    remember: d.remember,
  };
}

const hasAddress = (d: Draft) => /^https?:\/\/\S+/i.test(d.baseURL.trim());

// Enough to ask the service for its models.
const reachable = (d: Draft) => (d.provider === "custom" ? hasAddress(d) : d.key.trim().length >= 8);

export const draftValid = (d: Draft) =>
  !!d.model.trim() && (d.provider === "custom" ? hasAddress(d) : !!d.key.trim());

export function hostOf(url: string): string {
  return /^https?:\/\/([^/?#]+)/i.exec(url.trim())?.[1] ?? "that address";
}

/* "Claude", "OpenAI", or the custom server's host. */
export const serviceName = (d: Draft) =>
  d.provider === "custom"
    ? d.baseURL.trim()
      ? hostOf(d.baseURL)
      : "your server"
    : PROVIDER_LABEL[d.provider];

const KEY_PREFIX = { claude: "sk-ant-", openai: "sk-" };

export function failCopy(reason: CheckFailure, d: Draft): { title: string; body: string } {
  const custom = d.provider === "custom";
  const name = serviceName(d);
  switch (reason) {
    case "privateAddress":
      return {
        title: "Can’t use a private address",
        body: "This Scrappy can only reach services on the internet. Private and local addresses are turned off by whoever runs it.",
      };
    case "modelNotFound":
      return {
        title: "Model not found",
        body: `${name} doesn’t offer “${d.model.trim()}” to this key. Pick one from the list, or check the spelling.`,
      };
    case "unreachable":
      return custom
        ? {
            title: "Can’t reach that address",
            body: `No answer from ${name}. Check the address, and that the server is running.`,
          }
        : { title: `Can’t reach ${name}`, body: "No answer just now. Check your connection, then try again." };
    case "wrongKey":
      return {
        title: "That key didn’t work",
        body: custom
          ? "The server refused this key. Check it — or leave it empty if the server doesn’t need one."
          : `${name} didn’t accept it. Check you copied the whole key — it starts with ${KEY_PREFIX[d.provider as "claude" | "openai"]}.`,
      };
  }
}

/* `onSaved` runs after a successful check, or on "Save anyway". */
export function useAiDraft(
  initial: Draft,
  { saved, onSaved }: { saved: AiSettings | null; onSaved: (ai: AiSettings) => void },
) {
  const [d, setD] = useState(initial);
  const run = useRef(0);

  // Any edit clears the last check result.
  const update = (patch: Partial<Draft>) =>
    setD((prev) => ({
      ...prev,
      ...patch,
      check: prev.check === "checking" ? "checking" : "idle",
      reason: null,
    }));

  // A pasted key picks its service when the prefix says which: sk-ant- is
  // Claude, other sk- keys are OpenAI's (other vendors use sk- too; a failed
  // check then points them to Custom).
  const setKey = (key: string) => {
    const t = key.trim();
    const guess = t.length >= 10 ? (/^sk-ant-/.test(t) ? "claude" : /^sk-/.test(t) ? "openai" : null) : null;
    if (guess && d.provider !== "custom" && guess !== d.provider) {
      return update({ key, provider: guess, model: DEFAULT_MODEL[guess], models: null });
    }
    update({ key });
  };

  // Switching service starts that service fresh, or from what's saved for it.
  const setProvider = (provider: AiProvider) => {
    if (provider === d.provider) return;
    run.current++;
    setD(saved?.provider === provider ? draftFromAi(saved) : { ...blankDraft(provider), remember: d.remember });
  };

  // The model list: free to fetch, so it follows the key (debounced).
  const listKey = `${d.provider}|${d.key.trim()}|${d.baseURL.trim()}|${d.format}`;
  const listable = reachable(d);
  useEffect(() => {
    if (!listable) return;
    const draft = d;
    const my = ++run.current;
    const t = window.setTimeout(async () => {
      setD((prev) => ({ ...prev, models: "loading" }));
      const res = await checkAi(toSettings(draft), true);
      if (my !== run.current) return;
      setD((prev) => ({ ...prev, models: res.ok ? (res.models ?? []) : null }));
    }, 500);
    return () => window.clearTimeout(t);
    // Refetch only when what reaches the service changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey, listable]);

  const runCheck = async () => {
    if (d.check === "checking" || !draftValid(d)) return;
    const settings = toSettings(d);
    const my = ++run.current;
    setD((prev) => ({ ...prev, check: "checking", reason: null }));
    const res = await checkAi(settings);
    if (my !== run.current) return;
    if (res.ok) {
      onSaved(settings);
      setD((prev) => ({ ...prev, check: "ok" }));
    } else {
      setD((prev) => ({ ...prev, check: "fail", reason: res.reason }));
    }
  };

  // The check can be wrong itself (no model list, a slow server).
  const saveAnyway = () => onSaved(toSettings(d));

  // Without an address or key there's nothing to list.
  const view = listable ? d : { ...d, models: null };
  return {
    d: view,
    update,
    setKey,
    setProvider,
    runCheck,
    saveAnyway,
    valid: draftValid(d),
    /* There's enough to ask the service for its models. */
    listable,
    /* An official service's own default is in use (shows a reassurance). */
    modelIsDefault: d.provider !== "custom" && d.model.trim() === DEFAULT_MODEL[d.provider],
  };
}
