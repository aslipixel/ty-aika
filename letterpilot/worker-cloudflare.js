// Generated bundle replaces __ASSETS__ during build.
const assets = {};
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': 'https://aslipixel.github.io', 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' } });
const randomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');
async function digest(code) { const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code)); return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join(''); }
function bearer(request) { const h = request.headers.get('Authorization') || ''; if (!h.startsWith('Bearer ')) return ''; try { return decodeURIComponent(h.slice(7)); } catch { return ''; } }
async function role(code, env) {
  if (!code) return null;
  if (env.LETTERPILOT_ACCESS_TOKEN && code === env.LETTERPILOT_ACCESS_TOKEN) return 'owner';
  if (!env.LP_CODES || code.length < 24) return null;
  const hash = await digest(code);
  if (hash === await env.LP_CODES.get('LP2:admin')) return 'admin';
  const record = await env.LP_CODES.get('LP2:code:' + hash, 'json');
  return record && !record.disabled ? 'friend' : null;
}
async function adminApi(request, env, path) {
  if (!env.LP_CODES) return reply({ error: 'Хранилище кодов не подключено' }, 503);
  const code = bearer(request);
  if (path === '/api/admin/init' && request.method === 'POST') {
    if (!env.LETTERPILOT_ACCESS_TOKEN || code !== env.LETTERPILOT_ACCESS_TOKEN) return reply({ error: 'Нужен код владельца' }, 401);
    if (await env.LP_CODES.get('LP2:admin')) return reply({ error: 'Админский код уже создан' }, 409);
    const newCode = randomCode();
    await env.LP_CODES.put('LP2:admin', await digest(newCode));
    return reply({ code: newCode });
  }
  if (await role(code, env) !== 'admin') return reply({ error: 'Неверный админский код' }, 401);
  if (path === '/api/admin/codes' && request.method === 'GET') {
    const list = await env.LP_CODES.list({ prefix: 'LP2:code:' });
    const codes = await Promise.all(list.keys.map(async key => ({ id: key.name.slice(9), ...await env.LP_CODES.get(key.name, 'json') })));
    return reply({ codes });
  }
  if (path === '/api/admin/codes' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const name = String(body.name || '').trim().slice(0, 60);
    if (!name) return reply({ error: 'Укажите имя друга' }, 400);
    const newCode = randomCode(), id = await digest(newCode);
    const record = { name, created: new Date().toISOString(), disabled: false, lastFour: newCode.slice(-4) };
    await env.LP_CODES.put('LP2:code:' + id, JSON.stringify(record));
    return reply({ code: newCode, id, ...record });
  }
  if (path === '/api/admin/codes/revoke' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    if (!/^[a-f0-9]{64}$/.test(body.id || '')) return reply({ error: 'Неверный ID' }, 400);
    const key = 'LP2:code:' + body.id;
    const record = await env.LP_CODES.get(key, 'json');
    if (!record) return reply({ error: 'Код не найден' }, 404);
    await env.LP_CODES.put(key, JSON.stringify({ ...record, disabled: true }));
    return reply({ ok: true });
  }
  return reply({ error: 'Not found' }, 404);
}
async function models(key) {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw Error('Gemini models HTTP ' + r.status);
  const available = ((await r.json()).models || []).filter(x => x.supportedGenerationMethods?.includes('generateContent') && /^models\/gemini-/.test(x.name) && !/image|tts|robotics|audio|live|embedding|transcribe/i.test(x.name)).map(x => x.name);
  return [...new Set(['models/gemini-3.5-flash-lite', 'models/gemini-3.8-flash', ...available])];
}
async function gemini(key, model, input) {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/' + model + ':generateContent', { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: input.contents, systemInstruction: { parts: [{ text: 'You are LetterPilot. Analyze documents carefully. Preserve names, numbers, dates. Do not invent facts. ' + (input.systemInstruction || '') }] }, generationConfig: { temperature: 0.2, ...(input.jsonMode ? { responseMimeType: 'application/json' } : {}) } }), signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw Error('Gemini HTTP ' + r.status);
  const text = (await r.json()).candidates?.[0]?.content?.parts?.map(x => x.text || '').join('');
  if (!text?.trim()) throw Error('Empty Gemini response');
  return text;
}
async function nvidia(key, input) {
  const messages = input.contents.map(x => ({ role: x.role === 'model' ? 'assistant' : 'user', content: x.parts.map(p => p.text || '').join('\n') }));
  const r = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'meta/llama-3.3-70b-instruct', messages: [{ role: 'system', content: 'You are LetterPilot. Analyze documents carefully. Do not invent facts. ' + (input.systemInstruction || '') + (input.jsonMode ? ' Return valid JSON only.' : '') }, ...messages], temperature: 0.2, max_tokens: 4096 }), signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw Error('NVIDIA HTTP ' + r.status);
  const text = (await r.json()).choices?.[0]?.message?.content;
  if (!text?.trim()) throw Error('Empty NVIDIA response');
  return text;
}
async function tts(request, env) {
  if (!await role(bearer(request), env)) return reply({ error: 'Неверный код доступа' }, 401);
  if (!env.GEMINI_API_KEY) return reply({ error: 'Ключ Gemini не настроен' }, 503);
  const body = await request.json().catch(() => ({}));
  const words = String(body.text || '').trim();
  if (!words || words.length > 2000) return reply({ error: 'Фрагмент для озвучивания должен быть не длиннее 2000 символов' }, 400);
  const voices = ['Sulafat', 'Achernar', 'Kore', 'Charon'];
  const voice = voices.includes(body.voice) ? body.voice : 'Sulafat';
  const upstream = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent', {
    method: 'POST', headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: 'Read aloud naturally and clearly in the original language: ' + words }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } }),
    signal: AbortSignal.timeout(60000)
  });
  if (!upstream.ok) return reply({ error: 'Голос Gemini недоступен: HTTP ' + upstream.status }, 502);
  const data = await upstream.json();
  const audio = data.candidates?.[0]?.content?.parts?.find(item => item.inlineData?.data)?.inlineData;
  if (!audio?.data) return reply({ error: 'Gemini не вернул аудио' }, 502);
  const pcm = Uint8Array.from(atob(audio.data), c => c.charCodeAt(0));
  const wav = new Uint8Array(44 + pcm.length);
  const view = new DataView(wav.buffer);
  for (const [offset, word] of [[0, 'RIFF'], [8, 'WAVE'], [12, 'fmt '], [36, 'data']]) for (let i = 0; i < 4; i++) wav[offset + i] = word.charCodeAt(i);
  view.setUint32(4, 36 + pcm.length, true); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 24000, true); view.setUint32(28, 48000, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); view.setUint32(40, pcm.length, true);
  wav.set(pcm, 44);
  let binary = '';
  for (let i = 0; i < wav.length; i += 8192) binary += String.fromCharCode(...wav.subarray(i, i + 8192));
  return reply({ audio: btoa(binary), mimeType: 'audio/wav' });
}
export default { async fetch(request, env) {
  const path = new URL(request.url).pathname;
  if (request.method === 'OPTIONS') return reply({});
  const types = { '/': 'text/html; charset=utf-8', '/style.css': 'text/css; charset=utf-8', '/app.js': 'text/javascript; charset=utf-8' };
  if (request.method === 'GET' && Object.hasOwn(assets, path)) return new Response(assets[path], { headers: { 'Content-Type': types[path], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  if (path === '/health') return reply({ status: 'ready' });
  if (path.startsWith('/api/admin/')) return adminApi(request, env, path);
  if (path === '/api/tts' && request.method === 'POST') {
    try { return await tts(request, env); }
    catch { return reply({ error: 'Не удалось получить голос Gemini. Попробуйте позже.' }, 502); }
  }
  if (path !== '/api/generate') return reply({ error: 'Not found' }, 404);
  if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  if (!await role(bearer(request), env)) return reply({ error: 'Неверный код доступа' }, 401);
  if (Number(request.headers.get('Content-Length') || 0) > 11_000_000) return reply({ error: 'Слишком большой файл' }, 413);
  let input;
  try { input = await request.json(); } catch { return reply({ error: 'Неверный JSON' }, 400); }
  if (!Array.isArray(input?.contents) || !input.contents.length || !['auto','gemini','nvidia'].includes(input.provider) || JSON.stringify(input).length > 11_000_000) return reply({ error: 'Неверный запрос' }, 400);
  const hasFiles = input.contents.some(x => x.parts?.some(p => p.inlineData));
  if (hasFiles && input.provider === 'nvidia') return reply({ error: 'Для фото и PDF выберите Gemini или автоматический режим' }, 400);
  const attempts = [];
  if (!hasFiles && input.provider !== 'gemini' && env.NVIDIA_API_KEY) attempts.push(['NVIDIA', () => nvidia(env.NVIDIA_API_KEY, input)]);
  if (input.provider !== 'nvidia' && env.GEMINI_API_KEY) {
    try { for (const model of (await models(env.GEMINI_API_KEY)).slice(0,3)) attempts.push([model, () => gemini(env.GEMINI_API_KEY, model, input)]); }
    catch(e) { console.warn(e.message); }
  }
  if (!attempts.length) return reply({ error: 'Нет доступной модели или ключа' }, 503);
  const errors = [];
  for (const [provider, call] of attempts) {
    try {
      const result = await call();
      if (input.jsonMode) JSON.parse(result.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim());
      return reply({ result, provider });
    }
    catch(e) { errors.push(provider + ': ' + e.message); console.warn('Provider failed', provider, e.message); }
  }
  return reply({ error: 'Сервисы ИИ не ответили', details: errors }, 503);
} };

