// Packages site/index.html (copy of https://chertezh-3d.pages.dev/) into www/ for the Android app.
// Libraries and fonts are bundled locally so recognition and 3D work offline; AI goes to the site's /api/ai.
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { build } from 'esbuild';
const SITE = 'https://chertezh-3d.pages.dev';
await rm('www', { recursive: true, force: true });
await mkdir('www/lib/pdfjs', { recursive: true }); await mkdir('www/fonts', { recursive: true });
let html = await readFile('site/index.html', 'utf8');
const once = (a, b) => { const n = html.split(a).length - 1; if (n !== 1) throw Error(`Expected one "${a.slice(0, 60)}", found ${n}`); html = html.replace(a, () => b); };
const get = async (url, bin) => { const r = await fetch(url); if (!r.ok) throw Error(url + ' ' + r.status); return bin ? Buffer.from(await r.arrayBuffer()) : r.text(); };
// three.js and pdf.js
const THREE = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
await writeFile('www/lib/three.min.js', await get(THREE, true)); once(THREE, 'lib/three.min.js');
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
for (const f of ['pdf.min.js', 'pdf.worker.min.js']) await writeFile('www/lib/pdfjs/' + f, await get(PDFJS + f, true));
once(`'${PDFJS}'`, `'lib/pdfjs/'`);
// Google Fonts -> local files
const FONTS = 'https://fonts.googleapis.com/css2?family=Fira+Code:wght@500;600&family=Fira+Sans:wght@400;500;600;700&display=swap';
let css = await (await fetch(FONTS, { headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36' } })).text();
let i = 0;
for (const u of [...new Set(css.match(/https:\/\/fonts\.gstatic\.com\/[^)]+/g) || [])]) { const f = `f${i++}.woff2`; await writeFile('www/fonts/' + f, await get(u, true)); css = css.split(u).join('fonts/' + f); }
await writeFile('www/fonts.css', css);
html = html.replace(/<link rel="preconnect"[^>]*>/g, '');
once(`<link href="${FONTS}" rel="stylesheet">`, '<link href="fonts.css" rel="stylesheet">');
// AI through the website, file saving through the native share sheet
html = html.split("fetch('/api/ai'").join(`fetch('${SITE}/api/ai'`);
if (html.includes("'/api/ai'")) throw Error('Unpatched /api/ai');
once('const dl=(blob,name)=>{', 'const dl=(blob,name)=>{if(window.nativeDl)return nativeDl(blob,name);');
// Android draws the page under the status bar: push the top bar below it (and a little lower)
once('</head>', '<style>.appbar{padding-top:calc(max(env(safe-area-inset-top,0px),var(--safe-area-inset-top,0px),32px) + 10px)}body{padding-bottom:max(env(safe-area-inset-bottom,0px),var(--safe-area-inset-bottom,0px))}</style><script src="native.js"></script></head>');
await writeFile('www/index.html', html);
await build({ entryPoints: ['native.js'], bundle: true, outfile: 'www/native.js', target: 'chrome90', minify: true });
console.log('Packaged Чертёж в 3D into www/');
