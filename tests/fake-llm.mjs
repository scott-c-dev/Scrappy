/* A fake LLM server for tests: answers Anthropic Messages (POST …/messages),
   OpenAI Chat Completions (POST …/chat/completions) and both model lists
   (GET …/models), records every request, and can be told to misbehave.
   No credits needed. */
import http from "node:http";

export const MODELS = ["claude-sonnet-5-5", "gpt-6-luna", "vendor-model", "text-embedding-3-small"];

export function startFakeLlm() {
  const state = {
    requests: [],
    /* ok | badjson | wrongshape | fenced | truncated | refusal | redirect
       | 400 | 400credit | 401 | 402 | 404 | 429 | 429busy | models404 | noanswer | slow
       | schema400 | schema422 | schemaIgnored: how vendors without strict-schema
       output react to it (fine once the schema comes in the prompt instead) */
    mode: "ok",
    reply: {},
    models: MODELS,
  };
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw || "{}");
      state.requests.push({ method: req.method, path: req.url, headers: req.headers, body });
      const send = (code, obj) => {
        res.writeHead(code, { "content-type": "application/json" });
        res.end(JSON.stringify(obj));
      };
      const fail = (code, message) =>
        send(code, { type: "error", error: { type: "error", message, code: code === 429 ? "insufficient_quota" : null } });
      const { mode } = state;
      if (mode === "redirect") {
        res.writeHead(302, { location: "http://127.0.0.1:9/" });
        return res.end();
      }
      if (mode === "401") return fail(401, "invalid key");
      if (mode === "402") return fail(402, "payment required");
      if (mode === "429") return fail(429, "You exceeded your current quota");
      if (mode === "429busy") return send(429, { error: { message: "Rate limit reached for requests", code: "rate_limit_exceeded" } });
      if (mode === "400credit") return fail(400, "Your credit balance is too low to access the API");
      if (mode === "400") return fail(400, "unsupported parameter");
      if (mode === "404") return fail(404, "model not found");
      // Answers long after any test's timeout.
      if (mode === "slow") return void setTimeout(() => send(200, {}), 2000);

      // A strict-schema request: OpenAI's response_format, or Anthropic's output_config.format.
      const schemaAsked = body.response_format?.type === "json_schema" || !!body.output_config?.format;
      if (schemaAsked && mode === "schema400") return fail(400, "This response_format type is unavailable now");
      if (schemaAsked && mode === "schema422") {
        return send(422, { detail: [{ loc: ["body", "response_format"], msg: "Input should be 'text' or 'json_object'", type: "literal_error" }] });
      }
      // An error sent with a 200 and no answer in it.
      if (mode === "noanswer") return send(200, { error: { message: "Function is DEGRADED, try again later" } });

      if (req.method === "GET" && req.url.split("?")[0].endsWith("/models")) {
        if (mode === "models404") return fail(404, "not found");
        return send(200, {
          object: "list",
          data: state.models.map((id) => ({ id, object: "model", type: "model", created: 0, owned_by: "x", created_at: "2026-01-01T00:00:00Z", display_name: id })),
          has_more: false,
          first_id: null,
          last_id: null,
        });
      }

      let text = JSON.stringify(state.reply);
      if (mode === "badjson") text = "Sure! Here you go: {not json";
      if (mode === "wrongshape" || (schemaAsked && mode === "schemaIgnored")) text = JSON.stringify({ something: "else" });
      if (mode === "fenced") text = "```json\n" + text + "\n```";

      if (req.url.endsWith("/messages")) {
        const stop = mode === "truncated" ? "max_tokens" : mode === "refusal" ? "refusal" : "end_turn";
        return send(200, {
          id: "msg_test", type: "message", role: "assistant", model: body.model,
          stop_reason: stop, content: [{ type: "text", text }],
          usage: { input_tokens: 1, output_tokens: 1 },
        });
      }
      return send(200, {
        id: "chat_test", object: "chat.completion", model: body.model,
        choices: [{
          index: 0,
          finish_reason: mode === "truncated" ? "length" : "stop",
          message: {
            role: "assistant",
            content: mode === "refusal" ? null : text,
            refusal: mode === "refusal" ? "I can't help with that." : null,
          },
        }],
      });
    });
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const url = `http://127.0.0.1:${server.address().port}`;
      resolve({ state, url, close: () => server.close() });
    }),
  );
}
