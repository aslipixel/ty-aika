import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Preferences } from '@capacitor/preferences';
const key = 'tuntix.tt1';
let queue = Promise.resolve();
window.nativePersist = value => {
  queue = queue.then(() => Preferences.set({ key, value })).catch(() => {
    alert('Tietojen varmuustallennus epäonnistui. Vie varmuuskopio asetuksista.');
  });
};
window.nativeDownload = async (name, text) => {
  try {
    const { uri } = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: name, files: [uri] });
  } catch (error) {
    alert('Tiedostoa ei jaettu. Yritä uudelleen asetuksista.');
    throw error;
  }
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
  document.body.append(script);
}
start();
