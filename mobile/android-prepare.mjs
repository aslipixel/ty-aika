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

const gradle='android/app/build.gradle';
const versionCode=Number(process.env.TUNTIX_BUILD_NUMBER||5);
if(!Number.isSafeInteger(versionCode)||versionCode<5)throw Error('Invalid release build number');
await writeFile(gradle,(await readFile(gradle,'utf8')).replace(/versionCode \d+/,'versionCode '+versionCode).replace(/versionName "[^"]+"/,'versionName "1.4"'));
const manifest='android/app/src/main/AndroidManifest.xml';
await writeFile(manifest,(await readFile(manifest,'utf8')).replace('android:allowBackup="true"','android:allowBackup="false" android:usesCleartextTraffic="false"'));
await writeFile('android/app/src/main/res/xml/file_paths.xml','<?xml version="1.0" encoding="utf-8"?><paths xmlns:android="http://schemas.android.com/apk/res/android"><cache-path name="exports" path="exports/" /></paths>');

// Android-only layout: do not modify website or iOS assets.
const androidHtmlPath='android/app/src/main/assets/public/index.html';
let androidHtml=await readFile(androidHtmlPath,'utf8');
androidHtml=androidHtml.replace(/<style id="compact-home-layout">[\s\S]*?<\/style>/,'');
const androidCompactStyle="<style id=\"compact-home-layout\">\n/* Apply the safe-area inset once, then keep the working week above navigation. */\n:root{padding:0!important}\nhtml,body{padding-top:0!important;margin-top:0!important}\nbody::before{display:none}\n@media(min-width:0px){\n.top{padding:2px 12px 0;min-height:30px;gap:8px}\n.brand{font-size:19px;gap:5px}.brand svg{width:28px;height:28px}\n.top::after{font-size:7px;letter-spacing:.6px}\nmain{padding-top:0}\n.hero{padding:2px 0 7px}.clk{font-size:30px;line-height:1.05}.hero b{font-size:13px}\n.card.week-controls{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 8px;padding:7px 10px;margin-bottom:8px}\n.card>.weektools{grid-column:1;grid-row:1;grid-template-columns:minmax(0,1fr) 74px;gap:5px;margin:0}\n.card>.weekend-toggle{grid-column:2;grid-row:1;margin:0;min-height:40px;gap:5px;font-size:12px;white-space:nowrap}\n.card>.weekend-toggle input{width:18px;height:18px;min-width:18px}\n.card.week-controls>.wk{grid-column:1/-1;margin:0;min-height:42px}\n.card.week-controls>.wk .btn{min-height:40px;padding:6px 12px}\n.card.week-controls>.wk b{font-size:13px}\n.card.week-controls>.wk p{font-size:11px}\n.weektools .weekdate-field input{height:36px;min-height:36px;font-size:13px}\n.weektools .lnk{font-size:11px}\n.card.week-summary{padding:11px 12px 12px;margin-bottom:10px}\n.week-summary-heading{padding-bottom:8px}.week-summary-heading h2{font-size:16px}.week-summary-heading strong{font-size:22px}\n.week-entries{gap:4px}\n.week-summary .week-entry{min-height:44px;padding:5px 8px 5px 22px;font-size:18px;grid-template-columns:100px minmax(0,1fr) 26px;gap:6px;border-radius:12px}\n.week-day{gap:5px}.week-day b{font-size:16px}.week-day small{font-size:13px}\n.week-status{width:25px;height:25px}.week-status svg{width:23px;height:23px}\n.nav{padding-top:5px;padding-bottom:calc(5px + env(safe-area-inset-bottom,0px))}\n.nav a{min-height:46px;font-size:11px}\n}\n</style>";
if(!androidHtml.includes('</head>'))throw Error('Android HTML head missing');
await writeFile(androidHtmlPath,androidHtml.replace('</head>',androidCompactStyle+'</head>'));
