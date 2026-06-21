/* A file-backed OAuth client provider for the MCP SDK. The full OAuth flow runs
   once via `pnpm midjourney:auth`; this persists the dynamic client registration,
   tokens, and PKCE verifier to a gitignored JSON file so the backend can refresh
   access tokens automatically afterwards.

   Plain Node/fs only (no "server-only") so the one-time auth script can import it
   too. The route imports it indirectly through midjourney.ts, which is server-only. */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationFull,
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

const STORE_PATH = join(process.cwd(), ".mcp-auth", "midjourney.json");

/* Fixed localhost callback the one-time auth script listens on. */
export const REDIRECT_PORT = 7595;
export const REDIRECT_URL = `http://localhost:${REDIRECT_PORT}/callback`;

interface Store {
  clientInformation?: OAuthClientInformationFull;
  tokens?: OAuthTokens;
  codeVerifier?: string;
}

function read(): Store {
  if (!existsSync(STORE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(STORE_PATH, "utf8")) as Store;
  } catch {
    return {};
  }
}

function write(patch: Partial<Store>): void {
  const next = { ...read(), ...patch };
  mkdirSync(dirname(STORE_PATH), { recursive: true });
  writeFileSync(STORE_PATH, JSON.stringify(next, null, 2));
}

export class FileOAuthProvider implements OAuthClientProvider {
  /* Called with the authorization URL when interactive consent is needed.
     The route passes a no-op (it must already be authorized); the auth script
     passes a handler that opens the browser. */
  private readonly onRedirect: (url: URL) => void;

  constructor(onRedirect?: (url: URL) => void) {
    this.onRedirect = onRedirect ?? (() => {});
  }

  get redirectUrl(): string {
    return REDIRECT_URL;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Scrappy",
      redirect_uris: [REDIRECT_URL],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    return read().clientInformation;
  }

  saveClientInformation(info: OAuthClientInformationMixed): void {
    write({ clientInformation: info as OAuthClientInformationFull });
  }

  tokens(): OAuthTokens | undefined {
    return read().tokens;
  }

  saveTokens(tokens: OAuthTokens): void {
    write({ tokens });
  }

  saveCodeVerifier(codeVerifier: string): void {
    write({ codeVerifier });
  }

  codeVerifier(): string {
    const v = read().codeVerifier;
    if (!v) throw new Error("no PKCE code verifier saved");
    return v;
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    this.onRedirect(authorizationUrl);
  }

  /* True once a token set has been persisted — used by the route to fail fast
     with a helpful message instead of triggering an interactive flow. */
  hasTokens(): boolean {
    return !!read().tokens;
  }
}
