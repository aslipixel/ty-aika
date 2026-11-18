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

  function view() {
    return `<section class="weather" id="weather" aria-labelledby="weather-title">
      <h2 id="weather-title">Sää</h2>
      <form><input type="search" aria-label="Paikkakunta" placeholder="Hae paikkakuntaa" required minlength="2" maxlength="100">
      <button type="submit">Hae</button></form>
      <p class="weather-status" role="status"></p>
      <div class="weather-results"></div>
      <h3 class="weather-heading"></h3><p class="weather-hour"></p>
      ${window.nativePersist ? '' : '<a class="weather-link weather-forecast-link" href="../saa/">Tunti- ja viikkoennuste ›</a>'}
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
        const query = new URLSearchParams({ lat: point.latitude, lon: point.longitude, place: label(point) });
        forecastLink.href = '../saa/?' + query;
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

  return { view, mount };
})();
