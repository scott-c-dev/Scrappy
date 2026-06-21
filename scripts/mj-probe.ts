/* Diagnostic probe for the Midjourney MCP server. Run AFTER `pnpm midjourney:auth`:
     pnpm midjourney:probe ["a custom prompt --ar 4:3"]
   Prints the discovered tools + input-schema keys, calls the generation tool once,
   and dumps the RAW result so we can confirm the task/URL shape. */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { FileOAuthProvider } from "../src/lib/server/mcp-oauth.js";

const MCP_URL = process.env.MIDJOURNEY_MCP_URL || "https://mcp.midjourney.com/mcp";

async function main() {
  const provider = new FileOAuthProvider();
  if (!provider.hasTokens()) {
    console.error("Not authorized — run `pnpm midjourney:auth` first.");
    process.exit(1);
  }

  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    authProvider: provider,
  });
  const client = new Client({ name: "scrappy-probe", version: "1.0.0" });
  await client.connect(transport);

  const { tools } = await client.listTools();
  console.log("\n=== TOOLS ===");
  for (const t of tools) {
    const keys = Object.keys(
      (t.inputSchema as { properties?: Record<string, unknown> })?.properties ?? {},
    );
    console.log(`• ${t.name}  args: [${keys.join(", ")}]`);
    if (t.description) console.log(`    ${t.description.split("\n")[0]}`);
  }

  const imagine = tools.find((t) => /imagine|generate|create/i.test(t.name));
  if (!imagine) {
    console.error("\nNo generation tool found.");
    await client.close();
    process.exit(1);
  }

  const prompt =
    process.argv[2] ||
    "two ripe tomatoes and half a cabbage on a wooden board, overhead, warm natural kitchen light --ar 4:3";
  console.log(`\n=== CALLING ${imagine.name} ===\nprompt: ${prompt}`);
  const res = await client.callTool({ name: imagine.name, arguments: { prompt } });
  console.log("\n=== RAW RESULT ===");
  console.log(JSON.stringify(res, null, 2));

  await client.close();
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error("probe failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
