// Android: app icons, name, camera permission (live scanner and photo capture), version.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
const res = 'android/app/src/main/res';
for (const [density, size] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
  const dir = `${res}/mipmap-${density}`;
  await mkdir(dir, { recursive: true });
  const png = await sharp('icon.svg').resize(size, size).png().toBuffer();
  for (const name of ['ic_launcher', 'ic_launcher_round']) await writeFile(`${dir}/${name}.png`, png);
  const pad = Math.round(size * 0.25);
  await sharp('icon.svg').resize(size, size).extend({ top: pad, bottom: pad, left: pad, right: pad, background: '#0a6ae6' }).png().toFile(`${dir}/ic_launcher_foreground.png`);
}
const manifestPath = 'android/app/src/main/AndroidManifest.xml';
let manifest = await readFile(manifestPath, 'utf8');
if (!manifest.includes('android.permission.CAMERA')) {
  manifest = manifest.replace('<application', '<uses-permission android:name="android.permission.CAMERA" />\n    <uses-feature android:name="android.hardware.camera" android:required="false" />\n\n    <application');
}
manifest = manifest.replace('android:allowBackup="true"', 'android:allowBackup="false" android:usesCleartextTraffic="false"');
await writeFile(manifestPath, manifest);
const gradlePath = 'android/app/build.gradle';
const versionCode = Number(process.env.LP_BUILD_NUMBER || 1);
if (!Number.isSafeInteger(versionCode) || versionCode < 1) throw Error('Invalid build number');
await writeFile(gradlePath, (await readFile(gradlePath, 'utf8')).replace(/versionCode \d+/, 'versionCode ' + versionCode).replace(/versionName "[^"]+"/, 'versionName "1.0"'));
console.log('Android project prepared');
