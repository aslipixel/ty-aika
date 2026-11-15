// One-finger pan/swipe and two-finger zoom. No browser-wide zoom is changed.
export function attachGestures(view,{ready,getZoom,setZoom,finishZoom,turnPage}){
 const points=new Map();let pan=null,pinch=null,usedPinch=false,zoomChanged=false;
 const xy=e=>({x:e.clientX,y:e.clientY});
 const pair=()=>{const [a,b]=[...points.values()];return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,d:Math.max(10,Math.hypot(a.x-b.x,a.y-b.y))}};
 function begin(){
  if(points.size>=2){const p=pair();pinch={...p,zoom:getZoom(),left:view.scrollLeft,top:view.scrollTop};pan=null;usedPinch=true}
  else if(points.size===1){const p=[...points.values()][0];pan={...p,left:view.scrollLeft,top:view.scrollTop};pinch=null}
 }
 function down(e){if(!ready()||(e.pointerType==='mouse'&&e.button!==0))return;if(!points.size){usedPinch=false;zoomChanged=false}points.set(e.pointerId,xy(e));view.setPointerCapture(e.pointerId);begin();e.preventDefault()}
 function move(e){if(!points.has(e.pointerId))return;points.set(e.pointerId,xy(e));e.preventDefault();
  if(pinch&&points.size>=2){const p=pair(),z=Math.max(1,Math.min(4,pinch.zoom*p.d/pinch.d)),ratio=z/pinch.zoom,r=view.getBoundingClientRect();setZoom(z);zoomChanged=true;
   view.scrollLeft=(pinch.left+pinch.x-r.left-8)*ratio-(p.x-r.left-8);
   view.scrollTop=(pinch.top+pinch.y-r.top-8)*ratio-(p.y-r.top-8);
  }else if(pan){view.scrollLeft=pan.left+pan.x-e.clientX;view.scrollTop=pan.top+pan.y-e.clientY}
 }
 function end(e){if(!points.has(e.pointerId))return;const dx=pan?e.clientX-pan.x:0,dy=pan?e.clientY-pan.y:0;
  const swipe=e.type==='pointerup'&&points.size===1&&!usedPinch&&getZoom()<=1.02&&Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5;
  points.delete(e.pointerId);if(points.size){begin();return}pan=null;pinch=null;
  if(swipe)turnPage(dx<0?1:-1);else if(zoomChanged)finishZoom();zoomChanged=false;
 }
 const handlers={pointerdown:down,pointermove:move,pointerup:end,pointercancel:end};
 for(const [type,handler]of Object.entries(handlers))view.addEventListener(type,handler);
 return ()=>{points.clear();for(const [type,handler]of Object.entries(handlers))view.removeEventListener(type,handler)};
}
