// LetterPilot Cloudflare Worker: forwards page requests to APInex.
// Secrets (Cloudflare → Worker → Settings → Variables and Secrets):
//   APINEX_API_KEY          key from apinex.bond
//   LETTERPILOT_TEST_TOKEN  access code given to testers (24+ characters)
const ORIGIN = "https://aslipixel.github.io";
// Tried in order; the next one is used when APInex refuses a model (payment, missing, rate limit).
// The free/ models below unlock after a one-time $5 top-up at APInex (25M free tokens a day).
const MODELS = ["free/gpt-6-luna", "free/gemini-4-hydrogen", "free/gemini-3.8-flash"];
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

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: origin === ORIGIN ? 204 : 403, headers: headers(origin) });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      // Says whether the secrets exist, never their values.
      return respond({
        ok: true,
        service: "letterpilot-apinex",
        models: MODELS,
        apinexKeySet: !!env.APINEX_API_KEY,
        testTokenSet: !!env.LETTERPILOT_TEST_TOKEN
      }, 200, origin);
    }

    if (url.pathname !== "/api" || request.method !== "POST") {
      return respond({ error: "Not found" }, 404, origin);
    }
    if (origin !== ORIGIN) return respond({ error: "Origin not allowed" }, 403, origin);

    if (!env.APINEX_API_KEY || !env.LETTERPILOT_TEST_TOKEN) {
      const missing = [!env.APINEX_API_KEY && "APINEX_API_KEY", !env.LETTERPILOT_TEST_TOKEN && "LETTERPILOT_TEST_TOKEN"].filter(Boolean).join(", ");
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

      let response = null, last = null;
      for (const model of MODELS) {
        try {
          response = await fetch("https://api.apinex.bond/v1/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": env.APINEX_API_KEY, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({ ...base, model })
          });
        } catch (e) {
          console.log("Could not reach APInex:", String(e?.message || e));
          return respond({ error: "Could not reach APInex" }, 502, origin);
        }
        if (response.ok) break;
        const status = response.status;
        const text = (await response.text().catch(() => "")).slice(0, 600);
        console.log("APInex error", model, status, text);
        last = { status, text, model };
        response = null;
        if (![402, 403, 404, 429].includes(status)) break; // other errors: don't hammer the next model
      }

      if (!response) {
        const { status, text, model } = last;
        const reason =
          status === 401 || status === 403 ? "APInex rejected the API key" :
          status === 402 ? "APInex: payment required (a one-time $5 top-up unlocks the free models)" :
          status === 404 ? "APInex: model or endpoint not found (" + model + ")" :
          status === 429 ? "APInex: rate limit reached" :
          "APInex request failed";
        const clientStatus = [400, 413, 429].includes(status) ? status : 502;
        return respond({ error: reason, status, model, detail: text.slice(0, 300) }, clientStatus, origin);
      }

      const data = await response.json().catch(() => null);
      const content = Array.isArray(data?.content)
        ? data.content.filter(part => part?.type === "text" && typeof part.text === "string")
        : [];
      if (data?.stop_reason !== "refusal" && !content.some(part => part.text.trim())) {
        console.log("APInex returned no text:", JSON.stringify(data).slice(0, 600));
        return respond({ error: "APInex returned no text" }, 502, origin);
      }
      return respond({ content, stop_reason: data.stop_reason || "end_turn" }, 200, origin);
    } catch (err) {
      console.log("Invalid request:", String(err?.message || err));
      return respond({ error: "Invalid request: " + String(err?.message || "unknown").slice(0, 100) }, 400, origin);
    }
  }
};
