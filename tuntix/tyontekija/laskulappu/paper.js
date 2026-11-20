// Field coordinates and PDF layout from laskulappu_blank.html.
const LaskulappuPaper = (() => {
  const BG = new URL('blank.jpg', document.currentScript.src).href,
    W = 939,
    H = 1280;
  const SEC = {
    osa: ['Osamittaus', [22, 104, 168, 128]],
    loppu: ['Mittaus', [169, 104, 342, 128]],
    asnr: ['ASNR/O', [343, 92, 510, 127]],
    tyonro: ['Työnumero', [513, 92, 914, 119]],
    tilaaja: ['Tilaaja', [513, 121, 914, 146]],
    lasko: ['Laskutusosoite', [513, 148, 914, 198]],
    kalv: ['K-ALV 0%', [22, 129, 166, 162]],
    alv: ['ALV 24%', [22, 165, 166, 198]],
    kohde: ['Kohde', [168, 129, 510, 198]],
    merk: ['Tilaajan merkintä', [22, 203, 121, 988]],
    tyo: ['Työselitys', [123, 216, 511, 929]],
    tunnit: ['Laskutettavat tunnit', [123, 930, 511, 988]],
    maara: ['Määrä', [513, 216, 645, 988]],
    yks: ['Yksikkö', [646, 216, 667, 988]],
    euro: ['Euro', [668, 216, 755, 988]],
    yht: ['Yhteensä euro', [756, 216, 914, 988]],
    t10: ['Takuupvm 10 V', [22, 990, 511, 1027]],
    t2: ['Takuupvm 2 V', [22, 1028, 511, 1064]],
    paik: ['Paikka / Päiväys', [22, 1066, 291, 1102]],
    edu: ['Tilaajan edust. hyv.', [22, 1103, 291, 1176]],
    tj: ['Icopalin työnjohtaja', [22, 1177, 291, 1212]],
    lask: ['Laskutettu', [22, 1213, 291, 1249]],
    tt: ['Työntekijät', [293, 1066, 511, 1249]],
    huom: ['Huomautuksia', [513, 990, 914, 1249]],
  };
  const F = [],
    f = (id, sec, b, t) => F.push({ id, sec, b, t: t || 't' });
  f('osa', 'osa', [121, 108, 140, 127], 'c');
  f('loppu', 'loppu', [275, 108, 293, 127], 'c');
  f('asnr', 'asnr', [388, 100, 508, 125]);
  f('tyonro', 'tyonro', [590, 95, 912, 119]);
  f('tilaaja', 'tilaaja', [560, 123, 912, 145]);
  f('lasko1', 'lasko', [612, 150, 912, 171]);
  f('lasko2', 'lasko', [516, 175, 912, 197]);
  f('kalv', 'kalv', [75, 138, 164, 161]);
  f('alv', 'alv', [75, 174, 164, 197]);
  f('kohde1', 'kohde', [213, 141, 509, 162]);
  f('kohde2', 'kohde', [168, 165, 509, 197], 'm');
  const rh = (988 - 234) / 39,
    cols = [
      ['merk', 'merk', 25, 120],
      ['tyo', 'tyo', 123, 511],
      ['maara', 'maara', 514, 644],
      ['yks', 'yks', 647, 666],
      ['euro', 'euro', 669, 721],
      ['s1', 'euro', 724, 754],
      ['yht', 'yht', 757, 863],
      ['s2', 'yht', 867, 912],
    ];
  for (let r = 0; r < 39; r++)
    cols.forEach((c) => {
      let sec = c[1],
        x0 = c[2];
      if (c[0] == 'tyo' && r >= 36) {
        sec = 'tunnit';
        if (r == 36) x0 = 258;
      }
      f(c[0] + r, sec, [x0, 234 + r * rh + 1.5, c[3], 234 + (r + 1) * rh - 0.5]);
    });
  f('t10', 't10', [90, 1002, 476, 1025]);
  f('t2', 't2', [90, 1040, 484, 1064]);
  f('paikka', 'paik', [24, 1082, 178, 1101]);
  f('pvm', 'paik', [182, 1082, 290, 1101]);
  f('tj', 'tj', [24, 1190, 290, 1211]);
  f('lask', 'lask', [24, 1226, 290, 1248]);
  f('tt0', 'tt', [375, 1068, 510, 1084]);
  const ys = [1084, 1103, 1121, 1140, 1158, 1176, 1195, 1213, 1231, 1249];
  for (let i = 0; i < 9; i++) f('tt' + (i + 1), 'tt', [296, ys[i] + 1.5, 509, ys[i + 1] - 0.5]);
  f('huom', 'huom', [516, 1020, 912, 1246], 'm');
  const SIG = [24, 1116, 290, 1174];
  const num = (v) => {
    const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
    return isNaN(n) ? null : n;
  };
  function split(n) {
    const c = Math.round(n * 100);
    return [String(Math.floor(c / 100)), String(c % 100).padStart(2, '0')];
  }
  function values(S) {
    const v = S.v,
      o = {};
    [
      'osa',
      'loppu',
      'asnr',
      'tyonro',
      'tilaaja',
      'kalv',
      'alv',
      't10',
      't2',
      'paikka',
      'tj',
      'lask',
      'huom',
    ].forEach((k) => (o[k] = v[k]));
    // Existing drafts keep their original keys: kohde2 is the address.
    o.kohde1 = v.kohde2;
    o.kohde2 = v.kohde1;
    const la = (v.lasko || '').split('\n');
    o.lasko1 = la[0];
    o.lasko2 = la.slice(1).join(' ');
    if (v.pvm) {
      const p = v.pvm.split('-');
      o.pvm = p[2] + '.' + p[1] + '.' + p[0];
    }
    S.w.forEach((r, i) => {
      o['tyo' + i] = r.t.replace(/\n/g, ' ');
      o['maara' + i] = r.m;
      o['yks' + i] = r.u;
      o['merk' + i] = r.n;
      const p = num(r.p);
      if (p != null) {
        const s = split(p);
        o['euro' + i] = s[0];
        o['s1' + i] = s[1];
      }
      let y = num(r.y),
        m = num(r.m);
      if (y == null && p != null && m != null) y = p * m;
      if (y != null) {
        const s = split(y);
        o['yht' + i] = s[0];
        o['s2' + i] = s[1];
      }
    });
    S.h.forEach((r, j) => {
      o['tyo' + (36 + j)] = r.t;
      o['maara' + (36 + j)] = r.h;
    });
    S.tt.forEach((n, i) => (o['tt' + i] = n));
    return o;
  }
  function render(S) {
    return new Promise((res, reject) => {
      const im = new Image();
      im.onerror = reject;
      im.onload = () => {
        const k = 2,
          c = document.createElement('canvas');
        c.width = W * k;
        c.height = H * k;
        const x = c.getContext('2d');
        x.scale(k, k);
        x.drawImage(im, 0, 0, W, H);
        x.fillStyle = '#fefefe';
        Object.keys(SEC).forEach((s) => {
          if (S.hid[s]) {
            const b = SEC[s][1];
            x.fillRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
          }
        });
        x.fillStyle = '#0d1f5c';
        x.strokeStyle = '#0d1f5c';
        x.textBaseline = 'middle';
        x.font = '14px Helvetica,Arial,sans-serif';
        const V = values(S);
        F.forEach((d) => {
          if (S.hid[d.sec]) return;
          const v = V[d.id],
            b = d.b;
          if (!v) return;
          x.save();
          x.beginPath();
          x.rect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
          x.clip();
          if (d.t == 'c') {
            x.lineWidth = 2;
            x.beginPath();
            x.moveTo(b[0] + 3, b[1] + 3);
            x.lineTo(b[2] - 3, b[3] - 3);
            x.moveTo(b[2] - 3, b[1] + 3);
            x.lineTo(b[0] + 3, b[3] - 3);
            x.stroke();
          } else if (d.t == 'm') {
            let y = b[1] + 10;
            String(v)
              .split('\n')
              .forEach((p) => {
                let l = '';
                p.split(' ').forEach((w) => {
                  if (x.measureText(l + w).width > b[2] - b[0] - 6) {
                    x.fillText(l, b[0] + 3, y);
                    y += 17;
                    l = '';
                  }
                  l += w + ' ';
                });
                x.fillText(l, b[0] + 3, y);
                y += 17;
              });
          } else if (d.id === 'kohde1')
            x.fillText(v, b[0] + 3, (b[1] + b[3]) / 2 + 1, b[2] - b[0] - 6);
          else x.fillText(v, b[0] + 3, (b[1] + b[3]) / 2 + 1);
          x.restore();
        });
        if (S.sig && !S.hid.edu) {
          const s = new Image();
          s.onerror = reject;
          s.onload = () => {
            const r = Math.min((SIG[2] - SIG[0]) / s.width, (SIG[3] - SIG[1]) / s.height);
            x.drawImage(s, SIG[0], SIG[1], s.width * r, s.height * r);
            res(c);
          };
          s.src = S.sig;
        } else res(c);
      };
      im.src = BG;
    });
  }
  // `data` (optional, ASCII) is stored in its own stream so the editor can reopen the file.
  function pdfBytes(c, data = '') {
    const jb = Uint8Array.from(atob(c.toDataURL('image/jpeg', 0.92).split(',')[1]), (ch) =>
        ch.charCodeAt(0),
      ),
      en = new TextEncoder(),
      parts = [],
      off = [];
    let n = 0;
    const push = (s) => {
      const b = typeof s == 'string' ? en.encode(s) : s;
      parts.push(b);
      n += b.length;
    };
    const ob = (i, s) => {
      off[i] = n;
      push(i + ' 0 obj\n' + s + '\nendobj\n');
    };
    push('%PDF-1.4\n');
    ob(1, '<</Type/Catalog/Pages 2 0 R' + (data ? '/TuntixLaskulappu 6 0 R' : '') + '>>');
    ob(2, '<</Type/Pages/Kids[3 0 R]/Count 1>>');
    ob(
      3,
      '<</Type/Page/Parent 2 0 R/MediaBox[0 0 595.28 841.89]/Resources<</XObject<</I 4 0 R>>>>/Contents 5 0 R>>',
    );
    off[4] = n;
    push(
      '4 0 obj\n<</Type/XObject/Subtype/Image/Width ' +
        c.width +
        '/Height ' +
        c.height +
        '/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ' +
        jb.length +
        '>>\nstream\n',
    );
    push(jb);
    push('\nendstream\nendobj\n');
    const ct = 'q 595.28 0 0 841.89 0 0 cm /I Do Q';
    ob(5, '<</Length ' + ct.length + '>>\nstream\n' + ct + '\nendstream');
    if (data) ob(6, '<</Length ' + data.length + '>>\nstream\n' + data + '\nendstream');
    const count = data ? 7 : 6;
    const xr = n;
    push('xref\n0 ' + count + '\n0000000000 65535 f \n');
    for (let i = 1; i < count; i++) push(String(off[i]).padStart(10, '0') + ' 00000 n \n');
    push('trailer\n<</Size ' + count + '/Root 1 0 R>>\nstartxref\n' + xr + '\n%%EOF');
    const o = new Uint8Array(n);
    let p = 0;
    parts.forEach((b) => {
      o.set(b, p);
      p += b.length;
    });
    return o;
  }
  return { sections: SEC, render, pdfBytes };
})();
