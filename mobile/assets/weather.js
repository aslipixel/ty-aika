const TuntixWeather = (() => {
  const forecaEndpoint = document.querySelector('meta[name="tuntix-foreca-endpoint"]')?.content;
  const icons = {
    clearsky_day: 'Selkeää', partlycloudy_day: 'Puolipilvistä', cloudy: 'Pilvistä',
    fog: 'Sumua', rain: 'Sadetta', snow: 'Lumisadetta', sleet: 'Räntää', rainandthunder: 'Ukkosta'
  };
  const initialPlace = { name: 'Helsinki', country: 'Suomi', latitude: 60.17, longitude: 24.94, timezone: 'Europe/Helsinki' };
  const format = new Intl.NumberFormat('fi-FI', { maximumFractionDigits: 1 });
  const hour = 3600000;
  let place = history.state?.weatherPlace || initialPlace;
  // Old forecast bookmarks can include a city and its coordinates.
  if (location.hash === '#saa-ennuste' && !history.state?.weatherPlace) {
    const params = new URLSearchParams(location.search);
    const latitude = Number(params.get('lat')), longitude = Number(params.get('lon'));
    if (params.get('lat')?.trim() && params.get('lon')?.trim() && Number.isFinite(latitude) && Math.abs(latitude) <= 90 &&
        Number.isFinite(longitude) && Math.abs(longitude) <= 180) {
      place = { latitude, longitude, name: params.get('place') || [latitude, longitude].join(', ') };
    }
  }

  function view() {
    return `<section class="weather" id="weather" aria-labelledby="weather-title">
      <h2 id="weather-title">Sää</h2>
      <form><input type="search" aria-label="Paikkakunta" placeholder="Hae paikkakuntaa" required minlength="2" maxlength="100">
      <button type="submit">Hae</button></form>
      <p class="weather-status" role="status"></p>
      <div class="weather-results"></div>
      <h3 class="weather-heading"></h3><p class="weather-hour"></p>
      ${window.nativePersist ? '' : '<p class="weather-probability" hidden></p><a class="weather-link weather-forecast-link" href="#saa-ennuste">Tunti- ja viikkoennuste ›</a>'}
      <div class="weather-grid"></div>
    </section>`;
  }

  async function request(base, params, asText = false) {
    const url = new URL(base, location.href);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
      if (!response.ok) throw new Error('Weather service unavailable');
      return await (asText ? response.text() : response.json());
    } finally {
      clearTimeout(timeout);
    }
  }

  function wmoIcon(code) {
    if (!Number.isFinite(code)) return;
    if (code >= 95) return 'rainandthunder';
    if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
    if ([56, 57, 66, 67].includes(code)) return 'sleet';
    if (code >= 51) return 'rain';
    if (code >= 45) return 'fog';
    if (code === 3) return 'cloudy';
    return code === 0 ? 'clearsky_day' : 'partlycloudy_day';
  }

  function metIcon(symbol) {
    for (const [pattern, icon] of [
      [/thunder/, 'rainandthunder'], [/sleet/, 'sleet'], [/snow/, 'snow'], [/rain/, 'rain'],
      [/fog/, 'fog'], [/partlycloudy|fair/, 'partlycloudy_day'], [/cloudy/, 'cloudy'], [/clearsky/, 'clearsky_day']
    ]) {
      if (pattern.test(symbol)) return icon;
    }
  }

  async function fmi(point, time) {
    const xml = await request('https://opendata.fmi.fi/wfs', {
      service: 'WFS', version: '2.0.0', request: 'getFeature',
      storedquery_id: 'fmi::forecast::harmonie::surface::point::simple',
      latlon: `${point.latitude},${point.longitude}`, starttime: time.toISOString(),
      endtime: new Date(+time + hour).toISOString(),
      parameters: 'Temperature,WindSpeedMS,Precipitation1h,WeatherSymbol3', timestep: 60
    }, true);
    const ns = 'http://xml.fmi.fi/schema/wfs/2.0';
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const values = {};
    for (const row of doc.getElementsByTagNameNS(ns, 'BsWfsElement')) {
      const field = name => row.getElementsByTagNameNS(ns, name)[0]?.textContent;
      const name = field('ParameterName');
      const validAt = name === 'Precipitation1h' ? +time + hour : +time;
      if (Date.parse(field('Time')) === validAt) values[name] = Number(field('ParameterValue') || NaN);
    }
    const code = values.WeatherSymbol3;
    const icon = code >= 80 ? 'fog' : code >= 70 ? 'sleet' : code >= 60 ? 'rainandthunder'
      : code >= 40 ? 'snow' : code >= 20 ? 'rain'
      : ({ 1: 'clearsky_day', 2: 'partlycloudy_day', 3: 'cloudy' })[code];
    return { temp: values.Temperature, wind: values.WindSpeedMS, rain: values.Precipitation1h, icon };
  }

  async function met(point, time) {
    const data = await request('https://api.met.no/weatherapi/locationforecast/2.0/compact', {
      lat: point.latitude.toFixed(4), lon: point.longitude.toFixed(4)
    });
    const row = data.properties.timeseries.find(entry => Date.parse(entry.time) === +time)?.data;
    const current = row?.instant?.details;
    return {
      temp: current?.air_temperature, wind: current?.wind_speed,
      rain: row?.next_1_hours?.details?.precipitation_amount,
      icon: metIcon(row?.next_1_hours?.summary?.symbol_code)
    };
  }

  async function dwd(point, time) {
    const { hourly } = await request('https://api.open-meteo.com/v1/dwd-icon', {
      latitude: point.latitude, longitude: point.longitude,
      hourly: 'temperature_2m,wind_speed_10m,precipitation,weather_code',
      wind_speed_unit: 'ms', timeformat: 'unixtime', forecast_days: 2
    });
    const i = hourly.time.indexOf(+time / 1000);
    return {
      temp: hourly.temperature_2m[i], wind: hourly.wind_speed_10m[i],
      rain: i >= 0 ? hourly.precipitation[i + 1] : undefined, icon: wmoIcon(hourly.weather_code[i])
    };
  }

  function foreca(point, time) {
    return request(forecaEndpoint, { latitude: point.latitude, longitude: point.longitude, time: time.toISOString() });
  }

  function forecaLink(point) {
    const link = document.createElement('a');
    link.className = 'weather-link';
    link.href = point === initialPlace ? 'https://www.foreca.fi/Finland/Helsinki' : 'https://www.foreca.fi/';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Avaa Foreca';
    return link;
  }

  function cardContent(card, data) {
    if (Object.prototype.hasOwnProperty.call(icons, data.icon)) {
      const image = document.createElement('img');
      image.src = `./weather-icons/${data.icon}.svg`;
      image.alt = icons[data.icon];
      card.append(image);
    }
    const temp = document.createElement('div');
    temp.className = 'weather-temp';
    temp.textContent = `${format.format(data.temp)} °C`;
    card.append(temp);
    const metrics = document.createElement('dl');
    for (const [label, value, unit] of [['Tuuli', data.wind, 'm/s'], ['Sade / 1 h', data.rain, 'mm']]) {
      const row = document.createElement('div');
      const term = document.createElement('dt');
      const description = document.createElement('dd');
      term.textContent = label;
      description.textContent = Number.isFinite(value) ? `${format.format(value)} ${unit}` : '–';
      row.append(term, description);
      metrics.append(row);
    }
    card.append(metrics);
  }

  function mount(root) {
    const grid = root.querySelector('.weather-grid');
    const status = root.querySelector('.weather-status');
    const results = root.querySelector('.weather-results');
    const form = root.querySelector('form');
    const input = form.querySelector('input');
    let search = 0;
    const label = point => [point.name, point.admin1, point.country].filter(Boolean).join(', ');

    function load(point) {
      place = point;
      const time = new Date(Math.ceil(Date.now() / hour) * hour);
      root.querySelector('.weather-heading').textContent = label(point);
      const forecastLink = root.querySelector('.weather-forecast-link');
      if (forecastLink) {
        // Replace the target so an earlier city's response cannot overwrite the current one.
        const probability = document.createElement('p');
        probability.className = 'weather-probability';
        probability.hidden = true;
        root.querySelector('.weather-probability').replaceWith(probability);
        request('https://api.open-meteo.com/v1/forecast', {
          latitude: point.latitude, longitude: point.longitude, hourly: 'precipitation_probability',
          timeformat: 'unixtime', forecast_days: 2
        }).then(({ hourly }) => {
          const value = hourly.precipitation_probability?.[hourly.time.indexOf(+time / 1000)];
          if (Number.isFinite(value)) {
            probability.textContent = 'Sateen todennäköisyys ' + format.format(value) + ' % · Open-Meteo';
            probability.hidden = false;
          }
        }).catch(() => { /* Other providers can still show their forecasts. */ });
        // Restore this city when returning from the forecast, even after a full page load.
        history.replaceState({ ...history.state, weatherPlace: point === initialPlace ? null : point }, '');
      }
      const timeLabel = new Intl.DateTimeFormat('fi-FI', {
        timeZone: point.timezone || 'UTC', dateStyle: 'short', timeStyle: 'short'
      }).format(time);
      root.querySelector('.weather-hour').textContent = `Ennuste ${timeLabel} (${point.timezone ? 'paikallista aikaa' : 'UTC'})`;
      grid.replaceChildren();
      const sources = [['Ilmatieteen laitos', fmi], ['Foreca', foreca], ['MET Norway', met], ['DWD ICON', dwd]];
      sources.forEach(async ([name, fetchForecast]) => {
        const card = document.createElement('article');
        const heading = document.createElement('h4');
        const message = document.createElement('p');
        card.className = 'weather-card';
        heading.textContent = name;
        card.append(heading, message);
        grid.append(card);
        if (fetchForecast === foreca && !forecaEndpoint) {
          message.textContent = point === initialPlace ? 'Ennuste Forecan sivulla' : `Hae Forecan sivulta: ${point.name}`;
          card.append(forecaLink(point));
          return;
        }
        message.textContent = 'Ladataan…';
        try {
          const data = await fetchForecast(point, time);
          if (!Number.isFinite(data.temp)) throw new Error('No forecast for this hour');
          message.remove();
          cardContent(card, data);
        } catch {
          message.textContent = 'Ennustetta ei saatavilla.';
          if (fetchForecast === foreca) card.append(forecaLink(point));
        }
      });
    }

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const name = input.value.trim();
      if (name.length < 2) return;
      const id = ++search;
      results.replaceChildren();
      status.textContent = 'Haetaan paikkakuntia…';
      try {
        const data = await request('https://geocoding-api.open-meteo.com/v1/search', { name, count: 8, language: 'fi' });
        if (id !== search) return;
        status.textContent = data.results?.length ? 'Valitse paikkakunta.' : 'Paikkakuntaa ei löytynyt.';
        for (const point of data.results || []) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = label(point);
          button.onclick = () => {
            input.value = point.name;
            results.replaceChildren();
            status.textContent = '';
            load(point);
            input.focus();
          };
          results.append(button);
        }
      } catch {
        if (id === search) status.textContent = 'Haku epäonnistui. Yritä uudelleen.';
      }
    });
    load(place);
  }

  function forecastView() {
    return `<section class="weather-forecast" id="weather-forecast">
    <div class="forecast-heading">
      <a id="back" href="#saa">‹ Takaisin säähän</a>
      <h2>Sääennuste</h2>
      <p id="forecast-location"></p>
    </div>
    <p id="status" role="status">Ladataan ennustetta…</p>
    <button id="retry" type="button" hidden>Yritä uudelleen</button>
    <section id="forecast" hidden>
      <div class="switch" role="group" aria-label="Ennustejakso">
        <button type="button" id="day-mode" aria-pressed="true">Tunneittain</button>
        <button type="button" id="week-mode" aria-pressed="false">7 päivää</button>
      </div>
      <div id="date-picker" role="group" aria-label="Valitse ennustepäivä"></div>
      <h3 id="period"></h3>
      <div id="charts"></div>
      <table>
        <caption class="sr-only">Lämpötila, sateen todennäköisyys ja sademäärät</caption>
        <thead><tr><th scope="col" id="row-label">Klo</th><th scope="col" id="temp-label">Lämpötila</th><th scope="col" id="chance-label" title="Sateen todennäköisyys">Sade­riski</th><th scope="col">Vesi<br>mm</th><th scope="col">Lumi<br>cm</th></tr></thead>
        <tbody id="rows"></tbody>
      </table>
      <p id="units"></p>
    </section>
    <p class="forecast-source">Ennusteen lähde <a href="https://open-meteo.com/">Open-Meteo</a></p>
    </section>`;
  }

  function mountForecast(root) {
    const point = place;
    const byId = id => root.querySelector('#' + id);
    byId('forecast-location').textContent = [point.name, point.admin1, point.country].filter(Boolean).join(', ');
    history.replaceState({ ...history.state, weatherPlace: point }, '');
    const number = new Intl.NumberFormat('fi-FI', { maximumFractionDigits: 2 });
    const dateFormat = new Intl.DateTimeFormat('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'UTC' });
    const formatDay = date => dateFormat.format(new Date(date + 'T12:00:00Z'));
    const showNumber = value => Number.isFinite(value) ? number.format(value) : '–';
    const liquid = (rain, showers) => Number.isFinite(rain) && Number.isFinite(showers) ? rain + showers : null;
    let days = [], hours = [], week = false, selectedDay;

    function chart(records, key, title, unit) {
      const figure = document.createElement('figure');
      figure.className = key;
      const values = records.map(row => row[key]).filter(Number.isFinite);
      const max = Math.max(0, ...values);
      const ceiling = key === 'chance' ? 100 : Math.ceil(max * 10) / 10;
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
      const day = selectedDay;
      for (const button of byId('date-picker').children) {
        button.setAttribute('aria-pressed', String(button.dataset.date === day));
      }
      const records = week ? days : hours.filter(row => row.date === day);
      byId('day-mode').setAttribute('aria-pressed', String(!week));
      byId('week-mode').setAttribute('aria-pressed', String(week));
      byId('date-picker').hidden = week;
      byId('forecast').classList.toggle('week', week);
      byId('period').hidden = !week;
      byId('period').textContent = week ? formatDay(days[0].date) + ' – ' + formatDay(days.at(-1).date) : formatDay(day);
      byId('chance-label').title = week ? 'Päivän suurin sateen todennäköisyys' : 'Sateen todennäköisyys';
      byId('row-label').textContent = week ? 'Päivä' : 'Klo';
      byId('temp-label').textContent = week ? 'Alin / ylin °C' : 'Lämpötila °C';
      byId('units').textContent = week ? 'Saderiski on päivän suurin tuntikohtainen sateen todennäköisyys. Valitse päivä nähdäksesi tunnit.' : 'Paikallinen aika. Sademäärä on näytettyyn kellonaikaan päättyvän tunnin kertymä.';
      byId('charts').replaceChildren(chart(records, 'chance', 'Sateen todennäköisyys', '%'), chart(records, 'rain', 'Vesisade', 'mm'), chart(records, 'snow', 'Lumisade', 'cm'));
      const rows = records.map(row => {
        const tr = document.createElement('tr'), heading = document.createElement('th');
        heading.scope = 'row';
        if (week) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = row.label;
          button.addEventListener('click', () => {
            selectedDay = row.date;
            week = false;
            render();
            byId('date-picker').querySelector('[aria-pressed="true"]').focus();
          });
          heading.append(button);
        } else heading.textContent = row.label;
        tr.append(heading);
        const temperature = week ? showNumber(row.low) + ' / ' + showNumber(row.high) : showNumber(row.temp);
        for (const value of [temperature, Number.isFinite(row.chance) ? showNumber(row.chance) + ' %' : '–', showNumber(row.rain), showNumber(row.snow)]) {
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
          latitude: point.latitude, longitude: point.longitude, timezone: 'auto', forecast_days: 7,
          hourly: 'temperature_2m,rain,showers,snowfall,precipitation_probability',
          daily: 'temperature_2m_min,temperature_2m_max,rain_sum,showers_sum,snowfall_sum,precipitation_probability_max'
        });
        const response = await fetch('https://api.open-meteo.com/v1/forecast?' + query, { signal: controller.signal, credentials: 'omit' });
        if (!response.ok) throw Error('Forecast unavailable');
        const { daily, hourly } = await response.json();
        if (!daily?.time?.length || !hourly?.time?.length) throw Error('No forecast');
        days = daily.time.map((date, i) => ({
          date, label: formatDay(date), low: daily.temperature_2m_min[i], high: daily.temperature_2m_max[i],
          rain: liquid(daily.rain_sum[i], daily.showers_sum[i]), snow: daily.snowfall_sum[i], chance: daily.precipitation_probability_max?.[i]
        }));
        hours = hourly.time.map((time, i) => ({
          date: time.slice(0, 10), label: time.slice(11, 16), temp: hourly.temperature_2m[i],
          rain: liquid(hourly.rain[i], hourly.showers[i]), snow: hourly.snowfall[i], chance: hourly.precipitation_probability?.[i]
        }));
        selectedDay = days[0].date;
        byId('date-picker').replaceChildren(...days.map(day => {
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.date = day.date;
          button.setAttribute('aria-label', day.label);
          const weekday = document.createElement('span');
          weekday.textContent = day.label.split(' ')[0];
          const date = document.createElement('strong');
          date.textContent = Number(day.date.slice(-2));
          button.append(weekday, date);
          button.onclick = () => { selectedDay = day.date; render(); };
          return button;
        }));
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
    byId('retry').onclick = load;
    load();
  }

  return { view, mount, forecastView, mountForecast };
})();
