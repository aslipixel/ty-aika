// Собирает www/: страница приложения + three.js и шрифты локально, чтобы всё работало без интернета.
import { readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
await rm('www', { recursive: true, force: true });
await mkdir('www/fonts', { recursive: true });
await copyFile('src/index.html', 'www/index.html');
await copyFile('node_modules/three/build/three.min.js', 'www/three.min.js');
let css = '';
for (const [pkg, family, weights] of [['pt-sans', 'PT Sans', [400, 700]], ['pt-sans-narrow', 'PT Sans Narrow', [700]]]) {
  for (const w of weights) for (const subset of ['latin', 'cyrillic']) {
    const file = `${pkg}-${subset}-${w}-normal.woff2`;
    await copyFile(`node_modules/@fontsource/${pkg}/files/${file}`, `www/fonts/${file}`);
    css += `@font-face{font-family:"${family}";font-style:normal;font-weight:${w};font-display:swap;src:url(${file}) format("woff2")}\n`;
  }
}
await writeFile('www/fonts/fonts.css', css);
const html = await readFile('www/index.html', 'utf8');
if (/cdnjs|googleapis/.test(html)) throw Error('Page still loads files from the internet');
console.log('Packaged Чертёж 3D into www/');
