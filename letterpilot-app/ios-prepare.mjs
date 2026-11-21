// iPhone: app icon and the camera permission text shown by iOS.
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
await sharp('icon.svg').resize(1024, 1024).flatten({ background: '#0a6ae6' }).png().toFile('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');
const plistPath = 'ios/App/App/Info.plist';
let plist = await readFile(plistPath, 'utf8');
const add = (key, value) => { if (!plist.includes(`<key>${key}</key>`)) plist = plist.replace(/<dict>\n/, `<dict>\n\t<key>${key}</key>\n\t<string>${value}</string>\n`); };
add('NSCameraUsageDescription', 'LetterPilot uses the camera to scan letters and documents.');
add('NSPhotoLibraryUsageDescription', 'LetterPilot opens photos of letters you choose.');
await writeFile(plistPath, plist);
console.log('iOS project prepared');
