// LetterPilot Cloudflare Worker: forwards page requests to Google Gemini only.
// Secrets (Cloudflare → Worker → Settings → Variables and Secrets):
//   GEMINI_API_KEY          key from aistudio.google.com
//   LETTERPILOT_TEST_TOKEN  access code given to testers (24+ characters)
const ORIGIN = "https://aslipixel.github.io";
// Tried in order; the next one is used when a model is refused (missing, payment, rate limit, overloaded).
// Measured: flash-lite answers a full analysis in ~5 s; flash with low thinking ~40 s (backup).
const GEMINI_MODELS = [
  { model: "gemini-flash-lite-latest" },
  { model: "gemini-flash-latest", thinking: { thinkingLevel: "low" } }
];
const MAX_BODY = 7 * 1024 * 1024;

function headers(origin) {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...(origin === ORIGIN ? {
      "Access-Control-Allow-Origin": ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-LetterPilot-Token",
      "Vary": "Origin"
    } : {})
  };
}

function respond(data, status, origin) {
  return new Response(JSON.stringify(data), { status, headers: headers(origin) });
}

function convertPart(part) {
  if (typeof part === "string") return { type: "text", text: part };
  if (!part || typeof part !== "object") throw new Error("Invalid message part");

  if (part.type === "text") {
    return { type: "text", text: String(part.text || "").slice(0, 200000) };
  }

  if (part.type === "image" || part.type === "document") {
    const source = part.source || {};
    const mimeType = source.media_type;
    if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(mimeType)) {
      throw new Error("Unsupported file type");
    }
    if (source.type !== "base64" || typeof source.data !== "string" || !/^[A-Za-z0-9+/=]+$/.test(source.data)) {
      throw new Error("Invalid attachment");
    }
    if (source.data.length > 5.6 * 1024 * 1024) throw new Error("File too large (max 4 MB)");
    return {
      type: mimeType === "application/pdf" ? "document" : "image",
      source: { type: "base64", media_type: mimeType, data: source.data }
    };
  }

  throw new Error("Unsupported message part");
}

// Converts the page's message format to Gemini's generateContent format and back.
async function callGemini(key, model, base, thinking) {
  const contents = base.messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: m.content.map(p => p.type === "text"
      ? { text: p.text }
      : { inline_data: { mime_type: p.source.media_type, data: p.source.data } })
  }));
  const body = {
    contents,
    generationConfig: { temperature: base.temperature, maxOutputTokens: Math.max(base.max_tokens, 8192), ...(thinking ? { thinkingConfig: thinking } : {}) },
    ...(base.system ? { systemInstruction: { parts: [{ text: base.system }] } } : {})
  };
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body)
  });
  if (!res.ok) return { ok: false, status: res.status, text: (await res.text().catch(() => "")).slice(0, 600) };
  const data = await res.json().catch(() => null);
  if (data?.promptFeedback?.blockReason) return { ok: true, content: [], stop_reason: "refusal" };
  const cand = data?.candidates?.[0];
  const text = (cand?.content?.parts || []).filter(p => typeof p.text === "string" && !p.thought).map(p => p.text).join("");
  const fr = cand?.finishReason;
  if (fr === "SAFETY" || fr === "PROHIBITED_CONTENT" || fr === "BLOCKLIST") return { ok: true, content: [], stop_reason: "refusal" };
  if (!text.trim()) return { ok: false, status: 502, text: "empty answer (" + (fr || "no reason") + ")" };
  return { ok: true, content: [{ type: "text", text }], stop_reason: fr === "MAX_TOKENS" ? "max_tokens" : "end_turn" };
}

export default {
  async fetch(request, env) {
    const geminiKey = env.GEMINI_API_KEY || "";
    const origin = request.headers.get("Origin") || "";
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: origin === ORIGIN ? 204 : 403, headers: headers(origin) });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      // Says whether the secrets exist, never their values.
      return respond({
        ok: true,
        service: "letterpilot",
        geminiModels: GEMINI_MODELS.map(m => m.model),
        geminiKeySet: !!geminiKey,
        testTokenSet: !!env.LETTERPILOT_TEST_TOKEN
      }, 200, origin);
    }

    if (url.pathname !== "/api" || request.method !== "POST") {
      return respond({ error: "Not found" }, 404, origin);
    }
    if (origin !== ORIGIN) return respond({ error: "Origin not allowed" }, 403, origin);

    if (!geminiKey || !env.LETTERPILOT_TEST_TOKEN) {
      const missing = [!geminiKey && "GEMINI_API_KEY", !env.LETTERPILOT_TEST_TOKEN && "LETTERPILOT_TEST_TOKEN"].filter(Boolean).join(", ");
      console.log("Missing secrets:", missing);
      return respond({ error: "Server secrets not configured: " + missing }, 503, origin);
    }

    const token = request.headers.get("X-LetterPilot-Token") || "";
    if (token.length < 24 || token !== env.LETTERPILOT_TEST_TOKEN) {
      return respond({ error: "Invalid test access code" }, 401, origin);
    }

    if (!(request.headers.get("Content-Type") || "").startsWith("application/json")) {
      return respond({ error: "JSON required" }, 415, origin);
    }
    if (Number(request.headers.get("Content-Length") || 0) > MAX_BODY) {
      return respond({ error: "Request too large" }, 413, origin);
    }

    try {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).length > MAX_BODY) {
        return respond({ error: "Request too large" }, 413, origin);
      }
      const body = JSON.parse(raw);
      if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 30) {
        return respond({ error: "Invalid messages" }, 400, origin);
      }

      const messages = body.messages.map(msg => {
        if (!["user", "assistant"].includes(msg.role)) throw new Error("Invalid role");
        const parts = (Array.isArray(msg.content) ? msg.content : [{ type: "text", text: msg.content }]).map(convertPart);
        return { role: msg.role, content: parts };
      });

      let system = String(body.system || "").slice(0, 16000);
      const schema = body.output_config?.format?.schema;
      if (schema) {
        system += "\nReturn a single valid JSON object matching this schema exactly; no Markdown or commentary:\n" +
          JSON.stringify(schema).slice(0, 14000);
      }

      const requestedTokens = body.max_tokens;
      const base = {
        messages,
        max_tokens: Number.isInteger(requestedTokens) && requestedTokens > 0 ? Math.min(requestedTokens, 12000) : 12000,
        temperature: 0.15,
        ...(system ? { system } : {})
      };

      let last = null;
      const attempts = GEMINI_MODELS.map(m => ({ provider: "gemini", model: m.model, thinking: m.thinking }));
      for (const { provider, model, thinking } of attempts) {
        let r;
        try {
          r = await callGemini(geminiKey, model, base, thinking);
        } catch (e) {
          console.log("Could not reach", provider, String(e?.message || e));
          last = { provider, model, status: 502, text: "network error" };
          continue;
        }
        if (r.ok) return respond({ content: r.content, stop_reason: r.stop_reason }, 200, origin);
        console.log("Model error", provider, model, r.status, r.text);
        last = { provider, model, status: r.status, text: r.text };
        if (![404, 429, 500, 503].includes(r.status)) break; // e.g. 400: the request itself is wrong
      }

      const { provider, model, status, text } = last || { provider: "-", model: "-", status: 502, text: "" };
      const reason =
        status === 401 || status === 403 ? provider + " rejected the API key" :
        status === 404 ? provider + ": model not found (" + model + ")" :
        status === 429 ? provider + ": rate limit reached, try again in a minute" :
        provider + " request failed";
      const clientStatus = [400, 413, 429].includes(status) ? status : 502;
      return respond({ error: reason, status, model, detail: String(text).slice(0, 300) }, clientStatus, origin);
    } catch (err) {
      console.log("Invalid request:", String(err?.message || err));
      return respond({ error: "Invalid request: " + String(err?.message || "unknown").slice(0, 100) }, 400, origin);
    }
  }
};
