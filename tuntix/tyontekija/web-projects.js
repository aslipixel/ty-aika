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

  // One card per project. The day-by-day list of entries opens inside the card;
  // number, address and travel allowance are shown once, not under every entry.
  function groupKey(entry) {
    if (entry.p && S.pr.some(p => p.id === entry.p)) return entry.p;
    return isAbsence(entry.t) ? ':absence' : entry.p ? ':deleted' : ':none';
  }
  const groupNames = {':absence':'Poissaolot', ':deleted':'Poistettu projekti', ':none':'Ei projektia'};
  const hoursText = h => formatHours.format(h) + ' h';
  const dayText = d => { const date = pd(d); return `${DN[wd(date)]} ${date.toLocaleDateString('fi-FI')}`; };

  function entryLine(entry) {
    return `<button type="button" class="teras-project-entry" data-project-record="open" data-entry-id="${esc(entry.id)}" aria-label="${esc(dayText(entry.d)+' '+hoursText(entry.h)+' '+label(entry.t)+(entry.c?' '+entry.c:''))}. Avaa kirjaus.">
      <b>${hoursText(entry.h)}</b><span>${esc(label(entry.t))}</span><small>${esc(entry.c || '')}</small></button>`;
  }

  function projectCard(key, entries) {
    const project = S.pr.find(p => p.id === key);
    const name = project?.n || groupNames[key] || 'Ei projektia';
    const total = entries.reduce((sum, e) => sum + e.h, 0);
    const days = [...new Set(entries.map(e => e.d))];
    const work = entries.some(e => !isAbsence(e.t));
    const list = days.map(d => {
      const rows = entries.filter(e => e.d === d);
      return `<section class="teras-project-day"><h4><time datetime="${esc(d)}">${dayText(d)}</time><span>${hoursText(rows.reduce((sum, e) => sum + e.h, 0))}</span></h4>${rows.map(entryLine).join('')}</section>`;
    }).join('');
    const summary = entries.length
      ? `${days.length === 1 ? '1 päivä' : days.length + ' päivää'} · viimeksi ${dayText(days[0])}`
      : 'Ei kirjauksia';
    const buttons = project ? `<div class="teras-actions">
      <button type="button" class="teras-action" data-project-card="edit" data-project-id="${esc(project.id)}">${icon('pencil')}Muokkaa</button>
      <button type="button" class="teras-action" data-project-card="delete" data-project-id="${esc(project.id)}">${icon('trash-2')}Poista</button></div>` : '';
    return `<article class="card teras-project-row" data-project-key="${esc(key)}">
      <details${entries.length ? '' : ' class="empty"'}>
        <summary>
          <span class="teras-project-title"><h3 class="teras-project-heading">${esc(name)}</h3><b class="teras-project-total">${hoursText(total)}</b>${entries.length ? `<span class="teras-project-chevron" aria-hidden="true">${icon('chevron-down')}</span>` : ''}</span>
          ${project?.a ? `<span class="teras-project-address">${icon('map-pin')}${esc(project.a)}</span><span class="teras-project-travel">${distanceBadge(project.id, work)}</span>` : ''}
          <span class="teras-project-meta">${summary}</span>
        </summary>
        <div class="teras-project-days">${list}</div>
      </details>${buttons}</article>`;
  }

  function view() {
    const groups = new Map();
    for (const entry of [...S.en].sort((a, b) => b.d.localeCompare(a.d))) {
      const key = groupKey(entry);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    }
    for (const project of S.pr) if (!groups.has(project.id)) groups.set(project.id, []);
    const cards = [...groups].map(([key, entries]) => projectCard(key, entries));
    return `<h2>Projektit</h2><div class="teras-project-list">${cards.join('') || '<p class="card">Ei tuntikirjauksia.</p>'}</div>`;
  }

  document.addEventListener('click', async event => {
    const record = event.target.closest('[data-project-record]');
    if (record) {
      const entry = S.en.find(e => e.id === record.dataset.entryId);
      if (entry) WebEntries.view(entry.id); else render(1);
      return;
    }
    const button = event.target.closest('[data-project-card]');
    if (!button) return;
    const project = S.pr.find(p => p.id === button.dataset.projectId);
    if (!project) { render(1); return; }
    if (button.dataset.projectCard === 'edit') { pform(project.id); return; }
    const entries = S.en.filter(e => e.p === project.id);
    const question = entries.length
      ? `Poistetaanko projekti ”${project.n}” ja sen ${entries.length} kirjausta (${hoursText(entries.reduce((sum, e) => sum + e.h, 0))})?`
      : `Poistetaanko projekti ”${project.n}”?`;
    if (!(await appConfirm(question, {yes:'Poista', glyph:'trash-2', danger:true}))) return;
    const previous = {pr:S.pr, en:S.en};
    S.pr = S.pr.filter(p => p.id !== project.id);
    S.en = S.en.filter(e => e.p !== project.id);
    if (!save()) { S.pr = previous.pr; S.en = previous.en; return; }
    render(1);
    toast('Projekti poistettu');
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
