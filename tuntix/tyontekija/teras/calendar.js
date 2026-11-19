// Website dashboard. Entries and projects use the same local store as the original site.
(() => {
  const { icon } = Teras;
  const tabs = [
    ['kalenteri','calendar-days','Tunnit'], ['projektit','briefcase-business','Projektit'],
    ['lisaa','calculator','Laskurit'], ['lomakkeet','file-text','Lomakkeet'],
    ['profiili','user-round','Profiili'], ['asetukset','settings','Asetukset']
  ];
  const titles = {open:'Avaa', edit:'Muokkaa', delete:'Poista'};
  let action = null;
  function navigation(route) {
    if(route !== 'kalenteri') action = null;
    const selected = route === 'asiakirjat' ? 'lomakkeet' : route;
    return tabs.map(([id,glyph,label]) => `<a href="#${id}"${selected === id ? ' class="on" aria-current="page"' : ''}>${icon(glyph)}<span>${label}</span></a>`).join('');
  }
  function clock(now) { return pad(now.getHours())+'.'+pad(now.getMinutes()); }
  function updateClock() {
    const el = document.getElementById('teras-time');
    if (!el) return;
    const now = new Date();
    if (el.dateTime !== dk(now)) {
      if (!document.querySelector('dialog[open], #m .ov')) render(1);
    } else if (el.textContent !== clock(now)) el.textContent = clock(now);
  }
  function iconButton(key,glyph,label) {
    return `<button type="button" class="teras-square" data-a="${key}" title="${label}" aria-label="${label}">${icon(glyph)}</button>`;
  }
  function weekControls(start,today) {
    const date = dk(wo === 0 ? today : start);
    return `<div class="teras-week-tools">
      ${iconButton('pw','chevron-left','Edellinen viikko')}
      <label class="teras-week-picker"><span>Viikko ${wk(start)}</span><input id="weekdate" type="date" aria-label="Valitse viikko" value="${date}"></label>
      ${iconButton('nw','chevron-right','Seuraava viikko')}
      <button type="button" class="teras-add" data-web-new="${date}">${icon('plus')}Kirjaa tunnit</button>
    </div>`;
  }
  function weekRow(date, entries, total, today) {
    const key = dk(date);
    const names = [...new Set(entries.map(e => pn(e.p) || window.WebTypes?.label(e.t) || e.t).filter(Boolean))];
    const hours = entries.length ? fh(total) : '–';
    const current = key === dk(today);
    const label = [DL[wd(date)], fd(date), entries.length ? hours : 'Ei kirjauksia', ...names].join(' ');
    const attr = action ? `data-day-action="${key}"` : `data-a="day" data-d="${key}"`;
    return `<button type="button" class="teras-day${entries.length?' recorded':''}" ${attr}${current?' aria-current="date"':''}${action && action !== 'open' && !entries.length?' disabled':''} aria-label="${esc(label)}">
      <span class="teras-day-date"><b>${DN[wd(date)]}</b><span>${fd(date)}</span></span>
      <span class="teras-hours">${icon('clock')}${hours}</span>
      <span class="teras-day-project" title="${esc(names.join(', '))}"><span>${esc(names[0] || '–')}</span>${names.length>1?`<small>+${names.length-1}</small>`:''}</span>
    </button>`;
  }
  function month(now,totals) {
    const first = new Date(now.getFullYear(),now.getMonth()+mo,1);
    const count = new Date(first.getFullYear(),first.getMonth()+1,0).getDate();
    const leading = wd(first);
    const cells = [];
    for(let i=0;i<Math.ceil((leading+count)/7)*7;i++){
      const number = i-leading+1;
      if(number<1 || number>count){ cells.push('<span class="teras-blank" aria-hidden="true"></span>');continue; }
      const day = new Date(first.getFullYear(), first.getMonth(), number), key = dk(day);
      const hours = Object.hasOwn(totals,key) ? fh(totals[key]) : '';
      cells.push(`<button type="button" data-a="day" data-d="${key}" aria-label="${DL[wd(day)]} ${fd(day)} ${hours||'Ei kirjauksia'}"${key===dk(now)?' aria-current="date"':''}><b>${number}</b>${hours?`<small>${hours}</small>`:''}</button>`);
    }
    return `<section class="teras-month" aria-labelledby="teras-month-title">
      <div class="teras-month-tools">${iconButton('pm','chevron-left','Edellinen kuukausi')}<h2 id="teras-month-title">${MO[first.getMonth()]} ${first.getFullYear()}</h2>${iconButton('nm','chevron-right','Seuraava kuukausi')}</div>
      <div class="teras-grid">${DN.map(d=>`<span class="teras-weekday">${d}</span>`).join('')}${cells.join('')}</div>
    </section>`;
  }
  function calendar() {
    const now = new Date(), start = addD(mon(now),wo*7), totals = H();
    const days = Array.from({length:7},(_,i)=>addD(start,i));
    const byDate = new Map(days.map(d => [dk(d),[]]));
    for(const e of S.en) byDate.get(e.d)?.push(e);
    const hasRecords = [...byDate.values()].some(entries=>entries.length);
    if (action && action!=='open' && !hasRecords) action = null;
    return `<section class="teras-dashboard" aria-label="Työtunnit">
      <header class="teras-bar"><div class="teras-wordmark">Tunti<em>X</em></div><span class="teras-edition">Teräs</span>
        <div class="teras-shortcuts">${[['open','briefcase-business'],['edit','pencil'],['delete','trash-2']].map(([key,glyph])=>
          `<button type="button" data-week-action="${key}" aria-pressed="${action===key}"${key!=='open'&&!hasRecords?' disabled':''}>${icon(glyph)}<span>${titles[key]}</span></button>`).join('')}</div>
      </header>
      <div class="teras-date"><time id="teras-time" datetime="${dk(now)}">${clock(now)}</time><b>${DN[wd(now)]} ${fd(now)}${now.getFullYear()}</b></div>
      ${weekControls(start,now)}
      ${action?`<p class="teras-mode" role="status">${action==='delete'?'Valitse poistettava kirjaus.':action==='edit'?'Valitse muokattava kirjaus.':'Valitse avattava päivä.'}<button data-exit-mode type="button" aria-label="Peruuta">${icon('x')}</button></p>`:''}
      <section class="teras-week" aria-label="Viikon kirjaukset">${days.map(d=>weekRow(d,byDate.get(dk(d)),totals[dk(d)]||0,now)).join('')}</section>
      ${month(now,totals)}
    </section>`;
  }
  document.addEventListener('click',event=>{
    const btn = event.target.closest('[data-week-action],[data-day-action],[data-exit-mode],.teras-week-picker');
    if (!btn) return;
    if (btn.hasAttribute('data-exit-mode') || btn.dataset.weekAction) {
      action = action === btn.dataset.weekAction ? null : btn.dataset.weekAction || null;
      render(1);
    } else if (btn.dataset.dayAction){
      const date=btn.dataset.dayAction, selected=action;
      action=null; render(1);
      if (selected==='open') WebEntries.day(date);
      else {
        const entries=S.en.filter(e=>e.d===date);
        if (entries.length===1) {
          if(selected==='edit') WebEntries.open(date,entries[0].id);
          else WebEntries.remove(entries[0].id);
        } else if(entries.length) WebEntries.day(date);
      }
    } else if (event.target.tagName==='INPUT'){
      try{event.target.showPicker?.();}catch{}
    }
  });
  Object.assign(Teras,{calendar,navigation});
  document.documentElement.classList.add('teras');
  setInterval(updateClock,15000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateClock();});
})();
