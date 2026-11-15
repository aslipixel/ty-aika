import {getDocument,GlobalWorkerOptions} from './pdfjs/pdf.min.mjs';
GlobalWorkerOptions.workerSrc=new URL('./pdfjs/pdf.worker.min.mjs',import.meta.url).href;
export function mountReader(root,data,title){
 root.innerHTML=`<h3 class="tes-reader-title"></h3><div class="tes-reader-controls"><button type="button" data-pdf="prev" aria-label="Edellinen sivu">‹</button><label>Sivu <input aria-label="Sivu" type="number" min="1" value="1"></label><span class="tes-reader-count"></span><button type="button" data-pdf="next" aria-label="Seuraava sivu">›</button><button type="button" data-pdf="out" aria-label="Pienennä">−</button><button type="button" data-pdf="in" aria-label="Suurenna">+</button></div><p class="tes-reader-status" role="status">Avataan asiakirjaa…</p><div class="tes-reader-scroll" tabindex="0" aria-label="TES-asiakirja"><canvas aria-label="Asiakirjan sivu"></canvas></div>`;
 root.querySelector('h3').textContent=title;
 const canvas=root.querySelector('canvas'),scroll=root.querySelector('.tes-reader-scroll'),status=root.querySelector('[role=status]'),input=root.querySelector('input');
 const buttons=[...root.querySelectorAll('button')];
 let pdf=null,pageNumber=1,zoom=1,closed=false,busy=false,resizeTimer;
 const loading=getDocument({data,wasmUrl:new URL('./pdfjs/codecs/',import.meta.url).href,useWasm:false,isImageDecoderSupported:false,disableWorkerRendering:true});
 function controls(){buttons.forEach(b=>b.disabled=busy||!pdf);input.disabled=busy||!pdf;if(pdf&&!busy){root.querySelector('[data-pdf=prev]').disabled=pageNumber===1;root.querySelector('[data-pdf=next]').disabled=pageNumber===pdf.numPages;root.querySelector('[data-pdf=out]').disabled=zoom<=1;root.querySelector('[data-pdf=in]').disabled=zoom>=3}}
 async function draw(){
  if(closed||busy||!pdf)return;
  busy=true;controls();status.textContent='Ladataan sivua…';
  try{
   const page=await pdf.getPage(pageNumber);if(closed)return;
   const base=page.getViewport({scale:1});const scale=Math.max(240,scroll.clientWidth-16)/base.width*zoom;
   const viewport=page.getViewport({scale});const pixels=Math.min(window.devicePixelRatio||1,2,Math.sqrt(6000000/(viewport.width*viewport.height)));
   canvas.width=Math.floor(viewport.width*pixels);canvas.height=Math.floor(viewport.height*pixels);
   canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';
   await page.render({canvasContext:canvas.getContext('2d'),viewport,transform:[pixels,0,0,pixels,0,0]}).promise;
   if(closed)return;input.value=pageNumber;canvas.setAttribute('aria-label',`${title}, sivu ${pageNumber}`);status.textContent=`Sivu ${pageNumber} / ${pdf.numPages} · ${Math.round(zoom*100)} %`;scroll.scrollTo(0,0);
  }catch(e){if(!closed)status.textContent='Sivun avaaminen epäonnistui. Palaa takaisin ja yritä uudelleen.'}
  finally{busy=false;if(!closed)controls()}
 }
 root.addEventListener('click',e=>{const action=e.target.closest('[data-pdf]')?.dataset.pdf;if(!action||busy||!pdf)return;if(action==='prev')pageNumber=Math.max(1,pageNumber-1);if(action==='next')pageNumber=Math.min(pdf.numPages,pageNumber+1);if(action==='in')zoom=Math.min(3,zoom+.5);if(action==='out')zoom=Math.max(1,zoom-.5);draw()});
 input.addEventListener('change',()=>{if(busy||!pdf)return;pageNumber=Math.min(pdf.numPages,Math.max(1,Math.round(Number(input.value)||1)));draw()});
 const resized=()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(draw,180)};window.addEventListener('resize',resized);
 controls();loading.promise.then(doc=>{if(closed)return;pdf=doc;input.max=pdf.numPages;root.querySelector('.tes-reader-count').textContent='/ '+pdf.numPages;draw()}).catch(()=>{if(!closed)status.textContent='Asiakirjaa ei voitu avata. Palaa takaisin ja yritä uudelleen.'});
 return ()=>{closed=true;clearTimeout(resizeTimer);window.removeEventListener('resize',resized);loading.destroy().catch(()=>{});canvas.width=0;canvas.height=0};
}
