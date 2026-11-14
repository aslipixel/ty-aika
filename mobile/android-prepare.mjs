import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import sharp from 'sharp';
const res = 'android/app/src/main/res';
for (const [density,size] of Object.entries({mdpi:48,hdpi:72,xhdpi:96,xxhdpi:144,xxxhdpi:192})) {
  const dir = `${res}/mipmap-${density}`;
  await mkdir(dir,{recursive:true});
  const png = await sharp('../tuntix/tuntix-icon.svg').resize(size,size).flatten({background:'#ffffff'}).png().toBuffer();
  for (const name of ['ic_launcher','ic_launcher_round']) await writeFile(`${dir}/${name}.png`,png);
  await sharp('../tuntix/tuntix-icon.svg').resize(Math.round(size*1.35)).extend({top:Math.round(size*.45),bottom:Math.round(size*.45),left:Math.round(size*.45),right:Math.round(size*.45),background:'#ffffff'}).png().toFile(`${dir}/ic_launcher_foreground.png`);
}
const strings = `${res}/values/strings.xml`;
await writeFile(strings,(await readFile(strings,'utf8')).replace(/>TuntiX</g,'>TuntiX Työntekijä<'));
// Keep the exported Android Studio project independent of Node/npm paths.
let settings = await readFile('android/capacitor.settings.gradle','utf8');
const paths = [...settings.matchAll(/new File\('([^']+)'\)/g)];
for (const [expression,source] of paths) {
  const match = source.match(/@capacitor\/([^/]+)\/(android|capacitor)$/);
  if (!match) throw Error('Unexpected Capacitor dependency: '+source);
  const destination = 'vendor/'+match[1];
  await cp('android/'+source,'android/'+destination,{recursive:true});
  settings = settings.replace(expression,`new File('${destination}')`);
}
await writeFile('android/capacitor.settings.gradle',settings);
