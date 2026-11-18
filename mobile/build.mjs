import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { build } from 'esbuild';
await rm('www', { recursive: true, force: true });
await mkdir('www', { recursive: true });
let html = await readFile('../tuntix/tyontekija/index.html', 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);
if (!match) throw Error('App script not found');
let app = match[1];
function replaceOnce(from, to) {
  if (!app.includes(from)) throw Error('Source changed: ' + from);
  app = app.replace(from, to);
}
replaceOnce('localStorage.setItem(K,JSON.stringify(S));return true', 'localStorage.setItem(K,JSON.stringify(S));window.nativePersist(JSON.stringify(S));return true');
replaceOnce('function download(name,text,type){', 'function download(name,text,type){return window.nativeDownload(name,text,type);}\nfunction browserDownload(name,text,type){');
replaceOnce('function backup(){download(', 'function backup(){return download(');
replaceOnce('backup();const previous=S;', 'await backup();const previous=S;');

replaceOnce('function tesOpenPdf(doc){', 'function tesOpenPdf(doc){return window.nativeOpenPdf(doc); }\nfunction browserTesOpenPdf(doc){');
html = html.replace(match[0], '<script src="native.js"></script>');
await writeFile('www/index.html', html);
await writeFile('www/app.js', app);
for (const path of ['weather.js', 'weather.css', 'weather-icons', 'measurement.js', 'Mittaustodistus_92986_editable.pdf', 'Mittaustodistus_92986.jpg', 'vendor', 'fonts']) {
  await cp('../tuntix/tyontekija/' + path, 'www/' + path, { recursive: true });
}
await build({ entryPoints: ['native.js'], bundle: true, outfile: 'www/native.js', target: 'safari15', minify: true });
console.log('Packaged TuntiX with local fonts and native backup sharing.');
