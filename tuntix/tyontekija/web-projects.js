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

  function actions(id) {
    return `<div class="teras-actions">${[
      ['open', 'folder-open', 'Avaa'], ['edit', 'pencil', 'Muokkaa'], ['delete', 'trash-2', 'Poista']
    ].map(([action, glyph, name]) => `<button type="button" class="teras-action" data-project-record="${action}" data-entry-id="${esc(id)}">${icon(glyph)}${name}</button>`).join('')}</div>`;
  }

  function projectRow(entry, project) {
    const date = pd(entry.d);
    const name = project?.n || (entry.p ? 'Poistettu projekti' : isAbsence(entry.t) ? 'Poissaolo' : 'Ei projektia');
    return `<article class="card teras-project-row" data-entry-id="${esc(entry.id)}">
      <h3 class="teras-project-heading">${esc(name)}</h3>
      <p class="teras-project-meta"><time datetime="${esc(entry.d)}">${DN[wd(date)]} ${date.toLocaleDateString('fi-FI')}</time>
      · <b>${formatHours.format(entry.h)} h</b> · ${esc(label(entry.t))}</p>
      ${project?.a ? `<p class="teras-project-address">${icon('map-pin')}${esc(project.a)} ${distanceBadge(project.id, !isAbsence(entry.t))}</p>` : ''}
      ${entry.c ? `<p class="teras-project-comment">${esc(entry.c)}</p>` : ''}${actions(entry.id)}</article>`;
  }

  function view() {
    const projects = new Map(S.pr.map(p => [p.id, p]));
    const entries = [...S.en].sort((a, b) => b.d.localeCompare(a.d));
    const rows = entries.map(entry => projectRow(entry, projects.get(entry.p)));
    return `<h2>Projektit</h2><div class="teras-project-list">${rows.join('') || '<p class="card">Ei tuntikirjauksia.</p>'}</div>`;
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-project-record]');
    if (!button) return;
    const entry = S.en.find(e => e.id === button.dataset.entryId);
    if (!entry) { render(1); return; }
    switch (button.dataset.projectRecord) {
      case 'open': WebEntries.view(entry.id); break;
      case 'edit': WebEntries.open(entry.d, entry.id); break;
      case 'delete': WebEntries.remove(entry.id); break;
    }
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
        if (!confirm(`Muutetaanko työlajin nimi muotoon ”${name}”?`)) {
          editing = null;
          renderTypes();
          return false;
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
    list.addEventListener('click', event => {
      const button = event.target.closest('[data-type-action]');
      if (!button) return;
      const key = button.closest('[data-type-key]').dataset.typeKey;
      if (button.dataset.typeAction === 'apply') {finishEdit(); return;}
      if (editing !== null && (editing !== key || button.dataset.typeAction !== 'delete') && !finishEdit()) return;
      if (button.dataset.typeAction === 'edit') { editing = key; renderTypes(); return; }
      if (options().length <= 1) {toast('Säilytä vähintään yksi työlaji.'); return;}
      if (!confirm(`Poistetaanko työlaji ”${label(key)}” valikosta? Kirjatut tunnit säilyvät.`)) return;
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
