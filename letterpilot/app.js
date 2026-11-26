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
    state.config.largeText = false;
    state.config.adminToken = typeof saved.adminToken === "string" ? saved.adminToken : "";
    state.config.voice = ["Sulafat", "Achernar", "Kore", "Charon"].includes(saved.voice) ? saved.voice : "Sulafat";
  } catch (e) { /* Storage may be unavailable in private browsing. */ }
  $("cfgAccessToken").value = state.config.accessToken;
  $("cfgProvider").value = state.config.provider;
  $("cfgAdminToken").value = state.config.adminToken;
  $("cfgVoice").value = state.config.voice;
}

function saveConfig() {
  state.config.accessToken = $("cfgAccessToken").value.trim();
  state.config.provider = $("cfgProvider").value;
  state.config.largeText = false;
  state.config.voice = $("cfgVoice").value;
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
  $("btnOpenAdmin").addEventListener("click", () => { closeModal("settingsModal"); openModal("adminModal"); if (state.config.adminToken || state.config.accessToken) loadFriendCodes(); });
  $("btnCreateAdmin").addEventListener("click", createAdminCode);
  $("btnLoadCodes").addEventListener("click", loadFriendCodes);
  $("btnCreateFriend").addEventListener("click", createFriendCode);
  $("btnCopyNewCode").addEventListener("click", () => copyText($("newCodeValue").textContent));
  $("btnWaNewCode").addEventListener("click", () => window.open("https://wa.me/?text=" + encodeURIComponent(inviteText(newCodeName, $("newCodeValue").textContent)), "_blank", "noopener"));
  $("btnShareNewCode").addEventListener("click", () => navigator.share?.({ title: "Код LetterPilot", text: inviteText(newCodeName, $("newCodeValue").textContent) }).catch(() => {}));
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
  $("btnClearSpeech").addEventListener("click", clearSpeech);

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
const LP_URL = "https://aslipixel.github.io/ty-aika/letterpilot/";
let newCodeName = "";
function inviteText(name, code) {
  return `${name ? "Привет, " + name + "!" : "Привет!"} Вот твой код для LetterPilot — помощника с письмами и документами:

${code}

Открой ${LP_URL}, нажми значок настроек вверху справа, вставь код в поле «Код доступа» и нажми «Сохранить настройки».`;
}
function showNewCode(code, name = "") {
  newCodeName = name;
  $("newCodeValue").textContent = code;
  $("btnShareNewCode").classList.toggle("hidden", !navigator.share);
  $("newCodeBox").classList.remove("hidden");
}
function confirmTap(button, action) {
  let armed = false, timer = 0;
  const label = button.textContent;
  button.addEventListener("click", () => {
    if (!armed) {
      armed = true;
      button.textContent = "Точно удалить?";
      button.classList.add("armed");
      timer = setTimeout(() => { armed = false; button.textContent = label; button.classList.remove("armed"); }, 4000);
      return;
    }
    clearTimeout(timer);
    action();
  });
}
async function adminRequest(path, method = "GET", body = null, useOwner = false) {
  const token = useOwner ? state.config.accessToken : ($("cfgAdminToken").value.trim() || state.config.accessToken);
  if (!token) throw new Error("Сначала сохраните код доступа в настройках");
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
      row.className = "history-item code-row";
      const head = document.createElement("div");
      head.className = "code-head";
      const name = document.createElement("strong");
      name.textContent = item.name;
      const meta = document.createElement("span");
      meta.className = item.disabled ? "code-off" : "code-on";
      meta.textContent = `…${item.lastFour} · ${item.disabled ? "отключён" : "активен"}`;
      head.append(name, meta);
      const actions = document.createElement("div");
      actions.className = "code-actions";
      const make = (label, cls) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "chip-btn " + cls;
        button.textContent = label;
        actions.append(button);
        return button;
      };
      const run = async (button, path, done) => {
        button.disabled = true;
        try { await adminRequest(path, "POST", { id: item.id }); await loadFriendCodes(); adminMessage(done); }
        catch (e) { adminMessage(e.message); button.disabled = false; }
      };
      const toggle = make(item.disabled ? "Включить снова" : "Отключить", "");
      toggle.addEventListener("click", () => item.disabled
        ? run(toggle, "/api/admin/codes/restore", `Код ${item.name} снова работает`)
        : run(toggle, "/api/admin/codes/revoke", `Код ${item.name} отключён`));
      const renew = make("Новый код и отправить", "accent");
      renew.addEventListener("click", async () => {
        renew.disabled = true;
        try {
          const created = await adminRequest("/api/admin/codes", "POST", { name: item.name });
          let oldGone = true;
          try { await adminRequest("/api/admin/codes/delete", "POST", { id: item.id }); }
          catch { try { await adminRequest("/api/admin/codes/revoke", "POST", { id: item.id }); } catch { oldGone = false; } }
          showNewCode(created.code, item.name);
          await loadFriendCodes();
          adminMessage(oldGone
            ? `Новый код для ${item.name} готов — отправьте его. Старый больше не работает.`
            : `Новый код для ${item.name} готов, но старый код отключить не удалось — он ещё работает. Нажмите «Отключить» у старого кода.`);
          $("newCodeBox").scrollIntoView({ block: "nearest", behavior: "smooth" });
        } catch (e) { adminMessage(e.message); renew.disabled = false; }
      });
      const remove = make("Удалить", "danger");
      confirmTap(remove, () => run(remove, "/api/admin/codes/delete", `Код ${item.name} удалён`));
      row.append(head, actions);
      list.append(row);
    }
    adminMessage(data.codes?.length ? "Список кодов загружен" : "Кодов для друзей пока нет");
  } catch (e) { adminMessage(e.message); }
}
async function createFriendCode() {
  adminMessage("Создаю код...");
  try {
    const friend = $("friendName").value.trim();
    const data = await adminRequest("/api/admin/codes", "POST", { name: friend });
    showNewCode(data.code, friend);
    $("friendName").value = "";
    await loadFriendCodes();
    adminMessage("Код создан. Отправьте его другу — позже он не показывается.");
  } catch (e) { adminMessage(e.message); }
}

// --- File Handling ---
async function handleFileSelect(e) {
  const files = Array.from(e.target.files || []);
  for (const file of files) {
    const isImage = (file.type || "").startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name);
    if (isImage && file.size > 1.5 * 1024 * 1024) {
      // Фото с телефона часто весят 6–15 МБ: уменьшаем и пережимаем в JPEG прямо в браузере.
      // Для чтения текста хватает 2400 px по длинной стороне.
      if (file.size > 60 * 1024 * 1024) {
        showToast(`Фото ${file.name} больше 60 МБ — выберите другое.`);
        continue;
      }
      try {
        showToast(`Уменьшаю фото ${file.name}...`);
        const base64 = await compressImage(file);
        state.attachedFiles.push({ name: file.name.replace(/\.[^.]+$/, "") + ".jpg", mimeType: "image/jpeg", base64 });
      } catch (err) {
        showToast(`Не удалось открыть фото ${file.name}. Сохраните его как JPG и выберите снова.`);
      }
      continue;
    }
    if (file.size > 6 * 1024 * 1024) {
      showToast(`Файл ${file.name} больше 6 МБ. Для PDF разделите его на части.`);
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

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
    img.src = url;
  });
}

async function compressImage(file, maxSide = 2400, targetBytes = 3 * 1024 * 1024) {
  const img = await loadImage(file); // браузер сам учитывает поворот фото (EXIF)
  let side = maxSide;
  for (let attempt = 0; attempt < 5; attempt++) {
    const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; // прозрачный фон PNG → белый, а не чёрный
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const quality = attempt === 0 ? 0.85 : 0.78;
    const blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", quality));
    if (!blob) throw new Error("encode");
    if (blob.size <= targetBytes || attempt === 4) return fileToBase64(blob);
    side = Math.round(side * 0.8);
  }
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
    pill.innerHTML = `<span>${escapeHtml(f.name)}</span><button type="button" aria-label="Удалить">×</button>`;
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

  $("resLang").textContent = `${data.detected_language || "Авто"}`;
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
  $("btnClearSpeech").classList.add("hidden");
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
const speechControllers = new Set();
let speechCache = { key: "", parts: [] };
let speechNeedsTap = false;
function speechIdle() {
  const button = $("btnSpeakTranslation");
  speakingTranslation = false;
  speechNeedsTap = false;
  button.textContent = "Прослушать перевод";
  button.setAttribute("aria-pressed", "false");
  $("btnClearSpeech").classList.toggle("hidden", !speechCache.parts.some(Boolean));
}
function clearSpeech() {
  speechRun++;
  for (const controller of speechControllers) controller.abort();
  const player = $("translationAudio");
  player.pause();
  player.onended = null;
  player.removeAttribute("src");
  player.load();
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  speechCache = { key: "", parts: [] };
  speechIdle();
  showToast("Озвучка удалена");
}

function splitSpeechText(text) {
  const chunks = [];
  let remaining = text.trim();
  const limit = 420;
  while (remaining.length > limit) {
    const windowText = remaining.slice(0, limit + 1);
    const sentences = [...windowText.matchAll(/[.!?…](?=\s|$)/g)]
      .map(match => match.index + 1)
      .filter(position => position >= 220);
    const spaces = [...windowText.matchAll(/\s+/g)];
    let end = sentences.at(-1) || spaces.at(-1)?.index || limit;
    if (end < 220) end = limit;
    chunks.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function toggleTranslationSpeech() {
  const button = $("btnSpeakTranslation");
  const player = $("translationAudio");
  if (speechNeedsTap) {
    speechNeedsTap = false;
    button.textContent = "■ Остановить чтение";
    player.play().catch(() => {});
    return;
  }
  if (speakingTranslation) {
    speechRun++;
    for (const controller of speechControllers) controller.abort();
    player.pause();
    player.onended = null;
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    player.removeAttribute("src");
    speechIdle();
    return;
  }
  const text = state.currentAnalysis?.full_translation?.trim();
  if (!text) return showToast("Сначала разберите документ");
  if (!state.config.accessToken) return showToast("Сохраните код доступа в настройках");
  const chunks = splitSpeechText(text);
  const voice = state.config.voice;
  const token = state.config.accessToken;
  const cacheKey = voice + "\u0000" + text;
  if (speechCache.key !== cacheKey) speechCache = { key: cacheKey, parts: [] };
  const cache = speechCache;
  const pending = new Map();
  const run = ++speechRun;
  let index = 0;
  speakingTranslation = true;
  button.setAttribute("aria-pressed", "true");
  $("btnClearSpeech").classList.add("hidden");
  const prepare = (part) => {
    if (cache.parts[part]) return Promise.resolve(cache.parts[part]);
    if (pending.has(part)) return pending.get(part);
    const controller = new AbortController();
    speechControllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 65000);
    const request = (async () => {
      try {
        const res = await fetch(API_BASE + "/api/tts", {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${encodeURIComponent(token)}` },
          body: JSON.stringify({ text: chunks[part], voice })
        });
        const data = await res.json();
        if (!res.ok || !data.audio) throw new Error(data.error || "Голос недоступен");
        cache.parts[part] = data;
        return data;
      } catch (error) {
        return { error };
      } finally {
        clearTimeout(timeout);
        speechControllers.delete(controller);
      }
    })();
    pending.set(part, request);
    return request;
  };
  const next = async () => {
    if (run !== speechRun) return;
    if (index >= chunks.length) {
      speechIdle();
      return;
    }
    const part = index;
    const started = Date.now();
    button.textContent = `Готовлю часть ${part + 1} из ${chunks.length} · 0 с`;
    const timer = setInterval(() => {
      if (run !== speechRun) return clearInterval(timer);
      button.textContent = `Готовлю часть ${part + 1} из ${chunks.length} · ${Math.floor((Date.now() - started) / 1000)} с`;
    }, 1000);
    try {
      const data = await prepare(part);
      if (run !== speechRun) return;
      if (data.error) throw data.error;
      index = part + 1;
      if (index < chunks.length) prepare(index);
      player.src = `data:${data.mimeType || "audio/wav"};base64,${data.audio}`;
      player.onended = next;
      button.textContent = "■ Остановить чтение";
      await player.play().catch(() => {
        speechNeedsTap = true;
        button.textContent = "▶ Голос готов — нажмите, чтобы слушать";
      });
    } catch (e) {
      if (run !== speechRun) return;
      for (const controller of speechControllers) controller.abort();
      console.warn("Gemini TTS failed:", e.message);
      if (!("speechSynthesis" in window)) {
        speakingTranslation = false;
        button.textContent = "Прослушать перевод";
        button.setAttribute("aria-pressed", "false");
        showToast(e.message);
        return;
      }
      showToast(`Gemini: ${e.message}. Читаю голосом телефона`);
      button.textContent = "■ Остановить чтение";
      player.pause();
      player.onended = null;
      player.classList.add("hidden");
      const fallback = new SpeechSynthesisUtterance(chunks.slice(part).join(" "));
      const langs = { "Русский": "ru-RU", "Suomi": "fi-FI", "English": "en-US", "Deutsch": "de-DE", "Українська": "uk-UA", "Español": "es-ES", "Français": "fr-FR" };
      fallback.lang = langs[state.targetLang] || "ru-RU";
      fallback.onend = fallback.onerror = () => {
        if (run !== speechRun) return;
        speechIdle();
      };
      speechSynthesis.speak(fallback);
    } finally {
      clearInterval(timer);
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

