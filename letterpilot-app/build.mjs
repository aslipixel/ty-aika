// Packages the LetterPilot website (../letterpilot/index.html) as the app's local web bundle.
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
await rm('www', { recursive: true, force: true });
await mkdir('www', { recursive: true });
const html = await readFile('../letterpilot/index.html', 'utf8');
if (!html.includes('WORKER_URL')) throw Error('LetterPilot page changed: Worker address not found');
await writeFile('www/index.html', html);
console.log('Packaged LetterPilot into www/');
