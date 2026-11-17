const measurementFields = {
  siteExtra: ['Kohde, toinen rivi', 55],
  billingExtra: ['Laskutusosoite, toinen rivi', 65],
  approvalExtra: ['Tilaajan edustajan lisätiedot', 45],
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
  workers: ['Työntekijät', 240, 10],
  approvedBy: ['Tilaajan edustajan hyväksyntä', 45],
  supervisor: ['Icopalin työnjohtaja', 45],
  billed: ['Laskutettu', 45],
  notes: ['Huomautuksia (esim. työnaikaiset muutokset)', 560, 6],
};
const measurementColumns = {
  mark: ['Tilaajan merkinnät', 20],
  work: ['Työselitys', 100],
  quantity: ['Määrä', 20],
  unit: ['Yksikkö', 6],
  euros: ['Euro', 10],
  cents: ['Snt', 2],
  totalEuros: ['Yhteensä euro', 15],
  totalCents: ['Yhteensä snt', 2],
};
const measurementRowCount = 39;
const measurementHoursRow = 36;
const measurementPdfUrl = './Mittaustodistus_92986_editable.pdf';
const measurementPreviewUrl = './Mittaustodistus_92986.jpg';
const measurementPdfNames = {
  customerNumber: 'asnr_o', jobNumber: 'tyonumero', site: 'kohde_1', siteExtra: 'kohde_2',
  customer: 'tilaaja', billing: 'laskutusosoite_1', billingExtra: 'laskutusosoite_2',
  vatZero: 'k_alv_0', vatAmount: 'alv_24', hours: 'tyoselitys_37',
  warrantyLong: 'takuupvm_10v', warrantyShort: 'takuupvm_2v', place: 'paikka', date: 'paivays',
  workers: 'tyontekija_1', approvedBy: 'tilaajan_edust_1', approvalExtra: 'tilaajan_edust_2',
  supervisor: 'icopalin_tyonjohtaja', billed: 'laskutettu', notes: 'huomautuksia',
};
const measurementPdfColumns = {
  mark: 'merkinnat', work: 'tyoselitys', quantity: 'maara', unit: 'yksikko',
  euros: 'euro', cents: 's1', totalEuros: 'yhteensa', totalCents: 's2',
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
let measurementTemplate;
let measurementLoading = false;
let measurementLoadError = false;

function measurementCells(row) {
  return Object.entries(measurementColumns)
    .filter(([key]) => row !== measurementHoursRow || key !== 'work')
    .map(([key, field]) => [key, field, measurementPdfColumns[key] + '_' + (row + 1)]);
}

async function loadMeasurementTemplate() {
  if (measurementLoading || measurementTemplate) return;
  measurementLoading = true;
  measurementLoadError = false;
  try {
    const response = await fetch(measurementPdfUrl);
    if (!response.ok) throw Error('PDF unavailable');
    const bytes = await response.arrayBuffer();
    const pdf = await PDFLib.PDFDocument.load(bytes);
    const { width, height } = pdf.getPage(0).getSize();
    const positions = Object.fromEntries(pdf.getForm().getFields().map(field => {
      const { x, y, width: w, height: h } = field.acroField.getWidgets()[0].getRectangle();
      return [field.getName(), [x / width * 939, (height - y - h) / height * 1280, w / width * 939, h / height * 1280]];
    }));
    // The names share their printed rows with the handwritten signatures.
    positions.tilaajan_edust_1[2] = 112;
    positions.icopalin_tyonjohtaja[2] = 112;
    positions.tyontekija_1 = [297, 1085, 209, 161];
    measurementTemplate = { bytes, positions };
  } catch {
    measurementLoadError = true;
  } finally {
    measurementLoading = false;
    const preview = document.getElementById('measurement-preview');
    if (!preview) return;
    preview.innerHTML = measurementPreview(S.mittaus || { rows: [] });
    document.querySelectorAll('[data-measurement-export]').forEach(button => {
      button.disabled = !measurementTemplate;
    });
  }
}

function validateMeasurement(raw) {
  const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
  return {
    ...Object.fromEntries(Object.entries(measurementFields).map(([key, [, max]]) => [key, text(raw?.[key], max)])),
    signatures: validateMeasurementSignatures(raw?.signatures),
    rows: Array.isArray(raw?.rows) ? raw.rows.map(row =>
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

function measurementRow(row, index) {
  const fields = measurementCells(index);
  const primary = fields.filter(([key]) => key === 'work' || key === 'quantity');
  const extra = fields.filter(([key]) => key !== 'work' && key !== 'quantity');
  const inputs = entries => entries.map(([key, field]) => measurementInput(key, field, row?.[key], index)).join('');
  return `<div class="measurement-row">
    <h4>Työrivi ${index + 1}</h4>
    <div class="measurement-row-main">${primary.map(entry => `<div>${inputs([entry])}</div>`).join('')}</div>
    <details><summary>Muut rivitiedot</summary>${inputs(extra)}</details>
    <button type="button" class="btn sm del" data-measurement-action="remove" data-row="${index}">Poista työrivi ${index + 1}</button>
  </div>`;
}

function measurementRows(rows) {
  return Array.from({length: Math.max(rows.length, 1)}, (_, index) => measurementRow(rows[index], index)).join('');
}

function appendMeasurementRows(rows) {
  const list = $('#measurement-rows');
  for (let index = list.children.length; index < rows.length; index++) {
    list.insertAdjacentHTML('beforeend', measurementRow(rows[index], index));
  }
}

function measurementPreview(draft) {
  if (!measurementTemplate) return measurementLoadError
    ? '<div class="card"><p role="status">Lomakkeen lataaminen epäonnistui.</p><button type="button" class="btn" data-measurement-action="retry">Yritä uudelleen</button></div>'
    : '<div class="card"><p role="status">Ladataan mittaustodistusta…</p></div>';
  const { positions } = measurementTemplate;
  const style = ([x, y, w, h]) => `left:${x / 939 * 100}%;top:${y / 1280 * 100}%;width:${w / 939 * 100}%;height:${h / 1280 * 100}%`;
  function overlay(key, field, position, row) {
    const [label, max, multiline] = field, value = row === undefined ? draft[key] : draft.rows[row]?.[key];
    const attrs = `data-measurement-overlay data-measurement-field="${key}"${row === undefined ? '' : ` data-row="${row}"`}
      aria-label="${label}${row === undefined ? '' : ', rivi ' + (row + 1)}" maxlength="${max}" style="${style(position)}"`;
    return multiline ? `<textarea ${attrs}>${esc('\n' + (value || ''))}</textarea>` : `<input ${attrs} value="${esc(value)}">`;
  }
  return `<section class="card">
    <h3>Täytä suoraan lomakkeeseen</h3>
    <button type="button" class="btn" data-measurement-action="add">+ Lisää työrivi</button>
    <label class="weekend-toggle" for="measurement-zoom"><input type="checkbox" id="measurement-zoom"> Suurenna lomaketta</label>
    <div class="measurement-scroll" tabindex="0" aria-label="Vieritettävä mittaustodistus">
      <div class="measurement-photo">
        <img src="${measurementPreviewUrl}" alt="Alkuperäinen mittaustodistus" draggable="false">
        ${Object.entries(measurementSignatures).map(([key, [label, position]]) => {
          const strokes = draft.signatures?.[key];
          if (!strokes?.length) return '';
          return `<img class="measurement-signature-preview" style="${style(position)}" src="${signatureImage(strokes)}" alt="${label}">`;
        }).join('')}
        ${Object.entries(measurementPdfNames).map(([key, name]) => overlay(key, measurementFields[key], positions[name])).join('')}
        ${Array.from({length: measurementRowCount}, (_, row) =>
          measurementCells(row).map(([key, field, name]) => overlay(key, field, positions[name], row)).join('')).join('')}
      </div>
    </div>
  </section>`;
}

function measurementForm(fromCalculator = false) {
  if (!measurementTemplate && !measurementLoadError) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadMeasurementTemplate, { once: true });
    else loadMeasurementTemplate();
  }
  const draft = S.mittaus || { rows: [] };
  const fields = keys => keys.map(key => measurementInput(key, measurementFields[key], draft[key])).join('');
  return `${fromCalculator
    ? '<div class="tes-page-toolbar"><h2>Urakkaselitys</h2><button type="button" class="btn sm" data-tes="calculator">Takaisin</button></div><h3>Mittaustodistus</h3>'
    : '<h2>Mittaustodistus</h2>'}
    <div id="measurement-preview">${measurementPreview(draft)}</div>
    <section class="card measurement-form" aria-labelledby="measurement-rows-title">
      <h3 id="measurement-rows-title">Työselitys ja määrä</h3>
      <div id="measurement-rows">${measurementRows(draft.rows)}</div>
      <button type="button" class="btn" data-measurement-action="add">+ Lisää työrivi</button>
    </section>
    <details class="card measurement-form">
      <summary>Täytä kenttälistassa</summary>
      <h3>Mittauksen tiedot</h3>
      ${fields(['customerNumber', 'jobNumber', 'site', 'siteExtra', 'customer', 'billing', 'billingExtra', 'vatZero', 'vatAmount'])}
      ${fields(['hours'])}
      <h3>Takuu, hyväksyntä ja huomautukset</h3>
      ${fields(['warrantyLong', 'warrantyShort', 'place', 'date', 'workers', 'approvedBy', 'approvalExtra', 'supervisor', 'billed', 'notes'])}
    </details>
    <section class="card">
      <h3>Allekirjoitukset</h3>
      ${Object.entries(measurementSignatures).map(([key, [label]]) => `<button type="button" class="btn" data-measurement-signature="${key}">${label}${draft.signatures?.[key]?.length ? ' ✓' : ''}</button>`).join('')}
    </section>
    <section class="card">
      <h3>Valmis mittaustodistus</h3>
      <button type="button" class="btn pri" data-measurement-action="download" data-measurement-export${measurementTemplate ? '' : ' disabled'}>Lataa täytettävä PDF</button>
      <button type="button" class="btn" data-measurement-action="print" data-measurement-export${measurementTemplate ? '' : ' disabled'}>Avaa PDF tulostusta varten</button>
      <button type="button" class="btn" data-measurement-action="mail" data-measurement-export${measurementTemplate ? '' : ' disabled'}>Lähetä sähköpostilla</button>
      <p id="measurement-status" role="status" hidden></p>
      <a id="measurement-email" href="mailto:?subject=Mittaustodistus" hidden>Avaa sähköposti</a>
      <button type="button" class="btn del" data-measurement-action="reset">Tyhjennä lomake</button>
    </section>`;
}

async function makeMeasurementPdf(draft, template) {
  const { PDFDocument, StandardFonts } = PDFLib;
  const pdf = await PDFDocument.load(template.bytes, { updateMetadata: false });
  const page = pdf.getPage(0), form = pdf.getForm();
  const { width, height } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  function fill(name, value, narrow = false) {
    if (!value) return;
    const field = form.getTextField(name);
    field.setText(value);
    // The source uses octal escapes in its appearance strings.
    field.acroField.setDefaultAppearance('/Helv 9 Tf 0.05 0.08 0.25 rg');
    if (!field.isMultiline()) {
      const limit = narrow ? width * 112 / 939 : field.acroField.getWidgets()[0].getRectangle().width;
      field.setFontSize(Math.min(9, (limit - 4) / font.widthOfTextAtSize(value, 1)));
    }
  }
  for (const name of ['osamittaus', 'loppumittaus']) form.removeField(form.getCheckBox(name));
  for (const [key, name] of Object.entries(measurementPdfNames)) {
    if (key === 'workers') continue;
    fill(name, draft[key], key === 'approvedBy' || key === 'supervisor');
  }
  draft.workers.split(/\r?\n/).slice(0, 10).forEach((value, i) => fill('tyontekija_' + i, value));
  draft.rows.slice(0, measurementRowCount).forEach((row, index) => {
    for (const [key, , name] of measurementCells(index)) fill(name, row[key]);
  });
  // Earlier drafts could store a work description in the slot used for invoice hours.
  if (!draft.hours) fill(measurementPdfNames.hours, draft.rows[measurementHoursRow]?.work);
  for (const [key, [, [x, top, w, h]]] of Object.entries(measurementSignatures)) {
    const strokes = draft.signatures[key];
    if (!strokes.length) continue;
    const signature = await pdf.embedPng(signatureImage(strokes));
    page.drawImage(signature, {
      x: x / 939 * width, y: (1280 - top - h) / 1280 * height,
      width: w / 939 * width, height: h / 1280 * height,
    });
  }
  addMeasurementContinuation(pdf, form, font, draft.rows.slice(measurementRowCount), width, height);
  form.updateFieldAppearances(font);
  return pdf.save();
}

function addMeasurementContinuation(pdf, form, font, rows, width, height) {
  const { rgb } = PDFLib;
  const ink = rgb(0.05, 0.08, 0.25);
  const columns = Object.entries(measurementColumns);
  const columnWidths = [81, 181, 52, 40, 49, 28, 68, 40];
  const left = (width - columnWidths.reduce((sum, w) => sum + w, 0)) / 2;
  const rowHeight = 20, rowsPerPage = 34;
  for (let offset = 0; offset < rows.length; offset += rowsPerPage) {
    const page = pdf.addPage([width, height]);
    page.drawText('Mittaustodistus 92986 – Työrivit, jatkosivu ' + (1 + offset / rowsPerPage), {
      x: left, y: height - 52, font, size: 14, color: ink,
    });
    const pageRows = rows.slice(offset, offset + rowsPerPage);
    let x = left;
    columns.forEach(([key, [label, max]], column) => {
      const w = columnWidths[column];
      page.drawText(label, { x: x + 3, y: height - 82, font, size: 7, color: ink });
      pageRows.forEach((row, index) => {
        const y = height - 90 - rowHeight * (index + 1);
        page.drawRectangle({ x, y, width: w, height: rowHeight, borderColor: ink, borderWidth: 0.4 });
        const field = form.createTextField('jatko_' + key + '_' + (measurementRowCount + offset + index + 1));
        field.setMaxLength(max);
        field.addToPage(page, {
          x: x + 1, y: y + 1, width: w - 2, height: rowHeight - 2,
          borderWidth: 0, borderColor: undefined, backgroundColor: undefined, textColor: ink, font,
        });
        const value = row[key] || '';
        field.setText(value);
        field.setFontSize(value ? Math.min(9, (w - 6) / font.widthOfTextAtSize(value, 1)) : 9);
      });
      x += w;
    });
  }
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
  const rows = [...(previous?.rows || [])];
  if (action === 'add') {
    if (!rows.length || rows.length === measurementHoursRow) rows.push({});
    rows.push({});
  } else {
    const index = Number(button.dataset.row);
    if (Object.values(rows[index] || {}).some(Boolean) && !confirm('Poistetaanko täytetty työrivi?')) return;
    if (index === measurementHoursRow && rows.length > measurementHoursRow + 1) {
      rows[index] = {};
    } else {
      rows.splice(index, 1);
      if (index < measurementHoursRow && rows.length >= measurementHoursRow) {
        rows.splice(measurementHoursRow - 1, 0, {});
      }
    }
  }
  S.mittaus = { ...previous, rows };
  if (!save()) {
    S.mittaus = previous;
    return;
  }
  if (action === 'add') {
    appendMeasurementRows(rows);
    document.getElementById(`mittaus-${rows.length - 1}-work`)?.focus();
  } else {
    $('#measurement-rows').innerHTML = measurementRows(rows);
    $('#measurement-preview').innerHTML = measurementPreview(S.mittaus);
  }
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

document.addEventListener('input', event => {
  const input = event.target, key = input.dataset.measurementField;
  if (!key) return;
  const draft = S.mittaus ||= { rows: [] };
  if (input.dataset.row !== undefined) {
    const index = Number(input.dataset.row);
    while (draft.rows.length <= index) draft.rows.push({});
    draft.rows[index][key] = input.value;
    appendMeasurementRows(draft.rows);
  } else {
    draft[key] = input.value;
  }
  const rowFilter = input.dataset.row === undefined ? ':not([data-row])' : `[data-row="${input.dataset.row}"]`;
  document.querySelectorAll(`[data-measurement-field="${key}"]${rowFilter}`).forEach(peer => {
    if (peer === input) return;
    peer.value = input.value;
  });
});

document.addEventListener('change', event => {
  if (event.target.dataset.measurementField) save();
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
  if (action === 'retry') loadMeasurementTemplate();
  else if (action === 'add' || action === 'remove') changeMeasurementRow(action, button);
  else if (action === 'reset') {
    if (!S.mittaus || !confirm('Tyhjennetäänkö tallennettu mittaustodistus?')) return;
    const previous = S.mittaus;
    delete S.mittaus;
    if (save()) render(1);
    else S.mittaus = previous;
  } else exportMeasurement(action);
});
