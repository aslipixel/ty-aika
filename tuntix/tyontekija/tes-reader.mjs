import {attachGestures} from './tes-gestures.mjs';
import {getDocument,GlobalWorkerOptions} from './pdfjs/pdf.min.mjs';
GlobalWorkerOptions.workerSrc=new URL('./pdfjs/pdf.worker.min.mjs',import.meta.url).href;
export function mountReader(root,data,title){
 root.innerHTML=`<h3 class="tes-reader-title"></h3><div class="tes-reader-controls"><label>Sivu <input aria-label="Sivu" type="number" min="1" value="1"></label><span class="tes-reader-count"></span></div><p class="tes-reader-hint">Suurenna kahdella sormella. Vaihda sivua pyyhkäisemällä sivulle.</p><p class="tes-reader-status" role="status">Avataan asiakirjaa…</p><div class="tes-reader-scroll" tabindex="0" aria-label="TES-asiakirja"><canvas aria-label="Asiakirjan sivu"></canvas></div>`;
 root.querySelector('h3').textContent=title;
 const canvas=root.querySelector('canvas'),scroll=root.querySelector('.tes-reader-scroll'),status=root.querySelector('[role=status]'),input=root.querySelector('input');
 let pdf=null,pageNumber=1,zoom=1,closed=false,busy=false,resizeTimer;
 const loading=getDocument({data,wasmUrl:new URL('./pdfjs/codecs/',import.meta.url).href,useWasm:false,isImageDecoderSupported:false,disableWorkerRendering:true});
 function controls(){input.disabled=busy||!pdf}
 function updateStatus(){if(pdf)status.textContent=`Sivu ${pageNumber} / ${pdf.numPages} · ${Math.round(zoom*100)} %`}
 function setZoom(value){const ratio=value/zoom;zoom=value;canvas.style.width=(parseFloat(canvas.style.width)||canvas.clientWidth)*ratio+'px';canvas.style.height=(parseFloat(canvas.style.height)||canvas.clientHeight)*ratio+'px';updateStatus()}
 function turnPage(delta){const next=Math.min(pdf.numPages,Math.max(1,pageNumber+delta));if(next===pageNumber)return;pageNumber=next;zoom=1;draw(true)}
 const removeGestures=attachGestures(scroll,{ready:()=>!!pdf&&!busy,getZoom:()=>zoom,setZoom,finishZoom:()=>draw(false),turnPage});
 scroll.addEventListener('keydown',e=>{if(!pdf||busy)return;if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();turnPage(e.key==='ArrowRight'?1:-1)}else if(['+','-','=','0'].includes(e.key)){e.preventDefault();setZoom(e.key==='0'?1:Math.max(1,Math.min(4,zoom+(e.key==='-'?-.5:.5))));draw(false)}});
 async function draw(reset=false){
  if(closed||busy||!pdf)return;
  busy=true;controls();status.textContent='Ladataan sivua…';
  try{
   const page=await pdf.getPage(pageNumber);if(closed)return;
   const base=page.getViewport({scale:1});const scale=Math.max(240,scroll.clientWidth-16)/base.width*zoom;
   const viewport=page.getViewport({scale});const pixels=Math.min(window.devicePixelRatio||1,2,Math.sqrt(6000000/(viewport.width*viewport.height)));
   canvas.width=Math.floor(viewport.width*pixels);canvas.height=Math.floor(viewport.height*pixels);
   canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';
   await page.render({canvasContext:canvas.getContext('2d'),viewport,transform:[pixels,0,0,pixels,0,0]}).promise;
   if(closed)return;input.value=pageNumber;canvas.setAttribute('aria-label',`${title}, sivu ${pageNumber}`);updateStatus();if(reset)scroll.scrollTo(0,0);
  }catch(e){if(!closed)status.textContent='Sivun avaaminen epäonnistui. Palaa takaisin ja yritä uudelleen.'}
  finally{busy=false;if(!closed)controls()}
 }
 input.addEventListener('change',()=>{if(busy||!pdf)return;pageNumber=Math.min(pdf.numPages,Math.max(1,Math.round(Number(input.value)||1)));zoom=1;draw(true)});
 const resized=()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(draw,180)};window.addEventListener('resize',resized);
 controls();loading.promise.then(doc=>{if(closed)return;pdf=doc;input.max=pdf.numPages;root.querySelector('.tes-reader-count').textContent='/ '+pdf.numPages;draw()}).catch(()=>{if(!closed)status.textContent='Asiakirjaa ei voitu avata. Palaa takaisin ja yritä uudelleen.'});
 return ()=>{closed=true;removeGestures();clearTimeout(resizeTimer);window.removeEventListener('resize',resized);loading.destroy().catch(()=>{});canvas.width=0;canvas.height=0};
}
