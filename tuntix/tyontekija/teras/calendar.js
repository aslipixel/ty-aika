// Website dashboard. Entries and projects use the same local store as the original site.
(() => {
  const { icon } = Teras;
  const tabs = [
    ['kalenteri','calendar-days','Tunnit'], ['projektit','briefcase-business','Projektit'],
    ['lisaa','calculator','Laskurit'], ['lomakkeet','file-text','Lomakkeet'],
    ['profiili','user-round','Profiili'], ['asetukset','settings','Asetukset']
  ];
  function navigation(route) {
    const selected = route === 'asiakirjat' ? 'lomakkeet' : route;
    return tabs.map(([id,glyph,label]) => `<a href="#${id}"${selected === id ? ' class="on" aria-current="page"' : ''}>${icon(glyph)}<span>${label}</span></a>`).join('');
  }
  function updateClock() {
    const el = document.getElementById('teras-time');
    if (!el) return;
    if (el.dataset.day !== dk(new Date()) && !document.querySelector('dialog[open], #m .ov')) render(1);
  }
  function num(h) { return (Math.round(h*10)/10).toString().replace('.',','); }
  function weekTotal(total,today) {
    const goal = (Number(S.set.goal) || 8) * 5, left = goal - total;
    const note = left > 0.05 ? `jäljellä ${num(left)} h` : left < -0.05 ? `+${num(-left)} h yli` : 'tavoite täynnä';
    return `<div class="teras-week-total" id="teras-time" data-day="${dk(today)}" role="status" aria-label="Viikko yhteensä ${num(total)} h, tavoite ${num(goal)} h, ${note}">
      <small>${note}</small><span><b>${num(total)}</b> / ${num(goal)} h</span>
    </div>`;
  }
  function iconButton(key,glyph,label) {
    return `<button type="button" class="teras-square" data-a="${key}" title="${label}" aria-label="${label}">${icon(glyph)}</button>`;
  }
  function weekControls(start,today,total) {
    const date = dk(wo === 0 ? today : start);
    return `<div class="teras-week-tools">
      ${iconButton('pw','chevron-left','Edellinen viikko')}
      <label class="teras-week-picker"><span>Viikko ${wk(start)}</span><input id="weekdate" type="date" aria-label="Valitse viikko" value="${date}"></label>
      ${iconButton('nw','chevron-right','Seuraava viikko')}
      ${weekTotal(total,today)}
    </div>`;
  }
  function weekRow(date, entries, total, today) {
    const key = dk(date);
    const names = [...new Set(entries.map(e => pn(e.p) || window.WebTypes?.label(e.t) || e.t).filter(Boolean))];
    const hours = entries.length ? fh(total) : '–';
    const current = key === dk(today);
    const label = [DL[wd(date)], fd(date), entries.length ? hours : 'Ei kirjauksia', ...names].join(' ') + '. Lisää tunteja.';
    return `<button type="button" class="teras-day${entries.length?' recorded':''}" data-a="day" data-d="${key}"${current?' aria-current="date"':''} aria-label="${esc(label)}">
      <span class="teras-day-date"><b>${DN[wd(date)]}</b><span>${fd(date)}</span></span>
      <span class="teras-hours">${icon('clock')}${hours}</span>
      <span class="teras-day-project" title="${esc(names.join(', '))}"><span>${esc(names[0] || '–')}</span>${names.length>1?`<small>+${names.length-1}</small>`:''}</span>
      <span class="teras-day-add" aria-hidden="true">${icon('plus')}</span>
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
    return `<section class="teras-dashboard" aria-label="Työtunnit">
      <header class="teras-bar"><div class="teras-wordmark">Tunti<em>X</em></div>
        <b class="teras-date">${DN[wd(now)]} ${fd(now)}${now.getFullYear()}</b>
      </header>
      ${weekControls(start,now,days.reduce((sum,d)=>sum+(totals[dk(d)]||0),0))}
      ${wo===0&&window.reminderBanner?reminderBanner():''}
      <section class="teras-week" aria-label="Viikon kirjaukset">${days.map(d=>weekRow(d,byDate.get(dk(d)),totals[dk(d)]||0,now)).join('')}</section>
      ${month(now,totals)}
    </section>`;
  }
  document.addEventListener('click',event=>{
    if (event.target.matches('.teras-week-picker input')){
      try{event.target.showPicker?.();}catch{}
    }
  });
  Object.assign(Teras,{calendar,navigation});
  document.documentElement.classList.add('teras');
  setInterval(updateClock,15000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateClock();});
})();
