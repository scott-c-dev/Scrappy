/* Server-only Midjourney image generation via its MCP server. Midjourney has no
   REST API — it's only reachable over MCP (Streamable HTTP). We act as an MCP
   client, authenticated with the OAuth tokens persisted by `pnpm midjourney:auth`.

   Generation is async: the imagine tool returns a task, which we poll until an
   image URL is ready. Tool names/shapes are discovered at runtime (not hardcoded)
   so this survives the server renaming things. */

import "server-only";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { FileOAuthProvider } from "./mcp-oauth";

const MCP_URL = process.env.MIDJOURNEY_MCP_URL || "https://mcp.midjourney.com/mcp";
const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 120_000;
const URL_RE = /https?:\/\/[^\s"')]+\.(?:png|jpe?g|webp|gif)/i;

interface Discovered {
  client: Client;
  imagineTool: string;
  statusTool: string | null;
  statusArgKey: string;
}

let connection: Promise<Discovered> | null = null;

interface ToolInfo {
  name: string;
  inputSchema?: { properties?: Record<string, unknown> };
}

function firstKeyMatching(
  schema: ToolInfo["inputSchema"],
  re: RegExp,
  fallback: string,
): string {
  const keys = Object.keys(schema?.properties ?? {});
  return keys.find((k) => re.test(k)) ?? fallback;
}

async function connect(): Promise<Discovered> {
  if (connection) return connection;
  connection = (async () => {
    const provider = new FileOAuthProvider();
    if (!provider.hasTokens()) {
      throw new Error(
        "Midjourney is not authorized yet — run `pnpm midjourney:auth` once.",
      );
    }
    const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
      authProvider: provider,
    });
    const client = new Client({ name: "scrappy", version: "1.0.0" });
    await client.connect(transport);

    const { tools } = (await client.listTools()) as { tools: ToolInfo[] };
    const imagine = tools.find((t) => /imagine|generate|create/i.test(t.name));
    const status = tools.find((t) => /status|task|result|fetch|get/i.test(t.name));
    if (!imagine) {
      throw new Error(
        `no image-generation tool found on Midjourney MCP (have: ${tools
          .map((t) => t.name)
          .join(", ")})`,
      );
    }
    return {
      client,
      imagineTool: imagine.name,
      statusTool: status?.name ?? null,
      statusArgKey: firstKeyMatching(status?.inputSchema, /task|job|id/i, "task_id"),
    };
  })().catch((err) => {
    connection = null; // allow a retry on the next request
    throw err;
  });
  return connection;
}

type ToolResult = { content?: unknown[]; structuredContent?: unknown };

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

/* Pull the first usable image URL out of a tool result's content blocks or
   structured payload. A 4-up grid is a single URL, which is fine. */
function extractImageUrl(result: ToolResult): string | null {
  for (const raw of result.content ?? []) {
    const b = asRecord(raw);
    if (!b) continue;
    if (b.type === "image" && typeof b.url === "string") return b.url;
    const res = asRecord(b.resource);
    const uri = (typeof b.uri === "string" && b.uri) || (res && typeof res.uri === "string" && res.uri);
    if (uri && /^https?:\/\//.test(uri)) return uri;
    if (b.type === "text" && typeof b.text === "string") {
      const m = b.text.match(URL_RE);
      if (m) return m[0];
    }
  }
  if (result.structuredContent) {
    const m = JSON.stringify(result.structuredContent).match(URL_RE);
    if (m) return m[0];
  }
  return null;
}

function extractTaskId(result: ToolResult): string | null {
  const sc = asRecord(result.structuredContent);
  for (const k of ["task_id", "taskId", "id", "jobId", "job_id"]) {
    const v = sc?.[k];
    if (typeof v === "string" && v) return v;
  }
  const text = (result.content ?? [])
    .map((raw) => asRecord(raw))
    .filter((b): b is Record<string, unknown> => !!b && b.type === "text")
    .map((b) => (typeof b.text === "string" ? b.text : ""))
    .join("\n");
  const m = text.match(/["']?(?:task_?id|job_?id|id)["']?\s*[:=]\s*["']?([\w-]{6,})/i);
  return m?.[1] ?? null;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* Generate one image for `prompt` at the given Midjourney aspect ratio
   (e.g. "4:3", "1:1"). Returns the image URL. */
export async function generateImage(prompt: string, aspect: string): Promise<string> {
  const { client, imagineTool, statusTool, statusArgKey } = await connect();

  const res = (await client.callTool({
    name: imagineTool,
    arguments: { prompt: `${prompt} --ar ${aspect}` },
  })) as ToolResult;

  const direct = extractImageUrl(res);
  if (direct) return direct;

  const taskId = extractTaskId(res);
  if (!taskId || !statusTool) {
    throw new Error("Midjourney returned no image and no task to poll");
  }

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await wait(POLL_INTERVAL_MS);
    const status = (await client.callTool({
      name: statusTool,
      arguments: { [statusArgKey]: taskId },
    })) as ToolResult;
    const url = extractImageUrl(status);
    if (url) return url;
  }
  throw new Error("Midjourney image generation timed out");
}
