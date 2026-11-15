const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'../../tuntix/tyontekija');
test('both bundled TES documents render every page with the in-app PDF engine',async()=>{
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
 for(const id of ['tes-pdf-main','tes-pdf-liite']){
  const b64=html.match(new RegExp('id="'+id+'">([^<]+)'))[1];
  const task=getDocument({data:new Uint8Array(Buffer.from(b64,'base64')),stopAtErrors:true,wasmUrl:require('node:url').pathToFileURL(path.resolve(__dirname,'../node_modules/pdfjs-dist/wasm')+'/').href,useWasm:false,isImageDecoderSupported:false,disableWorkerRendering:true});
  const pdf=await task.promise;
  assert.ok(pdf.numPages>1);
  for(let n=1;n<=pdf.numPages;n++){
   const page=await pdf.getPage(n);const viewport=page.getViewport({scale:n===1?1:.3});
   const target=pdf.canvasFactory.create(Math.ceil(viewport.width),Math.ceil(viewport.height));
   await page.render({canvasContext:target.context,viewport}).promise;
   if(n===1&&process.env.TES_PREVIEW_DIR){fs.mkdirSync(process.env.TES_PREVIEW_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.TES_PREVIEW_DIR,id+'.png'),target.canvas.toBuffer('image/png'))}
   pdf.canvasFactory.destroy(target);page.cleanup();
  }
  console.log(id+': '+pdf.numPages+' pages rendered');await task.destroy();
 }
});
