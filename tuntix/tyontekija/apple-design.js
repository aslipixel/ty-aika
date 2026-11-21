// Apple-style design experiment: toggles class "apple" on <html> (remembered per browser).
// In Apple mode every text button gets one compact standard and a color by its action (data-tone).
(() => {
  const KEY = 'tuntix.design';
  const root = document.documentElement;
  let mode = 'apple';
  try { mode = localStorage.getItem(KEY) || 'apple'; } catch {}

  // Shorter labels; the full text stays in title/aria-label.
  const SHORT = {
    'Tietoa sovelluksesta': 'Tietoa',
    'Tallenna osoite A': 'Tallenna',
    'Lataa varmuuskopio (JSON)': 'Lataa',
    'Palauta varmuuskopio': 'Palauta',
    'Vie kaikki tunnit (CSV)': 'CSV',
    'Muokkaa työlajeja': 'Työlajit',
    'Lisää kirjaus': 'Lisää',
    'Lataa täytettävä PDF': 'PDF',
    'Tilaajan edustajan allekirjoitus': 'Allekirjoitus'
  };
  // Anything else that starts with a known action word is cut down to that word.
  const SHORT_RE = [[/^Lataa TES\b.*PDF$/, 'TES PDF']];
  // Color by action (first word of the full label), one meaning everywhere in the app.
  const TONE = {
    muokkaa: 'orange', kentät: 'orange', työlajit: 'orange', vaalea: 'orange',
    poista: 'red',
    avaa: 'blue', lataa: 'blue', lähetä: 'blue', lisää: 'blue',
    tallenna: 'green',
    katso: 'teal', palauta: 'teal', teksti: 'teal',
    allekirjoita: 'indigo', tumma: 'indigo',
    vie: 'purple', csv: 'purple',
    tietoa: 'gray', peruuta: 'gray',
    hinnasto: 'orange', tyhjennä: 'red', tilaajan: 'indigo', allekirjoitus: 'indigo'
  };
  const SOLID = new Set(['lähetä', 'lisää']);

  const TONE_CSS = `
[data-tone=orange]{--c:#ff9500;--t:var(--t-orange,#c45f00)}
[data-tone=red]{--c:#ff3b30;--t:var(--t-red,#d70015)}
[data-tone=blue]{--c:#007aff;--t:var(--t-blue,#0058bf)}
[data-tone=green]{--c:#34c759;--t:var(--t-green,#1f7a35)}
[data-tone=teal]{--c:#30b0c7;--t:var(--t-teal,#0b6f81)}
[data-tone=indigo]{--c:#5e5ce6;--t:var(--t-indigo,#3634a3)}
[data-tone=purple]{--c:#af52de;--t:var(--t-purple,#8236a8)}
[data-tone=gray]{--c:#8e8e93;--t:var(--t-gray,#55555a)}
button[data-tone]{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:auto!important;min-width:0!important;flex:0 0 auto!important;min-height:32px!important;height:auto!important;margin:2px 4px 2px 0!important;padding:4px 11px!important;gap:5px!important;border:0!important;border-radius:16px!important;box-shadow:none!important;background:color-mix(in srgb,var(--c) var(--tint-amt,15%),transparent)!important;color:var(--t)!important;font:600 14px/1.2 var(--font-ui,-apple-system,system-ui,sans-serif)!important;letter-spacing:-.01em!important;white-space:nowrap!important}
button[data-tone] svg{width:15px!important;height:15px!important;flex:0 0 15px!important;stroke-width:2.2!important}
button[data-tone]::before,button[data-tone]::after{width:15px!important;height:15px!important;flex-basis:15px!important}
button[data-tone][data-solid],button[data-tone][aria-pressed="true"]{background:var(--c)!important;color:#fff!important}
:is(.actions,footer,.teras-actions,.measurement-signature-actions):has(> button[data-tone]){display:flex!important;flex-wrap:wrap!important;align-items:center!important;gap:6px!important}
:is(.actions,footer,.teras-actions,.measurement-signature-actions) > button[data-tone]{margin:0!important}
button[data-tone]:active{opacity:.65}
button[data-tone]:disabled{opacity:.45}`;

  const styleFor = () => { const s = document.createElement('style'); s.dataset.appleTone = ''; s.textContent = TONE_CSS; return s; };
  const docStyle = styleFor();
  const roots = new Set();
  const observer = new MutationObserver(() => schedule());

  const labelNode = b => {
    const walk = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
    let last = null;
    while (walk.nextNode()) if (walk.currentNode.textContent.trim()) last = walk.currentNode;
    return last;
  };
  const decorate = b => {
    if (b.closest('.apple-switch')) return;
    const node = labelNode(b);
    if (!node && !b.dataset.fullLabel) return;
    const full = b.dataset.fullLabel || node.textContent.trim();
    const first = full.split(/\s+/)[0].replace(/[·,:;]+$/, '');
    const tone = TONE[first.toLowerCase()];
    const short = SHORT[full] || SHORT_RE.find(([re]) => re.test(full))?.[1] || (tone && first !== full ? first : null);
    if (mode === 'apple') {
      if (short && node) { b.dataset.fullLabel = full; if (node.textContent !== short) node.textContent = short; b.title = full; b.setAttribute('aria-label', full); }
      if (tone) { if (b.dataset.tone !== tone) b.dataset.tone = tone; if (SOLID.has(full.split(/\s+/)[0].toLowerCase())) b.dataset.solid = ''; }
    } else {
      if (b.dataset.fullLabel && node) { node.textContent = b.dataset.fullLabel; b.removeAttribute('title'); b.removeAttribute('aria-label'); delete b.dataset.fullLabel; }
      delete b.dataset.tone; delete b.dataset.solid;
    }
  };
  const scan = () => {
    document.querySelectorAll('*').forEach(el => {
      const sr = el.shadowRoot;
      if (sr && !roots.has(sr)) { roots.add(sr); observer.observe(sr, { childList: true, subtree: true }); }
    });
    for (const sr of roots) {
      const s = sr.querySelector('style[data-apple-tone]');
      if (mode === 'apple' && !s) sr.append(styleFor());
      if (mode !== 'apple' && s) s.remove();
    }
    if (mode === 'apple' && !docStyle.isConnected) document.head.append(docStyle);
    if (mode !== 'apple') docStyle.remove();
    [document, ...roots].forEach(r => r.querySelectorAll('button').forEach(decorate));
  };
  let queued = false;
  const schedule = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; scan(); }); };

  const apply = m => {
    mode = m;
    root.classList.toggle('apple', m === 'apple');
    try { localStorage.setItem(KEY, m); } catch {}
    document.querySelectorAll('.apple-switch button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.design === m)));
    if (document.body) scan();
  };
  apply(mode);

  const mount = () => {
    const bar = document.createElement('div');
    bar.className = 'apple-switch';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Ulkoasu');
    bar.innerHTML = '<button type="button" data-design="apple">Apple</button><button type="button" data-design="classic">Vanha</button>';
    bar.addEventListener('click', e => { const b = e.target.closest('button'); if (b) apply(b.dataset.design); });
    document.body.append(bar);
    observer.observe(document.body, { childList: true, subtree: true });
    apply(mode);
  };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', mount) : mount();
})();
