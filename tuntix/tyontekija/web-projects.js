// Browser-only project register and editable display names for stable work-type keys.
(() => {
  if (window.nativePersist) return;

  const defaultKeys = ['Sovittu', 'Laskutyö', 'Urakka', 'Sää', 'Sairasloma', 'Loma', 'Pekkanen', 'Koulutus'];
  const defaultNames = new Map([['Laskutyö', 'Lasku'], ['Sää', 'Sääeste']]);
  const label = key => S.set.workTypeLabels?.find(pair => pair[0] === key)?.[1] ?? defaultNames.get(key) ?? key;
  const isAbsence = key => ABS.includes(key) || key === 'Sääeste';
  const normalized = name => name.trim().toLocaleLowerCase('fi');
  const icon = name => window.Teras.icon(name);
  const formatHours = new Intl.NumberFormat('fi-FI', {maximumFractionDigits:2});

  function keys() {
    const legacy = S.en.some(entry => entry.t === 'Etumies') || S.last.t === 'Etumies' ? ['Etumies'] : [];
    return [...new Set([...defaultKeys, ...legacy, ...(S.set.customTypes || [])])];
  }

  function options(current) {
    const visible = keys().filter(key => !S.set.hiddenTypes?.includes(key));
    if (current && !visible.includes(current)) visible.push(current);
    return visible.map(value => ({value, label: label(value)}));
  }

  // Labels change independently of hour records, absence calculations, and project links.
  function restoreLabels(settings) {
    const rows = settings.workTypeLabels;
    if (rows === undefined) return {};
    if (!Array.isArray(rows) || rows.length > 209 || !rows.every(pair =>
      Array.isArray(pair) && pair.length === 2 && pair.every(v => typeof v === 'string' && v.trim() && v.length <= 80)
    ) || new Set(rows.map(pair => pair[0])).size !== rows.length) throw Error('Virheellinen työlaji.');
    return {workTypeLabels: rows.map(([key, name]) => [key, name])};
  }

  function updateSettings(patch) {
    const old = S.set;
    S.set = {...old, ...patch};
    if (save()) return true;
    S.set = old;
    return false;
  }

  // Projektit: one compact row per day and project ("Ma 16.11. · E1204401 · 5 h Sovittu, 3 h Lasku").
  // The small button opens the details: each entry with its comment, then the address and travel once.
  const groupNames = {':absence':'Poissaolo', ':deleted':'Poistettu projekti', ':none':'Ei projektia'};
  const hoursText = h => formatHours.format(h) + ' h';
  function groupKey(entry) {
    if (entry.p && S.pr.some(p => p.id === entry.p)) return entry.p;
    return isAbsence(entry.t) ? ':absence' : entry.p ? ':deleted' : ':none';
  }
  function byType(entries) {
    const sums = new Map();
    for (const e of entries) sums.set(e.t, (sums.get(e.t) || 0) + e.h);
    return [...sums].map(([t, h]) => ({t, h}));
  }

  function entryLine(entry) {
    return `<button type="button" class="pj-entry" data-project-record="open" data-entry-id="${esc(entry.id)}" aria-label="${esc(hoursText(entry.h)+' '+label(entry.t)+(entry.c?', '+entry.c:''))}. Avaa kirjaus.">
      <b>${hoursText(entry.h)}</b><span>${esc(label(entry.t))}</span>${entry.c ? `<small>${esc(entry.c)}</small>` : ''}</button>`;
  }

  function dayRow(day, key, entries) {
    const date = pd(day), project = S.pr.find(p => p.id === key);
    const name = project?.n || groupNames[key] || 'Ei projektia';
    const types = byType(entries), total = entries.reduce((sum, e) => sum + e.h, 0);
    const work = entries.some(e => !isAbsence(e.t));
    // With one entry per type the lines show the comments; otherwise the type totals come first.
    const lines = entries.map(entryLine).join('');
    const place = project?.a ? `<div class="pj-place">${icon('map-pin')}<span>${esc(project.a)}</span></div><div class="pj-travel">${distanceBadge(project.id, work)}</div>` : '';
    return `<details class="pj-row">
      <summary aria-label="${esc(DL[wd(date)]+' '+fd(date)+' '+name+' '+hoursText(total))}. Näytä tiedot.">
        <span class="pj-date"><b>${DN[wd(date)]}</b><span>${fd(date)}</span></span>
        <span class="pj-main"><b class="pj-name">${esc(name)}</b><span class="pj-types">${types.map(x => `${hoursText(x.h)} ${esc(label(x.t))}`).join(' · ')}</span></span>
        <span class="pj-more" aria-hidden="true">${icon('chevron-down')}</span>
      </summary>
      <div class="pj-details">${lines}${place}</div>
    </details>`;
  }

  function view() {
    const days = new Map();
    for (const entry of S.en) {
      if (!days.has(entry.d)) days.set(entry.d, new Map());
      const groups = days.get(entry.d), key = groupKey(entry);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    }
    let month = '', html = '';
    for (const day of [...days.keys()].sort((a, b) => b.localeCompare(a))) {
      const date = pd(day), title = MO[date.getMonth()] + ' ' + date.getFullYear();
      if (title !== month) { html += `${month ? '</div>' : ''}<h3 class="pj-month">${title}</h3><div class="card pj-list">`; month = title; }
      for (const [key, entries] of days.get(day)) html += dayRow(day, key, entries);
    }
    if (month) html += '</div>';
    return `<h2>Projektit</h2>${html || '<p class="card">Ei tuntikirjauksia.</p>'}`;
  }

  document.addEventListener('click', event => {
    const record = event.target.closest('[data-project-record]');
    if (!record) return;
    const entry = S.en.find(e => e.id === record.dataset.entryId);
    if (entry) WebEntries.view(entry.id); else render(1);
  });

  function toolbar(title) {
    return `<header class="teras-dialog-toolbar">
      <button type="button" class="teras-action" data-dialog-exit="home" aria-label="Etusivulle">${icon('house')}</button>
      <h2>${title}</h2>
      <button type="button" class="teras-action" data-dialog-exit="done" aria-label="Valmis">${icon('check')}</button></header>`;
  }

  function show(dialog, finish) {
    const leave = home => {
      if (!finish()) return;
      dialog.close();
      if (home) {
        if (document.querySelector('.web-entry-dialog[open]')) WebEntries.home();
        else location.hash = 'kalenteri';
      }
    };
    dialog.addEventListener('click', event => {
      const exit = event.target.closest('[data-dialog-exit]');
      if (exit) leave(exit.dataset.dialogExit === 'home');
    });
    dialog.addEventListener('cancel', event => { event.preventDefault(); leave(false); });
    dialog.addEventListener('close', () => dialog.remove(), {once:true});
    document.body.append(dialog);
    dialog.showModal();
  }

  function manage(onDone) {
    if (document.getElementById('web-type-manager')) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'web-type-manager';
    dialog.className = 'tes-dialog teras-dialog';
    dialog.setAttribute('aria-label', 'Muokkaa työlajeja');
    dialog.innerHTML = toolbar('Muokkaa työlajeja') + `<div class="teras-dialog-body"><div class="teras-type-list"></div>
      <form class="teras-type-add"><label for="web-new-type">Uusi työlaji</label>
      <input id="web-new-type" maxlength="80">
      <button type="submit" class="teras-action" data-type-action="add">${icon('plus')}Lisää</button></form></div>`;
    const list = dialog.querySelector('.teras-type-list');
    const newName = dialog.querySelector('#web-new-type');
    let editing = null;

    function renderTypes() {
      list.innerHTML = options().map(({value, label: name}) => {
        const active = editing === value;
        return `<div class="teras-type-row" data-type-key="${esc(value)}">
          ${active ? `<input id="web-edit-type" aria-label="Työlajin nimi" maxlength="80" value="${esc(name)}">` : `<span>${esc(name)}</span>`}
          <button type="button" class="teras-action" data-type-action="${active ? 'apply' : 'edit'}" aria-label="${active ? 'Vahvista muutos' : 'Muokkaa'}: ${esc(name)}">${icon(active ? 'check':'pencil')}</button>
          <button type="button" class="teras-action" data-type-action="delete" aria-label="Poista: ${esc(name)}">${icon('trash-2')}</button></div>`;
      }).join('');
      const edit = list.querySelector('#web-edit-type');
      if (edit) {edit.focus(); edit.select();}
    }

    function finishEdit() {
      if (editing === null) return true;
      const input = list.querySelector('#web-edit-type');
      const name = input.value.trim();
      if (!name) {toast('Anna työlajin nimi.'); input.focus(); return false;}
      if (name !== label(editing)) {
        if (options().some(item => item.value !== editing && normalized(item.label) === normalized(name))) {
          toast('Työlaji on jo olemassa.'); input.focus(); return false;
        }
        const labels = new Map(S.set.workTypeLabels || []);
        labels.set(editing, name);
        if (!updateSettings({workTypeLabels:[...labels]})) return false;
      }
      editing = null;
      renderTypes();
      return true;
    }

    function addType() {
      const name = newName.value.trim();
      if (!name) {toast('Anna työlajin nimi.'); newName.focus(); return false;}
      if (options().some(item => normalized(item.label) === normalized(name))) {
        toast('Työlaji on jo olemassa.'); newName.focus(); return false;
      }
      const custom = S.set.customTypes || [];
      const hidden = S.set.hiddenTypes || [];
      const key = keys().find(key => hidden.includes(key) && normalized(label(key)) === normalized(name));
      let patch;
      if (key) patch = {hiddenTypes:hidden.filter(k => k !== key)};
      else {
        if (custom.length >= 200) {toast('Työlajeja on enimmäismäärä.'); return false;}
        // A renamed existing type can have the same storage key as the proposed label.
        const key = [...keys(), ...S.en.map(e => e.t), ...TY.map(t => t[0])].includes(name) ? 'tyo-'+crypto.randomUUID() : name;
        patch = {customTypes:[...custom,key]};
        if (key !== name) patch.workTypeLabels = [...(S.set.workTypeLabels || []),[key,name]];
      }
      if (!updateSettings(patch)) return false;
      newName.value = '';
      renderTypes();
      return true;
    }

    dialog.querySelector('form').addEventListener('submit', event => {
      event.preventDefault();
      if (finishEdit()) addType();
    });
    list.addEventListener('click', async event => {
      const button = event.target.closest('[data-type-action]');
      if (!button) return;
      const key = button.closest('[data-type-key]').dataset.typeKey;
      if (button.dataset.typeAction === 'apply') {finishEdit(); return;}
      if (editing !== null && (editing !== key || button.dataset.typeAction !== 'delete') && !finishEdit()) return;
      if (button.dataset.typeAction === 'edit') { editing = key; renderTypes(); return; }
      if (options().length <= 1) {toast('Säilytä vähintään yksi työlaji.'); return;}
      if (!(await appConfirm(`Poistetaanko työlaji ”${label(key)}” valikosta? Kirjatut tunnit säilyvät.`, {yes:'Poista', glyph:'trash-2', danger:true}))) return;
      if (updateSettings({hiddenTypes:[...(S.set.hiddenTypes || []), key]})) {editing = null; renderTypes();}
    });
    list.addEventListener('keydown', event => {
      if (event.key === 'Enter' && event.target.id === 'web-edit-type') {event.preventDefault(); finishEdit();}
    });
    renderTypes();
    show(dialog, () => {
      if (!finishEdit() || (newName.value.trim() && !addType())) return false;
      if (onDone) onDone();
      return true;
    });
  }

  window.WebTypes = {options, label, isAbsence, manage, restoreLabels};
  window.TuntixProjects = {view};
})();
