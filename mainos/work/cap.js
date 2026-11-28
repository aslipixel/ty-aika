const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const [,,out,...ts]=process.argv;fs.mkdirSync(out,{recursive:true});
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1920}});
p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto('http://localhost:8765/mainos/work/stage.html');await p.evaluate(()=>window.ready);
const list=ts.length?ts.map(Number):Array.from({length:360},(_,i)=>i/30);
for(let i=0;i<list.length;i++){await p.evaluate(t=>setT(t),list[i]);await p.screenshot({path:`${out}/${String(i).padStart(4,'0')}.${ts.length?'png':'jpg'}`,...(ts.length?{}:{type:'jpeg',quality:92})})}
await b.close()})();
