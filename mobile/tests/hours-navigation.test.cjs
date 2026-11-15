const {readFileSync}=require('node:fs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {randomUUID}=require('node:crypto');
const source=readFileSync(new URL('../../tuntix/tyontekija/index.html',`file://${__filename}`),'utf8');
function setup(){
 const fields={}; const handlers={};
 const c=vm.createContext({structuredClone,crypto:{randomUUID},console,fields,handlers,document:{activeElement:null},location:{hash:'#kalenteri'},history:{replaceState(a,b,hash){c.location.hash=hash}},addEventListener:(n,f)=>handlers[n]=f});
 vm.runInContext(`
 let S={en:[],pr:[{id:'p1',n:'Test',a:'Helsinki'}],last:{t:'',p:''}};
 let ed=null,dayEditing=false,ret=0,modalInputBaseline=[],lastRenderedRoute='kalenteri',projectDeleteMode=false;
 const selectedProjects=new Set(),ABS=['Loma'],DEFAULT_HOURS=8;
 let persisted=null,failSave=false,messages=[];
 const $=id=>fields[id]||null;
 const mk=d=>({d,t:'',p:'',h:8,c:''});
 const save=()=>{if(failSave)return false;persisted=JSON.stringify(S);return true};
 const toast=m=>messages.push(m),render=()=>{},confirm=()=>{throw Error('Unexpected discard prompt')};
 const pd=d=>new Date(d+'T12:00:00Z'),dk=d=>d.toISOString().slice(0,10),addD=(d,n)=>new Date(d.getTime()+n*86400000);
 function sheet(){for(const k of Object.keys(fields))delete fields[k];fields['#m .ov']={};fields['#fh']={value:String(ed.h)};fields['#fp']={value:ed.p};fields['#fc']={value:ed.c}}
 function closeSheet(){ed=null;for(const k of Object.keys(fields))delete fields[k]}
 function open(d){ed=mk(d);sheet()}
 `,c);
 const start=source.indexOf('function dayHasChanges(){'),end=source.indexOf('function closeSheet(){',start);
 vm.runInContext(source.slice(start,end),c);
 const syncStart=source.indexOf('function changeSheetDay(offset)'),syncEnd=source.indexOf('let dayEditing=false;',syncStart);
 vm.runInContext(source.slice(syncStart,syncEnd),c);
 const route=source.split('\n').find(s=>s.startsWith("addEventListener('hashchange'"));vm.runInContext(route,c);
 return code=>vm.runInContext(code,c);
}
test('next day, back, menu and restart preserve entered hours and comments',()=>{
 const run=setup();
 run("open('2026-11-15');ed.t='Laskutyö';fields['#fp'].value='p1';fields['#fh'].value='7.5';fields['#fc'].value='Roof work';changeSheetDay(1)");
 assert.equal(run('ed.d'),'2026-11-16');assert.equal(run('S.en.length'),1);
 run("ed.t='Laskutyö';fields['#fp'].value='p1';fields['#fh'].value='8';changeSheetDay(-1)");
 assert.equal(run('S.en.length'),2);assert.equal(run('S.en[0].h'),7.5);assert.equal(run('S.en[0].c'),'Roof work');
 run("ed={...S.en[0]};sheet();fields['#fh'].value='9';location.hash='#projektit';handlers.hashchange();S=JSON.parse(persisted)");
 assert.equal(run('ed'),null);assert.equal(run('S.en[0].h'),9);assert.equal(run('S.en.length'),2);
});
test('checkmark exit saves once; repeated exit does not duplicate entries',()=>{
 const run=setup();run("open('2026-11-15');ed.t='Loma'");
 assert.equal(run('allowSheetExit()'),true);assert.equal(run('allowSheetExit()'),true);assert.equal(run('S.en.length'),1);
});
test('invalid hours or missing project block navigation and preserve input',()=>{
 const run=setup();run("open('2026-11-15');ed.t='Laskutyö';fields['#fh'].value='7.5';changeSheetDay(1)");
 assert.equal(run('ed.d'),'2026-11-15');assert.equal(run('S.en.length'),0);
 run("fields['#fp'].value='p1';fields['#fh'].value='25';location.hash='#projektit';handlers.hashchange()");
 assert.equal(run('location.hash'),'#kalenteri');assert.equal(run("fields['#fh'].value"),'25');
});
test('storage failure rolls back state and keeps form for retry',()=>{
 const run=setup();run("open('2026-11-15');ed.t='Loma';failSave=true;changeSheetDay(1)");
 assert.equal(run('S.en.length'),0);assert.equal(run('ed.d'),'2026-11-15');
 run('failSave=false;changeSheetDay(1)');assert.equal(run('S.en.length'),1);
});
test('untouched day is not saved; daily total remains limited to 24 hours',()=>{
 const run=setup();run("open('2026-11-15');changeSheetDay(1)");assert.equal(run('S.en.length'),0);
 run("S.en.push({id:'existing',d:'2026-11-16',t:'Loma',p:'',h:20,c:''});ed.t='Loma';changeSheetDay(1)");
 assert.equal(run('ed.d'),'2026-11-16');assert.equal(run('S.en.length'),1);
});
