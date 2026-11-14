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
// PDFs are bundled in the HTML; export binary base64 without a network request.
window.nativeOpenPdf = async doc => {
  try {
    const supplement = doc === 'liite';
    const element = document.getElementById(supplement ? 'tes-pdf-liite' : 'tes-pdf-main');
    if (!element) throw Error('Bundled TES PDF missing');
    const name = supplement ? 'Vedeneristys-TES-lisaliite-2026.pdf' : 'Vedeneristys-TES-2025-2028.pdf';
    const { uri } = await Filesystem.writeFile({ path: name, data: element.textContent.trim(), directory: Directory.Cache });
    await Share.share({ title: name, files: [uri], dialogTitle: 'Avaa tai tallenna TES' });
  } catch (error) {
    if (!/cancel|dismiss/i.test(String(error?.message || error))) alert('PDF:n avaaminen epäonnistui. Yritä uudelleen.');
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
