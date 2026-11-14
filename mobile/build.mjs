import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
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
replaceOnce('function tesOpenPdf(doc){', 'function tesOpenPdf(doc){return window.nativeOpenPdf(doc);}\nfunction browserTesOpenPdf(doc){');
html = html.replace(match[0], '<script src="native.js"></script>');
html = html.replace(/<link[^>]+fonts\.googleapis\.com[^>]*>/g, '<link rel="stylesheet" href="fonts.css">');
await writeFile('www/index.html', html);
await writeFile('www/app.js', app);
await build({ entryPoints: ['native.js'], bundle: true, outfile: 'www/native.js', target: 'safari15', minify: true });
await build({ stdin: { contents: [400,500,600,700].map(w => `@import "@fontsource/poppins/latin-${w}.css";`).join('\n'), resolveDir: process.cwd(), loader: 'css' }, bundle: true, outfile: 'www/fonts.css', loader: { '.woff2': 'file', '.woff': 'file' } });
console.log('Packaged TuntiX with local fonts and native backup sharing.');
