// Website work diary. The stored hours, projects and work type keys are shared with existing records.
(() => {
  'use strict';
  if (window.nativePersist) return;
  const NEW_PROJECT = '__new__';
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const initialShift = {start:'07:00', end:'15:30', breakMinutes:30};
  let dialog, draft, original, projectValues, entryDay, opener, route, goHomeOnBack = false;
  const get = id => dialog?.querySelector('#entry-' + id);
  const icon = name => window.Teras.icon(name);
  const typeInfo = () => window.WebTypes;
  const project = id => S.pr.find(item => item.id === id);
  const record = id => S.en.find(item => item.id === id);
  const hoursLabel = value => new Intl.NumberFormat('fi-FI', {maximumFractionDigits:2}).format(value) + ' h';
  function validDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && dk(pd(value)) === value;
  }
  function dateLabel(value) {
    return pd(value).toLocaleDateString('fi-FI',{weekday:'short',day:'numeric',month:'numeric',year:'numeric'});
  }
  function action(name, text, symbol, id = '') {
    return `<button type="button" class="teras-action" data-entry-action="${name}" data-id="${esc(id)}">${icon(symbol)}<span>${esc(text)}</span></button>`;
  }
  function iconAction(name, label, symbol) {
    return `<button type="button" class="teras-icon-button" data-entry-action="${name}" aria-label="${label}" title="${label}">${icon(symbol)}</button>`;
  }
  function layout(title, contents) {
    if (!dialog) {
      opener = document.activeElement;
      route = location.hash;
      dialog = document.createElement('dialog');
      dialog.className = 'tes-dialog teras-dialog web-entry-dialog';
      dialog.setAttribute('aria-labelledby','entry-heading');
      dialog.addEventListener('cancel', event => { event.preventDefault(); finish(); });
      dialog.addEventListener('click', event => {
        if (event.target === dialog) {
          const bounds = dialog.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) finish();
        }
      });
      document.body.append(dialog);
      history.pushState({...history.state,tuntixEntry:true},'',location.href);
    }
    dialog.innerHTML = `<div class="teras-dialog-toolbar">${iconAction('home','Siirry etusivulle','house')}<h2 id="entry-heading">${esc(title)}</h2>${iconAction('done','Sulje','check')}</div>${contents}`;
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
  }
  function options(values, chosen) {
    return values.map(({value,label}) => `<option value="${esc(value)}"${value === chosen ? ' selected' : ''}>${esc(label)}</option>`).join('');
  }
  function start(date, id) {
    if (!validDate(date)) return;
    const row = id ? record(id) : null;
    if (id && !row) return;
    entryDay = date;
    const shift = row ? {start:row.start || '',end:row.end || '',breakMinutes:row.breakMinutes ?? 0} : initialShift;
    draft = {id:row?.id || '',d:row?.d || date,t:row?.t || '',p:row?.p || '',
      c:row?.c || '',h:String(row?.h ?? 8),...shift};
    original = {...draft};
    projectValues = new Map();
    editor();
  }
  function editor() {
    const types = typeInfo().options(draft.t);
    const projects = S.pr.map(p => ({value:p.id,label:p.n}));
    if (draft.id && draft.p && draft.p !== NEW_PROJECT && !project(draft.p)) {
      projects.push({value:draft.p,label:'Aiempi projekti (poistettu)'});
    }
    projects.push({value:NEW_PROJECT,label:'Lisää uusi projekti…'});
    layout(draft.id ? 'Muokkaa kirjausta' : 'Kirjaa tunnit', `<form class="teras-editor" novalidate>
      <label for="entry-date">Päivä</label><input id="entry-date" type="date" value="${esc(draft.d)}">
      <label for="entry-type">Työlaji</label><select id="entry-type"><option value="">Valitse työlaji</option>${options(types,draft.t)}</select>
      ${action('types','Muokkaa työlajeja','pencil')}
      <div id="entry-project-group"><label for="entry-project">Projekti</label><select id="entry-project"><option value="">Valitse projekti</option>${options(projects,draft.p)}</select>
      <div id="entry-location"></div></div>
      <div id="entry-shift"><div class="teras-field-pair">
      <div><label for="entry-start">Alkaa</label><input id="entry-start" type="time" value="${esc(draft.start)}"></div>
      <div><label for="entry-end">Päättyy</label><input id="entry-end" type="time" value="${esc(draft.end)}"></div></div>
      <label for="entry-break">Tauko (min)</label><input id="entry-break" type="number" inputmode="numeric" min="0" max="1439" step="1" value="${esc(draft.breakMinutes)}"></div>
      <label for="entry-hours">Tunnit</label><input id="entry-hours" type="number" inputmode="decimal" min="0.5" max="24" step="0.01" value="${esc(draft.h)}">
      <label for="entry-comment">Kommentti</label><textarea id="entry-comment" rows="2">${esc(draft.c)}</textarea>
      <p class="entry-error" id="entry-error" role="alert"></p>
      <div id="entry-discard" hidden>${action('discard','Hylkää muutokset','x')}</div>
      ${draft.id ? action('remove','Poista kirjaus','trash-2',draft.id) : ''}
      </form>`);
    get('project-group').hidden = get('shift').hidden = typeInfo().isAbsence(draft.t);
    showLocation();
    dialog.querySelector('form').onsubmit = e => { e.preventDefault(); finish(); };
  }
  function showLocation() {
    const id = draft.p;
    const destination = get('location');
    if (!id || (id !== NEW_PROJECT && !project(id))) { destination.replaceChildren(); return; }
    const value = projectValues.get(id) || project(id) || {n:'',a:''};
    destination.innerHTML = `<label for="entry-number">Projektinumero</label><input id="entry-number" maxlength="120" value="${esc(value.n)}">
      <label for="entry-address">Työmaan osoite</label>${addressInput('entry-address',value.a)}`;
  }
  function capture() {
    if (!draft || !get('type')) return;
    if (draft.p && get('number')) projectValues.set(draft.p,{n:get('number').value.trim(),a:get('address').value.trim()});
    Object.assign(draft,{d:get('date').value,t:get('type').value,p:get('project').value,
      start:get('start').value,end:get('end').value,breakMinutes:get('break').value,h:get('hours').value,c:get('comment').value.trim()});
  }
  function minute(value) {
    const [h,m] = value.split(':').map(Number);
    return h*60+m;
  }
  function duration() {
    if (!timePattern.test(get('start').value) || !timePattern.test(get('end').value)) return null;
    const pause = get('break').valueAsNumber;
    if (!Number.isInteger(pause) || pause<0 || pause>1439) return null;
    const span = (minute(get('end').value) - minute(get('start').value) + 1440) % 1440 || 1440;
    return Math.round((span-pause)*100/60)/100;
  }
  function updateEnd() {
    const h = get('hours').valueAsNumber, pause = get('break').valueAsNumber;
    if (!timePattern.test(get('start').value) || !Number.isFinite(h) || h<0.5 || !Number.isInteger(pause) || pause<0 || h*60+pause>1440) return;
    const end = (minute(get('start').value) + Math.round(h*60) + pause) % 1440;
    get('end').value = String(Math.floor(end/60)).padStart(2,'0') + ':' + String(end%60).padStart(2,'0');
  }
  function invalid(message,field) {
    get('error').textContent = message;
    get('discard').hidden = false;
    get(field)?.focus();
    return false;
  }
  function commit() {
    if (!draft) return true;
    capture();
    const absence = typeInfo().isAbsence(draft.t);
    const sel = absence ? '' : draft.p;
    const target = project(sel);
    const edits = projectValues.get(sel);
    const projectChanged = !!edits && (edits.n !== (target?.n || '') || edits.a !== (target?.a || ''));
    const changed = ['d','t','p','start','end','breakMinutes','h','c'].some(k=>String(draft[k])!==String(original[k]));
    if (!projectChanged && !changed) return true;

    if (!validDate(draft.d)) return invalid('Valitse päivä.','date');
    if (!draft.t) return invalid('Valitse työlaji.','type');
    const legacyProject = draft.id && sel === original.p && !target && !typeInfo().isAbsence(original.t);
    if (!absence && !legacyProject && !sel) return invalid('Valitse tai lisää projekti.','project');
    if (sel && !legacyProject && !edits?.n) return invalid('Anna projektinumero.','number');
    if (sel && !legacyProject && !target && sel!==NEW_PROJECT) return invalid('Valitse projekti uudelleen.','project');
    if (sel && !legacyProject && (sel===NEW_PROJECT || edits.n!==target.n) && S.pr.some(p=>p.id!==sel && p.n.toLocaleLowerCase('fi')===edits.n.toLocaleLowerCase('fi'))) return invalid('Projektinumero on jo käytössä. Valitse projekti luettelosta.','number');
    const h = Number(draft.h);
    const shift = !absence && (draft.start || draft.end);
    if (shift && (duration()===null || duration()<=0)) return invalid('Tarkista työaika ja tauko.','start');
    if (!Number.isFinite(h) || h<0.5 || h>24) return invalid('Anna työtunnit väliltä 0,5–24.','hours');
    if (shift && Math.abs(duration()-h)>0.01) return invalid('Työajan, tauon ja tuntimäärän pitää vastata toisiaan.','hours');
    if (S.en.filter(e=>e.id!==draft.id && e.d===draft.d).reduce((n,e)=>n+e.h,0)+h>24.000001) return invalid('Päivän tunnit eivät voi ylittää 24 tuntia.','hours');
    if (draft.id && !record(draft.id)) return invalid('Kirjausta ei enää löydy.','date');
    if ((draft.id || (target && projectChanged)) && !confirm(target && projectChanged ? 'Muutetaanko kirjausta ja projektin tietoja? Projektin tiedot päivittyvät kaikkiin sen kirjauksiin.' : 'Tallennetaanko muutokset kirjaukseen?')) return false;

    const previous = structuredClone(S);
    let projectId = sel;
    if (sel===NEW_PROJECT) {
      projectId = 'p'+crypto.randomUUID();
      S.pr.push({id:projectId,...edits});
    } else if (projectChanged) Object.assign(target,edits);
    const row = draft.id ? record(draft.id) : {id:'e'+crypto.randomUUID()};
    Object.assign(row,{d:draft.d,t:draft.t,p:projectId,h,c:draft.c});
    if (shift) Object.assign(row,{start:draft.start,end:draft.end,breakMinutes:Number(draft.breakMinutes)});
    else { delete row.start; delete row.end; delete row.breakMinutes; }
    if (!draft.id) S.en.push(row);
    S.last = {t:row.t,p:absence ? S.last.p : projectId};
    if (!save()) { S=previous; return false; }
    return true;
  }
  function release() {
    dialog.close();
    dialog.remove();
    dialog=null;draft=null;original=null;projectValues=null;
    render(1);
    if (opener?.isConnected) opener.focus({preventScroll:true});
    opener=null;
  }
  function finish(home=false, discard=false) {
    if (!dialog || (!discard && !commit())) return false;
    release();
    if (history.state?.tuntixEntry) {
      goHomeOnBack=home;
      history.back();
    } else if (home) location.hash='kalenteri';
    return true;
  }
  function day(date) {
    if (!validDate(date)) return;
    const entries = S.en.filter(e=>e.d===date);
    if (!entries.length) return start(date);
    draft=null;entryDay=date;
    layout(dateLabel(date),`<div class="teras-editor">${entries.map(row=>`<article class="entry-record"><h3>${esc(typeInfo().label(row.t))} · ${esc(hoursLabel(row.h))}</h3>
      ${row.p?`<p>${esc(pn(row.p))}</p>`:''}
      <div class="teras-dialog-actions">${action('view','Avaa','briefcase-business',row.id)}${action('edit','Muokkaa','pencil',row.id)}${action('remove','Poista','trash-2',row.id)}</div></article>`).join('')}
      ${action('new','Lisää kirjaus','plus')}</div>`);
  }
  function view(id) {
    const row = record(id);if (!row) return;
    draft=null;entryDay=row.d;
    const info=[['Päivä',dateLabel(row.d)],['Työlaji',typeInfo().label(row.t)],['Projektinumero',pn(row.p)],['Työmaan osoite',pa(row.p)],['Työaika',row.start&&row.end?row.start+'–'+row.end:''],['Tauko',row.breakMinutes!=null?row.breakMinutes+' min':''],['Tunnit',hoursLabel(row.h)],['Kommentti',row.c]];
    layout('Kirjauksen tiedot',`<div class="teras-editor"><dl>${info.filter(([,v])=>v).map(([k,v])=>`<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl><div class="teras-dialog-actions">${action('edit','Muokkaa','pencil',id)}${action('remove','Poista','trash-2',id)}</div></div>`);
  }
  function remove(id) {
    const row = record(id);
    if (!row || !confirm('Poistetaanko kirjaus '+dateLabel(row.d)+' ('+hoursLabel(row.h)+')?')) return;
    const previous=S.en;
    S.en=S.en.filter(e=>e.id!==id);
    if (!save()) { S.en=previous; return; }
    if (dialog) finish(false,true); else render(1);
  }
  document.addEventListener('input',e=>{
    if (!dialog?.contains(e.target) || !draft) return;
    if (['entry-start','entry-end','entry-break'].includes(e.target.id)){
      const value=duration();
      get('hours').value=value!==null && value>0?String(value):'';
    } else if(e.target.id==='entry-hours' && !typeInfo().isAbsence(get('type').value)) updateEnd();
  });
  document.addEventListener('change',e=>{
    if (!dialog?.contains(e.target) || !draft) return;
    if (e.target.id==='entry-type') {
      capture();
      get('project-group').hidden=get('shift').hidden=typeInfo().isAbsence(draft.t);
    }
    if (e.target.id==='entry-project') { capture();showLocation(); }
  });
  document.addEventListener('click',e=>{
    const button=e.target.closest('button,[data-a="day"]');
    if (!button) return;
    if (button.hasAttribute('data-web-new') || button.dataset.a==='day') {
      e.preventDefault();e.stopImmediatePropagation();
      if (button.hasAttribute('data-web-new')) start(button.dataset.webNew || dk(new Date()));else day(button.dataset.d);
      return;
    }
    if (!dialog?.contains(button)) return;
    const cmd=button.dataset.entryAction,id=button.dataset.id;
    if (cmd==='home') finish(true);
    else if(cmd==='done') finish();
    else if(cmd==='discard' && confirm('Hylätäänkö kirjaamattomat muutokset?')) finish(false,true);
    else if(cmd==='types') {
      capture();
      typeInfo().manage(()=>{
        if (!dialog || !draft) return;
        const available=typeInfo().options(original.id ? original.t : '');
        if (!available.some(type=>type.value===draft.t)) draft.t='';
        editor();
      });
    }
    else if(cmd==='new') start(entryDay);
    else if(cmd==='edit') { const row=record(id);if(row)start(row.d,id); }
    else if(cmd==='view') view(id);
    else if(cmd==='remove') remove(id);
  },true);
  window.addEventListener('popstate',()=>{
    if (dialog) {
      const nested = document.querySelector('#web-type-manager[open]');
      if (nested) {
        history.pushState({...history.state,tuntixEntry:true},'',route || location.pathname+location.search);
        nested.querySelector('[data-dialog-exit="done"]')?.click();
        return;
      }
      if (commit()) release();
      else history.pushState({ ...history.state,tuntixEntry:true },'',route || location.pathname+location.search);
    } else if (goHomeOnBack) {
      goHomeOnBack=false;
      location.hash='kalenteri';
    }
  });
  window.WebEntries = {
    open:start,day,view,remove,
    home() {
      if (dialog) return finish(true);
      location.hash='kalenteri';
      return true;
    },
    restoreShift(e) {
      if (e.start===undefined && e.end===undefined && e.breakMinutes===undefined) return {};
      if (typeof e.start!=='string' || typeof e.end!=='string' || !timePattern.test(e.start) || !timePattern.test(e.end) || !Number.isInteger(e.breakMinutes) || e.breakMinutes<0 || e.breakMinutes>=1440) throw Error('Virheellinen työaika');
      return {start:e.start,end:e.end,breakMinutes:e.breakMinutes};
    }
  };
})();
