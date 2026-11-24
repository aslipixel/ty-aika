import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(new URL("../../letterpilot/worker.js", import.meta.url));
const { default: worker } = await import("data:text/javascript;base64," + source.toString("base64"));
const token = "example-test-access-code";
const env = { NVIDIA_API_KEY: "test-nvidia", GEMINI_API_KEY: "test-gemini", LETTERPILOT_TEST_TOKEN: token };
const image = { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AQID" } };
const request = (content, analysis = false) => new Request("https://example.org/api", {
  method: "POST", headers: { Origin: "https://aslipixel.github.io", "Content-Type": "application/json", "X-LetterPilot-Token": token },
  body: JSON.stringify({ messages: [{ role: "user", content }], analysis })
});
const completion = (text, reason = "stop") => Response.json({ choices: [{ message: { content: text }, finish_reason: reason }] });
const google = () => Response.json({ candidates: [{ content: { parts: [{ text: "fallback" }] }, finishReason: "STOP" }] });

test("NVIDIA handles text without contacting Gemini", async t => {
  const mock = t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(new URL(url).hostname, "integrate.api.nvidia.com");
    assert.equal(options.headers.Authorization, "Bearer test-nvidia");
    assert.equal(JSON.parse(options.body).messages[0].content, "letter");
    return completion('{"paragraphs":[]}');
  });
  const result = await worker.fetch(request("letter", true), env, {});
  assert.equal((await result.json()).provider, "nvidia");
  assert.equal(mock.mock.callCount(), 1);
});

for (const [name, fail] of Object.entries({
  quota: () => new Response("", { status: 429 }),
  invalidKey: () => new Response("", { status: 401 }),
  timeout: () => { throw new DOMException("Timed out", "TimeoutError"); },
  invalidJson: () => completion("incomplete"),
  empty: () => completion(""),
  truncated: () => completion('{"paragraphs":[]}', "length")
})) {
  test(name + " retries the same text and scan with Gemini", async t => {
    const calls = [];
    t.mock.method(globalThis, "fetch", async (url, options) => {
      calls.push(new URL(url).hostname);
      const body = JSON.parse(options.body);
      if (calls.length === 1) {
        assert.equal(body.messages[0].content[0].image_url.url, "data:image/jpeg;base64,AQID");
        assert.equal(body.messages[0].content[1].text, "read this");
        return fail();
      }
      assert.deepEqual(body.contents[0].parts, [{ inline_data: { mime_type: "image/jpeg", data: "AQID" } }, { text: "read this" }]);
      return google();
    });
    const result = await worker.fetch(request([image, { type: "text", text: "read this" }], true), env, {});
    assert.equal((await result.json()).provider, "gemini");
    assert.deepEqual(calls, ["integrate.api.nvidia.com", "generativelanguage.googleapis.com"]);
  });
}

test("content filter stops the request", async t => {
  const mock = t.mock.method(globalThis, "fetch", async () => completion("", "content_filter"));
  assert.equal((await (await worker.fetch(request("letter"), env, {})).json()).stop_reason, "refusal");
  assert.equal(mock.mock.callCount(), 1);
});
test("Gemini works with only its original key", async t => {
  t.mock.method(globalThis, "fetch", async url => { assert.equal(new URL(url).hostname, "generativelanguage.googleapis.com"); return google(); });
  const result = await worker.fetch(request("letter"), { ...env, NVIDIA_API_KEY: "" }, {});
  assert.equal((await result.json()).provider, "gemini");
});
test("no provider returns a service error", async () => {
  assert.equal((await worker.fetch(request("letter"), {}, {})).status, 503);
});
