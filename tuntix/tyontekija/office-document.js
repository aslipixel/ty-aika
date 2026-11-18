// Edit text and worksheet cells in the original package. Unedited parts, drawings,
// styles, headers, and page setup are copied into the downloaded document.
import { unzipSync, zipSync, strToU8, strFromU8 } from './vendor/formats/zip.mjs';
const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const x = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const xml = 'http://www.w3.org/XML/1998/namespace';
const nodes = (el, ns, local) => [...el.getElementsByTagNameNS(ns, local)];
const serialize = doc => strToU8(new XMLSerializer().serializeToString(doc));
const address = /^([A-Z]{1,3})([1-9]\d{0,6})$/;

function columnNumber(letters) {
  return [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
}
function columnName(n) {
  let name = '';
  while (n) { n--; name = String.fromCharCode(65 + n % 26) + name; n = Math.floor(n / 26); }
  return name;
}
function readXML(files, path) {
  const part = files[path];
  if (!part) throw Error('Asiakirjan rakenne ei ole tuettu.');
  const doc = new DOMParser().parseFromString(strFromU8(part), 'application/xml');
  if (doc.querySelector('parsererror')) throw Error('Asiakirjan rakenne on virheellinen.');
  return doc;
}
function resolvePart(base, target) {
  const url = new URL(target, 'https://package.invalid/' + base);
  if (url.origin !== 'https://package.invalid') throw Error('Tiedoston osa puuttuu.');
  return decodeURIComponent(url.pathname.slice(1));
}
function setWordText(p, value) {
  const parts = nodes(p, w, 't');
  if (!parts.length) {
    const run = p.ownerDocument.createElementNS(w, 'w:r');
    const text = p.ownerDocument.createElementNS(w, 'w:t');
    run.append(text); p.append(run); parts.push(text);
  }
  // Keep unchanged characters in their original formatting runs.
  const old = parts.map(node => node.textContent).join('');
  let start = 0, tail = 0;
  while (start < old.length && start < value.length && old[start] === value[start]) start++;
  while (tail < old.length-start && tail < value.length-start && old[old.length-tail-1] === value[value.length-tail-1]) tail++;
  const insert = value.slice(start, value.length-tail);
  let offset = 0, inserted = false;
  for (const part of parts) {
    const text = part.textContent, end = offset + text.length;
    const before = text.slice(0, Math.max(0, start-offset));
    const after = text.slice(Math.max(0, old.length-tail-offset));
    const take = !inserted && start <= end;
    part.textContent = before + (take ? insert : '') + after;
    if (take) inserted = true;
    if (/^\s|\s$/.test(part.textContent)) part.setAttributeNS(xml,'xml:space','preserve');
    offset = end;
  }
}

export async function openOfficeDocument(bytes, name, edits, persist) {
  const files = unzipSync(new Uint8Array(bytes));
  const word = /\.docx$/i.test(name);
  const mime = 'application/vnd.openxmlformats-officedocument.' + (word ? 'wordprocessingml.document' : 'spreadsheetml.sheet');
  const path = word ? 'word/document.xml' : 'xl/workbook.xml';
  const documentPart = readXML(files, path);
  const paragraphs = word ? nodes(documentPart, w, 'p') : [];
  const labels = paragraphs.map(p => nodes(p, w, 't').map(t => t.textContent).join(''));
  const changes = new Map(Object.entries(edits));
  let sheets = [], strings = [], sheetIndex = 0, firstRow = 1, firstCol = 1;
  const models = new Map();
  if (!word) {
    const relationships = readXML(files, 'xl/_rels/workbook.xml.rels');
    const links = [...relationships.documentElement.children];
    sheets = nodes(documentPart, x, 'sheet').flatMap(s => {
      const target = links.find(r => r.getAttribute('Id') === s.getAttributeNS(rel, 'id') && r.getAttribute('Type').endsWith('/worksheet'));
      return target ? [{ name: s.getAttribute('name'), path: resolvePart(path, target.getAttribute('Target')) }] : [];
    });
    if (!sheets.length) throw Error('Laskentataulukkoa ei löytynyt.');
    const shared = links.find(r => r.getAttribute('Type').endsWith('/sharedStrings'));
    if (shared) strings = nodes(readXML(files, resolvePart(path, shared.getAttribute('Target'))), x, 'si')
      .map(si => nodes(si, x, 't').map(n => n.textContent).join(''));
  }

  function model(index) {
    if (!models.has(index)) {
      const doc = readXML(files, sheets[index].path);
      const cells = new Map(nodes(doc,x,'c').map(c => [c.getAttribute('r'),c]));
      const merges = nodes(doc,x,'mergeCell').map(el => {
        const [a,b] = el.getAttribute('ref').split(':').map(v => address.exec(v));
        return a && b ? [columnNumber(a[1]),+a[2],columnNumber(b[1]),+b[2]] : null;
      }).filter(Boolean);
      models.set(index,{doc,cells,merges});
    }
    return models.get(index);
  }
  function originalCell(c) {
    if (!c) return '';
    const value = nodes(c,x,'v')[0]?.textContent || '';
    if (c.getAttribute('t') === 's') return strings[Number(value)] || '';
    if (c.getAttribute('t') === 'inlineStr') return nodes(c,x,'t').map(n=>n.textContent).join('');
    return value;
  }
  function update(key, value, old) {
    if (value === old) changes.delete(key); else changes.set(key, value);
    persist(Object.fromEntries(changes));
  }

  function draw(container) {
    if (word) {
      if (!paragraphs.length) { container.textContent = 'Ei tekstikappaleita.'; return; }
      const paragraphIds = new Map(paragraphs.map((p,i)=>[p,i]));
      function display(parent, dest) {
        for (const item of parent.children) {
          if (item.namespaceURI !== w) continue;
          if (item.localName === 'p') {
            const index = paragraphIds.get(item), key = String(index);
            const input = document.createElement('input');
            input.setAttribute('aria-label', 'Kappale ' + (index+1));
            input.placeholder = 'Kirjoita tekstiä'; input.value = changes.get(key) ?? labels[index];
            input.oninput = () => update(key, input.value, labels[index]); dest.append(input);
          } else if (['tbl','tr','tc'].includes(item.localName)) {
            const node = document.createElement(({tbl:'table',tr:'tr',tc:'td'})[item.localName]);
            display(item,node);dest.append(node);
          } else if (['body','sdt','sdtContent','customXml'].includes(item.localName)) display(item,dest);
        }
      }
      display(documentPart.documentElement,container);
    } else {
      const sheet = document.createElement('select');sheet.setAttribute('aria-label','Laskentataulukko');
      sheets.forEach((s,i)=>sheet.add(new Option(s.name,String(i))));sheet.value=String(sheetIndex);
      sheet.onchange=()=>{sheetIndex=Number(sheet.value);firstRow=firstCol=1;refresh();};
      const go=document.createElement('form');
      const position=document.createElement('input');position.setAttribute('aria-label','Solun osoite');position.value=columnName(firstCol)+firstRow;
      const button=document.createElement('button');button.className='btn sm doc-action';button.textContent='Siirry soluun';
      go.onsubmit=e=>{e.preventDefault();const a=address.exec(position.value.trim().toUpperCase());
        if (!a || columnNumber(a[1])>16384 || +a[2]>1048576) {toast('Anna solun osoite, esimerkiksi B12.');return;}
        firstCol=columnNumber(a[1]);firstRow=+a[2];refresh();};
      go.append(position,button);container.append(sheet,go);
      const scroll=document.createElement('div');scroll.className='office-scroll';
      const table=document.createElement('table');scroll.append(table);container.append(scroll);
      const {cells,merges}=model(sheetIndex), head=table.createTHead().insertRow();
      head.append(document.createElement('th'));
      for(let col=firstCol; col<firstCol+8 && col<=16384; col++) {
        const th=document.createElement('th');th.textContent=columnName(col);head.append(th);
      }
      const body=table.createTBody();
      for(let r=firstRow;r<firstRow+16 && r<=1048576;r++) {
        const row=body.insertRow(),th=document.createElement('th');th.textContent=r;row.append(th);
        for(let col=firstCol;col<firstCol+8 && col<=16384;col++) {
          const ref=columnName(col)+r, c=cells.get(ref), key=sheetIndex+':'+ref;
          const input=document.createElement('input');input.setAttribute('aria-label',ref);
          const old=originalCell(c);input.value=changes.get(key)??old;
          input.readOnly=!!(c && nodes(c,x,'f').length) || merges.some(([l,t,z,b])=>col>=l&&col<=z&&r>=t&&r<=b&&(r!==t||col!==l));
          if(c && nodes(c,x,'f').length)input.title='Kaava: '+nodes(c,x,'f')[0].textContent;
          input.oninput=()=>update(key,input.value,old);row.insertCell().append(input);
        }
      }
    }
    function refresh(){container.replaceChildren();draw(container);}
  }

  function setCell(doc, cells, ref, value) {
    const [, letters,rowNum] = address.exec(ref);
    let c = cells.get(ref);
    if (!c) {
      const sheetData=nodes(doc,x,'sheetData')[0],rows=[...sheetData.children];
      let row=rows.find(el=>el.getAttribute('r')===rowNum);
      if(!row){row=doc.createElementNS(x,'row');row.setAttribute('r',rowNum);
        sheetData.insertBefore(row,rows.find(el=>Number(el.getAttribute('r'))>Number(rowNum))||null);}
      c=doc.createElementNS(x,'c');c.setAttribute('r',ref);
      const next=[...row.children].find(el=>el.localName!=='c'||columnNumber(address.exec(el.getAttribute('r'))[1])>columnNumber(letters));
      row.insertBefore(c,next||null);cells.set(ref,c);
      // The dimension is optional; Excel will determine the expanded range.
      nodes(doc,x,'dimension')[0]?.remove();
    }
    const numeric=(!c.hasAttribute('t')||c.getAttribute('t')==='n') && /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value);
    for(const child of [...c.children]) if(['f','v','is'].includes(child.localName))child.remove();
    c.setAttribute('t',numeric?'n':'inlineStr');
    const el=doc.createElementNS(x,numeric?'v':'is');
    if(numeric)el.textContent=value;
    else{const t=doc.createElementNS(x,'t');t.setAttributeNS(xml,'xml:space','preserve');t.textContent=value;el.append(t);}
    c.insertBefore(el,c.firstChild);
  }

  const pictures = Object.keys(files).filter(path => /^(word|xl)\/media\/[^/]+\.(?:png|jpe?g|webp|bmp)$/i.test(path));
  const hasOnlyPicture = pictures.length === 1 && (word
    ? labels.every(label => !label.trim()) && !nodes(documentPart,w,'tbl').length
    : sheets.length === 1 && !model(0).cells.size);
  return {
    name,mime,
    save() { return persist(Object.fromEntries(changes)); },
    picture: hasOnlyPicture ? new File([files[pictures[0]]], pictures[0]) : null,
    view() {
      queueMicrotask(()=>{const container=document.getElementById('office-content');if(container)draw(container);});
      return '<section class="card"><h3>'+(word?'Muokkaa Word-asiakirjaa':'Muokkaa Excel-taulukkoa')+'</h3><div id="office-content"></div></section><button type="button" class="btn doc-action pri" data-office-download>Lataa muokattu tiedosto</button>';
    },
    bytes() {
      if(!changes.size)return bytes;
      const result={...files};
      if(word){
        const doc=readXML(files,path),ps=nodes(doc,w,'p');
        for(const [key,value] of changes) if(ps[Number(key)])setWordText(ps[Number(key)],value);
        result[path]=serialize(doc);
      }else{
        const modified=new Map();
        for(const [key,value] of changes){
          const [idx,ref]=key.split(':'),part=sheets[Number(idx)]?.path;
          if(!part||!address.test(ref))continue;
          if(!modified.has(part)){const doc=readXML(files,part);modified.set(part,{doc,cells:new Map(nodes(doc,x,'c').map(c=>[c.getAttribute('r'),c]))});}
          const {doc,cells}=modified.get(part);setCell(doc,cells,ref,value);
        }
        for(const [part,{doc}] of modified)result[part]=serialize(doc);
        const book=readXML(files,path);let calc=nodes(book,x,'calcPr')[0];
        if(!calc){calc=book.createElementNS(x,'calcPr');book.documentElement.append(calc);}
        calc.setAttribute('fullCalcOnLoad','1');result[path]=serialize(book);
      }
      return zipSync(result);
    }
  };
}
