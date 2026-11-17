const measurementFields = {
  number: ['Todistuksen numero', 16],
  customerNumber: ['Asiakasnumero', 22],
  jobNumber: ['Työnumero', 30],
  site: ['Kohde', 55],
  customer: ['Tilaaja', 60],
  billing: ['Laskutusosoite', 65],
  vat: ['ALV %', 7],
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
const measurementRowCount = 38;

function validateMeasurement(raw) {
  const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
  return {
    ...Object.fromEntries(Object.entries(measurementFields).map(([key, [, max]]) => [key, text(raw?.[key], max)])),
    kind: ['partial', 'final'].includes(raw?.kind) ? raw.kind : '',
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

function measurementForm(fromCalculator = false) {
  const draft = S.mittaus || { rows: [] };
  const fields = keys => keys.map(key => measurementInput(key, measurementFields[key], draft[key])).join('');
  return `${fromCalculator
    ? '<div class="tes-page-toolbar"><h2>Urakkaselitys</h2><button type="button" class="btn sm" data-tes="calculator">Takaisin</button></div><h3>Mittaustodistus</h3>'
    : '<h2>Mittaustodistus</h2>'}
    <section class="card measurement-form">
      <h3>Mittauksen tiedot</h3>
      <label for="mittaus-kind">Mittaustapa</label>
      <select id="mittaus-kind" data-measurement-field="kind">
        <option value="">Valitse mittaustapa</option>
        <option value="partial"${draft.kind === 'partial' ? ' selected' : ''}>Osamittaus</option>
        <option value="final"${draft.kind === 'final' ? ' selected' : ''}>Loppumittaus</option>
      </select>
      ${fields(['number', 'customerNumber', 'jobNumber', 'site', 'customer', 'billing', 'vat'])}
    </section>
    <section class="card measurement-form">
      <h3>Työrivit</h3>
      <div id="measurement-rows">${measurementRows(draft.rows)}</div>
      <button type="button" class="btn" data-measurement-action="add"${draft.rows.length >= measurementRowCount ? ' disabled' : ''}>+ Lisää työrivi</button>
      ${fields(['hours'])}
    </section>
    <section class="card measurement-form">
      <h3>Takuu, hyväksyntä ja huomautukset</h3>
      ${fields(['warrantyLong', 'warrantyShort', 'place', 'date', 'workers', 'approvedBy', 'supervisor', 'billed', 'notes'])}
    </section>
    <section class="card">
      <h3>Valmis mittaustodistus</h3>
      <button type="button" class="btn pri" data-measurement-action="download">Lataa täytettävä PDF</button>
      <button type="button" class="btn" data-measurement-action="print">Avaa PDF tulostusta varten</button>
      <button type="button" class="btn" data-measurement-action="mail">Lähetä sähköpostilla</button>
      <p id="measurement-status" role="status" hidden></p>
      <a id="measurement-email" href="mailto:?subject=Mittaustodistus" hidden>Avaa sähköposti</a>
      <button type="button" class="btn del" data-measurement-action="reset">Tyhjennä lomake</button>
    </section>`;
}

async function makeMeasurementPdf(draft) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const pdf = await PDFDocument.create();
  pdf.setTitle('Mittaustodistus');
  const page = pdf.addPage([595.28, 841.89]);
  const height = page.getHeight(), form = pdf.getForm();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const blue = rgb(0.08, 0.31, 0.49), grid = rgb(0.46, 0.58, 0.69);
  const black = rgb(0.08, 0.12, 0.17);

  function label(value, x, top, size = 7, font = normal, color = blue) {
    page.drawText(value, { x, y: height - top - size, size, font, color });
  }
  function line(x1, top1, x2, top2, thickness = 0.45) {
    page.drawLine({ start: { x: x1, y: height - top1 }, end: { x: x2, y: height - top2 }, thickness, color: grid });
  }
  function textField(name, value, x, top, width, boxHeight, { max, size = 8, multiline = false } = {}) {
    const field = form.createTextField(name);
    if (multiline) field.enableMultiline();
    if (max) field.setMaxLength(max);
    // With no background, the widget leaves the printed grid visible.
    field.addToPage(page, { x, y: height - top - boxHeight, width, height: boxHeight,
      borderWidth: 0, borderColor: undefined, backgroundColor: undefined, textColor: black, font: normal });
    field.setText(value || '');
    const fit = multiline || !value ? Infinity : (width - 3) / normal.widthOfTextAtSize(value, 1);
    field.setFontSize(Math.min(size, fit));
  }
  function field(key, x, top, width, boxHeight, options) {
    textField(key, draft[key], x, top, width, boxHeight, { max: measurementFields[key][1], ...options });
  }
  function headerField(key, title, x, top, width, boxHeight) {
    label(title, x + 2, top + 2);
    field(key, x + 1, top + 10, width - 2, boxHeight - 10);
  }

  label('MITTAUSTODISTUS', 16, 32, 14, bold);
  label('Nro', 248, 33);
  field('number', 270, 25, 118, 20, { size: 13 });
  label('icopal', 456, 19, 22, bold);
  label('Katto', 517, 19, 22, bold, black);
  label('Part of BMI Group', 508, 44, 7, normal, black);

  const measurementType = form.createRadioGroup('mittaustapa');
  for (const [kind, title, x] of [['partial', 'OSAMITTAUS', 16], ['final', 'LOPPUMITTAUS', 110]]) {
    label(title, x, 66);
    measurementType.addOptionToPage(kind, page, { x: x + 64, y: height - 75, width: 9, height: 9, borderWidth: 0.6, borderColor: grid });
  }
  if (draft.kind) measurementType.select(draft.kind);

  [58, 126].forEach(top => line(16, top, 579, top));
  line(16, 78, 321, 78);
  line(203, 58, 203, 78);
  line(321, 58, 321, 126);
  line(107, 78, 107, 126);
  line(321, 81, 579, 81);
  line(321, 104, 579, 104);
  headerField('customerNumber', 'ASNRO', 203, 58, 118, 20);
  headerField('site', 'KOHDE', 107, 78, 214, 48);
  headerField('jobNumber', 'TYÖNUMERO', 321, 58, 258, 23);
  headerField('customer', 'TILAAJA', 321, 81, 258, 23);
  headerField('billing', 'LASKUTUSOSOITE', 321, 104, 258, 22);
  label('K-ALV 0 %', 18, 82);
  headerField('vat', 'ALV %', 16, 99, 91, 27);

  const columns = [16, 77, 321, 407, 453, 475, 548, 579];
  const tableHeaders = ['TILAAJAN', 'TYÖSELITYS', 'MÄÄRÄ', 'EURO', 'SNT', 'YHTEENSÄ EURO', 'SNT'];
  const tableTop = 127, firstRow = 151, rowHeight = 12.75;
  const tableBottom = firstRow + (measurementRowCount + 1) * rowHeight;
  columns.forEach(x => line(x, tableTop, x, tableBottom));
  tableHeaders.forEach((title, index) => label(title, columns[index] + 3, index === 0 ? 131 : 138, 7, bold));
  label('MERKINNÄT', 19, 140, 7, bold);
  for (let row = 0; row <= measurementRowCount; row++) {
    const top = firstRow + row * rowHeight;
    line(16, top, 579, top);
    if (row === measurementRowCount) {
      label('LASKUTETTAVAT TUNNIT', 80, top + 2, 7, bold);
      field('hours', 323, top + 0.4, 82, rowHeight - 0.8);
      break;
    }
    Object.entries(measurementColumns).forEach(([key, [, max]], index) =>
      textField(`tyorivi-${row + 1}-${key}`, draft.rows[row]?.[key], columns[index] + 1, top + 0.4,
        columns[index + 1] - columns[index] - 2, rowHeight - 0.8, { max }));
  }
  line(16, tableBottom, 579, tableBottom, 0.75);
  line(321, tableBottom, 321, 817);
  [669, 697, 721, 753, 785].forEach(top => line(16, top, top >= 697 ? 192 : 321, top));
  line(192, 697, 192, 817);
  line(110, 697, 110, 721);
  line(16, 817, 579, 817, 0.75);
  headerField('warrantyLong', 'TAKUUPVM (10 V)', 16, tableBottom, 305, 669 - tableBottom);
  headerField('warrantyShort', 'TAKUUPVM (2 V)', 16, 669, 305, 28);
  line(192, 697, 321, 697);
  headerField('place', 'PAIKKA', 16, 697, 94, 24);
  headerField('date', 'PÄIVÄYS', 110, 697, 82, 24);
  label('TYÖNTEKIJÄT', 196, 699);
  field('workers', 195, 709, 123, 106, { multiline: true });
  headerField('approvedBy', 'TILAAJAN EDUST. HYV.', 16, 721, 176, 32);
  headerField('supervisor', 'ICOPALIN TYÖNJOHTAJA', 16, 753, 176, 32);
  headerField('billed', 'LASKUTETTU', 16, 785, 176, 32);
  label('HUOMAUTUKSIA (esim. työnaikaiset muutokset)', 325, tableBottom + 4, 7, bold);
  field('notes', 324, tableBottom + 17, 253, 815 - tableBottom - 17, { multiline: true });
  label('LASKUTUS', 540, 821, 7, bold);
  form.updateFieldAppearances(normal);
  return pdf.save();
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
  $('[data-measurement-action="add"]').disabled = draft.rows.length >= measurementRowCount;
  $('#measurement-rows details[open] summary')?.focus();
}

async function exportMeasurement(action) {
  const status = $('#measurement-status'), mail = $('#measurement-email');
  status.hidden = false;
  status.textContent = 'Luodaan PDF-tiedostoa…';
  mail.hidden = true;
  const preview = action === 'print' && !window.nativeSharePdf ? window.open('about:blank', '_blank') : null;
  if (preview) preview.opener = null;
  const actions = [...document.querySelectorAll('[data-measurement-action="download"], [data-measurement-action="print"], [data-measurement-action="mail"]')];
  actions.forEach(item => item.disabled = true);
  try {
    const bytes = await makeMeasurementPdf(validateMeasurement(S.mittaus));
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
  if (!key) return;
  const draft = S.mittaus ||= { rows: [] };
  if (input.dataset.row !== undefined) {
    const index = Number(input.dataset.row);
    (draft.rows[index] ||= {})[key] = input.value;
    if (key === 'work') input.closest('details').querySelector('[data-measurement-summary]').textContent = input.value ? ' · ' + input.value : '';
  } else {
    draft[key] = input.value;
  }
  save();
});

document.addEventListener('click', event => {
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
