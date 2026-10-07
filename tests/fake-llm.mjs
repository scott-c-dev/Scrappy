/* A fake LLM server for tests: answers both Anthropic Messages
   (POST …/messages) and OpenAI Chat Completions (POST …/chat/completions),
   records every request, and can be told to misbehave. No credits needed. */
import http from "node:http";

export function startFakeLlm() {
  const state = {
    requests: [],
    /* ok | badjson | wrongshape | fenced | nulls | truncated | refusal | 400 | 401 */
    mode: "ok",
    reply: {},
  };
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw || "{}");
      state.requests.push({ path: req.url, headers: req.headers, body });
      const send = (code, obj) => {
        res.writeHead(code, { "content-type": "application/json" });
        res.end(JSON.stringify(obj));
      };
      const { mode } = state;
      if (mode === "401")
        return send(401, { type: "error", error: { type: "authentication_error", message: "invalid key" } });
      if (mode === "400")
        return send(400, { type: "error", error: { type: "invalid_request_error", message: "unsupported parameter" } });

      let text = JSON.stringify(state.reply);
      if (mode === "badjson") text = "Sure! Here you go: {not json";
      if (mode === "wrongshape") text = JSON.stringify({ something: "else" });
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
