const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const html=fs.readFileSync(require('node:path').resolve(__dirname,'../../tuntix/tyontekija/index.html'),'utf8');
test('calendar marks daily totals red only for multiple entries',()=>{
const src=html.slice(html.indexOf('function kalenteri(){'),html.indexOf('function projectDays(){'));
const d=new Date(),key=d=>d.toISOString().slice(0,10),today=key(d);const c=vm.createContext({Date,Math,S:{en:[],set:{goal:8,showWeekends:true}},wo:0,mo:0,H:()=>c.S.en.reduce((r,e)=>(r[e.d]=(r[e.d]||0)+e.h,r),{}),dk:key,mon:d=>{d=new Date(d);d.setDate(d.getDate()-(d.getDay()+6)%7);return d},addD:(d,n)=>new Date(d.getFullYear(),d.getMonth(),d.getDate()+n),wd:d=>(d.getDay()+6)%7,DN:Array(7).fill('day'),DL:Array(7).fill('day'),MO:Array(12).fill('month'),fd:key,fh:String,pad:String,wk:()=>1});vm.runInContext(src,c);
for(const hours of [[8],[6,2],[8,1]]){c.S.en=hours.map(h=>({d:today,h}));const out=vm.runInContext('kalenteri()',c);const month=out.match(new RegExp('data-d="'+today+'"><span>[^<]+</span><b class="([^"]*)">([^<]*)'));
assert.ok(month);assert.equal(month[1],hours.length>1?'multiple-entries':'');assert.equal(+month[2],hours.reduce((a,b)=>a+b,0));}
});
