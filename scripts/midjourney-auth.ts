/* One-time Midjourney OAuth login. Run with `pnpm midjourney:auth`.

   Runs the full OAuth 2.1 flow (dynamic client registration + PKCE) under our own
   control, captures the redirect on a localhost callback server, exchanges the
   code for tokens, and persists them to .mcp-auth/midjourney.json. After this the
   backend refreshes access tokens automatically — no need to repeat unless the
   refresh token is revoked. */

import http from "node:http";
import open from "open";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import {
  FileOAuthProvider,
  REDIRECT_PORT,
  REDIRECT_URL,
} from "../src/lib/server/mcp-oauth.js";

const MCP_URL = process.env.MIDJOURNEY_MCP_URL || "https://mcp.midjourney.com/mcp";

/* Start listening for the OAuth redirect immediately so we never miss it. */
function captureCallback(): { code: Promise<string>; close: () => void } {
  let resolve!: (c: string) => void;
  let reject!: (e: Error) => void;
  const code = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? "/", REDIRECT_URL);
    if (u.pathname !== "/callback") {
      res.writeHead(404);
      res.end();
      return;
    }
    const c = u.searchParams.get("code");
    const err = u.searchParams.get("error");
    res.writeHead(200, { "content-type": "text/html" });
    res.end(
      `<html><body style="font-family:sans-serif;padding:40px"><h2>${
        c ? "Scrappy is connected to Midjourney ✅" : "Authorization failed ❌"
      }</h2><p>You can close this tab and return to the terminal.</p></body></html>`,
    );
    if (c) resolve(c);
    else reject(new Error(`authorization failed: ${err ?? "no code returned"}`));
  });
  server.listen(REDIRECT_PORT, () =>
    console.log(`Listening for the OAuth redirect on ${REDIRECT_URL}`),
  );
  return { code, close: () => server.close() };
}

async function main() {
  const { code, close } = captureCallback();
  const provider = new FileOAuthProvider((url) => {
    console.log("\nOpening your browser to authorize Midjourney…");
    console.log(`If it doesn't open, visit:\n${url.toString()}\n`);
    void open(url.toString());
  });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    authProvider: provider,
  });
  const client = new Client({ name: "scrappy-auth", version: "1.0.0" });

  try {
    await client.connect(transport);
    console.log("Already authorized — existing tokens are valid. Nothing to do.");
    close();
    await client.close();
    return;
  } catch (err) {
    if (!(err instanceof UnauthorizedError)) {
      close();
      throw err;
    }
    // The provider already opened the browser; wait for the redirect code.
  }

  const authCode = await code;
  await transport.finishAuth(authCode);
  close();

  // Reconnect to confirm the tokens work and list what the server offers.
  await client.connect(transport);
  const { tools } = await client.listTools();
  console.log("\n✅ Authorized. Tokens saved to .mcp-auth/midjourney.json");
  console.log("Tools exposed by the Midjourney MCP server:");
  for (const t of tools) console.log(`  • ${t.name}`);
  await client.close();
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error("\n✗ Auth failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
