/**
 * LetterPilot 2.0 — разбор документов, ответы и чат.
 * Поддержка: текст, скриншоты/фото, PDF, пошаговые действия, генерация ответов, AI-чат.
 */

const STORAGE_HIST = "docai_v2_history";
const STORAGE_CONFIG = "letterpilot_v2_config";

const state = {
  config: {
    accessToken: "",
    provider: "auto",
    largeText: false,
    adminToken: "",
    voice: "Sulafat"
  },
  attachedFiles: [], // { name, mimeType, base64, textContent? }
  rawInputText: "",
  targetLang: "Русский",
  currentAnalysis: null,
  selectedIntent: "Согласиться и подтвердить",
  chatHistory: [], // { role: 'user'|'model', parts: [{text}] }
  history: []
};

// DOM helper
const $ = (id) => document.getElementById(id);
function showRequestError(err) {
  const box = $("requestError");
  box.textContent = "Ошибка: " + (err?.message || String(err));
  box.classList.remove("hidden");
  $("appMain").scrollTop = 0;
}

// --- Initialization ---
document.addEventListener("DOMContentLoaded", () => {
  loadConfig();
  loadHistory();
  bindEvents();
});

function loadConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_CONFIG) || "{}");
    state.config.accessToken = typeof saved.accessToken === "string" ? saved.accessToken : "";
    state.config.provider = ["auto", "gemini", "nvidia"].includes(saved.provider) ? saved.provider : "auto";
    state.config.largeText = saved.largeText === true;
    state.config.adminToken = typeof saved.adminToken === "string" ? saved.adminToken : "";
    state.config.voice = ["Sulafat", "Achernar", "Kore", "Charon"].includes(saved.voice) ? saved.voice : "Sulafat";
  } catch (e) { /* Storage may be unavailable in private browsing. */ }
  $("cfgAccessToken").value = state.config.accessToken;
  $("cfgProvider").value = state.config.provider;
  $("cfgLargeText").checked = state.config.largeText;
  $("cfgAdminToken").value = state.config.adminToken;
  $("cfgVoice").value = state.config.voice;
  document.body.classList.toggle("large-text", state.config.largeText);
}

function saveConfig() {
  state.config.accessToken = $("cfgAccessToken").value.trim();
  state.config.provider = $("cfgProvider").value;
  state.config.largeText = $("cfgLargeText").checked;
  state.config.voice = $("cfgVoice").value;
  document.body.classList.toggle("large-text", state.config.largeText);
  try { localStorage.setItem(STORAGE_CONFIG, JSON.stringify(state.config)); }
  catch (e) { showToast("Браузер не разрешает сохранить код на устройстве"); return; }
  closeModal("settingsModal");
  showToast("Настройки сохранены");
}

function loadHistory() {
  try {
    state.history = JSON.parse(localStorage.getItem(STORAGE_HIST) || "[]");
  } catch (e) {
    state.history = [];
  }
}

function saveToHistory(entry) {
  state.history.unshift(entry);
  if (state.history.length > 15) state.history.pop();
  localStorage.setItem(STORAGE_HIST, JSON.stringify(state.history));
}

// --- Events ---
function bindEvents() {
  // Bottom navigation
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.goto));
  });

  // Header buttons
  $("btnNewDoc").addEventListener("click", () => {
    switchTab("viewInput");
    $("docTextInput").focus();
  });
  $("btnSettings").addEventListener("click", () => openModal("settingsModal"));
  $("btnHistory").addEventListener("click", () => {
    renderHistory();
    openModal("historyModal");
  });

  // Modal closers
  document.querySelectorAll("[data-close]").forEach((el) => {
    el.addEventListener("click", () => closeModal(el.dataset.close));
  });

  $("btnSaveSettings").addEventListener("click", saveConfig);
  $("btnOpenAdmin").addEventListener("click", () => { closeModal("settingsModal"); openModal("adminModal"); if (state.config.adminToken) loadFriendCodes(); });
  $("btnCreateAdmin").addEventListener("click", createAdminCode);
  $("btnLoadCodes").addEventListener("click", loadFriendCodes);
  $("btnCreateFriend").addEventListener("click", createFriendCode);
  $("btnCopyNewCode").addEventListener("click", () => copyText($("newCodeValue").textContent));
  $("btnClearHistory").addEventListener("click", () => {
    state.history = [];
    localStorage.removeItem(STORAGE_HIST);
    renderHistory();
    showToast("История очищена");
  });

  // Sample Document
  $("btnLoadSample").addEventListener("click", () => {
    $("docTextInput").value =
`MAKSUMUISTUTUS / PAYMENT REMINDER
Ref: 2026-88412 | Date: 25.11.2026

Hyvä asiakas,
Huomaamme, että lasku #40918 (summa 148,50 €) erääntyi 18.11.2026, emmekä ole vielä vastaanottaneet maksua.
Pyydämme teitä suorittamaan maksun viimeistään 02.12.2026 mennessä viitenumerolla 884120045.
Jos lasku on jo maksettu, voitte jättää tämän muistutuksen huomiotta. Mikäli tarvitsette maksuaikaa, ottakaa yhteyttä asiakaspalveluumme ennen eräpäivää (muistutusmaksu 5,00 € lisätään seuraavaan laskuun).

Ystävällisin terveisin,
Laskutusosasto / Billing Department`;
    showToast("Загружен пример документа");
  });

  // Clear input
  $("btnClearInput").addEventListener("click", () => {
    $("docTextInput").value = "";
    state.attachedFiles = [];
    $("fileInput").value = "";
    renderFileList();
  });

  // File upload
  $("fileInput").addEventListener("change", handleFileSelect);

  // Analyze button
  $("btnAnalyze").addEventListener("click", runAnalysis);

  // Translation toggle & copy
  $("btnToggleTrans").addEventListener("click", () => {
    const wrap = $("resTranslationWrap");
    const isHidden = wrap.classList.toggle("hidden");
    $("btnToggleTrans").textContent = isHidden ? "Показать" : "Скрыть";
  });

  $("btnCopyTrans").addEventListener("click", () => {
    if (!state.currentAnalysis) return;
    copyText(state.currentAnalysis.full_translation || "");
  });
  $("btnSpeakTranslation").addEventListener("click", toggleTranslationSpeech);

  // Reply intent chips
  $("replyIntentChips").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip-select");
    if (!chip) return;
    document.querySelectorAll("#replyIntentChips .chip-select").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    state.selectedIntent = chip.dataset.intent;
  });

  // Generate Reply
  $("btnGenReply").addEventListener("click", runReplyGenerator);
  $("btnCopyReply").addEventListener("click", () => copyText($("replyOrigText").textContent));
  $("btnShareEmail").addEventListener("click", () => {
    const body = encodeURIComponent($("replyOrigText").textContent);
    const subj = encodeURIComponent("Re: " + (state.currentAnalysis?.doc_type || "Document"));
    window.location.href = `mailto:?subject=${subj}&body=${body}`;
  });
  $("btnShareWhatsApp").addEventListener("click", () => {
    const text = encodeURIComponent($("replyOrigText").textContent);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  });

  // Chat
  $("chatForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("chatInput").value.trim();
    if (!q) return;
    $("chatInput").value = "";
    sendChatMessage(q);
  });

  document.querySelectorAll(".quick-q").forEach((btn) => {
    btn.addEventListener("click", () => sendChatMessage(btn.textContent));
  });
}

// --- Navigation ---
function switchTab(tabId) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
  $(tabId).classList.add("active");
  const navBtn = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  if (navBtn) navBtn.classList.add("active");
}

function openModal(id) { $(id).classList.remove("hidden"); }
function closeModal(id) { $(id).classList.add("hidden"); }

const API_BASE = "https://letterpilot-v2.asl-icopal.workers.dev";
function adminMessage(message) { $("adminMessage").textContent = message; }
function showNewCode(code) {
  $("newCodeValue").textContent = code;
  $("newCodeBox").classList.remove("hidden");
}
async function adminRequest(path, method = "GET", body = null, useOwner = false) {
  const token = useOwner ? state.config.accessToken : $("cfgAdminToken").value.trim();
  if (!token) throw new Error(useOwner ? "Сначала сохраните код доступа в настройках" : "Введите админский код");
  const res = await fetch(API_BASE + path, {
    method,
    headers: { "Authorization": `Bearer ${encodeURIComponent(token)}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Ошибка HTTP ${res.status}`);
  return data;
}
async function createAdminCode() {
  adminMessage("Создаю админский код...");
  try {
    const data = await adminRequest("/api/admin/init", "POST", null, true);
    $("cfgAdminToken").value = data.code;
    state.config.adminToken = data.code;
    localStorage.setItem(STORAGE_CONFIG, JSON.stringify(state.config));
    showNewCode(data.code);
    adminMessage("Админский код создан. Скопируйте его сейчас.");
  } catch (e) { adminMessage(e.message); }
}
async function loadFriendCodes() {
  adminMessage("Загружаю список...");
  try {
    state.config.adminToken = $("cfgAdminToken").value.trim();
    localStorage.setItem(STORAGE_CONFIG, JSON.stringify(state.config));
    const data = await adminRequest("/api/admin/codes");
    const list = $("friendCodeList");
    list.replaceChildren();
    for (const item of data.codes || []) {
      const row = document.createElement("div");
      row.className = "history-item";
      const name = document.createElement("strong");
      name.textContent = `${item.name} · …${item.lastFour}`;
      const status = document.createElement("span");
      status.textContent = item.disabled ? "Отключён" : "Активен";
      row.append(name, status);
      if (!item.disabled) {
        const button = document.createElement("button");
        button.className = "btn-secondary mt-10";
        button.textContent = "Отключить";
        button.addEventListener("click", async () => {
          button.disabled = true;
          try { await adminRequest("/api/admin/codes/revoke", "POST", { id: item.id }); await loadFriendCodes(); }
          catch (e) { adminMessage(e.message); button.disabled = false; }
        });
        row.append(button);
      }
      list.append(row);
    }
    adminMessage(data.codes?.length ? "Список кодов загружен" : "Кодов для друзей пока нет");
  } catch (e) { adminMessage(e.message); }
}
async function createFriendCode() {
  adminMessage("Создаю код...");
  try {
    const data = await adminRequest("/api/admin/codes", "POST", { name: $("friendName").value.trim() });
    showNewCode(data.code);
    $("friendName").value = "";
    await loadFriendCodes();
    adminMessage("Код создан. Скопируйте его и передайте другу лично.");
  } catch (e) { adminMessage(e.message); }
}

// --- File Handling ---
async function handleFileSelect(e) {
  const files = Array.from(e.target.files || []);
  for (const file of files) {
    if (file.size > 6 * 1024 * 1024) {
      showToast(`Файл ${file.name} больше 6 МБ. Выберите меньший файл.`);
      continue;
    }
    if (file.type === "text/plain" || file.name.endsWith(".txt")) {
      const text = await file.text();
      state.attachedFiles.push({ name: file.name, mimeType: "text/plain", textContent: text });
    } else {
      const base64 = await fileToBase64(file);
      state.attachedFiles.push({
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        base64
      });
    }
  }
  renderFileList();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.split(",")[1] || "");
    };
    reader.onerror = () => reject(new Error("Телефон не смог прочитать файл. Сохраните его на устройство и выберите снова."));
    reader.readAsDataURL(file);
  });
}

function renderFileList() {
  const container = $("filePreviewList");
  container.innerHTML = "";
  state.attachedFiles.forEach((f, idx) => {
    const pill = document.createElement("div");
    pill.className = "file-pill";
    pill.innerHTML = `<span>📎 ${escapeHtml(f.name)}</span><button type="button" aria-label="Удалить">×</button>`;
    pill.querySelector("button").addEventListener("click", () => {
      state.attachedFiles.splice(idx, 1);
      renderFileList();
    });
    container.appendChild(pill);
  });
}

// --- Server API ---
async function callGemini({ contents, systemInstruction = null, jsonMode = false }) {
  $("requestError").classList.add("hidden");
  const { accessToken, provider } = state.config;
  if (!accessToken) {
    openModal("settingsModal");
    throw new Error("Введите код доступа в настройках.");
  }
  const body = JSON.stringify({ contents, systemInstruction, jsonMode, provider });
  if (new Blob([body]).size > 10000000) {
    throw new Error("Вложения слишком большие для отправки. Отправьте один файл до 6 МБ или разделите PDF на части.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 150000);
  let res;
  try {
  res = await fetch("https://letterpilot-v2.asl-icopal.workers.dev/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${encodeURIComponent(accessToken)}` },
    body,
    signal: controller.signal
  });
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Сервер не успел обработать документ. Попробуйте одну страницу или небольшой PDF.");
    throw new Error("Не удалось отправить документ на сервер. Проверьте интернет, попробуйте файл меньшего размера и оставьте страницу открытой до завершения. Если ошибка повторяется, проверьте без VPN или через другую сеть.");
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = Array.isArray(data.details) ? data.details.join("; ") : "";
    throw new Error([data.error || `Ошибка сервера: HTTP ${res.status}`, detail].filter(Boolean).join(". "));
  }
  const text = data.result || "";
  if (!text) throw new Error("Пустой ответ от модели.");
  return text;
}

// --- 1. Document Analysis ---
async function runAnalysis() {
  const text = $("docTextInput").value.trim();
  if (!text && state.attachedFiles.length === 0) {
    showToast("Вставьте текст или прикрепите файл");
    return;
  }

  state.rawInputText = text;
  state.targetLang = $("targetLang").value;

  setLoading("btnAnalyze", "analyzeSpinner", true);
  $("statusSubtitle").textContent = "Анализирую документ...";
  const startedAt = Date.now();
  const progress = $("analysisProgress");
  progress.classList.remove("hidden");
  const updateProgress = () => {
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    const stage = seconds < 10 ? "Отправляю документ" : seconds < 35 ? "ИИ читает и разбирает документ" : "Обработка продолжается, подождите";
    progress.textContent = `${stage} · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  };
  updateProgress();
  const progressTimer = setInterval(updateProgress, 1000);

  try {
    const parts = [];
    const prompt = `Ты — профессиональный AI-ассистент по переводу и юридическо-бытовому разбору документов.
Проанализируй прикреплённый документ (текст, изображение/скриншот или PDF) и верни СТРОГО валидный JSON на языке "${state.targetLang}" со следующей структурой:
{
  "detected_language": "язык оригинала",
  "doc_type": "тип документа (например: Счёт / Напоминание, Договор, Письмо из ведомства, Сообщение)",
  "urgency": "high" | "medium" | "low",
  "urgency_label": "короткая метка срочности (например: Срочно до 02.12, Важно, Для сведения)",
  "summary": "краткая и понятная суть документа в 2-4 предложениях",
  "nuances": [
    {
      "category": "danger" | "warning" | "money" | "info",
      "title": "короткий заголовок нюанса (срок, сумма, штраф, требование)",
      "detail": "подробное объяснение"
    }
  ],
  "action_steps": [
    {
      "title": "чёткий шаг действия",
      "detail": "что именно нужно сделать"
    }
  ],
  "full_translation": "полный и точный перевод всего документа на язык ${state.targetLang}"
}`;

    parts.push({ text: prompt });

    if (text) {
      parts.push({ text: `--- ТЕКСТ ДОКУМЕНТА ---\n${text}` });
    }

    for (const f of state.attachedFiles) {
      if (f.textContent) {
        parts.push({ text: `--- ФАЙЛ ${f.name} ---\n${f.textContent}` });
      } else if (f.base64) {
        parts.push({
          inlineData: {
            mimeType: f.mimeType,
            data: f.base64
          }
        });
      }
    }

    const rawJson = await callGemini({
      contents: [{ role: "user", parts }],
      jsonMode: true
    });

    const parsed = parseJsonSafe(rawJson);
    state.currentAnalysis = parsed;

    // Reset chat with document context
    state.chatHistory = [];
    renderChatReset(parsed);

    renderAnalysis(parsed);
    renderActions(parsed);
    enableReplyTab();

    saveToHistory({
      id: Date.now(),
      date: new Date().toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
      doc_type: parsed.doc_type || "Документ",
      summary: parsed.summary || "",
      analysis: parsed,
      rawText: text
    });

    $("statusSubtitle").textContent = `${parsed.doc_type || "Документ"} (${parsed.detected_language || ""})`;
    switchTab("viewAnalysis");
    showToast("Разбор готов!");
  } catch (err) {
    showRequestError(err);
    $("statusSubtitle").textContent = "Ошибка анализа";
  } finally {
    clearInterval(progressTimer);
    progress.classList.add("hidden");
    setLoading("btnAnalyze", "analyzeSpinner", false);
  }
}

function renderAnalysis(data) {
  $("analysisEmpty").classList.add("hidden");
  $("analysisContent").classList.remove("hidden");

  $("resLang").textContent = `🌍 ${data.detected_language || "Авто"}`;
  $("resType").textContent = data.doc_type || "Документ";

  const urg = $("resUrgency");
  urg.className = `badge badge-urgency ${data.urgency || "low"}`;
  urg.textContent = data.urgency_label || "Информация";

  $("resSummary").textContent = data.summary || "—";

  const nuancesEl = $("resNuances");
  nuancesEl.innerHTML = "";
  (data.nuances || []).forEach((n) => {
    const div = document.createElement("div");
    div.className = `nuance-item ${n.category || "info"}`;
    div.innerHTML = `<strong>${escapeHtml(n.title || "")}</strong><p>${escapeHtml(n.detail || "")}</p>`;
    nuancesEl.appendChild(div);
  });

  $("resTranslation").textContent = data.full_translation || "—";
  $("resTranslationWrap").classList.add("hidden");
  $("btnToggleTrans").textContent = "Показать";
}

// --- 2. Action Checklist ---
function renderActions(data) {
  $("actionsEmpty").classList.add("hidden");
  $("actionsContent").classList.remove("hidden");

  const list = $("actionChecklist");
  list.innerHTML = "";
  const steps = data.action_steps || [];

  if (steps.length === 0) {
    list.innerHTML = `<p class="muted-sm">Особых действий не требуется.</p>`;
    return;
  }

  steps.forEach((step, idx) => {
    const item = document.createElement("div");
    item.className = "check-item";
    item.innerHTML = `
      <input type="checkbox" id="step_${idx}" />
      <div class="check-body">
        <div class="check-title">${escapeHtml(step.title || "")}</div>
        <div class="check-desc">${escapeHtml(step.detail || "")}</div>
        <button type="button" class="check-ask-btn">Объяснить подробнее в чате →</button>
      </div>
    `;

    const cb = item.querySelector("input");
    const body = item.querySelector(".check-body");
    cb.addEventListener("change", () => body.classList.toggle("done", cb.checked));

    item.querySelector(".check-ask-btn").addEventListener("click", () => {
      switchTab("viewChat");
      sendChatMessage(`Объясни максимально подробно, как выполнить шаг: "${step.title}". ${step.detail}`);
    });

    list.appendChild(item);
  });
}

// --- 3. Reply Generator ---
function enableReplyTab() {
  $("replyEmpty").classList.add("hidden");
  $("replyContent").classList.remove("hidden");
  $("replyResultCard").classList.add("hidden");
}

async function runReplyGenerator() {
  if (!state.currentAnalysis) return;
  setLoading("btnGenReply", "replySpinner", true);

  try {
    const tone = $("replyTone").value;
    const note = $("replyCustomNote").value.trim();
    const origLang = state.currentAnalysis.detected_language || "язык оригинала";

    const prompt = `На основе разобранного документа составь готовый ответ.
Суть документа: ${state.currentAnalysis.summary}
Полный перевод документа: ${state.currentAnalysis.full_translation}
Язык оригинала (на нём нужно написать ответ): ${origLang}
Язык пользователя (для обратного перевода): ${state.targetLang}
Цель ответа: ${state.selectedIntent}
Тон: ${tone}
Дополнительные пожелания пользователя: ${note || "нет"}

Верни СТРОГО валидный JSON:
{
  "original_reply": "готовый текст ответа на языке оригинала (${origLang})",
  "translated_reply": "точный перевод этого ответа на ${state.targetLang} для проверки пользователем"
}`;

    const raw = await callGemini({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      jsonMode: true
    });

    const parsed = parseJsonSafe(raw);
    $("replyOrigLang").textContent = origLang;
    $("replyOrigText").textContent = parsed.original_reply || "";
    $("replyTransText").textContent = parsed.translated_reply || "";
    $("replyResultCard").classList.remove("hidden");
  } catch (err) {
    showRequestError(err);
  } finally {
    setLoading("btnGenReply", "replySpinner", false);
  }
}

// --- 4. Context Chat ---
function renderChatReset(analysis) {
  const box = $("chatMessages");
  box.innerHTML = `
    <div class="chat-bubble ai">
      Документ «${escapeHtml(analysis.doc_type || "Документ")}» загружен в контекст. Задайте любой вопрос — подскажу, что делать дальше, переведу детали или помогу с формулировкой.
    </div>
  `;
}

async function sendChatMessage(question) {
  appendBubble("user", question);
  const thinkingEl = appendBubble("ai", "Думаю...");

  const contextSummary = state.currentAnalysis
    ? `Контекст документа:
Тип: ${state.currentAnalysis.doc_type}
Язык оригинала: ${state.currentAnalysis.detected_language}
Суть: ${state.currentAnalysis.summary}
Нюансы: ${JSON.stringify(state.currentAnalysis.nuances)}
Полный перевод: ${state.currentAnalysis.full_translation}`
    : "Документ ещё не загружен. Отвечай как полезный AI-переводчик и консультант.";

  const systemInstruction = `Ты — помощник LetterPilot. Отвечай чётко, конкретно и по делу на языке "${state.targetLang}".
${contextSummary}`;

  state.chatHistory.push({ role: "user", parts: [{ text: question }] });

  try {
    const answer = await callGemini({
      contents: state.chatHistory,
      systemInstruction,
      jsonMode: false
    });
    thinkingEl.textContent = answer;
    state.chatHistory.push({ role: "model", parts: [{ text: answer }] });
  } catch (err) {
    thinkingEl.textContent = `Ошибка: ${err.message}`;
    state.chatHistory.pop();
  }
}

function appendBubble(role, text) {
  const box = $("chatMessages");
  const div = document.createElement("div");
  div.className = `chat-bubble ${role}`;
  div.textContent = text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return div;
}

// --- History ---
function renderHistory() {
  const list = $("historyList");
  list.innerHTML = "";
  if (state.history.length === 0) {
    list.innerHTML = `<p class="muted-sm">История пока пуста.</p>`;
    return;
  }

  state.history.forEach((entry) => {
    const div = document.createElement("div");
    div.className = "history-item";
    div.innerHTML = `
      <strong>${escapeHtml(entry.doc_type)}</strong>
      <span>${escapeHtml(entry.date)} — ${escapeHtml((entry.summary || "").slice(0, 75))}...</span>
    `;
    div.addEventListener("click", () => {
      state.currentAnalysis = entry.analysis;
      state.rawInputText = entry.rawText || "";
      renderAnalysis(entry.analysis);
      renderActions(entry.analysis);
      enableReplyTab();
      renderChatReset(entry.analysis);
      closeModal("historyModal");
      switchTab("viewAnalysis");
    });
    list.appendChild(div);
  });
}

// --- Utilities ---
function parseJsonSafe(str) {
  const cleaned = str.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned);
}

function setLoading(btnId, spinnerId, isLoading) {
  $(btnId).disabled = isLoading;
  $(spinnerId).classList.toggle("hidden", !isLoading);
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(
    () => showToast("Скопировано!"),
    () => showToast("Не удалось скопировать")
  );
}

let speechRun = 0;
let speakingTranslation = false;
async function toggleTranslationSpeech() {
  const button = $("btnSpeakTranslation");
  const player = $("translationAudio");
  if (speakingTranslation) {
    speechRun++;
    player.pause();
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    player.removeAttribute("src");
    player.classList.add("hidden");
    speakingTranslation = false;
    button.textContent = "🔊 Прослушать перевод";
    button.setAttribute("aria-pressed", "false");
    return;
  }
  const text = state.currentAnalysis?.full_translation?.trim();
  if (!text) return showToast("Сначала разберите документ");
  if (!state.config.accessToken) return showToast("Сохраните код доступа в настройках");
  const chunks = [];
  let remaining = text;
  while (remaining.length) {
    let end = Math.min(1800, remaining.length);
    if (end < remaining.length) {
      const boundary = remaining.slice(0, end).search(/\s+\S*$/);
      if (boundary > 900) end = boundary + 1;
    }
    chunks.push(remaining.slice(0, end));
    remaining = remaining.slice(end);
  }
  const run = ++speechRun;
  let index = 0;
  speakingTranslation = true;
  button.textContent = "Готовлю живой голос...";
  button.setAttribute("aria-pressed", "true");
  const next = async () => {
    if (run !== speechRun) return;
    if (index >= chunks.length) {
      speakingTranslation = false;
      button.textContent = "🔊 Прослушать перевод";
      button.setAttribute("aria-pressed", "false");
      return;
    }
    button.textContent = `Готовлю часть ${index + 1} из ${chunks.length}...`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 70000);
      let data;
      let res;
      try {
        res = await fetch(API_BASE + "/api/tts", { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json", "Authorization": `Bearer ${encodeURIComponent(state.config.accessToken)}` }, body: JSON.stringify({ text: chunks[index++], voice: state.config.voice }) });
        data = await res.json();
      } finally { clearTimeout(timeout); }
      if (!res.ok || !data.audio) throw new Error(data.error || "Голос недоступен");
      if (run !== speechRun) return;
      player.src = `data:${data.mimeType || "audio/wav"};base64,${data.audio}`;
      player.classList.remove("hidden");
      player.onended = next;
      button.textContent = "■ Остановить чтение";
      await player.play().catch(() => showToast("Голос готов. Нажмите ▶ на плеере"));
    } catch (e) {
      if (run !== speechRun) return;
      if (!("speechSynthesis" in window)) {
        speakingTranslation = false;
        button.textContent = "🔊 Прослушать перевод";
        button.setAttribute("aria-pressed", "false");
        showToast(e.message);
        return;
      }
      showToast("Gemini недоступен. Читаю голосом телефона");
      button.textContent = "■ Остановить чтение";
      const fallback = new SpeechSynthesisUtterance(chunks.slice(index - 1).join(""));
      const langs = { "Русский": "ru-RU", "Suomi": "fi-FI", "English": "en-US", "Deutsch": "de-DE", "Українська": "uk-UA", "Español": "es-ES", "Français": "fr-FR" };
      fallback.lang = langs[state.targetLang] || "ru-RU";
      fallback.onend = fallback.onerror = () => {
        if (run !== speechRun) return;
        speakingTranslation = false;
        button.textContent = "🔊 Прослушать перевод";
        button.setAttribute("aria-pressed", "false");
      };
      speechSynthesis.speak(fallback);
    }
  };
  await next();
}

let toastTimer = null;
function showToast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 2200);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

