// Packages the LetterPilot website (../letterpilot/) as the app's local web bundle.
import { readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
await rm('www', { recursive: true, force: true });
await mkdir('www', { recursive: true });
const app = await readFile('../letterpilot/app.js', 'utf8');
if (!app.includes('workers.dev')) throw Error('LetterPilot app changed: Worker address not found');
for (const file of ['index.html', 'app.js', 'style.css', 'letterpilot-glass.svg']) await copyFile('../letterpilot/' + file, 'www/' + file);
console.log('Packaged LetterPilot into www/');
