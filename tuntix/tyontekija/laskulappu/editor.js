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
      exclusions: { osa: {}, loppu: {} },
    };
    selectMode(form, 'osa');
    return form;
  };
  let draft = blank(),
    name = '';
  const button = (action, glyph, label, title = label) =>
    `<button type="button" data-action="${action}" title="${escape(title)}" aria-label="${escape(title)}">${icon(glyph)}${label ? '<span>' + escape(label) + '</span>' : ''}</button>`;
  const actions = {
    sign: ['pen-line', 'Allekirjoita'],
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
      });
    }
    connectedCallback() {
      this.root.innerHTML = `<link rel="stylesheet" href="${sheet}"><header><h2></h2>${controls('fields')}</header><main></main>
        <footer class="actions document-actions" aria-label="Lomakkeen toiminnot"></footer><p role="status"></p>
        <dialog class="preview"><header><h2></h2>${controls('edit')}</header><div class="paper"><img alt="Laskulapun esikatselu"></div>
        <footer class="actions">${controls('zoomOut', 'zoomIn', 'sign', 'export', 'send')}</footer></dialog>
        <dialog class="modal"></dialog>`;
      this.draw();
    }
    el(s) {
      return this.root.querySelector(s);
    }
    status(message) {
      this.el('[role=status]').textContent = message;
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
                  `<button type="button" data-action="mode" data-mode="${mode}" aria-pressed="${mode === draft.mode}">${mode === 'osa' ? 'Osamittaus' : 'Loppumittaus'}</button>`,
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
        (draft.hid.edu ? '' : controls('sign', 'removeSig')) +
        controls('preview', 'open', 'save', 'send');
      this.el('.preview [data-action=sign]').hidden = !!draft.hid.edu;
      if (this.el('.sig img')) this.el('.sig img').src = draft.sig;
    }
    modal(title, html) {
      const d = this.el('.modal');
      d.innerHTML = '<h2>' + escape(title) + '</h2>' + html;
      if (!d.open) d.showModal();
      return d;
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
              `<div class="saved" data-name="${escape(k.slice(5))}"><strong>${escape(k.slice(5))}</strong>${button('load', 'pencil', 'Muokkaa')}${button('delete', 'trash-2', '', 'Poista lomake')}</div>`,
          )
          .join('') +
          (list.length ? '' : '<p>Ei tallennettuja lomakkeita.</p>') +
          controls('close'),
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
      if (action === 'mode') {
        selectMode(draft, b.dataset.mode);
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
        } else if (confirm('Poistetaanko rivi?')) {
          rows.splice(i, 1);
          if (!rows.length) rows.push(type.create());
        } else return;
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
          !confirm('Korvataanko tallennettu lomake?')
        )
          return;
        try {
          localStorage.setItem('lask:' + n, JSON.stringify(draft));
        } catch {
          alert('Tallennus epäonnistui. Tarkista vapaa tallennustila.');
          return;
        }
        name = n;
        modal.close();
        this.draw();
        this.status('Tallennettu: ' + n);
      } else if (action === 'open') this.files();
      else if (action === 'load' || action === 'delete') {
        const n = b.closest('[data-name]').dataset.name;
        if (action === 'delete') {
          if (confirm('Poistetaanko lomake ”' + n + '”?')) {
            localStorage.removeItem('lask:' + n);
            if (name === n) {
              name = '';
              this.draw();
            }
            this.files();
          }
          return;
        }
        const stored = JSON.parse(localStorage.getItem('lask:' + n));
        if (!stored || !Array.isArray(stored.w)) return;
        // Older saved forms stored the two checkboxes and a single visibility map.
        const legacyPartial = stored.v.osa || (stored.hid?.loppu && !stored.v.loppu);
        const mode = stored.mode || (legacyPartial && !stored.v.loppu ? 'osa' : 'loppu');
        stored.exclusions ||= { osa: {}, loppu: {}, [mode]: { ...stored.hid } };
        selectMode(stored, mode);
        draft = stored;
        name = n;
        modal.close();
        this.draw();
        this.status('Avattu: ' + n);
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
        modal.close();
        this.draw();
        if (preview.open) await this.refresh();
      } else if (action === 'removeSig') {
        if (draft.sig && confirm('Poistetaanko allekirjoitus?')) {
          draft.sig = '';
          this.draw();
        }
      } else if (action === 'preview') {
        this.zoom = 1;
        this.el('.paper img').style.width = '100%';
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
            pdf: new File([LaskulappuPaper.pdfBytes(canvas)], filename + '.pdf', {
              type: 'application/pdf',
            }),
            photo: new File([jpeg], filename + '.jpg', { type: 'image/jpeg' }),
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
                [LaskulappuPaper.pdfBytes(await LaskulappuPaper.render(draft))],
                (name || 'Laskulappu').replace(/[/\\]/g, '_') + '.pdf',
                { type: 'application/pdf' },
              )
            : this.exports[action];
        if (action !== 'pdf' && navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: name || 'Laskulappu' });
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
