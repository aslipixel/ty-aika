// User documents stay in this browser. The stored PDF is a working copy.
export let session = null;
export let template;
let active = null, busy = false, officeEditor;
let database;
const storagePrefix = 'tuntix.form-draft.';
const supported = '.pdf,image/*,.heic,.heif,.tif,.tiff,.bmp,.avif,.docx,.pptx,.xlsx,.odt,.odp,.ods';
const office = /\.(docx|pptx|xlsx|odt|odp|ods)$/i;

function openDatabase() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('tuntix.user-forms', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('documents');
      request.result.createObjectStore('names');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = null; reject(request.error); };
  });
  return database;
}

async function read(store, id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const collection = db.transaction(store).objectStore(store);
    const request = id === undefined ? collection.getAll() : collection.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeDocument(record) {
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(['documents', 'names'], 'readwrite');
    transaction.objectStore('documents').put(record, record.id);
    transaction.objectStore('names').put({ id: record.id, name: record.name, created: Date.now() }, record.id);
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error || Error('Tallennus epäonnistui.'));
  });
}

export function saveDraft() {
  try {
    localStorage.setItem(storagePrefix + active.id, JSON.stringify(session.mittaus));
    return true;
  } catch {
    toast('Luonnosta ei voitu tallentaa. Lataa täytetty PDF.');
    return false;
  }
}

let restoring;
export function view(id) {
  if (id && active?.id === id) return officeEditor ? toolbar() + officeEditor.view() : measurementForm(false, true);
  if (id) {
    if (restoring !== id) {
      restoring = id;
      read('documents', id).then(record => activate(record, () => selectedDocumentId() === id))
        .catch(() => {
          if (selectedDocumentId() === id) {
            clearSelection();
            render();
            toast('Tiedostoa ei voitu avata.');
          }
        }).finally(() => { if (restoring === id) restoring = null; });
    }
    return '<p role="status">Avataan asiakirjaa…</p>';
  }
  return '<a class="lnk" href="#lomakkeet">‹ Lomakkeet</a><h2>Asiakirjat</h2>' + chooser();
}

function listButton(label, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn sm doc-action';
  button.textContent = label;
  button.dataset.listAction = action;
  return button;
}

export async function refreshList() {
  const list = document.getElementById('saved-form-list');
  if (!list) return;
  try {
    const names = await read('names');
    if (!list.isConnected) return;
    const heading = list.querySelector('h3');
    list.replaceChildren(heading);
    if (!names.length) {
      list.insertAdjacentHTML('beforeend', '<p>Ei tallennettuja tiedostoja.</p>');
      return;
    }
    const controls = document.createElement('div');
    controls.className = 'document-actions';
    const select = listButton('Valitse', 'select'), remove = listButton('Poista valitut', 'delete'),
      cancel = listButton('Peruuta', 'cancel');
    controls.append(select, remove, cancel);
    list.append(controls);
    const selected = new Set();
    const boxes = [];
    function selecting(on) {
      selected.clear();
      list.classList.toggle('choosing-files', on);
      select.hidden = on;
      remove.hidden = cancel.hidden = !on;
      remove.disabled = true;
      remove.textContent = 'Poista valitut';
      for (const box of boxes) {
        box.checked = false;
      }
    }
    for (const item of names.sort((a, b) => b.created - a.created)) {
      const row = document.createElement('div');
      row.className = 'saved-document';
      const label = document.createElement('label'), box = document.createElement('input');
      box.type = 'checkbox';
      boxes.push(box);
      box.onchange = () => {
        if (box.checked) selected.add(item.id); else selected.delete(item.id);
        remove.disabled = !selected.size;
        remove.textContent = 'Poista valitut' + (selected.size ? ' (' + selected.size + ')' : '');
      };
      label.append(box, item.name);
      const button = document.createElement('button'), send = document.createElement('button');
      button.type = send.type = 'button';
      button.className = 'lnk doc-action'; send.className = 'btn sm doc-action';
      button.dataset.savedForm = send.dataset.sendForm = item.id;
      button.textContent = item.name; send.textContent = 'Lähetä';
      send.setAttribute('aria-label', 'Lähetä ' + item.name);
      row.append(label, button, send);
      list.append(row);
    }
    selecting(false);
    select.onclick = () => { selecting(true); boxes[0].focus(); };
    cancel.onclick = () => { selecting(false); select.focus(); };
    remove.onclick = async () => {
      const ids = [...selected];
      if (!ids.length || !(await appConfirm('Poistetaanko valitut tiedostot (' + ids.length + ')?', { yes: 'Poista', glyph: 'trash-2', danger: true }))) return;
      remove.disabled = cancel.disabled = true;
      boxes.forEach(box => box.disabled = true);
      try {
        const db = await openDatabase();
        await new Promise((resolve, reject) => {
          const tx = db.transaction(['documents', 'names'], 'readwrite');
          for (const id of ids) {
            tx.objectStore('documents').delete(id);
            tx.objectStore('names').delete(id);
          }
          tx.oncomplete = resolve;
          tx.onabort = () => reject(tx.error);
        });
        for (const id of ids) localStorage.removeItem(storagePrefix + id);
        toast('Valitut tiedostot poistettu.');
      } catch { toast('Poisto epäonnistui.'); }
      await refreshList();
    };
  } catch {
    const status = document.getElementById('upload-form-status');
    if (status) status.textContent = 'Selaimen tiedostotallennus ei ole käytettävissä.';
  }
}

function chooser() {
  queueMicrotask(refreshList);
  return `<section class="card"><h3>Avaa asiakirja</h3>
    <p>Valitse Word- tai Excel-tiedosto, mittaustodistuksen PDF tai kuva. Tiedosto ja muutokset tallentuvat tähän selaimeen.</p>
    <input type="file" id="user-form-file" accept="${supported}" hidden>
    <button type="button" class="btn doc-action pri" data-form-choose>Valitse tiedosto</button>
    <p>Word (.docx), Excel (.xlsx), PDF ja kuvat, myös HEIC ja TIFF.</p></section>
    <p id="upload-form-status" role="status"></p><a id="saved-email" hidden>Avaa sähköposti</a>
    <section class="card" id="saved-form-list"><h3>Tallennetut tiedostot</h3></section>`;

}

export function toolbar() {
  return `<section class="card document-toolbar"><h3>${esc(active.name)}</h3>
    <div class="document-actions"><button type="button" class="btn doc-action sm" data-form-close>Tallennetut tiedostot</button>
    <button type="button" class="btn doc-action sm" data-form-save>Tallenna</button>
    ${officeEditor ? '<button type="button" class="btn doc-action sm" data-office-share>Lähetä</button>' :
      '<button type="button" class="btn doc-action sm" data-measurement-action="mail" data-measurement-export>Lähetä</button>'}</div>
    <p id="upload-form-status" role="status"></p><a id="saved-email" hidden>Avaa sähköposti</a></section>`;
}

async function activate(record, stillCurrent) {
  if (!record) throw Error('Tiedostoa ei löytynyt.');
  if (!stillCurrent()) return;
  const saved = localStorage.getItem(storagePrefix + record.id);
  let editor, pdfTemplate, pdfSession;
  if (record.kind === 'office') {
    const { openOfficeDocument } = await import('./office-document.js?v=2');
    editor = await openOfficeDocument(record.bytes, record.name, saved ? JSON.parse(saved) : {}, edits => {
      try { localStorage.setItem(storagePrefix + record.id, JSON.stringify(edits)); return true; }
      catch { toast('Luonnosta ei voitu tallentaa. Lataa asiakirja.'); return false; }
    });
  } else {
    const pdf = await PDFLib.PDFDocument.load(record.bytes);
    pdfTemplate = { bytes: record.bytes, positions: measurementPositions(pdf), filename: pdfName(record.name) };
    pdfSession = { mittaus: validateMeasurement(saved ? JSON.parse(saved) : record.initial) };
  }
  if (!stillCurrent()) return;
  releaseEditor();
  if (pdfTemplate) pdfTemplate.previewUrl = record.preview ? URL.createObjectURL(record.preview) : measurementPreviewUrl;
  template = pdfTemplate;
  session = pdfSession;
  officeEditor = editor;
  active = { id: record.id, name: record.name };
  if (selectedDocumentId() !== record.id) {
    history.pushState({ tuntixDocument: record.id }, '', '#lomakkeet');
  }
  render();
}

function releaseEditor() {
  if (template?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(template.previewUrl);
  session = active = template = officeEditor = null;
}

function clearSelection() {
  history.replaceState(null, '', '#lomakkeet');
  releaseEditor();
}

function close() {
  if (session && !saveDraft()) return;
  if (officeEditor && !officeEditor.save()) return;
  history.back();
}

function pdfName(name) { return name.replace(/\.[^.]+$/, '') + '.pdf'; }

export async function saveOriginal() {
  const name = prompt('Tiedoston nimi', 'Mittaustodistus ' + new Date().toLocaleDateString('fi-FI'));
  if (!name?.trim()) return;
  const response = await fetch(measurementPdfUrl);
  if (!response.ok) throw Error('Lataus epäonnistui.');
  await storeDocument({ id: crypto.randomUUID(), name: name.trim().replace(/\.pdf$/i, '') + '.pdf',
    bytes: await response.arrayBuffer(), initial: validateMeasurement(S.mittaus) });
  await refreshList();
  toast('Tiedosto tallennettu');
}

const asBlob = canvas => new Promise((resolve, reject) => canvas.toBlob(blob =>
  blob ? resolve(blob) : reject(Error('Kuvan käsittely epäonnistui.')), 'image/png'));

async function raster(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    const factor = Math.min(1, 4096 / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.max(1, Math.round(img.naturalWidth * factor));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * factor));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return { preview: await asBlob(canvas), width: canvas.width, height: canvas.height };
  } finally { URL.revokeObjectURL(url); }
}

async function officePicture(file) {
  const { unzipSync } = await import('./vendor/formats/zip.mjs');
  // Only a full-page picture can be imported without changing Office page layout.
  const instructions = 'Jos lomake sisältää tekstiä, taulukoita tai useita kuvia, tallenna se ensin PDF-muotoon.';
  const contents = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: entry =>
    /^(?:word\/media\/|xl\/media\/|ppt\/media\/|Pictures\/)|^(?:word\/document|content|ppt\/slides\/slide\d+|xl\/worksheets\/sheet\d+)\.xml$/.test(entry.name) });
  const images = Object.keys(contents).filter(name => /\.(png|jpe?g|gif|bmp|webp|avif|svg)$/i.test(name));
  const xml = Object.entries(contents).filter(([name]) => name.endsWith('.xml'));
  if (images.length !== 1 || xml.length !== 1) throw Error(instructions);
  const doc = new DOMParser().parseFromString(new TextDecoder().decode(xml[0][1]), 'application/xml');
  const hasContent = [...doc.getElementsByTagName('*')].some(el =>
    ['t','p','h','v'].includes(el.localName) && el.textContent.trim());
  if (hasContent || doc.querySelector('parsererror')) throw Error(instructions);
  const type = images[0].endsWith('.svg') ? 'image/svg+xml' : '';
  return raster(new Blob([contents[images[0]]], { type }));
}

async function photoPages(file, bytes) {
  if (office.test(file.name)) return [await officePicture(file)];
  if (/\.tiff?$/i.test(file.name) || /image\/tiff/.test(file.type)) {
    const { default: tiff } = await import('./vendor/formats/tiff.mjs');
    const pages = [];
    for (const frame of tiff.decode(bytes).filter(item => item.t256 && item.t257 && !(item.t254?.[0] & 1))) {
      tiff.decodeImage(bytes, frame);
      const canvas = document.createElement('canvas');
      canvas.width = frame.width; canvas.height = frame.height;
      const pixels = new Uint8ClampedArray(tiff.toRGBA8(frame));
      canvas.getContext('2d').putImageData(new ImageData(pixels, frame.width, frame.height), 0, 0);
      pages.push({ preview: await asBlob(canvas), width: frame.width, height: frame.height });
    }
    if (pages.length) return pages;
  }
  try { return [await raster(file)]; } catch {
    if (/\.hei[cf]$/i.test(file.name) || /image\/hei[cf]/.test(file.type)) {
      const { heicTo } = await import('./vendor/formats/heic.mjs');
      return [await raster(await heicTo({ blob: file, type: 'image/png' }))];
    }
    throw Error('Tiedostoa ei voitu avata kuvana. Tallenna lomake PDF- tai PNG-muotoon ja yritä uudelleen.');
  }
}

async function pdfPreview(bytes, editable) {
  const renderer = await import('./pdfjs/pdf.min.mjs');
  renderer.GlobalWorkerOptions.workerSrc = new URL('./pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  const task = renderer.getDocument({ data: new Uint8Array(bytes).slice(), isEvalSupported: false,
    useWasm: false, wasmUrl: new URL('./pdfjs/codecs/', import.meta.url).href });
  try {
    const page = await (await task.promise).getPage(1);
    const original = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 2200 / Math.max(original.width, original.height) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport,
      annotationMode: editable ? renderer.AnnotationMode.DISABLE : renderer.AnnotationMode.ENABLE }).promise;
    return { preview: await asBlob(canvas), width: original.width, height: original.height };
  } finally { await task.destroy(); }
}

function importFields(form) {
  const fieldCount = form.getFields().length;
  const draft = { rows: [] };
  const value = name => form.getFieldMaybe(name)?.getText?.() || '';
  for (const [key, name] of Object.entries(measurementPdfNames)) draft[key] = value(name);
  draft.workers = Array.from({ length: 10 }, (_, i) => value('tyontekija_' + i)).join('\n').trimEnd();
  for (let i = 0; i < measurementRowCount; i++) {
    for (const [key,, name] of measurementCells(i)) {
      const text = value(name);
      if (text) (draft.rows[i] ||= {})[key] = text;
    }
  }
  for (const field of form.getFields()) {
    const match = /^jatko_(\w+)_(\d+)$/.exec(field.getName());
    if (!match || !Object.hasOwn(measurementColumns, match[1])) continue;
    const index = Number(match[2]) - 1;
    if (index >= measurementRowCount && index < measurementRowCount + fieldCount) {
      (draft.rows[index] ||= {})[match[1]] = field.getText() || '';
    }
  }
  draft.rows = Array.from(draft.rows, row => row || {});
  const appearance = form.getTextField(measurementPdfNames.site).acroField.getDefaultAppearance() || '';
  if (appearance.includes('OpenSans')) draft.font = 'print';
  return draft;
}

async function prepare(file, bytes) {
  const { PDFDocument, PDFName, PDFTextField } = PDFLib;
  const isPdf = /%PDF-/.test(new TextDecoder().decode(bytes.slice(0, 1024)));
  const input = isPdf ? await PDFDocument.load(bytes, { updateMetadata: false }) : null;
  const form = input?.getForm();
  const known = form && [...Object.values(measurementPdfNames), ...measurementCells(0).map(cell => cell[2])]
    .every(name => form.getFieldMaybe(name) instanceof PDFTextField);
  const pages = input ? [await pdfPreview(bytes, known)] : await photoPages(file, bytes);
  const front = pages[0];
  if (known) {
    const initial = importFields(form);
    // Clear imported values from the working background so cleared fields stay empty on export.
    const continuation = new Set();
    for (const field of form.getFields()) {
      if (/^jatko_/.test(field.getName())) {
        for (const widget of field.acroField.getWidgets()) continuation.add(widget.P()?.toString());
        form.removeField(field);
      } else if (field instanceof PDFTextField) field.setText('');
    }
    for (let i = input.getPageCount() - 1; i > 0; i--) {
      if (continuation.has(input.getPage(i).ref.toString())) input.removePage(i);
    }
    return { preview: front.preview, bytes: await input.save(), initial };
  }
  // Use only the field layout of the reference PDF. The visible page comes from the upload.
  const response = await fetch(measurementPdfUrl);
  if (!response.ok) throw Error('Lomakkeen kenttiä ei voitu ladata.');
  const pdf = await PDFDocument.load(await response.arrayBuffer());
  const page = pdf.getPage(0);
  const width = page.getWidth(), height = width * front.height / front.width;
  page.node.set(PDFName.of('Contents'), pdf.context.obj([]));
  page.node.set(PDFName.of('Resources'), pdf.context.obj({}));
  page.scale(1, height / page.getHeight());
  const original = input?.getPage(0);
  const crop = original?.getCropBox();
  if (original && !original.getRotation().angle && !original.node.Annots()?.size() && original.node.Contents()) {
    const vector = await pdf.embedPage(original, { left: crop.x, bottom: crop.y, right: crop.x+crop.width, top: crop.y+crop.height });
    page.drawPage(vector, { width, height });
  } else {
    page.drawImage(await pdf.embedPng(await front.preview.arrayBuffer()), { width, height });
  }
  if (input) {
    for (const extra of await pdf.copyPages(input, input.getPageIndices().slice(1))) pdf.addPage(extra);
  }
  for (const extra of pages.slice(1)) {
    const image = await pdf.embedPng(await extra.preview.arrayBuffer());
    const h = width * extra.height / extra.width;
    pdf.addPage([width, h]).drawImage(image, { width, height: h });
  }
  return { preview: front.preview, bytes: await pdf.save(), initial: {} };
}

async function importFile(file) {
  if (/\.(doc|xls)$/i.test(file.name)) throw Error('Tallenna vanha Word- tai Excel-tiedosto ensin DOCX-, XLSX- tai PDF-muotoon.');
  const bytes = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const id = Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join('');
  let record = await read('documents', id);
  if (!record) {
    if (/\.(docx|xlsx)$/i.test(file.name)) {
      const { openOfficeDocument } = await import('./office-document.js?v=2');
      const editor = await openOfficeDocument(bytes, file.name, {}, () => {});
      record = editor.picture
        ? { ...await prepare(editor.picture, await editor.picture.arrayBuffer()), id, name: file.name }
        : { id, name: file.name, bytes, kind: 'office' };
    } else record = { ...await prepare(file, bytes), id, name: file.name };
    await storeDocument(record);
  }
  return record;
}

async function openFromChooser(operation) {
  if (busy) return;
  const status = document.getElementById('upload-form-status');
  if (!status) return;
  busy = true;
  status.textContent = 'Avataan lomaketta…';
  try {
    const record = await operation();
    if (!record) throw Error('Tiedostoa ei löytynyt.');
    await activate(record, () => status.isConnected);
  } catch (error) {
    console.warn("Asiakirjan avaaminen epäonnistui", error);
    status.textContent = /^(Tallenna|Jos lomake|Tiedostoa ei voitu avata kuvana|Lomakkeen kenttiä|Asiakirjan rakenne|Laskentataulukkoa)/.test(error.message)
      ? error.message : 'Tiedostoa ei voitu avata tai tallentaa. Valitse suojaamaton Word-, Excel- tai PDF-tiedosto tai koko lomakkeen kuva.';
  } finally { busy = false; }
}

document.addEventListener('click', event => {

  if (event.target.closest('[data-form-close]') || (selectedDocumentId() && event.target.closest('#nav a[href="#lomakkeet"]'))) {
    event.preventDefault();
    close();
    return;
  }
  if (event.target.closest('[data-form-save]') && (officeEditor ? officeEditor.save() : saveDraft())) {
    document.getElementById('upload-form-status').textContent = 'Muutokset tallennettu.';
  }
  if (officeEditor && event.target.closest('[data-office-share]')) sendSaved(active.id);
  const send = event.target.closest('[data-send-form]');
  if (send) sendSaved(send.dataset.sendForm);
  if (officeEditor && event.target.closest('[data-office-download]')) {
    try { download(officeEditor.name, officeEditor.bytes(), officeEditor.mime); }
    catch { toast('Tiedoston luominen epäonnistui.'); }
  }
  const saved = event.target.closest('[data-saved-form]');
  if (saved) openFromChooser(() => read('documents', saved.dataset.savedForm));
});

export function openFile(file) { return openFromChooser(() => importFile(file)); }

async function sendSaved(id) {
  const status = document.getElementById('upload-form-status'), mail = document.getElementById('saved-email');
  if (!status || busy) return;
  busy = true;
  status.textContent = 'Valmistellaan tiedostoa…';
  mail.hidden = true;
  try {
    const record = await read('documents', id);
    const saved = localStorage.getItem(storagePrefix + id);
    let bytes, name = record.name, type;
    if (officeEditor && active?.id === id) {
      bytes = officeEditor.bytes(); type = officeEditor.mime;
    } else if (record.kind === 'office') {
      const { openOfficeDocument } = await import('./office-document.js?v=2');
      const editor = await openOfficeDocument(record.bytes, name, saved ? JSON.parse(saved) : {}, () => {});
      bytes = editor.bytes(); type = editor.mime;
    } else {
      bytes = await makeMeasurementPdf(validateMeasurement(saved ? JSON.parse(saved) : record.initial), record);
      name = pdfName(name); type = 'application/pdf';
    }
    const share = { files: [new File([bytes], name, { type })], title: name };
    if (navigator.canShare?.(share)) {
      try { await navigator.share(share); status.textContent = 'Tiedosto jaettu.'; return; }
      catch (error) { if (error.name === 'AbortError') { status.textContent = ''; return; } }
    }
    download(name, bytes, type);
    status.textContent = 'Tiedosto ladattu. Liitä ' + name + ' sähköpostiviestiin.';
    mail.href = 'mailto:?subject=' + encodeURIComponent(name); mail.hidden = false; mail.focus();
  } catch { status.textContent = 'Tiedoston valmistelu epäonnistui. Yritä uudelleen.'; }
  finally { busy = false; }
}

window.addEventListener('popstate', () => {
  if (active && selectedDocumentId() !== active.id) releaseEditor();
  if (location.hash === '#lomakkeet') render();
});
window.addEventListener('hashchange', () => {
  if (active && selectedDocumentId() !== active.id) releaseEditor();
});
