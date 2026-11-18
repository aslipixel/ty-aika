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
const measurementGroups = {
  rows: ['Työrivit', Object.keys(measurementColumns)],
  details: ['Mittauksen tiedot', ['customerNumber', 'jobNumber', 'site', 'siteExtra', 'customer', 'billing', 'billingExtra', 'vatZero', 'vatAmount']],
  warranty: ['Takuu ja hyväksyntä', ['warrantyLong', 'warrantyShort', 'place', 'date', 'approvedBy', 'approvalExtra', 'supervisor', 'billed']],
  remarks: ['Tunnit, työntekijät ja huomautukset', ['hours', 'workers', 'notes']],
};
const measurementVisibilityKeys = new Set(Object.entries(measurementGroups).flatMap(([group, [, keys]]) => [group, ...keys]));

function visibleMeasurementFields(draft, group) {
  const hidden = draft?.hiddenFields || [];
  return hidden.includes(group) ? [] : measurementGroups[group][1].filter(key => !hidden.includes(key));
}

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

let uploadManager;
let loadingUploads;

function measurementState() {
  return selectedDocumentId() && uploadManager?.session || S;
}

function saveMeasurement() {
  return measurementState() === S ? save() : uploadManager.saveDraft();
}

function measurementPositions(pdf) {
  const { width, height } = pdf.getPage(0).getSize();
  const positions = Object.fromEntries(pdf.getForm().getFields().map(field => {
    const { x, y, width: w, height: h } = field.acroField.getWidgets()[0].getRectangle();
    return [field.getName(), [x / width * 939, (height - y - h) / height * 1280, w / width * 939, h / height * 1280]];
  }));
  // The names share their printed rows with the handwritten signatures.
  positions.tilaajan_edust_1[2] = 112;
  positions.icopalin_tyonjohtaja[2] = 112;
  positions.tyontekija_1 = [297, 1085, 209, 161];
  return positions;
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
    const positions = measurementPositions(pdf);
    measurementTemplate = { bytes, positions };
  } catch {
    measurementLoadError = true;
  } finally {
    measurementLoading = false;
    const preview = document.getElementById('measurement-preview');
    if (!preview || selectedDocumentId()) return;
    preview.innerHTML = measurementPreview(measurementState().mittaus || { rows: [] });
    document.querySelectorAll('[data-measurement-export]').forEach(button => {
      button.disabled = !measurementTemplate;
    });
  }
}

function validateMeasurement(raw) {
  const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
  return {
    ...Object.fromEntries(Object.entries(measurementFields).map(([key, [, max]]) => [key, text(raw?.[key], max)])),
    font: raw?.font === 'print' ? 'print' : 'hand',
    signatures: validateMeasurementSignatures(raw?.signatures),
    hiddenFields: Array.isArray(raw?.hiddenFields) ? [...new Set(raw.hiddenFields.filter(key => measurementVisibilityKeys.has(key)))] : [],
    rows: Array.isArray(raw?.rows) ? raw.rows.map(row =>
      ({
        ...Object.fromEntries(Object.entries(measurementColumns).map(([key, [, max]]) => [key, text(row?.[key], max)])),
        ...(row?.hidden === true ? { hidden: true } : {}),
      })) : []
  };
}

function continuationRow(row, index, keys) {
  return `<tr><th scope="row">${index + 1}</th>${keys.map(key => {
    const [label, max] = measurementColumns[key];
    return `<td><input data-measurement-field="${key}" data-row="${index}" aria-label="${label}, rivi ${index + 1}" maxlength="${max}" value="${esc(row?.[key])}"></td>`;
  }).join('')}</tr>`;
}

function measurementPreview(draft, measurementTemplate = currentMeasurementTemplate()) {
  if (!measurementTemplate) return measurementLoadError
    ? '<div class="card"><p role="status">Lomakkeen lataaminen epäonnistui.</p><button type="button" class="btn doc-action" data-measurement-action="retry">Yritä uudelleen</button></div>'
    : '<div class="card"><p role="status">Ladataan mittaustodistusta…</p></div>';
  const { positions } = measurementTemplate;
  const rowKeys = visibleMeasurementFields(draft, 'rows');
  const headerKeys = ['details', 'warranty', 'remarks'].flatMap(group => visibleMeasurementFields(draft, group));
  const style = ([x, y, w, h]) => `left:${x / 939 * 100}%;top:${y / 1280 * 100}%;width:${w / 939 * 100}%;height:${h / 1280 * 100}%`;
  function overlay(key, field, position, row) {
    const [label, max, multiline] = field, value = row === undefined ? draft[key] : draft.rows[row]?.[key];
    const attrs = `data-measurement-overlay data-measurement-field="${key}"${row === undefined ? '' : ` data-row="${row}"`}
      aria-label="${label}${row === undefined ? '' : ', rivi ' + (row + 1)}" maxlength="${max}" style="${style(position)}"`;
    return multiline ? `<textarea ${attrs}>${esc('\n' + (value || ''))}</textarea>` : `<input ${attrs} value="${esc(value)}">`;
  }
  return `<section class="card">
    <h3>Täytä suoraan lomakkeeseen</h3>
    <label for="measurement-font">Tekstin tyyli</label>
    <select id="measurement-font">
      <option value="hand"${draft.font !== 'print' ? ' selected' : ''}>Käsinkirjoitettu</option>
      <option value="print"${draft.font === 'print' ? ' selected' : ''}>Tavallinen</option>
    </select>
    ${draft.hiddenFields?.length ? '<button type="button" class="btn doc-action sm" data-measurement-action="restore-fields">Näytä piilotetut kentät</button>' : ''}
    <label class="weekend-toggle" for="measurement-zoom"><input type="checkbox" id="measurement-zoom"> Suurenna lomaketta</label>
    <div class="measurement-scroll" tabindex="0" aria-label="Vieritettävä mittaustodistus">
      <div class="measurement-photo">
        <img src="${measurementTemplate.previewUrl || measurementPreviewUrl}" alt="Alkuperäinen mittaustodistus" draggable="false">
        ${rowKeys.length ? '<button type="button" class="measurement-table-add" data-measurement-action="add" data-measurement-table-add aria-label="Lisää työrivi: Työselitys ja määrä" title="Lisää työrivi">+</button>' : ''}
        ${Object.entries(measurementSignatures).map(([key, [label, position]]) => {
          const strokes = draft.signatures?.[key];
          if (!strokes?.length) return '';
          return `<img class="measurement-signature-preview" style="${style(position)}" src="${signatureImage(strokes)}" alt="${label}">`;
        }).join('')}
        ${headerKeys.map(key => overlay(key, measurementFields[key], positions[measurementPdfNames[key]])).join('')}
        ${Array.from({length: measurementRowCount}, (_, row) =>
          measurementCells(row).filter(([key]) => rowKeys.includes(key)).map(([key, field, name]) => overlay(key, field, positions[name], row)).join('')).join('')}
      </div>
    </div>
    ${rowKeys.length ? `<div id="measurement-continuation" ${draft.rows.length <= measurementRowCount ? 'hidden' : ''}>
      <h3>Työrivit – jatkosivu</h3>
      <div class="measurement-scroll"><table><thead><tr><th scope="col">Rivi</th>${rowKeys.map(key => `<th scope="col">${measurementColumns[key][0]}</th>`).join('')}</tr></thead>
      <tbody>${draft.rows.slice(measurementRowCount).map((row, i) => continuationRow(row, measurementRowCount + i, rowKeys)).join('')}</tbody></table></div>
      <button type="button" class="btn doc-action sm" data-measurement-action="add">Lisää työrivi</button>
    </div>` : ''}
  </section>`;
}

function currentMeasurementTemplate() {
  return selectedDocumentId() ? uploadManager?.template : measurementTemplate;
}

function openUploadManager() {
  return loadingUploads ||= import('./form-upload.js?v=2').then(module => uploadManager = module).catch(error => {
    loadingUploads = null;
    throw error;
  });
}

function selectedDocumentId() {
  return location.hash === '#lomakkeet' && history.state?.tuntixDocument;
}

function documentLibrary() {
  if (uploadManager) return uploadManager.view(selectedDocumentId());
  openUploadManager().then(() => {
    if ($('#upload-loading')) render(1);
  }).catch(() => {
    if ($('#upload-loading')) $('#upload-loading').innerHTML = '<button class="btn doc-action" data-measurement-action="load-uploads">Yritä uudelleen</button>';
  });
  return '<h2>Asiakirjat</h2><p id="upload-loading" role="status">Ladataan…</p>';
}

function measurementForm(fromCalculator = false, uploaded = false) {
  if (!uploaded && selectedDocumentId()) return documentLibrary();
  const template = currentMeasurementTemplate();
  if (!uploaded && !template && !measurementLoadError) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadMeasurementTemplate, { once: true });
    else loadMeasurementTemplate();
  }
  const draft = measurementState().mittaus || { rows: [] };
  if (!uploaded && !window.nativePersist) {
    queueMicrotask(() => openUploadManager().then(module => module.refreshList()).catch(() => {}));
  }
  return `${fromCalculator
    ? '<div class="tes-page-toolbar"><h2>Urakkaselitys</h2><button type="button" class="btn doc-action sm" data-tes="calculator">Takaisin</button></div><h3>Mittaustodistus</h3>'
    : '<h2>Mittaustodistus</h2>'}
    ${uploaded ? uploadManager.toolbar() : !window.nativePersist ? '<section class="card"><input type="file" id="user-form-file" hidden><button type="button" class="btn doc-action" data-form-choose>Avaa asiakirja</button><p>Word (.docx), Excel (.xlsx), PDF tai kuva. Tiedostot tallentuvat tähän selaimeen.</p><p id="upload-form-status" role="status"></p><a id="saved-email" hidden>Avaa sähköposti</a></section><section class="card" id="saved-form-list"><h3>Tallennetut tiedostot</h3></section>' : ''}
    <div id="measurement-preview" data-font="${draft.font === 'print' ? 'print' : 'hand'}">${measurementPreview(draft)}</div>
    <section class="card">
      <button type="button" class="btn doc-action" data-measurement-signature="approvedBy">${measurementSignatures.approvedBy[0]}${draft.signatures?.approvedBy?.length ? ' ✓' : ''}</button>
    </section>
    <section class="card">
      <h3>Valmis mittaustodistus</h3>
      ${!window.nativePersist && !uploaded ? '<button type="button" class="btn doc-action" data-measurement-action="save-copy">Tallenna tiedosto</button>' : ''}
      <button type="button" class="btn doc-action pri" data-measurement-action="download" data-measurement-export${template ? '' : ' disabled'}>Lataa täytettävä PDF</button>
      ${uploaded ? '' : `<button type="button" class="btn doc-action" data-measurement-action="mail" data-measurement-export${template ? '' : ' disabled'}>Lähetä sähköpostilla</button>`}
      <p id="measurement-status" role="status" hidden></p>
      <a id="measurement-email" href="mailto:?subject=Mittaustodistus" hidden>Avaa sähköposti</a>
      <button type="button" class="btn doc-action del" data-measurement-action="reset">Tyhjennä lomake</button>
    </section>`;
}

async function makeMeasurementPdf(draft, template) {
  const { PDFDocument, StandardFonts } = PDFLib;
  const pdf = await PDFDocument.load(template.bytes, { updateMetadata: false });
  const page = pdf.getPage(0), form = pdf.getForm();
  const { width, height } = page.getSize();
  await import('./vendor/fontkit.umd.min.js');
  pdf.registerFontkit(window.fontkit);
  const printed = draft.font === 'print';
  const fontResponse = await fetch(printed ? './fonts/OpenSans-Regular.ttf' : './fonts/Caveat-Medium.ttf');
  if (!fontResponse.ok) throw Error('Lomakkeen fontin lataaminen epäonnistui');
  const font = await pdf.embedFont(await fontResponse.arrayBuffer(), { customName: printed ? 'OpenSansRegular' : 'CaveatMedium' });
  const fontSize = printed ? 8.5 : 10.5;
  const resources = form.acroForm.dict.lookup(PDFLib.PDFName.of('DR'), PDFLib.PDFDict);
  resources.lookup(PDFLib.PDFName.of('Font'), PDFLib.PDFDict).set(PDFLib.PDFName.of(font.name), font.ref);
  // Keep the selected font when a blank field is filled in a PDF reader.
  for (const field of form.getFields()) {
    if (field instanceof PDFLib.PDFTextField) {
      field.acroField.setDefaultAppearance(`/${font.name} ${fontSize} Tf 0.125 0.212 0.357 rg`);
    }
  }
  function fill(name, value, narrow = false) {
    if (!value) return;
    const field = form.getTextField(name);
    field.setText(value);
    if (!field.isMultiline()) {
      const limit = narrow ? width * 112 / 939 : field.acroField.getWidgets()[0].getRectangle().width;
      field.setFontSize(Math.min(fontSize, (limit - 4) / font.widthOfTextAtSize(value, 1)));
    }
  }
  for (const name of ['osamittaus', 'loppumittaus']) {
    const field = form.getFieldMaybe(name);
    if (field) form.removeField(field);
  }
  const headerKeys = ['details', 'warranty', 'remarks'].flatMap(group => visibleMeasurementFields(draft, group));
  const rowKeys = visibleMeasurementFields(draft, 'rows');
  for (const key of headerKeys) {
    if (key === 'workers') {
      draft.workers.split(/\r?\n/).slice(0, 10).forEach((value, i) => fill('tyontekija_' + i, value));
    } else {
      fill(measurementPdfNames[key], draft[key], key === 'approvedBy' || key === 'supervisor');
    }
  }
  if (rowKeys.length) {
    draft.rows.slice(0, measurementRowCount).forEach((row, index) => {
      for (const [key, , name] of measurementCells(index)) {
        if (rowKeys.includes(key)) fill(name, row[key]);
      }
    });
  }
  // Earlier drafts could store a work description in the slot used for invoice hours.
  if (headerKeys.includes('hours') && rowKeys.includes('work') && !draft.hours) {
    fill(measurementPdfNames.hours, draft.rows[measurementHoursRow]?.work);
  }
  for (const [key, [, [x, top, w, h]]] of Object.entries(measurementSignatures)) {
    const strokes = draft.signatures[key];
    if (!strokes.length) continue;
    const signature = await pdf.embedPng(signatureImage(strokes));
    page.drawImage(signature, {
      x: x / 939 * width, y: (1280 - top - h) / 1280 * height,
      width: w / 939 * width, height: h / 1280 * height,
    });
  }
  if (rowKeys.length && draft.rows.length > measurementRowCount) {
    const labelFont = await pdf.embedFont(StandardFonts.Helvetica);
    addMeasurementContinuation(pdf, form, font, draft.rows.slice(measurementRowCount), width, height, rowKeys, labelFont, fontSize);
  }
  form.updateFieldAppearances(font);
  return pdf.save();
}

function addMeasurementContinuation(pdf, form, font, rows, width, height, rowKeys, labelFont, fontSize) {
  const { rgb } = PDFLib;
  const ink = rgb(0.05, 0.08, 0.25);
  const columns = Object.entries(measurementColumns);
  const columnWidths = [81, 181, 52, 40, 49, 28, 68, 40];
  const left = (width - columnWidths.reduce((sum, w) => sum + w, 0)) / 2;
  const rowHeight = 20, rowsPerPage = 34;
  for (let offset = 0; offset < rows.length; offset += rowsPerPage) {
    const page = pdf.addPage([width, height]);
    page.drawText('Mittaustodistus 92986 – Työrivit, jatkosivu ' + (1 + offset / rowsPerPage), {
      x: left, y: height - 52, font: labelFont, size: 14, color: ink,
    });
    const pageRows = rows.slice(offset, offset + rowsPerPage);
    let x = left;
    columns.forEach(([key, [label, max]], column) => {
      const w = columnWidths[column];
      if (!rowKeys.includes(key)) return;
      page.drawText(label, { x: x + 3, y: height - 82, font: labelFont, size: 7, color: ink });
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
        field.setFontSize(value ? Math.min(fontSize, (w - 6) / font.widthOfTextAtSize(value, 1)) : fontSize);
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
    <canvas width="650" height="350" aria-label="Allekirjoitusalue"></canvas>
    <div class="measurement-signature-actions">
      <button type="button" class="btn doc-action" data-clear>Tyhjennä</button>
      <button type="button" class="btn doc-action" data-cancel>Peruuta</button>
      <button type="button" class="btn doc-action pri" data-save>Tallenna</button>
    </div>`;
  const canvas = dialog.querySelector('canvas');
  // Existing signatures use coordinates in the printed 650 × 138 field.
  const printHeight = 138;
  const padHeight = canvas.height;
  let strokes = validateMeasurementSignatures(measurementState().mittaus?.signatures)[key].map(stroke =>
    stroke.map(([x, y]) => [x, 0.5 + (y - 0.5) * printHeight / padHeight]));
  let changed = false;
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
    changed = true;
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
    changed = true;
    strokes = [];
    points = 0;
    active = null;
    drawSignature(canvas, strokes);
  };
  dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
  dialog.querySelector('[data-save]').onclick = () => {
    if (!changed) {
      dialog.close();
      return;
    }
    const previous = measurementState().mittaus, draft = validateMeasurement(measurementState().mittaus);
    // Fit tall strokes inside the printed line without flattening the handwriting.
    const ys = strokes.flat().map(([, y]) => y * padHeight);
    if (ys.length) {
      const top = Math.min(...ys), bottom = Math.max(...ys);
      const margin = 3;
      const scale = Math.min(1, (printHeight - 2 * margin) / Math.max(1, bottom - top));
      const offset = Math.max(margin - top * scale, Math.min(
        (printHeight - padHeight * scale) / 2, printHeight - margin - bottom * scale));
      draft.signatures[key] = strokes.map(stroke => stroke.map(([x, y]) => [
        0.5 + (x - 0.5) * scale, (y * padHeight * scale + offset) / printHeight,
      ]));
    } else {
      draft.signatures[key] = [];
    }
    measurementState().mittaus = draft;
    if (!saveMeasurement()) {
      measurementState().mittaus = previous;
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

function addMeasurementRow() {
  const previous = measurementState().mittaus;
  const rows = [...(previous?.rows || [])];
  if (!rows.length || rows.length === measurementHoursRow) rows.push({});
  const index = rows.length;
  rows.push({});
  measurementState().mittaus = { ...previous, rows };
  if (!saveMeasurement()) {
    measurementState().mittaus = previous;
    return;
  }
  if (index >= measurementRowCount) {
    const continuation = $('#measurement-continuation');
    continuation.hidden = false;
    continuation.querySelector('tbody').insertAdjacentHTML('beforeend',
      continuationRow({}, index, visibleMeasurementFields(measurementState().mittaus, 'rows')));
  }
  const selector = `[data-measurement-field][data-row="${index}"]`;
  (document.querySelector(selector + '[data-measurement-field="work"]') || document.querySelector(selector))?.focus();
}

async function exportMeasurement(action) {
  const measurementTemplate = currentMeasurementTemplate();
  if (!measurementTemplate) return;
  const toolbar = action === 'mail' ? document.querySelector('.document-toolbar') : null;
  const status = toolbar?.querySelector('[role=status]') || $('#measurement-status'), mail = toolbar?.querySelector('a') || $('#measurement-email');
  status.hidden = false;
  status.textContent = 'Luodaan PDF-tiedostoa…';
  mail.hidden = true;
  const actions = [...document.querySelectorAll('[data-measurement-export]')];
  actions.forEach(item => item.disabled = true);
  try {
    const bytes = await makeMeasurementPdf(validateMeasurement(measurementState().mittaus), measurementTemplate);
    const name = measurementTemplate.filename || 'Mittaustodistus.pdf', type = 'application/pdf';
    if (window.nativeSharePdf) {
      await window.nativeSharePdf(name, bytes);
      status.textContent = 'Valitse tallennus, tulostus tai sähköposti laitteen jakovalikosta.';
    } else if (action === 'mail') {
      mail.href = 'mailto:?subject=' + encodeURIComponent(name);
      const share = { title: name, files: [new File([bytes], name, { type })] };
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
      status.textContent = 'PDF ladattu. Liitä ' + name + ' sähköpostiviestiin.';
      mail.hidden = false;
      mail.focus();
    } else {
      download(name, bytes, type);
      status.textContent = name + ' on valmis.';
    }
  } catch (error) {
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
  const draft = measurementState().mittaus ||= { rows: [] };
  if (input.dataset.row !== undefined) {
    const index = Number(input.dataset.row);
    while (draft.rows.length <= index) draft.rows.push({});
    draft.rows[index][key] = input.value;
  } else {
    draft[key] = input.value;
  }
  if (measurementState() !== S) saveMeasurement();
});

document.addEventListener('change', event => {
  const input = event.target;
  if (input.dataset.measurementField) saveMeasurement();
  if (input.id !== 'measurement-font') return;
  const previous = measurementState().mittaus;
  measurementState().mittaus = { ...previous, rows: previous?.rows || [], font: input.value };
  if (!saveMeasurement()) {
    measurementState().mittaus = previous;
    input.value = previous?.font || 'hand';
  }
  $('#measurement-preview').dataset.font = input.value;
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
  if (action === 'load-uploads') render(1);
  else if (action === 'save-copy') openUploadManager().then(module => module.saveOriginal()).catch(() => toast('Tallennus epäonnistui.'));
  else if (action === 'retry') loadMeasurementTemplate();
  else if (action === 'add') addMeasurementRow();
  else if (action === 'restore-fields') {
    const previous = measurementState().mittaus;
    measurementState().mittaus = { ...previous, hiddenFields: [] };
    if (saveMeasurement()) render(1);
    else measurementState().mittaus = previous;
  }
  else if (action === 'reset') {
    if (!measurementState().mittaus || !confirm('Tyhjennetäänkö tallennettu mittaustodistus?')) return;
    const previous = measurementState().mittaus;
    measurementState().mittaus = { rows: [], font: previous.font, hiddenFields: previous.hiddenFields || [] };
    if (saveMeasurement()) render(1);
    else measurementState().mittaus = previous;
  } else exportMeasurement(action);
});

document.addEventListener('click', event => {
  if (event.target.closest('[data-form-choose]')) document.getElementById('user-form-file')?.click();
});
document.addEventListener('change', async event => {
  if (event.target.id !== 'user-form-file') return;
  const file = event.target.files[0];
  event.target.value = '';
  if (file) {
    try { await (await openUploadManager()).openFile(file); }
    catch { toast('Tiedoston avaaminen epäonnistui.'); }
  }
});
