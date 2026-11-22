// Website chrome shared by the existing calculators, document editors and settings.
(() => {
  'use strict';
  const icon = name => window.Teras.icon(name);
  const routeTitles = {
    projektit: 'Projektit', lisaa: 'Laskurit', lomakkeet: 'Lomakkeet',
    asiakirjat: 'Asiakirjat', profiili: 'Profiili', asetukset: 'Asetukset'
  };
  const webCalculators = {
    calculator: 'calculator',
    trapezoid: 'ruler', 'contract-description': 'file-text'
  };
  function calculatorButton(action, label) {
    if (!Object.hasOwn(webCalculators, action)) return '';
    return `<button type="button" class="btn calculator-link" data-tes="${esc(action)}">
    <span class="calculator-icon" aria-hidden="true">${icon(webCalculators[action])}</span>
    <span class="calculator-name">${esc(label)}</span><span class="calculator-chevron" aria-hidden="true">${icon('chevron-right')}</span></button>`;
  }

  function toolbarButton(name, text, listener) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'teras-icon-button';
    button.setAttribute('aria-label', text);
    button.title = text;
    button.innerHTML = icon(name);
    button.addEventListener('click', listener);
    return button;
  }

  function goHome() { location.hash = 'kalenteri'; }

  // In-app replacements for window.confirm() and window.prompt(). Some browsers and
  // installed apps block the native dialogs and answer "no" at once, so deletes, saves
  // and file names silently failed.
  // Resolves true/false, or for a prompt the entered text (null when cancelled).
  function appDialog(message, { yes = 'Kyllä', glyph = 'check', danger = false, value = null, label = '' } = {}) {
    const asking = value !== null;
    const dialog = document.createElement('dialog');
    dialog.className = 'tes-dialog teras-dialog app-confirm';
    dialog.setAttribute('role', asking ? 'dialog' : 'alertdialog');
    dialog.setAttribute('aria-labelledby', 'app-confirm-text');
    dialog.innerHTML = `<form method="dialog"><p id="app-confirm-text"></p>
      ${asking ? `<input class="app-confirm-input" maxlength="120" aria-label="${esc(label || message)}">` : ''}
      <div class="app-confirm-actions">
      <button type="button" class="btn" data-answer="no">${icon('x')}Peruuta</button>
      <button type="submit" class="btn ${danger ? 'del app-confirm-danger' : 'pri'}" data-answer="yes">${icon(glyph)}${esc(yes)}</button></div></form>`;
    dialog.querySelector('p').textContent = message;
    const input = dialog.querySelector('input');
    if (input) input.value = value;
    return new Promise(resolve => {
      let answer = false;
      dialog.addEventListener('click', event => {
        if (event.target.closest('[data-answer="no"]')) dialog.close();
      });
      dialog.querySelector('form').addEventListener('submit', event => {
        event.preventDefault();
        if (input && !input.value.trim()) { input.focus(); return; }
        answer = true;
        dialog.close();
      });
      dialog.addEventListener('close', () => {
        dialog.remove();
        resolve(asking ? (answer ? input.value.trim() : null) : answer);
      }, { once: true });
      document.body.append(dialog);
      dialog.showModal();
      if (input) { input.focus(); input.select(); }
      else dialog.querySelector('[data-answer="no"]').focus();
    });
  }
  window.appConfirm = (message, options) => appDialog(message, options);
  window.appPrompt = (message, value = '', options = {}) =>
    appDialog(message, { yes: 'Tallenna', glyph: 'save', ...options, value: String(value) });

  function applyTheme() {
    const theme = S.set.theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').content = theme === 'light' ? '#f2f2f5' : '#3a3d42';
  }

  function themeSettings() {
    const options = [['light','sun','Vaalea'], ['dark','moon','Tumma']];
    const buttons = options.map(([theme,glyph,label]) =>
      `<button type="button" class="btn" data-web-theme="${theme}" aria-pressed="${theme === document.documentElement.dataset.theme}">${icon(glyph)}${label}</button>`
    ).join('');
    return `<section class="card"><h3 id="theme-title">Teema</h3><div class="theme-options" role="group" aria-labelledby="theme-title">${buttons}</div></section>`;
  }

  document.addEventListener('click', event => {
    const choice = event.target.closest('button[data-web-theme]');
    if (!choice || choice.getAttribute('aria-pressed') === 'true') return;
    const previous = S.set.theme;
    S.set.theme = choice.dataset.webTheme;
    if (!save()) { S.set.theme = previous; return; }
    applyTheme();
    for (const button of choice.parentElement.querySelectorAll('[data-web-theme]')) {
      button.setAttribute('aria-pressed', String(button === choice));
    }
  });

  function refresh(route, view) {
    delete view.dataset.surface;
    if (!Object.hasOwn(routeTitles, route)) return;
    view.dataset.surface = route;
    let bar = view.querySelector('.tes-page-toolbar');
    if (!bar) {
      const heading = view.querySelector(':scope > h2') || document.createElement('h2');
      if (!heading.textContent) heading.textContent = routeTitles[route];
      bar = document.createElement('div');
      view.prepend(bar);
      bar.append(heading);
    }
    bar.classList.add('teras-page-toolbar');
    const existingDone = bar.querySelector('button');
    if (existingDone) {
      existingDone.className = 'teras-icon-button teras-done';
      existingDone.innerHTML = icon('check');
      existingDone.setAttribute('aria-label', 'Valmis, palaa laskureihin');
    }
    bar.insertBefore(toolbarButton('house', 'Etusivu', goHome), existingDone);
    if (!existingDone) {
      const done = toolbarButton('check', 'Valmis', () => {
        const editor = view.querySelector('laskulappu-editor');
        if (editor?.finish) editor.finish();
        else if (view.querySelector('.document-toolbar [data-form-close]')) view.querySelector('.document-toolbar [data-form-close]').click();
        else if (route === 'asiakirjat') location.hash = 'lomakkeet';
        else goHome();
      });
      done.classList.add('teras-done');
      bar.append(done);
    }
  }
  window.TerasSurfaces = { refresh, themeSettings, applyTheme, init() { calculatorLink = calculatorButton; } };

  const tesActions = {
    pdf: 'download', catalogue: 'list', newitem: 'plus', edititem: 'pencil', deleteitem: 'trash-2',
    addline: 'plus', removeline: 'trash-2', clearcalc: 'trash-2', export: 'download',
    import: 'upload', resetcatalog: 'undo-2', saveitem: 'check', closeeditor: 'check'
  };
  const settingsActions = {
    aboutapp: 'info', saveoffice: 'check', backup: 'download', import: 'upload', csv: 'table-2',
    dismisssheet: 'check', retryroute: 'refresh-cw'
  };

  function decorate(button) {
    if (button.classList.contains('teras-icon-button') || button.querySelector('svg')) return;
    const name = tesActions[button.dataset.tes] || settingsActions[button.dataset.a];
    if (!name) return;
    const label = button.textContent.trim().replace(/^[+✎↓↑✓×]\s*/, '');
    if (label) button.textContent = label;
    else button.textContent = '';
    button.insertAdjacentHTML('afterbegin', icon(name));
    button.classList.add('teras-decorated');
  }

  async function finishRateEditor(dialog, home) {
    // A dismissed confirmation or invalid value leaves the editor open.
    if (tesEditorValues() !== dialog._baseline) {
      if (tesEditing && !(await appConfirm('Vahvistetaanko hinnan muutokset?', { yes: 'Vahvista' }))) return;
      tesSaveItem();
      if (dialog.isConnected) return;
    } else tesCloseEditor();
    if (home) goHome();
  }

  function decorateDialog(dialog) {
    if (dialog.matches('.teras-dialog') || dialog.querySelector('.teras-dialog-home')) return;
    if (dialog.id === 'tes-editor') {
      const close = dialog.querySelector('[data-tes="closeeditor"]');
      const check = toolbarButton('check', 'Valmis', () => finishRateEditor(dialog, false));
      check.classList.add('teras-done');
      close.replaceWith(check);
      const home = toolbarButton('house', 'Etusivu', () => finishRateEditor(dialog, true));
      home.classList.add('teras-dialog-home');
      check.before(home);
      dialog.querySelector('[data-tes="saveitem"]')?.remove();
      const submit = event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        finishRateEditor(dialog, false);
      };
      dialog.addEventListener('cancel', submit, true);
      dialog.addEventListener('submit', submit, true);
    } else if (dialog.classList.contains('measurement-signature-dialog')) {
      const heading = dialog.querySelector('h2');
      const bar = document.createElement('div');
      bar.className = 'teras-signature-head';
      heading.before(bar);
      const home = toolbarButton('house', 'Etusivu', () => {
        dialog.querySelector('[data-save]').click();
        if (!dialog.open) goHome();
      });
      home.classList.add('teras-dialog-home');
      bar.append(heading, home);
    }
  }

  function decorateSheet(toolbar) {
    if (toolbar.querySelector('.teras-dialog-home')) return;
    const close = toolbar.querySelector('[data-a="dismisssheet"]');
    if (!close) return;
    const home = toolbarButton('house', 'Etusivu', () => {
      if (!allowSheetExit()) return;
      closeSheet();
      goHome();
    });
    home.classList.add('teras-dialog-home');
    close.before(home);
  }

  // Imported forms, catalogue search results and dialogs are inserted between page renders.
  const controls = 'button[data-tes], button[data-a]';
  function inspect(root) {
    if (!(root instanceof HTMLElement)) return;
    if (root.matches('dialog')) decorateDialog(root);
    if (root.matches('.sheet-toolbar')) decorateSheet(root);
    root.querySelectorAll('.sheet-toolbar').forEach(decorateSheet);
    if (root.matches(controls)) decorate(root);
    root.querySelectorAll(controls).forEach(decorate);
  }
  const observer = new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) inspect(node);
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
