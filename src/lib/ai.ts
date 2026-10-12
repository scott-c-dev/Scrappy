/* The user's AI service settings ("bring your own key"). They live on the
   device and travel with each AI request; the server never stores them. */

export type AiProvider = "claude" | "openai" | "custom";
export type ApiFormat = "anthropic" | "openai-chat";
export type AiEffort = "low" | "medium" | "high";

export interface AiSettings {
  provider: AiProvider;
  /* May be empty for a custom server that needs none. */
  key: string;
  /* null = Scrappy's default for the provider, so a new default in the code
     reaches everyone who never picked a model. */
  model: string | null;
  /* Custom only. */
  format: ApiFormat;
  baseURL: string;
  /* Custom only; null = don't send any reasoning setting. */
  effort: AiEffort | null;
  jsonMode: boolean;
  /* Kept on this device (localStorage) or only until the tab closes. */
  remember: boolean;
}

/* Cheap current models that do the job well. Custom has no default. */
export const DEFAULT_MODEL: Record<Exclude<AiProvider, "custom">, string> = {
  claude: "claude-sonnet-5-5",
  openai: "gpt-6-luna",
};

export const PROVIDER_LABEL: Record<AiProvider, string> = {
  claude: "Claude",
  openai: "OpenAI",
  custom: "Custom",
};

/* Where each official key comes from. */
export const KEY_HELP_URL: Record<Exclude<AiProvider, "custom">, string> = {
  claude: "https://platform.claude.com/docs/en/get-api-key",
  openai: "https://platform.openai.com/api-keys",
};

export const modelOf = (ai: AiSettings): string =>
  ai.model ?? (ai.provider === "custom" ? "" : DEFAULT_MODEL[ai.provider]);

/* Why a check before saving failed. */
export type CheckFailure = "wrongKey" | "modelNotFound" | "unreachable" | "privateAddress";

/* Why an AI request failed, as far as the app needs to know. */
export type AiFailure = "credit" | "refused" | "modelNotFound" | "unreachable" | "timeout" | "service";
