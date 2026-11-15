// Pin PDF.js locally so the TES reader also works offline in iOS and Android.
import {mkdir,copyFile} from 'node:fs/promises';
const out='../tuntix/tyontekija/pdfjs';
await mkdir(out,{recursive:true});
for(const name of ['pdf.min.mjs','pdf.worker.min.mjs'])await copyFile('node_modules/pdfjs-dist/legacy/build/'+name,out+'/'+name);
await copyFile('node_modules/pdfjs-dist/LICENSE',out+'/LICENSE');

await mkdir(out+'/codecs',{recursive:true});
for(const name of ['jbig2_nowasm_fallback.js','openjpeg_nowasm_fallback.js','LICENSE_JBIG2','LICENSE_OPENJPEG','LICENSE_PDFJS_JBIG2','LICENSE_PDFJS_OPENJPEG'])await copyFile('node_modules/pdfjs-dist/wasm/'+name,out+'/codecs/'+name);
