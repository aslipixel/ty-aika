let mileageYear;
let homeSaving = false, mileageRunning = false;
const mileageErrors = new Map();

function homeOrigin(profile = S.pf) {
  return isOffice(profile.home) ? profile.home : null;
}

function validHomeRoute(project, origin) {
  const route = project.homeRoute;
  return origin && Array.isArray(route?.point) && route.point.length === 2 && route.point.every((value, i) => value === origin.point[i])
    && validDistance({ ...project, route }, origin);
}

function mileageProjects(year) {
  const days = new Map();
  for (const entry of S.en) {
    if (!entry.p || !entry.d.startsWith(year + '-') || entry.h <= 0 || ABS.includes(entry.t)) continue;
    if (!days.has(entry.p)) days.set(entry.p, new Set());
    days.get(entry.p).add(entry.d);
  }
  const projects = new Map(S.pr.map(project => [project.id, project]));
  const rows = S.pr.map(project => ({ project, count: days.get(project.id)?.size || 0 }));
  for (const [id, dates] of days) {
    if (!projects.has(id)) rows.push({ project: { id, n: 'Poistettu projekti', a: '' }, count: dates.size });
  }
  return rows;
}

function mileageDistance(km) {
  return km.toLocaleString('fi-FI', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' km';
}

function mileageResults(year) {
  const origin = homeOrigin(), rows = mileageProjects(year);
  const withRoute = rows.filter(({ project }) => validHomeRoute(project, origin));
  const sum = withRoute.reduce((total, { project, count }) => total + project.homeRoute.km * count, 0);
  const missingDays = rows.filter(({ project }) => !validHomeRoute(project, origin))
    .reduce((total, { count }) => total + count, 0);
  return `<div class="stat"><b>${mileageDistance(sum)}</b><span>Yhteensä vuonna ${year} · yhteen suuntaan</span></div>
    ${missingDays ? `<p>Matka puuttuu ${missingDays} työmaa- ja päivämerkinnältä. Summa sisältää lasketut matkat.</p>` : ''}
    ${rows.length ? `<ul class="mileage-list">${rows.map(({ project, count }) => {
      const valid = validHomeRoute(project, origin);
      const routeText = valid ? mileageDistance(project.homeRoute.km)
        : !project.a ? 'Osoite puuttuu'
        : mileageErrors.get(project.id) || 'Matkaa ei ole laskettu';
      return `<li><strong>${esc(project.n)}</strong>${project.a ? `<span>${esc(project.a)}</span>` : ''}
        <span>${esc(routeText)} · ${count} työpäivää${valid && count ? ' · ' + mileageDistance(project.homeRoute.km * count) : ''}</span></li>`;
    }).join('')}</ul>` : '<p>Ei projekteja vielä.</p>'}`;
}

function homeMileage(currentYear) {
  const years = [...new Set([currentYear, ...S.en.map(entry => entry.d.slice(0, 4))])].sort().reverse();
  if (!years.includes(mileageYear)) mileageYear = currentYear;
  return `<section class="card" id="home-mileage" aria-labelledby="home-mileage-title">
    <h3 id="home-mileage-title">Työmatkat verotusta varten</h3>
    <p>Arvioitu ajomatka kotoa työmaalle yhteen suuntaan. Vuosisummaan lasketaan yksi matka työmaata ja kirjattua työpäivää kohti.</p>
    <label for="home-address">Kotiosoite</label>
    <input id="home-address" autocomplete="off" maxlength="300" placeholder="Katu, talonumero ja kaupunki" value="${esc(homeOrigin()?.address)}">
    <p>Kotiosoite ja työmaiden osoitteet tarkistetaan Photonissa. OSRM laskee reitin koordinaateista. Tallennettua kotiosoitetta käytetään valitun vuoden kaikille matkoille.</p>
    <button type="button" class="btn" data-mileage-action="save"${homeSaving ? ' disabled' : ''}>Tallenna kotiosoite</button>
    <button type="button" class="btn sm" data-mileage-action="clear"${homeSaving || !homeOrigin() ? ' disabled' : ''}>Poista kotiosoite</button>
    <p id="home-address-status" role="status"></p>
    <label for="mileage-year">Verovuosi</label>
    <select id="mileage-year">${years.map(year => `<option${year === mileageYear ? ' selected' : ''}>${esc(year)}</option>`).join('')}</select>
    <button type="button" class="btn pri" data-mileage-action="calculate"${!homeOrigin() || homeSaving || mileageRunning ? ' disabled' : ''}>Laske työmatkat</button>
    <p id="home-mileage-status" role="status">${mileageRunning ? 'Lasketaan työmatkoja…' : ''}</p>
    <div id="home-mileage-results">${mileageResults(mileageYear)}</div>
  </section>`;
}

function paintHomeMileage(message) {
  const view = $('#home-mileage');
  if (!view) return;
  view.querySelector('[data-mileage-action="save"]').disabled = homeSaving;
  view.querySelector('[data-mileage-action="clear"]').disabled = homeSaving || !homeOrigin();
  view.querySelector('[data-mileage-action="calculate"]').disabled = homeSaving || mileageRunning || !homeOrigin();
  $('#home-mileage-results').innerHTML = mileageResults(mileageYear);
  if (message !== undefined) $('#home-mileage-status').textContent = message;
}

function persistHomeAddress(origin) {
  const previous = S.pf.home;
  const oldRoutes = S.pr.filter(project => project.homeRoute && !validHomeRoute(project, origin))
    .map(project => [project, project.homeRoute]);
  for (const [project] of oldRoutes) delete project.homeRoute;
  if (origin) S.pf.home = origin;
  else delete S.pf.home;
  if (save()) return true;
  if (previous) S.pf.home = previous;
  else delete S.pf.home;
  for (const [project, route] of oldRoutes) project.homeRoute = route;
  return false;
}

async function saveHomeAddress() {
  const input = $('#home-address'), status = $('#home-address-status'), address = input.value.trim();
  if (homeSaving) return;
  if (!address) {
    status.textContent = 'Anna katu, talonumero ja kaupunki.';
    return;
  }
  if (address === homeOrigin()?.address) {
    status.textContent = 'Kotiosoite on jo tallennettu.';
    return;
  }
  const profile = S.pf;
  homeSaving = true;
  paintHomeMileage();
  status.textContent = 'Tarkistetaan osoitetta…';
  try {
    const { label, point } = await resolveRouteAddress(address);
    if (!input.isConnected || S.pf !== profile) return;
    if (input.value.trim() !== address) {
      status.textContent = 'Osoite muuttui. Paina Tallenna kotiosoite uudelleen.';
      return;
    }
    if (!persistHomeAddress({ address: label, point })) {
      status.textContent = 'Tallennus epäonnistui.';
      return;
    }
    input.value = label;
    mileageErrors.clear();
    status.textContent = 'Kotiosoite tallennettu.';
  } catch (error) {
    status.textContent = error.message === 'Tarkista katu, talonumero ja kaupunki'
      ? 'Osoitetta ei tunnistettu. Tarkista katu, talonumero ja kaupunki.'
      : 'Osoitteen tarkistus epäonnistui. Yritä uudelleen.';
  } finally {
    homeSaving = false;
    paintHomeMileage(mileageRunning ? 'Lasketaan työmatkoja…' : '');
  }
}

function clearHomeAddress() {
  if (!persistHomeAddress(null)) return;
  $('#home-address').value = '';
  $('#home-address-status').textContent = 'Kotiosoite poistettu.';
  mileageErrors.clear();
  paintHomeMileage('');
}

async function calculateHomeMileage() {
  const origin = homeOrigin();
  const input = $('#home-address');
  if (!origin || mileageRunning || homeSaving) return;
  if (input.value.trim() !== origin.address) {
    $('#home-address-status').textContent = 'Tallenna muuttunut kotiosoite ensin.';
    return;
  }
  const projects = S.pr.filter(project => project.a && !validHomeRoute(project, origin));
  if (!projects.length) {
    paintHomeMileage('Kaikki osoitteelliset työmaat on laskettu.');
    return;
  }
  mileageRunning = true;
  mileageErrors.clear();
  paintHomeMileage('Lasketaan työmatkoja…');
  let completed = 0;
  let failed = 0;
  try {
    for (const project of projects) {
      const address = project.a;
      const stillCurrent = () => homeOrigin() === origin && S.pr.includes(project) && project.a === address;
      routeQueue = routeQueue.then(async () => {
        if (!stillCurrent()) return;
        try {
          const route = await calculateDistance(address, origin);
          if (!stillCurrent()) return;
          const previous = project.homeRoute;
          project.homeRoute = { ...route, point: origin.point };
          if (!save()) {
            if (previous) project.homeRoute = previous;
            else delete project.homeRoute;
            throw Error('Tallennus epäonnistui');
          }
        } catch (error) {
          if (!stillCurrent()) return;
          failed++;
          mileageErrors.set(project.id, error.message === 'Tarkista katu, talonumero ja kaupunki'
            ? 'Tarkista työmaan osoite' : 'Laskenta epäonnistui. Yritä uudelleen.');
        } finally {
          completed++;
          if (homeOrigin() === origin) paintHomeMileage(`Työmaat ${completed} / ${projects.length}`);
          await new Promise(resolve => setTimeout(resolve, 1100));
        }
      });
      await routeQueue;
      if (homeOrigin() !== origin) break;
    }
  } finally {
    mileageRunning = false;
    paintHomeMileage(homeOrigin() !== origin ? '' : failed
      ? 'Osa matkoista jäi laskematta. Tarkista virheilmoitukset ja yritä uudelleen.'
      : 'Työmatkat päivitetty.');
  }
}

document.addEventListener('change', event => {
  if (event.target.id !== 'mileage-year') return;
  mileageYear = event.target.value;
  paintHomeMileage();
});

document.addEventListener('click', event => {
  const action = event.target.closest('[data-mileage-action]')?.dataset.mileageAction;
  if (action === 'save') saveHomeAddress();
  if (action === 'clear') clearHomeAddress();
  if (action === 'calculate') calculateHomeMileage();
});
