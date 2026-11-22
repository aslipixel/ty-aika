import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Preferences } from '@capacitor/preferences';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
const key = 'tuntix.tt1';
let queue = Promise.resolve();
window.nativePersist = value => {
  queue = queue.then(() => Preferences.set({ key, value })).catch(() => {
    alert('Tietojen varmuustallennus epäonnistui. Vie varmuuskopio asetuksista.');
  });
  scheduleReminders(value);
};

// Reminder to record hours: one local notification per chosen day for the next two weeks.
// A day that already has an entry gets no notification. Rescheduled after every save and at start.
const REMINDER_DAYS = 14, REMINDER_CHANNEL = 'tuntix-muistutus', QUIET_CHANNEL = 'tuntix-muistutus-hiljainen';
const pad2 = n => String(n).padStart(2, '0');
const dayKey = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const reminderId = d => 7000000 + Number(String(d.getFullYear()).slice(-2) + pad2(d.getMonth() + 1) + pad2(d.getDate()));
let reminderTimer = 0, channelsReady = null, openTodayPending = false;
function readReminder(state) {
  const r = state?.set?.reminder || {};
  const days = Array.isArray(r.days) ? r.days.filter(d => Number.isInteger(d) && d >= 0 && d < 7) : [0, 1, 2, 3, 4];
  return { on: r.on === true, time: /^([01]\d|2[0-3]):[0-5]\d$/.test(r.time) ? r.time : '16:30', days, sound: r.sound !== false };
}
function ensureChannels() {
  if (Capacitor.getPlatform() !== 'android') return Promise.resolve();
  channelsReady ||= Promise.all([
    LocalNotifications.createChannel({ id: REMINDER_CHANNEL, name: 'Muistutus', description: 'Muistutus kirjata tunnit', importance: 4, vibration: true, visibility: 1 }),
    LocalNotifications.createChannel({ id: QUIET_CHANNEL, name: 'Muistutus ilman ääntä', description: 'Muistutus kirjata tunnit ilman ääntä', importance: 2, vibration: false, visibility: 1 })
  ]).catch(() => { channelsReady = null; });
  return channelsReady;
}
async function applyReminders(value) {
  let state; try { state = JSON.parse(value); } catch { return; }
  const r = readReminder(state);
  const pending = await LocalNotifications.getPending();
  const ours = pending.notifications.filter(n => n.extra?.tuntix === 'muistutus' || (n.id >= 7000000 && n.id < 8000000));
  if (ours.length) await LocalNotifications.cancel({ notifications: ours.map(n => ({ id: n.id })) });
  if (!r.on || !r.days.length) return;
  if ((await LocalNotifications.checkPermissions()).display !== 'granted') return;
  await ensureChannels();
  const recorded = new Set((state.en || []).map(e => e.d));
  const [hour, minute] = r.time.split(':').map(Number), now = new Date(), android = Capacitor.getPlatform() === 'android';
  const notifications = [];
  for (let i = 0; i < REMINDER_DAYS; i++) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hour, minute);
    if (at <= now || !r.days.includes((at.getDay() + 6) % 7) || recorded.has(dayKey(at))) continue;
    notifications.push({
      id: reminderId(at), title: 'Muista kirjata tunnit', body: 'Tänään ei ole vielä kirjauksia. Napauta ja lisää.',
      schedule: { at, allowWhileIdle: true }, isExactNotification: false, extra: { tuntix: 'muistutus', day: dayKey(at) },
      ...(android ? { channelId: r.sound ? REMINDER_CHANNEL : QUIET_CHANNEL } : (r.sound ? { sound: 'default.caf' } : {}))
    });
  }
  if (notifications.length) await LocalNotifications.schedule({ notifications });
}
function scheduleReminders(value) {
  clearTimeout(reminderTimer);
  reminderTimer = setTimeout(() => { applyReminders(value).catch(() => {}); }, 400);
}
window.nativeReminders = {
  async enable() {
    try {
      let { display } = await LocalNotifications.checkPermissions();
      if (display !== 'granted') ({ display } = await LocalNotifications.requestPermissions());
      return display === 'granted';
    } catch { return false; }
  }
};
function openToday() {
  const button = document.querySelector('[data-a="day"][data-d="' + dayKey(new Date()) + '"]');
  if (!button) { location.hash = '#kalenteri'; setTimeout(() => document.querySelector('[data-a="day"][data-d="' + dayKey(new Date()) + '"]')?.click(), 300); return; }
  button.click();
}
LocalNotifications.addListener('localNotificationActionPerformed', event => {
  if (event.notification?.extra?.tuntix !== 'muistutus') return;
  if (window.__tuntixReady) openToday(); else openTodayPending = true;
}).catch(() => {});
window.nativeDownload = async (name, text) => {
  try {
    const { uri } = await Filesystem.writeFile({ path: "exports/"+name, recursive: true, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: name, files: [uri] });
  } catch (error) {
    alert('Tiedostoa ei jaettu. Yritä uudelleen asetuksista.');
    throw error;
  }
};
window.nativeSharePdf = async (name, bytes) => {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  const { uri } = await Filesystem.writeFile({
    path: 'exports/' + name, recursive: true, data: btoa(binary), directory: Directory.Cache
  });
  await Share.share({ title: name, files: [uri], dialogTitle: 'Jaa tai tallenna mittaustodistus' });
};
window.nativeOpenPdf = async doc => {
 try {
  const supplement=doc==='liite';
  const el=document.getElementById(supplement?'tes-pdf-liite':'tes-pdf-main');
  const name=supplement?'Vedeneristys-TES-lisaliite-2026.pdf':'Vedeneristys-TES-2025-2028.pdf';
  const {uri}=await Filesystem.writeFile({path:"exports/"+name,recursive:true,data:el.textContent.trim(),directory:Directory.Cache});
  await Share.share({title:name,files:[uri],dialogTitle:'Avaa tai tallenna TES'});
 } catch(error) {if(!/cancel|dismiss/i.test(String(error?.message||error)))alert('PDF:n avaaminen epäonnistui. Yritä uudelleen.');}
};
async function start() {
  try {
    const { value } = await Preferences.get({ key });
    if (value && !localStorage.getItem(key)) localStorage.setItem(key, value);
  } catch (error) {
    alert('Tallennettujen tietojen lukeminen epäonnistui.');
  }
  const script = document.createElement('script');
  script.src = 'app.js';
  script.onload = () => {
    window.__tuntixReady = true;
    const value = localStorage.getItem(key);
    if (value) scheduleReminders(value);
    if (openTodayPending) { openTodayPending = false; setTimeout(openToday, 300); }
  };
  document.body.append(script);
}
start();
