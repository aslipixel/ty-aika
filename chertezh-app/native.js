// Native bridge: saving PNG files on the phone (WebView ignores <a download>).
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
const toB64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
window.nativeDl = async (blob, name) => {
  try {
    const { uri } = await Filesystem.writeFile({ path: name, data: await toB64(blob), directory: Directory.Cache });
    await Share.share({ title: name, files: [uri] });
  } catch (e) { if (!/cancel/i.test(String(e && e.message))) alert('Не удалось сохранить файл: ' + (e && e.message || e)); }
};
