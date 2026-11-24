// LetterPilot Cloudflare Worker: uses NVIDIA first, then Google Gemini on provider failure.
// Secrets (Cloudflare → Worker → Settings → Variables and Secrets):
//   NVIDIA_API_KEY            key for the NVIDIA hosted inference API
//   GEMINI_API_KEY            key from aistudio.google.com
//   LETTERPILOT_ADMIN_TOKEN   password for the code management page (letterpilot/admin.html)
//   LETTERPILOT_TEST_TOKEN    optional old shared access code (still accepted while it exists)
// Bindings:
//   LP_KV     Workers KV namespace that stores personal access codes under the key "codes"
//   LIMITS    Durable Object namespace (class Limiter): per-code request counters
const ORIGIN = "https://aslipixel.github.io";
// The website plus the iPhone (capacitor://localhost) and Android (https://localhost) apps.
const ALLOWED = [ORIGIN, "capacitor://localhost", "https://localhost"];
// Tried in order; the next one is used when a model is refused (missing, payment, rate limit, overloaded).
// Measured: flash-lite answers a full analysis in ~5 s; flash with low thinking ~40 s (backup).
const NVIDIA_MODEL = "nvidia/nemotron-nano-12b-v2-vl";
const GEMINI_MODELS = [
  { model: "gemini-flash-lite-latest" },
  { model: "gemini-flash-latest", thinking: { thinkingLevel: "low" } }
];
const MAX_BODY = 7 * 1024 * 1024;
// Requests allowed for each access code.
const PER_MINUTE = 10;
const PER_DAY = 200;

function headers(origin) {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...(ALLOWED.includes(origin) ? {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-LetterPilot-Token, X-Admin-Token",
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

async function callNvidia(key, base, analysis) {
  const messages = [];
  if (base.system) messages.push({ role: "system", content: base.system });
  for (const { role, content } of base.messages) {
    if (content.every(p => p.type === "text")) {
      messages.push({ role, content: content.map(p => p.text).join("\n") });
      continue;
    }
    // Pass the full request to Gemini when NVIDIA cannot accept this attachment.
    if (role !== "user" || content.some(p => p.type === "document")) {
      return { ok: false, status: 415, text: "Unsupported NVIDIA attachment" };
    }
    messages.push({ role, content: content.map(p => p.type === "text" ? p : {
      type: "image_url", image_url: { url: "data:" + p.source.media_type + ";base64," + p.source.data }
    }) });
  }
  const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(30000),
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({ model: NVIDIA_MODEL, messages, temperature: base.temperature,
      max_tokens: Math.min(base.max_tokens, 8192), stream: false })
  });
  if (!res.ok) return { ok: false, status: res.status, text: "NVIDIA request failed" };
  const choice = (await res.json()).choices?.[0];
  if (choice?.finish_reason === "content_filter" || choice?.message?.refusal) {
    return { ok: true, content: [], stop_reason: "refusal" };
  }
  const text = choice?.message?.content;
  if (typeof text !== "string" || !text.trim()) return { ok: false, status: 502, text: "Empty NVIDIA response" };
  if (analysis) {
    try {
      const parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/gi, ""));
      if (!Array.isArray(parsed?.paragraphs) || choice.finish_reason === "length") throw new Error();
    } catch {
      return { ok: false, status: 502, text: "Incomplete NVIDIA document analysis" };
    }
  }
  return { ok: true, content: [{ type: "text", text }], stop_reason: choice.finish_reason === "length" ? "max_tokens" : "end_turn" };
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

// ---------- personal access codes (stored in KV as one JSON object: { code: {name, created, lastUsed, disabled} }) ----------
let codesCache = null, codesAt = 0;
async function loadCodes(env, fresh) {
  if (!env.LP_KV) return {};
  if (!fresh && codesCache && Date.now() - codesAt < 20000) return codesCache;
  codesCache = (await env.LP_KV.get("codes", "json")) || {};
  codesAt = Date.now();
  return codesCache;
}
async function saveCodes(env, codes) {
  await env.LP_KV.put("codes", JSON.stringify(codes));
  codesCache = codes; codesAt = Date.now();
}
function newCode() {
  const b = new Uint8Array(18); crypto.getRandomValues(b);
  return "LP-" + btoa(String.fromCharCode(...b)).replace(/\+/g, "A").replace(/\//g, "B").replace(/=+$/, "");
}
const today = () => new Date().toISOString().slice(0, 10);
async function checkCode(env, code, ctx) {
  if (!code || code.length < 16) return null;
  if (env.LETTERPILOT_ADMIN_TOKEN && code.length >= 24 && code === env.LETTERPILOT_ADMIN_TOKEN) return { name: "Администратор", admin: true };
  if (env.LETTERPILOT_TEST_TOKEN && code === env.LETTERPILOT_TEST_TOKEN) return { name: "legacy" };
  const codes = await loadCodes(env);
  const c = codes[code];
  if (!c || c.disabled) return null;
  if (c.lastUsed !== today()) { // remember the day of last use (at most one write per code per day)
    const fresh = await loadCodes(env, true);
    if (fresh[code]) { fresh[code].lastUsed = today(); ctx.waitUntil(saveCodes(env, fresh)); }
  }
  return c;
}
async function handleAdmin(request, env, url, origin) {
  const adm = request.headers.get("X-Admin-Token") || "";
  if (!env.LETTERPILOT_ADMIN_TOKEN || adm.length < 24 || adm !== env.LETTERPILOT_ADMIN_TOKEN) return respond({ error: "Invalid admin password" }, 401, origin);
  if (!env.LP_KV) return respond({ error: "Code storage is not connected" }, 503, origin);
  const codes = await loadCodes(env, true);
  if (url.pathname === "/admin/codes" && request.method === "GET") {
    return respond({ codes: Object.entries(codes).map(([code, c]) => ({ code, ...c })) }, 200, origin);
  }
  const body = await request.json().catch(() => ({}));
  if (url.pathname === "/admin/codes" && request.method === "POST") {
    const name = String(body.name || "").trim().slice(0, 60) || "Без имени";
    const code = newCode();
    codes[code] = { name, created: today(), lastUsed: "", disabled: false };
    await saveCodes(env, codes);
    return respond({ code, ...codes[code] }, 200, origin);
  }
  if (url.pathname === "/admin/codes/update" && request.method === "POST") {
    const code = String(body.code || "");
    if (!codes[code]) return respond({ error: "No such code" }, 404, origin);
    if (body.delete) delete codes[code];
    else {
      if (typeof body.disabled === "boolean") codes[code].disabled = body.disabled;
      if (typeof body.name === "string" && body.name.trim()) codes[code].name = body.name.trim().slice(0, 60);
    }
    await saveCodes(env, codes);
    return respond({ ok: true }, 200, origin);
  }
  return respond({ error: "Not found" }, 404, origin);
}

export default {
  async fetch(request, env, ctx) {
    const nvidiaKey = env.NVIDIA_API_KEY || "";
    const geminiKey = env.GEMINI_API_KEY || "";
    const origin = request.headers.get("Origin") || "";
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: ALLOWED.includes(origin) ? 204 : 403, headers: headers(origin) });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      // Says whether the secrets exist, never their values.
      return respond({
        ok: true,
        service: "letterpilot",
        nvidiaKeySet: !!nvidiaKey,
        nvidiaModel: NVIDIA_MODEL,
        geminiModels: GEMINI_MODELS.map(m => m.model),
        geminiKeySet: !!geminiKey,
        codeStorage: !!env.LP_KV,
        rateLimit: !!env.LIMITS,
        adminSet: !!env.LETTERPILOT_ADMIN_TOKEN,
        testTokenSet: !!env.LETTERPILOT_TEST_TOKEN
      }, 200, origin);
    }

    if (url.pathname === "/whoami" && request.method === "GET") {
      // Tells the page whether the entered code works and whether it is the administrator's.
      if (!ALLOWED.includes(origin)) return respond({ error: "Origin not allowed" }, 403, origin);
      const who = await checkCode(env, request.headers.get("X-LetterPilot-Token") || "", ctx);
      if (!who) return respond({ ok: false }, 401, origin);
      return respond({ ok: true, admin: !!who.admin, name: who.name }, 200, origin);
    }

    if (url.pathname.startsWith("/admin/")) {
      if (!ALLOWED.includes(origin)) return respond({ error: "Origin not allowed" }, 403, origin);
      return handleAdmin(request, env, url, origin);
    }

    if (url.pathname !== "/api" || request.method !== "POST") {
      return respond({ error: "Not found" }, 404, origin);
    }
    if (!ALLOWED.includes(origin)) return respond({ error: "Origin not allowed" }, 403, origin);

    if (!nvidiaKey && !geminiKey) return respond({ error: "No AI provider configured" }, 503, origin);

    const token = request.headers.get("X-LetterPilot-Token") || "";
    const who = await checkCode(env, token, ctx);
    if (!who) return respond({ error: "Invalid or disabled access code" }, 401, origin);
    if (env.LIMITS) {
      const stub = env.LIMITS.get(env.LIMITS.idFromName(token));
      const lim = await stub.fetch(`https://limiter/hit?min=${PER_MINUTE}&day=${PER_DAY}`).then(r => r.json()).catch(() => ({ ok: true }));
      if (!lim.ok) return respond({ error: lim.why === "day" ? `Daily limit reached for this access code (${PER_DAY} requests): try again tomorrow` : `Too many requests for this access code (${PER_MINUTE} per minute): wait a minute`, status: 429 }, 429, origin);
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
      const attempts = [];
      if (nvidiaKey) attempts.push({ provider: "nvidia", model: NVIDIA_MODEL });
      if (geminiKey) attempts.push(...GEMINI_MODELS.map(m => ({ provider: "gemini", ...m })));
      for (const { provider, model, thinking } of attempts) {
        let r;
        try {
          r = provider === "nvidia"
            ? await callNvidia(nvidiaKey, base, body.analysis === true)
            : await callGemini(geminiKey, model, base, thinking);
        } catch (e) {
          console.log("Could not reach", provider, String(e?.message || e));
          last = { provider, model, status: 502, text: "network error" };
          continue;
        }
        if (r.ok) return respond({ provider, content: r.content, stop_reason: r.stop_reason }, 200, origin);
        console.log("Model error", provider, model, r.status, r.text);
        last = { provider, model, status: r.status, text: r.text };
        if (provider === "gemini" && ![404, 429, 500, 503].includes(r.status)) break; // e.g. 400: the request itself is wrong
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

// One instance per access code (idFromName(code)) keeps that code's counters.
export class Limiter {
  constructor(state) { this.state = state; }
  async fetch(request) {
    const u = new URL(request.url);
    const perMin = Number(u.searchParams.get("min")) || 10, perDay = Number(u.searchParams.get("day")) || 200;
    const now = Date.now(), day = new Date().toISOString().slice(0, 10);
    const s = (await this.state.storage.get("s")) || { m: [], day, d: 0 };
    if (s.day !== day) { s.day = day; s.d = 0; }
    s.m = s.m.filter(t => now - t < 60000);
    let res;
    if (s.m.length >= perMin) res = { ok: false, why: "minute" };
    else if (s.d >= perDay) res = { ok: false, why: "day" };
    else { s.m.push(now); s.d++; res = { ok: true, today: s.d }; }
    await this.state.storage.put("s", s);
    return new Response(JSON.stringify(res), { headers: { "Content-Type": "application/json" } });
  }
}
