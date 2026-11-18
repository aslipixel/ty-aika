'use strict';
const byId = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const coordinate = (name, limit) => {
  const raw = params.get(name);
  if (!raw?.trim()) return NaN;
  const value = Number(raw);
  return Number.isFinite(value) && Math.abs(value) <= limit ? value : NaN;
};
const lat = coordinate('lat', 90), lon = coordinate('lon', 180);
const hasPlace = Number.isFinite(lat) && Number.isFinite(lon);
byId('location').textContent = hasPlace ? (params.get('place') || [lat, lon].join(', ')) : 'Helsinki, Suomi';
const number = new Intl.NumberFormat('fi-FI', { maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'UTC' });
const formatDay = date => dateFormat.format(new Date(date + 'T12:00:00Z'));
const showNumber = value => Number.isFinite(value) ? number.format(value) : '–';
const liquid = (rain, showers) => Number.isFinite(rain) && Number.isFinite(showers) ? rain + showers : null;
let days = [], hours = [], week = false;

function chart(records, key, title, unit) {
  const figure = document.createElement('figure');
  figure.className = key;
  const values = records.map(row => row[key]).filter(Number.isFinite);
  const max = Math.max(0, ...values);
  const ceiling = Math.ceil(max * 10) / 10;
  const caption = document.createElement('figcaption');
  caption.textContent = title;
  const scale = document.createElement('small');
  scale.textContent = !values.length ? 'Ei tietoja' : ceiling ? '0–' + number.format(ceiling) + ' ' + unit : '0 ' + unit;
  caption.append(scale);
  const bars = document.createElement('div'), ticks = document.createElement('div');
  bars.className = 'bars';
  ticks.className = 'ticks';
  bars.setAttribute('aria-hidden', 'true');
  ticks.setAttribute('aria-hidden', 'true');
  figure.style.setProperty('--count', records.length);
  records.forEach((row, i) => {
    const bar = document.createElement('span'), tick = document.createElement('span');
    if (Number.isFinite(row[key])) {
      bar.className = 'bar';
      bar.style.height = ceiling ? (row[key] / ceiling * 100) + '%' : '0';
      if (row[key] > 0) bar.style.minHeight = '2px';
    } else {
      bar.className = 'missing';
      bar.textContent = '–';
    }
    tick.textContent = week ? row.label.split(' ')[0] : (i % 4 === 0 || i === records.length - 1 ? row.label.slice(0, 2) : '');
    bars.append(bar);
    ticks.append(tick);
  });
  figure.append(caption, bars, ticks);
  return figure;
}

function render() {
  const day = byId('day').value;
  const records = week ? days : hours.filter(row => row.date === day);
  byId('day-mode').setAttribute('aria-pressed', String(!week));
  byId('week-mode').setAttribute('aria-pressed', String(week));
  byId('date-picker').hidden = week;
  byId('forecast').classList.toggle('week', week);
  byId('period').hidden = !week;
  byId('period').textContent = week ? formatDay(days[0].date) + ' – ' + formatDay(days.at(-1).date) : formatDay(day);
  byId('row-label').textContent = week ? 'Päivä' : 'Klo';
  byId('temp-label').textContent = week ? 'Alin / ylin °C' : 'Lämpötila °C';
  byId('units').textContent = week ? 'Valitse päivä nähdäksesi tuntiennusteen.' : 'Paikallinen aika. Sademäärä on näytettyyn kellonaikaan päättyvän tunnin kertymä.';
  byId('charts').replaceChildren(chart(records, 'rain', 'Vesisade', 'mm'), chart(records, 'snow', 'Lumisade', 'cm'));
  const rows = records.map(row => {
    const tr = document.createElement('tr'), heading = document.createElement('th');
    heading.scope = 'row';
    if (week) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = row.label;
      button.addEventListener('click', () => {
        byId('day').value = row.date;
        week = false;
        render();
        byId('day').focus();
      });
      heading.append(button);
    } else heading.textContent = row.label;
    tr.append(heading);
    const temperature = week ? showNumber(row.low) + ' / ' + showNumber(row.high) : showNumber(row.temp);
    for (const value of [temperature, showNumber(row.rain), showNumber(row.snow)]) {
      const cell = tr.insertCell();
      cell.textContent = value;
    }
    return tr;
  });
  byId('rows').replaceChildren(...rows);
}

async function load() {
  byId('retry').hidden = true;
  byId('status').hidden = false;
  byId('status').textContent = 'Ladataan ennustetta…';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const query = new URLSearchParams({
      latitude: hasPlace ? lat : 60.17, longitude: hasPlace ? lon : 24.94, timezone: 'auto', forecast_days: 7,
      hourly: 'temperature_2m,rain,showers,snowfall',
      daily: 'temperature_2m_min,temperature_2m_max,rain_sum,showers_sum,snowfall_sum'
    });
    const response = await fetch('https://api.open-meteo.com/v1/forecast?' + query, { signal: controller.signal, credentials: 'omit' });
    if (!response.ok) throw Error('Forecast unavailable');
    const { daily, hourly } = await response.json();
    if (!daily?.time?.length || !hourly?.time?.length) throw Error('No forecast');
    days = daily.time.map((date, i) => ({
      date, label: formatDay(date), low: daily.temperature_2m_min[i], high: daily.temperature_2m_max[i],
      rain: liquid(daily.rain_sum[i], daily.showers_sum[i]), snow: daily.snowfall_sum[i]
    }));
    hours = hourly.time.map((time, i) => ({
      date: time.slice(0, 10), label: time.slice(11, 16), temp: hourly.temperature_2m[i],
      rain: liquid(hourly.rain[i], hourly.showers[i]), snow: hourly.snowfall[i]
    }));
    byId('day').replaceChildren(...days.map(day => new Option(day.label, day.date)));
    render();
    byId('status').hidden = true;
    byId('forecast').hidden = false;
  } catch {
    byId('status').textContent = 'Ennustetta ei voitu hakea. Tarkista verkkoyhteys ja yritä uudelleen.';
    byId('retry').hidden = false;
  } finally { clearTimeout(timeout); }
}

byId('day-mode').onclick = () => { week = false; render(); };
byId('week-mode').onclick = () => { week = true; render(); };
byId('day').onchange = render;
byId('retry').onclick = load;
if (document.referrer && new URL(document.referrer).origin === location.origin &&
    new URL(document.referrer).pathname.startsWith(new URL('../tyontekija/', location.href).pathname)) {
  byId('back').onclick = event => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && history.length > 1) { event.preventDefault(); history.back(); } };
}
load();
