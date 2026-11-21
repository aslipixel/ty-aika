(() => {
  const icon = (name) => Teras.icon(name);
  const escape = (value) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const emptyWork = () => ({ t: '', m: '', u: '', p: '', y: '', n: '' });
  const rowTypes = {
    w: { limit: 36, create: emptyWork },
    h: { limit: 3, create: () => ({ t: '', h: '' }) },
    tt: { limit: 10, create: () => '' },
  };
  const partialHidden = new Set([
    'loppu',
    'asnr',
    'lasko',
    'kalv',
    'alv',
    'yks',
    'euro',
    'yht',
    't10',
    't2',
    'tj',
  ]);
  function selectMode(form, mode) {
    form.mode = mode;
    form.v.osa = mode === 'osa';
    form.v.loppu = mode === 'loppu';
    form.hid = { ...form.exclusions[mode] };
    delete form.hid.osa;
    delete form.hid.loppu;
    if (mode === 'osa') for (const key of partialHidden) form.hid[key] = true;
  }
  const blank = () => {
    const form = {
      v: {},
      w: [emptyWork()],
      h: [rowTypes.h.create()],
      tt: [''],
      hid: {},
      sig: '',
      exclusions: { osa: { merk: true, lask: true }, loppu: {} },
    };
    selectMode(form, 'osa');
    return form;
  };
  // Exported PDF and JPG files carry the form data, so they can be opened for editing again.
  const DATA_TAG = 'TUNTIX-LASKULAPPU-1:';
  const toBase64 = (text) => {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  };
  const fromBase64 = (b64) =>
    new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  const packDraft = () => DATA_TAG + toBase64(JSON.stringify(draft));
  // JPEG comment segments hold at most 65533 bytes, so long data is split over several.
  async function jpegWithData(blob) {
    const jpeg = new Uint8Array(await blob.arrayBuffer()),
      body = packDraft().slice(DATA_TAG.length),
      segments = [];
    for (let i = 0; i < body.length; i += 60000) {
      const text = DATA_TAG + body.slice(i, i + 60000),
        segment = new Uint8Array(4 + text.length);
      segment.set([0xff, 0xfe, (text.length + 2) >> 8, (text.length + 2) & 0xff]);
      for (let j = 0; j < text.length; j++) segment[4 + j] = text.charCodeAt(j);
      segments.push(segment);
    }
    return new Blob([jpeg.subarray(0, 2), ...segments, jpeg.subarray(2)], { type: 'image/jpeg' });
  }
  async function readDraftFile(file) {
    const text = new TextDecoder('latin1').decode(await file.arrayBuffer());
    const parts = [...text.matchAll(/TUNTIX-LASKULAPPU-1:([A-Za-z0-9+/=]+)/g)].map((m) => m[1]);
    return parts.length ? JSON.parse(fromBase64(parts.join(''))) : null;
  }
  const ensure = (group, index) => {
    const rows = draft[group];
    if (index >= rowTypes[group].limit) return null;
    while (rows.length <= index) rows.push(rowTypes[group].create());
    return rows[index];
  };
  const money = (whole, cents) => (whole || cents ? (whole || '0') + (cents ? ',' + cents : '') : '');
  function setPaperField(id, value) {
    const v = draft.v,
      plain = ['asnr', 'tyonro', 'tilaaja', 'kalv', 'alv', 't10', 't2', 'paikka', 'tj', 'lask', 'huom'];
    if (plain.includes(id)) return void (v[id] = value);
    // Existing drafts keep their original keys: kohde2 is the address.
    if (id === 'kohde1') return void (v.kohde2 = value);
    if (id === 'kohde2') return void (v.kohde1 = value);
    if (id === 'lasko1' || id === 'lasko2') {
      const lines = (v.lasko || '').split('\n');
      const first = id === 'lasko1' ? value : lines[0] || '',
        rest = id === 'lasko2' ? value : lines.slice(1).join(' ');
      return void (v.lasko = rest ? first + '\n' + rest : first);
    }
    if (id === 'pvm') {
      const m = value.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      return void (v.pvm = m ? m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') : '');
    }
    const tt = id.match(/^tt(\d+)$/);
    if (tt) {
      if (ensure('tt', +tt[1]) !== null) draft.tt[+tt[1]] = value;
      return;
    }
    const cell = id.match(/^(tyo|maara|yks|merk|euro|s1|yht|s2)(\d+)$/);
    if (!cell) return;
    const [, col, n] = cell,
      r = +n;
    if (r >= 36 && (col === 'tyo' || col === 'maara')) {
      const row = ensure('h', r - 36);
      if (row) row[col === 'tyo' ? 't' : 'h'] = value;
      return;
    }
    const row = ensure('w', r);
    if (!row) return;
    const shown = LaskulappuPaper.values(draft);
    if (col === 'tyo') row.t = value;
    else if (col === 'maara') row.m = value;
    else if (col === 'yks') row.u = value;
    else if (col === 'merk') row.n = value;
    else if (col === 'euro') row.p = money(value, shown['s1' + r]);
    else if (col === 's1') row.p = money(shown['euro' + r], value);
    else if (col === 'yht') row.y = money(value, shown['s2' + r]);
    else if (col === 's2') row.y = money(shown['yht' + r], value);
  }
  let draft = blank(),
    name = '',
    // True while the form has changes that are neither stored nor sent/exported.
    dirty = false;
  const button = (action, glyph, label, title = label) =>
    `<button type="button" data-action="${action}" title="${escape(title)}" aria-label="${escape(title)}">${icon(glyph)}${label ? '<span>' + escape(label) + '</span>' : ''}</button>`;
  const actions = {
    sign: ['signature', 'Allekirjoita'],
    removeSig: ['trash-2', 'Poista', 'Poista allekirjoitus'],
    preview: ['eye', 'Katso', 'Esikatsele lomaketta'],
    open: ['folder-open', 'Avaa'],
    save: ['save', 'Tallenna'],
    send: ['send', 'Lähetä'],
    edit: ['pencil', 'Muokkaa'],
    export: ['download', 'Vie', 'Vie PDF tai kuva'],
    pdf: ['file-text', 'PDF', 'Lataa PDF'],
    photo: ['image', 'Kuva', 'Tallenna kuva'],
    close: ['check', 'Valmis'],
    cancel: ['x', 'Peruuta'],
    clear: ['rotate-ccw', 'Tyhjennä'],
    accept: ['check', 'Valmis'],
    store: ['save', 'Tallenna'],
    fields: ['list', 'Kentät'],
    textStyle: ['type', 'Teksti', 'Tekstin ulkoasu: käsin tai tavallinen, lihava tai normaali'],
    zoomIn: ['plus', '', 'Suurenna'],
    zoomOut: ['minus', '', 'Pienennä'],
  };
  const controls = (...names) => names.map((key) => button(key, ...actions[key])).join('');
  const field = (section, key, label, type = 'text', value = draft.v[key]) => {
    if (draft.hid[section]) return '';
    const attrs = `data-key="${key}" aria-label="${label}" placeholder="${label}"`;
    if (type === 'checkbox')
      return `<label class="check"><input ${attrs} type="checkbox" ${value ? 'checked' : ''}>${label}</label>`;
    if (type === 'area') return `<textarea ${attrs}>${escape(value)}</textarea>`;
    return `<input ${attrs} type="${type}" value="${escape(value)}">`;
  };
  const card = (title, contents) =>
    contents ? `<section><h3>${title}</h3>${contents}</section>` : '';
  const grid = (content) => (content ? '<div class="pair">' + content + '</div>' : '');
  function rows(group, title, fields) {
    if (fields.every(([section]) => draft.hid[section])) return '';
    return card(
      title,
      draft[group]
        .map(
          (row, i) => `<div class="item" data-group="${group}" data-index="${i}">
      <div class="rowhead"><b>Rivi ${i + 1}</b><div>${button('del', 'trash-2', '', 'Poista rivi')} ${button('add', 'plus', '', 'Lisää rivi')}</div></div>
      <div class="pair">${fields.map(([section, key, label, type]) => field(section, key, label, type, group === 'tt' ? row : row[key])).join('')}</div></div>`,
        )
        .join(''),
    );
  }
  const sheet = new URL('editor.css', document.currentScript.src).href;
  class LaskulappuEditor extends HTMLElement {
    constructor() {
      super();
      this.root = this.attachShadow({ mode: 'open' });
      this.root.addEventListener('click', (event) => {
        const b = event.target.closest('[data-action]');
        if (b) this.act(b).catch(() => this.status('Toiminto epäonnistui. Yritä uudelleen.'));
      });
      this.root.addEventListener('change', (event) => {
        if (event.target.id !== 'import-file') return;
        const file = event.target.files[0];
        event.target.value = '';
        if (file) this.importFile(file);
      });
      this.root.addEventListener('input', (event) => {
        const input = event.target,
          key = input.dataset.key;
        if (!key) return;
        const row = input.closest('[data-group]');
        if (!row) draft.v[key] = input.type === 'checkbox' ? input.checked : input.value;
        else {
          const { group, index } = row.dataset;
          if (group === 'tt') draft.tt[index] = input.value;
          else draft[group][index][key] = input.value;
        }
        dirty = true;
      });
    }
    connectedCallback() {
      this.root.innerHTML = `<link rel="stylesheet" href="${sheet}"><header><h2></h2>${controls('fields')}</header><main></main>
        <footer class="actions document-actions" aria-label="Lomakkeen toiminnot"></footer><p role="status"></p>
        <dialog class="preview"><header><h2></h2>${controls('edit')}</header><div class="paper"><img alt="Laskulapun esikatselu" title="Kaksoisnapauta kenttää muokataksesi"></div>
        <div class="paper-style" id="paper-style" aria-label="Tekstin ulkoasu" hidden>
          <div class="seg" role="group" aria-label="Fontti"><button type="button" data-action="font" data-font="hand">Käsin</button><button type="button" data-action="font" data-font="print">Tavallinen</button></div>
          <div class="seg" role="group" aria-label="Tekstin paksuus"><button type="button" data-action="weight" data-weight="bold">Lihava</button><button type="button" data-action="weight" data-weight="normal">Normaali</button></div>
        </div>
        <footer class="actions">${controls('zoomOut', 'zoomIn', 'sign', 'export', 'send', 'textStyle')}<div class="ink" role="group" aria-label="Tekstin väri">${LaskulappuPaper.inks
          .map(([ink, label, color]) => `<button type="button" data-action="ink" data-ink="${ink}" title="${label}" aria-label="${label}" style="--swatch:${color}"></button>`)
          .join('')}</div></footer></dialog>
        <dialog class="modal"></dialog>
        <input type="file" id="import-file" accept="application/pdf,image/*,.pdf,.jpg,.jpeg" hidden>
        <dialog class="confirm" role="alertdialog" aria-labelledby="confirm-text"><p id="confirm-text"></p>
        <div class="actions"><button type="button" data-answer="no">${icon('x')}<span>Peruuta</span></button><button type="button" data-answer="yes"></button></div></dialog>`;
      this.draw();
      this.el('.paper').addEventListener('dblclick', (event) => {
        if (event.target.matches('img'))
          this.editOnPaper(event).catch(() => this.status('Muokkaus epäonnistui.'));
      });
    }
    // Double-click a field on the previewed form to type into it directly.
    async editOnPaper(event) {
      const img = this.el('.paper img'),
        [W, H] = LaskulappuPaper.size,
        rect = img.getBoundingClientRect(),
        d = LaskulappuPaper.fieldAt(
          draft,
          ((event.clientX - rect.left) / rect.width) * W,
          ((event.clientY - rect.top) / rect.height) * H,
        );
      if (!d || d.t === 'c') return;
      if (!this.paperEditOk) {
        if (!(await this.ask('Haluatko varmasti muokata lomaketta?', 'Muokkaa', 'pencil', false))) return;
        this.paperEditOk = true;
      }
      this.el('.paper .paper-edit')?.remove();
      const scale = img.clientWidth / W,
        [fontSpec, boldness] = LaskulappuPaper.fontOf(draft),
        size = parseFloat(fontSpec.match(/([\d.]+)px/)[1]) * scale,
        b = d.b,
        multi = d.t === 'm',
        input = document.createElement(multi ? 'textarea' : 'input');
      input.style.color = LaskulappuPaper.inkOf(draft)[2];
      input.className = 'paper-edit' + (draft.font === 'print' ? '' : ' hand') + (boldness ? ' bold' : '');
      input.value = LaskulappuPaper.values(draft)[d.id] || '';
      input.setAttribute('aria-label', LaskulappuPaper.sections[d.sec][0]);
      Object.assign(input.style, {
        left: img.offsetLeft + b[0] * scale - 2 + 'px',
        top: img.offsetTop + b[1] * scale - 2 + 'px',
        width: Math.max((b[2] - b[0]) * scale + 4, 90) + 'px',
        height: Math.max((b[3] - b[1]) * scale + 4, size * 1.6) + 'px',
        fontSize: Math.max(size, 16) + 'px',
      });
      let done = false;
      const finish = async (keep) => {
        if (done) return;
        done = true;
        if (keep && input.value !== (LaskulappuPaper.values(draft)[d.id] || '')) {
          setPaperField(d.id, input.value);
          dirty = true;
          this.draw();
        }
        input.remove();
        await this.refresh();
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          finish(false);
        } else if (e.key === 'Enter' && (!multi || e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          finish(true);
        }
      });
      input.addEventListener('blur', () => finish(true));
      this.el('.paper').append(input);
      input.focus();
      input.select?.();
    }
    el(s) {
      return this.root.querySelector(s);
    }
    status(message) {
      this.el('[role=status]').textContent = message;
    }
    // Start a new, empty form.
    reset() {
      draft = blank();
      name = '';
      dirty = false;
      if (this.el('.modal').open) this.el('.modal').close();
      if (this.el('.preview').open) this.el('.preview').close();
      this.draw();
      this.status('Uusi tyhjä lomake.');
      this.scrollIntoView({ block: 'start' });
    }
    // In-app confirmation. The browser's confirm() is blocked or hidden in some
    // browsers and installed apps, which made delete silently do nothing.
    ask(message, yes = 'Poista', glyph = 'trash-2', danger = true) {
      const d = this.el('.confirm'),
        ok = d.querySelector('[data-answer=yes]');
      d.querySelector('p').textContent = message;
      ok.innerHTML = icon(glyph) + '<span>' + escape(yes) + '</span>';
      ok.classList.toggle('danger', danger);
      return new Promise((resolve) => {
        const done = (answer) => {
          d.onclick = d.oncancel = null;
          d.close();
          resolve(answer);
        };
        d.onclick = (event) => {
          const b = event.target.closest('[data-answer]');
          if (b) done(b.dataset.answer === 'yes');
        };
        d.oncancel = (event) => {
          event.preventDefault();
          done(false);
        };
        d.showModal();
        d.querySelector('[data-answer=no]').focus();
      });
    }
    // Called by the page's ✓ button. Resolves false if the user keeps unsaved changes.
    async finish() {
      if (
        dirty &&
        !(await this.ask(
          'Lomaketta ei ole tallennettu tai lähetetty. Tyhjennetäänkö se silti?',
          'Tyhjennä',
          'rotate-ccw',
        ))
      )
        return false;
      this.reset();
      return true;
    }
    draw() {
      this.el('header h2').textContent = name || 'Laskulappu';
      this.el('main').innerHTML = [
        card(
          'Mittaus',
          '<div class="mode" role="group" aria-label="Mittaustapa">' +
            ['osa', 'loppu']
              .map(
                (mode) =>
                  `<button type="button" data-action="mode" data-mode="${mode}" aria-pressed="${mode === draft.mode}">${mode === 'osa' ? 'Osamittaus' : 'Mittaus'}</button>`,
              )
              .join('') +
            '</div>' +
            field('asnr', 'asnr', 'ASNR/O'),
        ),
        card(
          'Työnumero ja tilaaja',
          grid(field('tyonro', 'tyonro', 'Työnumero') + field('tilaaja', 'tilaaja', 'Tilaaja')) +
            field('lasko', 'lasko', 'Laskutusosoite', 'area'),
        ),
        card(
          'Kohde',
          field('kohde', 'kohde2', 'Kohteen osoite') +
            field('kohde', 'kohde1', 'Työskentelypaikka (esim. katto, piha tai talo 5 A)', 'area') +
            grid(field('kalv', 'kalv', 'K-ALV 0%') + field('alv', 'alv', 'ALV 24%')),
        ),
        rows('w', 'Työselitys / Määrä', [
          ['tyo', 't', 'Työselitys', 'area'],
          ['maara', 'm', 'Määrä'],
          ['yks', 'u', 'Yksikkö'],
          ['euro', 'p', 'Yksikköhinta (€)'],
          ['yht', 'y', 'Yhteensä (€)'],
          ['merk', 'n', 'Tilaajan merkintä'],
        ]),
        rows('h', 'Laskutettavat tunnit', [
          ['tunnit', 't', 'Työn kuvaus'],
          ['tunnit', 'h', 'Tunnit'],
        ]),
        rows('tt', 'Työntekijät', [['tt', 'tt', 'Työntekijä']]),
        card(
          'Huomautuksia',
          field('huom', 'huom', 'Huomautuksia (esim. työnaikaiset muutokset)', 'area'),
        ),
        card(
          'Takuu',
          grid(field('t10', 't10', 'Takuupvm 10 V') + field('t2', 't2', 'Takuupvm 2 V')),
        ),
        card(
          'Paikka ja päiväys',
          grid(field('paik', 'paikka', 'Paikka') + field('paik', 'pvm', 'Päiväys', 'date')),
        ),
        card(
          'Työnjohto ja laskutus',
          grid(field('tj', 'tj', 'Icopalin työnjohtaja') + field('lask', 'lask', 'Laskutettu')),
        ),
        card(
          'Tilaajan edustajan allekirjoitus',
          draft.hid.edu
            ? ''
            : `<div class="sig">${draft.sig ? '<img alt="Allekirjoitus">' : 'Ei allekirjoitusta'}</div>`,
        ),
      ].join('');
      this.el('.document-actions').innerHTML =
        (draft.hid.edu ? '' : controls('sign', ...(draft.sig ? ['removeSig'] : []))) +
        controls('preview', 'open', 'save', 'send');
      this.el('.preview [data-action=sign]').hidden = !!draft.hid.edu;
      const font = draft.font === 'print' ? 'print' : 'hand',
        weight = draft.weight === 'normal' ? 'normal' : 'bold';
      this.root.querySelectorAll('[data-action=font]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.font === font)));
      this.root.querySelectorAll('[data-action=weight]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.weight === weight)));
      const ink = LaskulappuPaper.inkOf(draft)[0];
      this.root.querySelectorAll('[data-action=ink]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.ink === ink)));
      if (this.el('.sig img')) this.el('.sig img').src = draft.sig;
    }
    modal(title, html) {
      const d = this.el('.modal');
      d.innerHTML = '<h2>' + escape(title) + '</h2>' + html;
      if (!d.open) d.showModal();
      return d;
    }
    // Make a stored or imported form the current one. Returns false for invalid data.
    adopt(stored, n) {
      if (!stored || typeof stored !== 'object' || !Array.isArray(stored.w)) return false;
      stored.v = stored.v && typeof stored.v === 'object' ? stored.v : {};
      if (!Array.isArray(stored.h) || !stored.h.length) stored.h = [rowTypes.h.create()];
      if (!Array.isArray(stored.tt) || !stored.tt.length) stored.tt = [''];
      if (!stored.w.length) stored.w = [emptyWork()];
      stored.hid = stored.hid && typeof stored.hid === 'object' ? stored.hid : {};
      if (typeof stored.sig !== 'string' || !stored.sig.startsWith('data:image/')) stored.sig = '';
      stored.font = stored.font === 'print' ? 'print' : 'hand';
      stored.weight = stored.weight === 'normal' ? 'normal' : 'bold';
      stored.ink = LaskulappuPaper.inkOf(stored)[0];
      // Older saved forms stored the two checkboxes and a single visibility map.
      const legacyPartial = stored.v.osa || (stored.hid.loppu && !stored.v.loppu);
      const mode = ['osa', 'loppu'].includes(stored.mode)
        ? stored.mode
        : legacyPartial && !stored.v.loppu
          ? 'osa'
          : 'loppu';
      stored.exclusions ||= { osa: {}, loppu: {}, [mode]: { ...stored.hid } };
      selectMode(stored, mode);
      draft = stored;
      name = n;
      dirty = false;
      return true;
    }
    async importFile(file) {
      const note = this.el('.modal .files-note');
      const say = (message) => (note ? (note.textContent = message) : this.status(message));
      let stored = null;
      try {
        stored = await readDraftFile(file);
      } catch {
        stored = null;
      }
      if (!stored || !Array.isArray(stored.w)) {
        // A photo or scan of the paper form opens straight in the Asiakirjat editor,
        // which places the same form fields on top of the picture.
        say('Avataan lomaketta…');
        if (this.el('.modal').open) this.el('.modal').close();
        location.hash = 'asiakirjat';
        // Wait until the Asiakirjat page has rendered its status line.
        for (let i = 0; i < 40 && !document.getElementById('upload-form-status'); i++)
          await new Promise((resolve) => setTimeout(resolve, 100));
        await (await openUploadManager()).openFile(file);
        return;
      }
      const n = file.name.replace(/\.[^.]+$/, '').trim().slice(0, 80) || 'Laskulappu';
      if (
        dirty &&
        !(await this.ask(
          'Nykyistä lomaketta ei ole tallennettu. Avataanko ”' + n + '” silti?',
          'Avaa',
          'folder-open',
          false,
        ))
      )
        return;
      if (!this.adopt(stored, n)) {
        say('Tiedoston lomaketta ei voitu avata.');
        return;
      }
      if (this.el('.modal').open) this.el('.modal').close();
      this.draw();
      this.status('Avattu tiedostosta: ' + file.name + '. Tallenna, jos haluat sen listaan.');
    }
    files() {
      const list = Object.keys(localStorage)
        .filter((k) => k.startsWith('lask:'))
        .sort((a, b) => a.localeCompare(b, 'fi'));
      this.modal(
        'Tallennetut lomakkeet',
        list
          .map(
            (k) =>
              `<div class="saved" data-name="${escape(k.slice(5))}"><strong>${escape(k.slice(5))}</strong>${button('view', 'eye', '', 'Katso lomaketta')}${button('load', 'pencil', '', 'Muokkaa lomaketta')}${button('delete', 'trash-2', '', 'Poista lomake')}</div>`,
          )
          .join('') +
          (list.length ? '' : '<p>Ei tallennettuja lomakkeita.</p>') +
          '<div class="files-actions">' +
          controls('close') +
          button('import', 'upload', '', 'Avaa tiedosto galleriasta tai kansiosta') +
          '</div><p class="files-note" role="status"></p>',
      );
    }
    signature() {
      const d = this.modal(
        'Allekirjoita sormella',
        '<canvas></canvas><div class="actions">' + controls('clear', 'cancel', 'accept') + '</div>',
      );
      const cv = d.querySelector('canvas'),
        rect = cv.getBoundingClientRect();
      cv.width = rect.width * 2;
      cv.height = rect.height * 2;
      const ctx = cv.getContext('2d');
      ctx.scale(2, 2);
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#18294a';
      const point = (e) => {
        const r = cv.getBoundingClientRect();
        return [e.clientX - r.left, e.clientY - r.top];
      };
      cv.onpointerdown = (e) => {
        cv.setPointerCapture(e.pointerId);
        ctx.beginPath();
        const [x, y] = point(e);
        ctx.moveTo(x - 0.1, y);
        ctx.lineTo(x, y);
        ctx.stroke();
        cv.dataset.ink = '1';
      };
      cv.onpointermove = (e) => {
        if (cv.hasPointerCapture(e.pointerId)) {
          ctx.lineTo(...point(e));
          ctx.stroke();
        }
      };
    }
    async refresh() {
      const c = await LaskulappuPaper.render(draft);
      this.el('.paper img').src = c.toDataURL('image/jpeg', 0.9);
    }
    async act(b) {
      const action = b.dataset.action,
        modal = this.el('.modal'),
        preview = this.el('.preview');
      if (action === 'font' || action === 'weight' || action === 'ink') {
        if (action === 'font') draft.font = b.dataset.font === 'print' ? 'print' : 'hand';
        else if (action === 'weight') draft.weight = b.dataset.weight === 'normal' ? 'normal' : 'bold';
        else draft.ink = LaskulappuPaper.inkOf({ ink: b.dataset.ink })[0];
        dirty = true;
        this.draw();
        b.focus();
        if (preview.open) await this.refresh();
      } else if (action === 'textStyle') {
        const panel = this.el('#paper-style'),
          open = panel.hidden;
        panel.hidden = !open;
        b.setAttribute('aria-pressed', String(open));
      } else if (action === 'mode') {
        selectMode(draft, b.dataset.mode);
        dirty = true;
        this.draw();
        this.el('[data-mode="' + draft.mode + '"]').focus();
      } else if (action === 'fields') {
        this.modal(
          'Näytettävät kentät',
          '<div class="choices">' +
            Object.entries(LaskulappuPaper.sections)
              .filter(
                ([key]) =>
                  key !== 'osa' &&
                  key !== 'loppu' &&
                  (draft.mode === 'loppu' || !partialHidden.has(key)),
              )
              .map(
                ([k, [label]]) =>
                  `<button data-action="toggle" data-field="${k}" aria-pressed="${!draft.hid[k]}">${escape(label)}</button>`,
              )
              .join('') +
            '</div>' +
            controls('close'),
        );
      } else if (action === 'toggle') {
        const k = b.dataset.field;
        draft.hid[k] = !draft.hid[k];
        draft.exclusions[draft.mode][k] = draft.hid[k];
        b.setAttribute('aria-pressed', String(!draft.hid[k]));
        dirty = true;
        this.draw();
      } else if (action === 'add' || action === 'del') {
        const { group, index } = b.closest('[data-group]').dataset,
          i = Number(index),
          rows = draft[group],
          type = rowTypes[group];
        if (action === 'add') {
          if (rows.length >= type.limit) {
            this.status('Lomakkeeseen mahtuu ' + type.limit + ' riviä.');
            return;
          }
          rows.splice(i + 1, 0, type.create());
        } else if (await this.ask('Poistetaanko rivi ' + (i + 1) + '?')) {
          rows.splice(i, 1);
          if (!rows.length) rows.push(type.create());
        } else return;
        dirty = true;
        this.draw();
        this.el(
          `[data-group="${group}"][data-index="${action === 'add' ? i + 1 : Math.min(i, rows.length - 1)}"] [data-key]`,
        )?.focus();
      } else if (action === 'close' || action === 'cancel') modal.close();
      else if (action === 'save')
        this.modal(
          'Lomakkeen nimi',
          '<input aria-label="Lomakkeen nimi" id="filename" value="' +
            escape(name) +
            '" placeholder="Laskulappu"><div class="actions">' +
            controls('cancel', 'store', 'export') +
            '</div>',
        );
      else if (action === 'store') {
        const n = this.el('#filename').value.trim() || 'Laskulappu';
        if (
          localStorage.getItem('lask:' + n) !== null &&
          !(await this.ask('Lomake ”' + n + '” on jo tallennettu. Korvataanko se?', 'Korvaa', 'save'))
        )
          return;
        try {
          localStorage.setItem('lask:' + n, JSON.stringify(draft));
        } catch {
          this.status('Tallennus epäonnistui. Tarkista vapaa tallennustila.');
          return;
        }
        name = n;
        dirty = false;
        modal.close();
        this.draw();
        this.status('Tallennettu: ' + n + '. Paina ✓ aloittaaksesi uuden lomakkeen.');
      } else if (action === 'open') this.files();
      else if (action === 'import') this.el('#import-file').click();
      else if (action === 'load' || action === 'view' || action === 'delete') {
        const n = b.closest('[data-name]').dataset.name;
        if (action === 'delete') {
          if (await this.ask('Haluatko varmasti poistaa lomakkeen ”' + n + '”? Tätä ei voi perua.')) {
            localStorage.removeItem('lask:' + n);
            if (name === n) {
              name = '';
              dirty = true;
              this.draw();
            }
            this.files();
            this.status('Poistettu: ' + n);
          }
          return;
        }
        if (
          dirty &&
          !(await this.ask(
            'Nykyistä lomaketta ei ole tallennettu. Avataanko ”' + n + '” silti?',
            'Avaa',
            'folder-open',
            false,
          ))
        )
          return;
        if (!this.adopt(JSON.parse(localStorage.getItem('lask:' + n)), n)) return;
        modal.close();
        this.draw();
        this.status('Avattu: ' + n);
        if (action === 'view') await this.act({ dataset: { action: 'preview' } });
      } else if (action === 'sign') this.signature();
      else if (action === 'clear') {
        const c = this.el('canvas');
        c.getContext('2d').clearRect(0, 0, c.width, c.height);
        delete c.dataset.ink;
      } else if (action === 'accept') {
        const c = this.el('canvas');
        if (!c.dataset.ink) {
          c.focus();
          return;
        }
        draft.sig = c.toDataURL();
        dirty = true;
        modal.close();
        this.draw();
        if (preview.open) await this.refresh();
      } else if (action === 'removeSig') {
        if (draft.sig && (await this.ask('Poistetaanko allekirjoitus?'))) {
          draft.sig = '';
          dirty = true;
          this.draw();
        }
      } else if (action === 'preview') {
        this.paperEditOk = false;
        this.zoom = 1;
        this.el('.paper img').style.width = '100%';
        this.el('#paper-style').hidden = true;
        this.el('[data-action=textStyle]').setAttribute('aria-pressed', 'false');
        this.el('.preview h2').textContent = name || 'Laskulappu';
        preview.showModal();
        await this.refresh();
      } else if (action === 'edit') preview.close();
      else if (action === 'zoomIn' || action === 'zoomOut') {
        this.zoom = Math.min(4, Math.max(1, this.zoom + (action === 'zoomIn' ? 0.5 : -0.5)));
        this.el('.paper img').style.width = this.zoom * 100 + '%';
      } else if (action === 'export') {
        const filename = (this.el('#filename')?.value.trim() || name || 'Laskulappu').replace(
          /[/\\]/g,
          '_',
        );
        const dialog = this.modal(
          'Tallenna tiedosto',
          '<div class="actions">' +
            controls('pdf', 'photo') +
            '</div><p class="export-status" role="status">Valmistellaan…</p>' +
            controls('close'),
        );
        const status = dialog.querySelector('.export-status');
        const options = dialog.querySelectorAll('.actions button');
        options.forEach((option) => (option.disabled = true));
        try {
          const canvas = await LaskulappuPaper.render(draft);
          const jpeg = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.94));
          if (!jpeg) throw Error();
          if (!status.isConnected || !dialog.open) return;
          this.exports = {
            pdf: new File([LaskulappuPaper.pdfBytes(canvas, packDraft())], filename + '.pdf', {
              type: 'application/pdf',
            }),
            photo: new File([await jpegWithData(jpeg)], filename + '.jpg', { type: 'image/jpeg' }),
          };
          status.textContent = navigator.canShare?.({ files: [this.exports.photo] })
            ? 'Valitse Kuva ja tallenna kuva jakovalikosta.'
            : 'Kuva ladataan JPEG-tiedostona.';
          options.forEach((option) => (option.disabled = false));
        } catch {
          status.textContent = 'Tiedoston luominen epäonnistui. Yritä uudelleen.';
        }
      } else if (action === 'pdf' || action === 'photo' || action === 'send') {
        const file =
          action === 'send'
            ? new File(
                [LaskulappuPaper.pdfBytes(await LaskulappuPaper.render(draft), packDraft())],
                (name || 'Laskulappu').replace(/[/\\]/g, '_') + '.pdf',
                { type: 'application/pdf' },
              )
            : this.exports[action];
        if (action !== 'pdf' && navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: name || 'Laskulappu' });
            dirty = false;
            this.status('Lähetetty. Paina ✓ aloittaaksesi uuden lomakkeen.');
            return;
          } catch (err) {
            if (err.name === 'AbortError') return;
          }
        }
        const a = document.createElement('a'),
          url = URL.createObjectURL(file);
        a.href = url;
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        dirty = false;
        this.status('Tiedosto ladattu: ' + file.name + '. Paina ✓ aloittaaksesi uuden lomakkeen.');
        if (action === 'send')
          location.href =
            'mailto:?subject=' +
            encodeURIComponent(name || 'Laskulappu') +
            '&body=' +
            encodeURIComponent('Liitä ladattu tiedosto: ' + file.name);
      }
    }
  }
  customElements.define('laskulappu-editor', LaskulappuEditor);
})();
