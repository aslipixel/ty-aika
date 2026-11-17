const measurementFields = {
  customerNumber: ['Asiakasnumero', 22],
  jobNumber: ['Työnumero', 30],
  site: ['Kohde', 55],
  customer: ['Tilaaja', 60],
  billing: ['Laskutusosoite', 65],
  vatZero: ['K-ALV 0 %', 12],
  vatAmount: ['ALV 24 %', 12],
  hours: ['Laskutettavat tunnit', 12],
  warrantyLong: ['Takuupäivä (10 v)', 24],
  warrantyShort: ['Takuupäivä (2 v)', 24],
  place: ['Paikka', 27],
  date: ['Päiväys', 16],
  workers: ['Työntekijät', 180, 5],
  approvedBy: ['Tilaajan edustajan hyväksyntä', 45],
  supervisor: ['Icopalin työnjohtaja', 45],
  billed: ['Laskutettu', 45],
  notes: ['Huomautuksia (esim. työnaikaiset muutokset)', 560, 6],
};
const measurementColumns = {
  mark: ['Tilaajan merkinnät', 20],
  work: ['Työselitys', 100],
  quantity: ['Määrä', 20],
  euros: ['Euro', 10],
  cents: ['Snt', 2],
  totalEuros: ['Yhteensä euro', 15],
  totalCents: ['Yhteensä snt', 2],
};
const measurementRowCount = 36;
const measurementPositions = {
    customerNumber: [394, 104, 111, 21],
    jobNumber: [589, 100, 320, 18],
    site: [213, 135, 295, 25],
    customer: [560, 123, 349, 21],
    billing: [606, 149, 303, 21],
    vatZero: [79, 132, 83, 28],
    vatAmount: [77, 168, 85, 28],
    hours: [285, 933, 222, 16],
    warrantyLong: [90, 996, 380, 29],
    warrantyShort: [90, 1032, 380, 31],
    place: [27, 1078, 145, 22],
    date: [183, 1079, 104, 21],
    workers: [297, 1085, 209, 161],
    approvedBy: [27, 1117, 112, 20],
    supervisor: [27, 1190, 112, 20],
    billed: [27, 1227, 261, 20],
    notes: [517, 1018, 392, 228],
  };
const measurementSignatures = {
  approvedBy: ['Tilaajan edustajan allekirjoitus', [143, 1106, 142, 30]],
  supervisor: ['Työnjohtajan allekirjoitus', [143, 1178, 142, 30]],
};
const signaturePointLimit = 2400;

function validateMeasurementSignatures(value) {
  return Object.fromEntries(Object.keys(measurementSignatures).map(key => {
    let remaining = signaturePointLimit;
    const strokes = [];
    for (const stroke of (Array.isArray(value?.[key]) ? value[key].slice(0, 240) : [])) {
      if (!Array.isArray(stroke) || !remaining) break;
      const points = stroke.slice(0, remaining).filter(point => Array.isArray(point) && point.length === 2
        && point.every(n => Number.isFinite(n) && n >= 0 && n <= 1));
      if (points.length) strokes.push(points);
      remaining -= points.length;
    }
    return [key, strokes];
  }));
}
const measurementColumnBounds = [[25, 118], [123, 508], [514, 643], [670, 720], [725, 753], [758, 862], [868, 912]];
function measurementCells(row) {
  return Object.entries(measurementColumns).map(([key, field], index) => {
    const [start, end] = measurementColumnBounds[index];
    return [key, field, [start, 234.6 + row * 19.35, end - start, 17.65]];
  });
}

let measurementTemplate;
let measurementTemplateUrl;
let measurementTemplateLoading = true;
let measurementTemplateSaving = false;

function measurementTemplateStorage(mode, request) {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open('tuntix-measurement-template', 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore('files');
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const tx = db.transaction('files', mode);
      const result = request(tx.objectStore('files'));
      tx.oncomplete = () => { db.close(); resolve(result.result); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  });
}

async function measurementSource(pdf, template) {
  const bytes = new Uint8Array(template.bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return pdf.embedJpg(bytes);
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return pdf.embedPng(bytes);
  throw Error('Valitse kuva JPG- tai PNG-muodossa.');
}

function useMeasurementTemplate(template) {
  if (measurementTemplateUrl) URL.revokeObjectURL(measurementTemplateUrl);
  measurementTemplate = template;
  measurementTemplateUrl = template ? URL.createObjectURL(new Blob([template.bytes], { type: template.type })) : null;
  const preview = document.getElementById('measurement-preview');
  if (preview) preview.innerHTML = measurementPreview(S.mittaus || { rows: [] });
}

function paintMeasurementTemplate(message) {
  const status = document.getElementById('measurement-template-status');
  if (!status) return;
  status.textContent = message || (measurementTemplate
    ? 'Käytössä: ' + measurementTemplate.name
    : 'Valitse mittaustodistuksen valokuva tai skannaus.');
  $('#measurement-template').disabled = measurementTemplateSaving || measurementTemplateLoading;
  document.querySelectorAll('[data-measurement-export]').forEach(button => {
    button.disabled = !measurementTemplate || measurementTemplateSaving;
  });
}

async function loadMeasurementTemplate() {
  if (!measurementTemplateLoading) return;
  try {
    useMeasurementTemplate(await measurementTemplateStorage('readonly', files => files.get('original')));
  } catch {
    // A selected image can still be used for the current session.
  } finally {
    measurementTemplateLoading = false;
    paintMeasurementTemplate();
  }
}

async function saveMeasurementTemplate(input) {
  const file = input.files[0];
  if (!file || measurementTemplateSaving || measurementTemplateLoading) return;
  if (file.size > 20 * 1024 * 1024) {
    paintMeasurementTemplate('Kuva on liian suuri. Enimmäiskoko on 20 Mt.');
    input.value = '';
    return;
  }
  measurementTemplateSaving = true;
  paintMeasurementTemplate('Avataan kuvaa…');
  let message;
  try {
    const bytes = await file.arrayBuffer();
    const type = new Uint8Array(bytes)[0] === 0xff ? 'image/jpeg' : 'image/png';
    const template = { name: file.name, type, bytes };
    const doc = await PDFLib.PDFDocument.create();
    const image = await measurementSource(doc, template);
    if (image.width >= image.height) throw Error('Valitse pystysuuntainen kuva koko lomakkeesta.');
    useMeasurementTemplate(template);
    try {
      await measurementTemplateStorage('readwrite', files => files.put(template, 'original'));
    } catch {
      message = 'Kuva on käytössä tämän istunnon ajan. Selain ei voinut tallentaa sitä.';
    }
  } catch (error) {
    message = /^(Valitse )/.test(error.message) ? error.message : 'Kuvan avaaminen epäonnistui. Kokeile toista JPG- tai PNG-kuvaa.';
  } finally {
    measurementTemplateSaving = false;
    input.value = '';
    paintMeasurementTemplate(message);
  }
}

function validateMeasurement(raw) {
  const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
  return {
    ...Object.fromEntries(Object.entries(measurementFields).map(([key, [, max]]) => [key, text(raw?.[key], max)])),
    kind: ['partial', 'final'].includes(raw?.kind) ? raw.kind : '',
    signatures: validateMeasurementSignatures(raw?.signatures),
    rows: Array.isArray(raw?.rows) ? raw.rows.slice(0, measurementRowCount).map(row =>
      Object.fromEntries(Object.entries(measurementColumns).map(([key, [, max]]) => [key, text(row?.[key], max)]))) : []
  };
}

function measurementInput(key, field, value, row) {
  const [label, max, lines] = field;
  const id = row === undefined ? 'mittaus-' + key : 'mittaus-' + row + '-' + key;
  const attributes = `id="${id}" data-measurement-field="${key}" maxlength="${max}"${row === undefined ? '' : ` data-row="${row}"`}`;
  return `<label for="${id}">${label}</label>${lines
    ? `<textarea ${attributes} rows="${lines}">${esc('\n' + (value || ''))}</textarea>`
    : `<input ${attributes} value="${esc(value)}">`}`;
}

function measurementRows(rows) {
  return Array.from({length: Math.max(rows.length, 1)}, (_, index) =>
    `<details class="measurement-row"${index === Math.max(rows.length, 1) - 1 ? ' open' : ''}>
      <summary>Työrivi ${index + 1}<span data-measurement-summary>${rows[index]?.work ? ' · ' + esc(rows[index].work) : ''}</span></summary>
      <div>${Object.entries(measurementColumns).map(([key, field]) => measurementInput(key, field, rows[index]?.[key], index)).join('')}</div>
      <button type="button" class="btn sm del" data-measurement-action="remove" data-row="${index}">Poista työrivi ${index + 1}</button>
    </details>`).join('');
}

function measurementPreview(draft) {
  if (!measurementTemplateUrl) return '';
  const style = ([x, y, w, h]) => `left:${x / 939 * 100}%;top:${y / 1280 * 100}%;width:${w / 939 * 100}%;height:${h / 1280 * 100}%`;
  function overlay(key, field, position, row) {
    const [label, max, multiline] = field, value = row === undefined ? draft[key] : draft.rows[row]?.[key];
    const attrs = `data-measurement-overlay data-measurement-field="${key}"${row === undefined ? '' : ` data-row="${row}"`}
      aria-label="${label}${row === undefined ? '' : ', rivi ' + (row + 1)}" maxlength="${max}" style="${style(position)}"`;
    return multiline ? `<textarea ${attrs}>${esc('\n' + (value || ''))}</textarea>` : `<input ${attrs} value="${esc(value)}">`;
  }
  const type = (value, label, position) => `<input type="radio" name="measurement-kind" value="${value}" data-measurement-overlay
    data-measurement-field="kind" aria-label="${label}" style="${style(position)}"${draft.kind === value ? ' checked' : ''}>`;
  return `<section class="card">
    <h3>Täytä suoraan lomakkeeseen</h3>
    <label class="weekend-toggle" for="measurement-zoom"><input type="checkbox" id="measurement-zoom"> Suurenna lomaketta</label>
    <div class="measurement-scroll" tabindex="0" aria-label="Vieritettävä mittaustodistus">
      <div class="measurement-photo">
        <img src="${measurementTemplateUrl}" alt="Alkuperäinen mittaustodistus" draggable="false">
        ${Object.entries(measurementSignatures).map(([key, [label, position]]) => {
          const strokes = draft.signatures?.[key];
          if (!strokes?.length) return '';
          return `<img class="measurement-signature-preview" style="${style(position)}" src="${signatureImage(strokes)}" alt="${label}">`;
        }).join('')}
        ${type('partial', 'Osamittaus', [122, 110, 15, 15])}
        ${type('final', 'Loppumittaus', [277, 110, 15, 15])}
        ${Object.entries(measurementPositions).map(([key, position]) => overlay(key, measurementFields[key], position)).join('')}
        ${Array.from({length: measurementRowCount}, (_, row) =>
          measurementCells(row).map(([key, field, position]) => overlay(key, field, position, row)).join('')).join('')}
      </div>
    </div>
  </section>`;
}

function measurementForm(fromCalculator = false) {
  const draft = S.mittaus || { rows: [] };
  const fields = keys => keys.map(key => measurementInput(key, measurementFields[key], draft[key])).join('');
  return `${fromCalculator
    ? '<div class="tes-page-toolbar"><h2>Urakkaselitys</h2><button type="button" class="btn sm" data-tes="calculator">Takaisin</button></div><h3>Mittaustodistus</h3>'
    : '<h2>Mittaustodistus</h2>'}
    <section class="card">
      <h3>Alkuperäinen lomake</h3>
      <p>Valitse kuva, jossa koko mittaustodistus näkyy suorassa. Kuva säilyy tämän laitteen selaimessa. PDF käyttää kuvaa sellaisenaan ja lisää täyttökentät sen päälle.</p>
      <label for="measurement-template">Mittaustodistuksen kuva (JPG tai PNG)</label>
      <input type="file" id="measurement-template" accept="image/jpeg,image/png,.jpg,.jpeg,.png"${measurementTemplateSaving || measurementTemplateLoading ? ' disabled' : ''}>
      <p id="measurement-template-status" role="status">${measurementTemplateLoading ? 'Etsitään tallennettua kuvaa…' : measurementTemplate ? 'Käytössä: ' + esc(measurementTemplate.name) : 'Valitse mittaustodistuksen valokuva tai skannaus.'}</p>
    </section>
    <div id="measurement-preview">${measurementPreview(draft)}</div>
    <details class="card measurement-form">
      <summary>Täytä kenttälistassa</summary>
      <h3>Mittauksen tiedot</h3>
      <label for="mittaus-kind">Mittaustapa</label>
      <select id="mittaus-kind" data-measurement-field="kind">
        <option value="">Valitse mittaustapa</option>
        <option value="partial"${draft.kind === 'partial' ? ' selected' : ''}>Osamittaus</option>
        <option value="final"${draft.kind === 'final' ? ' selected' : ''}>Loppumittaus</option>
      </select>
      ${fields(['customerNumber', 'jobNumber', 'site', 'customer', 'billing', 'vatZero', 'vatAmount'])}
      <h3>Työrivit</h3>
      <div id="measurement-rows">${measurementRows(draft.rows)}</div>
      <button type="button" class="btn" data-measurement-action="add"${draft.rows.length >= measurementRowCount ? ' disabled' : ''}>+ Lisää työrivi</button>
      ${fields(['hours'])}
      <h3>Takuu, hyväksyntä ja huomautukset</h3>
      ${fields(['warrantyLong', 'warrantyShort', 'place', 'date', 'workers', 'approvedBy', 'supervisor', 'billed', 'notes'])}
    </details>
    <section class="card">
      <h3>Allekirjoitukset</h3>
      ${Object.entries(measurementSignatures).map(([key, [label]]) => `<button type="button" class="btn" data-measurement-signature="${key}">${label}${draft.signatures?.[key]?.length ? ' ✓' : ''}</button>`).join('')}
    </section>
    <section class="card">
      <h3>Valmis mittaustodistus</h3>
      <button type="button" class="btn pri" data-measurement-action="download" data-measurement-export${measurementTemplate && !measurementTemplateSaving ? '' : ' disabled'}>Lataa täytettävä PDF</button>
      <button type="button" class="btn" data-measurement-action="print" data-measurement-export${measurementTemplate && !measurementTemplateSaving ? '' : ' disabled'}>Avaa PDF tulostusta varten</button>
      <button type="button" class="btn" data-measurement-action="mail" data-measurement-export${measurementTemplate && !measurementTemplateSaving ? '' : ' disabled'}>Lähetä sähköpostilla</button>
      <p id="measurement-status" role="status" hidden></p>
      <a id="measurement-email" href="mailto:?subject=Mittaustodistus" hidden>Avaa sähköposti</a>
      <button type="button" class="btn del" data-measurement-action="reset">Tyhjennä lomake</button>
    </section>`;
}

async function makeMeasurementPdf(draft, template) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const pdf = await PDFDocument.create();
  pdf.setTitle('Mittaustodistus');
  const image = await measurementSource(pdf, template);
  const page = pdf.addPage([595.28, 841.89]);
  const scale = Math.min(page.getWidth() / image.width, page.getHeight() / image.height);
  const imageWidth = image.width * scale, imageHeight = image.height * scale;
  const left = (page.getWidth() - imageWidth) / 2, bottom = (page.getHeight() - imageHeight) / 2;
  page.drawImage(image, { x: left, y: bottom, width: imageWidth, height: imageHeight });

  const form = pdf.getForm(), font = await pdf.embedFont(StandardFonts.Helvetica);
  const ink = rgb(0.08, 0.12, 0.17);
  // Field coordinates are measured on the full, uncropped 939 × 1280 reference photo.
  function rect(x, top, width, height) {
    return { x: left + x / 939 * imageWidth, y: bottom + (1280 - top - height) / 1280 * imageHeight,
      width: width / 939 * imageWidth, height: height / 1280 * imageHeight };
  }
  const transparent = { borderWidth: 0, borderColor: undefined, backgroundColor: undefined, textColor: ink };
  function textField(name, value, max, position, multiline = false) {
    const field = form.createTextField(name);
    if (multiline) field.enableMultiline();
    field.setMaxLength(max);
    const box = rect(...position);
    field.addToPage(page, { ...box, ...transparent, font });
    field.setText(value || '');
    const fit = multiline || !value ? Infinity : (box.width - 2) / font.widthOfTextAtSize(value, 1);
    field.setFontSize(Math.min(9, fit));
  }

  const kind = form.createRadioGroup('mittaustapa');
  kind.addOptionToPage('partial', page, { ...rect(122, 110, 15, 15), ...transparent });
  kind.addOptionToPage('final', page, { ...rect(277, 110, 15, 15), ...transparent });
  if (draft.kind) kind.select(draft.kind);
  for (const [id, position] of Object.entries(measurementPositions)) {
    const [, max, multiline] = measurementFields[id];
    textField(id, draft[id], max, position, !!multiline);
  }
  for (let row = 0; row < measurementRowCount; row++) {
    for (const [key, [, max], position] of measurementCells(row)) {
      textField(`tyorivi-${row + 1}-${key}`, draft.rows[row]?.[key], max, position);
    }
  }
  for (const [key, [, position]] of Object.entries(measurementSignatures)) {
    const strokes = draft.signatures[key];
    if (!strokes.length) continue;
    const signature = await pdf.embedPng(signatureImage(strokes));
    page.drawImage(signature, rect(...position));
  }
  form.updateFieldAppearances(font);
  return pdf.save();
}

function drawSignature(canvas, strokes) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = ctx.fillStyle = '#12346a';
  ctx.lineCap = ctx.lineJoin = 'round';
  ctx.lineWidth = 4.5;
  for (const stroke of strokes) {
    const [[x, y]] = stroke;
    ctx.beginPath();
    if (stroke.length === 1) {
      ctx.arc(x * canvas.width, y * canvas.height, ctx.lineWidth / 2, 0, 2 * Math.PI);
      ctx.fill();
      continue;
    }
    ctx.moveTo(x * canvas.width, y * canvas.height);
    for (const [px, py] of stroke.slice(1)) ctx.lineTo(px * canvas.width, py * canvas.height);
    ctx.stroke();
  }
}

function signatureImage(strokes) {
  const canvas = document.createElement('canvas');
  canvas.width = 650;
  canvas.height = 138;
  drawSignature(canvas, strokes);
  return canvas.toDataURL('image/png');
}

function openMeasurementSignature(key) {
  const [title] = measurementSignatures[key];
  const dialog = document.createElement('dialog');
  dialog.className = 'tes-dialog measurement-signature-dialog';
  dialog.setAttribute('aria-labelledby', 'measurement-signature-title');
  dialog.innerHTML = `<h2 id="measurement-signature-title">${title}</h2>
    <p>Piirrä allekirjoitus sormella, kynällä tai hiirellä.</p>
    <canvas width="650" height="138" aria-label="Allekirjoitusalue"></canvas>
    <button type="button" class="btn sm" data-clear>Tyhjennä</button>
    <div class="g2">
      <button type="button" class="btn" data-cancel>Peruuta</button>
      <button type="button" class="btn pri" data-save>Tallenna allekirjoitus</button>
    </div>`;
  const canvas = dialog.querySelector('canvas');
  let strokes = validateMeasurementSignatures(S.mittaus?.signatures)[key];
  let points = strokes.reduce((sum, stroke) => sum + stroke.length, 0);
  let active = null;
  const clamp = value => Math.min(1, Math.max(0, value));
  const position = event => {
    const bounds = canvas.getBoundingClientRect();
    return [
      Math.round(clamp((event.clientX - bounds.left) / bounds.width) * 10000) / 10000,
      Math.round(clamp((event.clientY - bounds.top) / bounds.height) * 10000) / 10000,
    ];
  };
  canvas.addEventListener('pointerdown', event => {
    if (active !== null || event.button !== 0 || points >= signaturePointLimit || strokes.length >= 240) return;
    active = event.pointerId;
    canvas.setPointerCapture(active);
    strokes.push([position(event)]);
    points++;
    drawSignature(canvas, strokes);
  });
  canvas.addEventListener('pointermove', event => {
    if (active !== event.pointerId || points >= signaturePointLimit) return;
    strokes.at(-1).push(position(event));
    points++;
    drawSignature(canvas, strokes);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(type, event => {
      if (active === event.pointerId) active = null;
    });
  }
  dialog.querySelector('[data-clear]').onclick = () => {
    strokes = [];
    points = 0;
    active = null;
    drawSignature(canvas, strokes);
  };
  dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
  dialog.querySelector('[data-save]').onclick = () => {
    if (!strokes.length && !S.mittaus?.signatures?.[key]?.length) {
      dialog.close();
      return;
    }
    const previous = S.mittaus, draft = validateMeasurement(S.mittaus);
    draft.signatures[key] = strokes;
    S.mittaus = draft;
    if (!save()) {
      S.mittaus = previous;
      return;
    }
    dialog.close();
    render(1);
    document.querySelector(`[data-measurement-signature="${key}"]`)?.focus({preventScroll:true});
  };
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  drawSignature(canvas, strokes);
  dialog.showModal();
}

function changeMeasurementRow(action, button) {
  const previous = S.mittaus;
  const draft = validateMeasurement(previous);
  if (action === 'add') {
    if (draft.rows.length >= measurementRowCount) return;
    if (!draft.rows.length) draft.rows.push({});
    draft.rows.push({});
  } else {
    const index = Number(button.dataset.row);
    if (Object.values(draft.rows[index] || {}).some(Boolean) && !confirm('Poistetaanko täytetty työrivi?')) return;
    draft.rows.splice(index, 1);
  }
  S.mittaus = draft;
  if (!save()) {
    S.mittaus = previous;
    return;
  }
  $('#measurement-rows').innerHTML = measurementRows(draft.rows);
  $('#measurement-preview').innerHTML = measurementPreview(draft);
  $('[data-measurement-action="add"]').disabled = draft.rows.length >= measurementRowCount;
  $('#measurement-rows details[open] summary')?.focus();
}

async function exportMeasurement(action) {
  if (!measurementTemplate) return;
  const status = $('#measurement-status'), mail = $('#measurement-email');
  status.hidden = false;
  status.textContent = 'Luodaan PDF-tiedostoa…';
  mail.hidden = true;
  const preview = action === 'print' && !window.nativeSharePdf ? window.open('about:blank', '_blank') : null;
  if (preview) preview.opener = null;
  const actions = [...document.querySelectorAll('[data-measurement-export]')];
  actions.forEach(item => item.disabled = true);
  try {
    const bytes = await makeMeasurementPdf(validateMeasurement(S.mittaus), measurementTemplate);
    const name = 'Mittaustodistus.pdf', type = 'application/pdf';
    if (window.nativeSharePdf) {
      await window.nativeSharePdf(name, bytes);
      status.textContent = 'Valitse tallennus, tulostus tai sähköposti laitteen jakovalikosta.';
    } else if (preview && !preview.closed) {
      const url = URL.createObjectURL(new Blob([bytes], { type }));
      preview.location.replace(url);
      setTimeout(() => URL.revokeObjectURL(url), 300000);
      status.textContent = 'Valitse Tulosta PDF-näkymässä.';
    } else if (action === 'mail') {
      const share = { title: 'Mittaustodistus', files: [new File([bytes], name, { type })] };
      if (navigator.canShare?.(share)) {
        try {
          await navigator.share(share);
          status.textContent = 'PDF jaettu.';
          return;
        } catch (error) {
          if (error.name === 'AbortError') {
            status.hidden = true;
            return;
          }
        }
      }
      download(name, bytes, type);
      status.textContent = 'PDF ladattu. Avaa sähköposti ja liitä Mittaustodistus.pdf viestiin.';
      mail.hidden = false;
      mail.focus();
    } else {
      download(name, bytes, type);
      status.textContent = action === 'print'
        ? 'PDF ladattu. Avaa tiedosto ja valitse Tulosta.'
        : 'Mittaustodistus.pdf on valmis.';
    }
  } catch (error) {
    preview?.close();
    status.textContent = /cannot encode/.test(error.message)
      ? 'PDF ei tue jotakin erikoismerkkiä. Tarkista kentät ja yritä uudelleen.'
      : 'PDF:n luominen tai avaaminen epäonnistui. Yritä uudelleen.';
  } finally {
    actions.forEach(item => item.disabled = false);
  }
}

document.addEventListener('change', event => {
  const input = event.target, key = input.dataset.measurementField;
  if (input.id === 'measurement-template') {
    saveMeasurementTemplate(input);
    return;
  }
  if (!key || (input.type === 'radio' && !input.checked)) return;
  const draft = S.mittaus ||= { rows: [] };
  if (input.dataset.row !== undefined) {
    const index = Number(input.dataset.row);
    while (draft.rows.length <= index) draft.rows.push({});
    draft.rows[index][key] = input.value;
    const rowList = $('#measurement-rows');
    if (rowList.children.length < draft.rows.length) rowList.innerHTML = measurementRows(draft.rows);
    const summary = rowList.children[index]?.querySelector('[data-measurement-summary]');
    if (key === 'work' && summary) summary.textContent = input.value ? ' · ' + input.value : '';
    $('[data-measurement-action="add"]').disabled = draft.rows.length >= measurementRowCount;
  } else {
    draft[key] = input.value;
  }
  const rowFilter = input.dataset.row === undefined ? ':not([data-row])' : `[data-row="${input.dataset.row}"]`;
  document.querySelectorAll(`[data-measurement-field="${key}"]${rowFilter}`).forEach(peer => {
    if (peer === input) return;
    if (peer.type === 'radio') peer.checked = peer.value === input.value;
    else peer.value = input.value;
  });
  save();
});

document.addEventListener('click', event => {
  const signature = event.target.closest('[data-measurement-signature]');
  if (signature) {
    openMeasurementSignature(signature.dataset.measurementSignature);
    return;
  }
  const button = event.target.closest('[data-measurement-action]');
  if (!button) return;
  const action = button.dataset.measurementAction;
  if (action === 'add' || action === 'remove') changeMeasurementRow(action, button);
  else if (action === 'reset') {
    if (!S.mittaus || !confirm('Tyhjennetäänkö tallennettu mittaustodistus?')) return;
    const previous = S.mittaus;
    delete S.mittaus;
    if (save()) render(1);
    else S.mittaus = previous;
  } else exportMeasurement(action);
});

document.addEventListener('DOMContentLoaded', loadMeasurementTemplate, { once: true });
