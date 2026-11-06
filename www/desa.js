/* ===========================================================
   Desa Readlify — kampung kecil yang tumbuh dari sesi fokusmu.
   Konsepnya mirip Forest: sesi pomodoro menghasilkan koin, koin dipakai membangun desa (jalan,
   rumah, sawah, balai desa, dst.). Mode Fokus: koin penuh, tapi hangus kalau kamu keluar dari
   Readlify. Pomodoro biasa: boleh membuka aplikasi lain, tapi koinnya setengah dari Mode Fokus.
   Nggak ada penduduk, nggak ada yang "mati" kalau kamu gagal — sesi yang bocor cuma nggak
   menghasilkan koin. Desa endless: wilayah bisa diperluas terus, dan desa level naik terus.

   Bagian 1 = mesin gambar isometrik (satu gaya, satu palet, satu arah cahaya, jadi semua
              benda terasa satu dunia, bukan stiker yang ditempel).
   Bagian 2 = logika sesi/koin + tampilan (HUD, bar bangun, panel info).
=========================================================== */
(function (root) {
  'use strict';

  // ------------------------------------------------------------
  // 1) MESIN GAMBAR
  // ------------------------------------------------------------
  const HW = 32, HH = 16;                       // setengah lebar / tinggi petak isometrik
  const P = (gx, gy, h) => [(gx - gy) * HW, (gx + gy) * HH - (h || 0)];
  const LINE = 'rgba(58,40,42,0.26)';

  function hash(x, y, s) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul((s || 0) + 1, 2147483629)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mixCache = new Map();
  function mix(a, b, t) {
    const k = a + b + t;
    let v = mixCache.get(k);
    if (v) return v;
    const A = hexRgb(a), B = hexRgb(b);
    v = '#' + [0, 1, 2].map((i) => Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, '0')).join('');
    mixCache.set(k, v);
    return v;
  }
  // Cahaya dari kiri-atas: atap/atas paling terang, sisi kiri sedang, sisi kanan paling gelap.
  const tone = (c) => ({ top: mix(c, '#FFF3D6', 0.18), l: c, r: mix(c, '#3A2C38', 0.26) });

  function poly(c, pts, fill, line) {
    c.beginPath();
    for (let i = 0; i < pts.length; i++) i ? c.lineTo(pts[i][0], pts[i][1]) : c.moveTo(pts[i][0], pts[i][1]);
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (line) { c.strokeStyle = line; c.lineWidth = 1; c.lineJoin = 'round'; c.stroke(); }
  }
  function ell(c, x, y, rx, ry, fill) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); }

  // sisi dinding: faceY = dinding yang menghadap kiri-bawah (y tetap), faceX = menghadap kanan-bawah (x tetap)
  function faceY(c, y, x0, x1, z0, z1, col) { poly(c, [P(x0, y, z0), P(x1, y, z0), P(x1, y, z1), P(x0, y, z1)], col, LINE); }
  function faceX(c, x, y0, y1, z0, z1, col) { poly(c, [P(x, y0, z0), P(x, y1, z0), P(x, y1, z1), P(x, y0, z1)], col, LINE); }
  function topQuad(c, x0, y0, x1, y1, z, col, line) { poly(c, [P(x0, y0, z), P(x1, y0, z), P(x1, y1, z), P(x0, y1, z)], col, line === undefined ? LINE : line); }

  function box(c, gx, gy, w, d, z0, z1, col, noTop) {
    const t = tone(col);
    faceY(c, gy + d, gx, gx + w, z0, z1, t.l);
    faceX(c, gx + w, gy, gy + d, z0, z1, t.r);
    if (!noTop) topQuad(c, gx, gy, gx + w, gy + d, z1, t.top);
  }
  function shadow(c, gx, gy, w, d) {
    poly(c, [P(gx + 0.08, gy + 0.08, 0), P(gx + w + 0.3, gy + 0.08, 0), P(gx + w + 0.3, gy + d + 0.3, 0), P(gx + 0.08, gy + d + 0.3, 0)], 'rgba(46,52,34,0.17)');
  }
  // atap pelana, bubungan sejajar sumbu x
  function gable(c, gx, gy, w, d, z1, rh, col, wallCol, o) {
    o = o == null ? 0.1 : o;
    const t = tone(col), my = gy + d / 2, zr = z1 + rh;
    poly(c, [P(gx + w, gy, z1), P(gx + w, gy + d, z1), P(gx + w, my, zr)], mix(wallCol, '#3A2C38', 0.3), LINE);
    poly(c, [P(gx - o, gy - o, z1), P(gx + w + o, gy - o, z1), P(gx + w + o, my, zr), P(gx - o, my, zr)], t.top, LINE);
    poly(c, [P(gx - o, gy + d + o, z1), P(gx + w + o, gy + d + o, z1), P(gx + w + o, my, zr), P(gx - o, my, zr)], t.l, LINE);
    c.strokeStyle = t.r; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(...P(gx - o, my, zr)); c.lineTo(...P(gx + w + o, my, zr)); c.stroke();
  }
  // atap limas/joglo
  function hip(c, gx, gy, w, d, z1, rh, col, o) {
    o = o == null ? 0.1 : o;
    const t = tone(col), cx = gx + w / 2, cy = gy + d / 2, ap = P(cx, cy, z1 + rh);
    const a = [gx - o, gy - o], b = [gx + w + o, gy - o], e = [gx + w + o, gy + d + o], f = [gx - o, gy + d + o];
    const p = (q) => P(q[0], q[1], z1);
    poly(c, [p(a), p(b), ap], t.top, LINE);
    poly(c, [p(a), p(f), ap], mix(t.top, t.l, 0.5), LINE);
    poly(c, [p(f), p(e), ap], t.l, LINE);
    poly(c, [p(b), p(e), ap], t.r, LINE);
  }
  function post(c, x, y, z0, z1, col, wd) { box(c, x - (wd || 0.035), y - (wd || 0.035), (wd || 0.035) * 2, (wd || 0.035) * 2, z0, z1, col); }
  function windowY(c, y, x0, x1, z0, z1) {
    faceY(c, y, x0, x1, z0, z1, '#CFE2E3');
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(...P((x0 + x1) / 2, y, z0)); c.lineTo(...P((x0 + x1) / 2, y, z1)); c.stroke();
  }
  function windowX(c, x, y0, y1, z0, z1) { faceX(c, x, y0, y1, z0, z1, '#A9C2C6'); }

  // ---------- palet (selaras dengan sage / clay / honey Readlify) ----------
  const COL = {
    wood: '#C29A6B', plank: '#CDAA7C', brick: '#D49A80', cream: '#EFE6D2', sage: '#9DB68E', ochre: '#E0BE80',
    roofRed: '#B5604B', roofClay: '#C9774F', roofThatch: '#CBAA5E', roofGrey: '#76828C', roofGreen: '#5E8F6B',
    door: '#6E4B3A', stone: '#B9B2A4', water: '#86B8BC', soil: '#8D6B4B', dirt: '#D2BC94', bamboo: '#C4A66E',
  };
  const WALLS = [COL.cream, COL.sage, COL.ochre, '#E4C9B6'];
  const ROOFS = [COL.roofRed, COL.roofClay, COL.roofGrey];

  // ---------- pepohonan ----------
  function shadowEll(c, x, y, rx) { ell(c, x + 3, y + 1, rx, rx * 0.46, 'rgba(46,52,34,0.18)'); }
  function drawCanopy(c, x, y, r, col) {
    ell(c, x + r * 0.18, y + r * 0.22, r, r * 0.9, mix(col, '#2C3A2A', 0.34));
    ell(c, x, y, r, r * 0.92, col);
    ell(c, x - r * 0.28, y - r * 0.3, r * 0.58, r * 0.46, mix(col, '#F4F0B8', 0.28));
  }
  function tree(c, gx, gy, kind, t, seed) {
    const [x, y] = P(gx + 0.5, gy + 0.5, 0);
    const sw = Math.sin(t / 900 + (gx + gy)) * 0.6;
    shadowEll(c, x, y, 12);
    if (kind === 'kelapa') {
      c.strokeStyle = '#8F6B49'; c.lineWidth = 4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 6, y - 22, x + 3 + sw, y - 44); c.stroke();
      c.strokeStyle = '#6F4F36'; c.lineWidth = 1;
      for (let i = 1; i < 6; i++) { c.beginPath(); c.moveTo(x + i * 0.6 - 2, y - i * 7); c.lineTo(x + i * 0.6 + 2, y - i * 7); c.stroke(); }
      const tx = x + 3 + sw, ty = y - 44, g = '#5E8F55';
      [[-1, -0.1], [-0.7, -0.9], [0, -1.1], [0.7, -0.9], [1, -0.1], [-0.55, 0.45], [0.55, 0.45]].forEach(([dx, dy], i) => {
        c.strokeStyle = i % 2 ? g : mix(g, '#2C3A2A', 0.2); c.lineWidth = 3.2;
        c.beginPath(); c.moveTo(tx, ty);
        c.quadraticCurveTo(tx + dx * 12, ty + dy * 12 - 7, tx + dx * 22 + sw, ty + dy * 14 + 6); c.stroke();
      });
      ell(c, tx - 2, ty + 3, 2.6, 2.6, '#7A5A33'); ell(c, tx + 3, ty + 4, 2.6, 2.6, '#8A683B');
      return;
    }
    c.fillStyle = '#7A5A3E'; c.fillRect(x - 2.2, y - 14, 4.4, 14);
    c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(x + 0.2, y - 14, 2, 14);
    const base = kind === 'mangga' ? '#5F9560' : ['#6B9A5E', '#5C8C58', '#789F5F'][Math.floor((seed || 0) * 3) % 3];
    drawCanopy(c, x - 5, y - 23 + sw * 0.3, 10, mix(base, '#2C3A2A', 0.12));
    drawCanopy(c, x + 6, y - 24 + sw * 0.3, 9, base);
    drawCanopy(c, x, y - 31 + sw * 0.4, 11.5, mix(base, '#F4F0B8', 0.06));
    if (kind === 'mangga') { ell(c, x - 6, y - 24, 1.7, 2.2, '#E7A243'); ell(c, x + 7, y - 28, 1.7, 2.2, '#E7A243'); ell(c, x + 1, y - 19, 1.7, 2.2, '#D98C3A'); }
  }
  function bush(c, gx, gy, seed) {
    const [x, y] = P(gx + 0.3 + seed * 0.4, gy + 0.4 + (1 - seed) * 0.3, 0);
    shadowEll(c, x, y, 8);
    drawCanopy(c, x, y - 5, 7, mix('#6E9A5E', '#9DB06A', seed));
  }
  function rock(c, gx, gy, seed) {
    const [x, y] = P(gx + 0.5, gy + 0.5, 0);
    shadowEll(c, x, y + 1, 7);
    ell(c, x, y - 3, 6.5, 4.6, '#A39E92'); ell(c, x - 1.5, y - 4.4, 3.8, 2.4, '#C4BFB2');
  }
  function flowers(c, gx, gy, seed, t) {
    for (let i = 0; i < 7; i++) {
      const fx = gx + 0.18 + hash(gx, gy, 20 + i) * 0.64, fy = gy + 0.18 + hash(gx, gy, 40 + i) * 0.64;
      const [x, y] = P(fx, fy, 0), s = Math.sin(t / 700 + i + gx) * 0.8;
      c.strokeStyle = '#5E8A50'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x, y); c.lineTo(x + s * 0.4, y - 6); c.stroke();
      const col = ['#E8A0A0', '#F2D27A', '#F4F0E4', '#C9A0D8', '#EFAE7A'][Math.floor(hash(gx, gy, 60 + i) * 5)];
      ell(c, x + s * 0.4, y - 7, 2.6, 2.3, col); ell(c, x + s * 0.4, y - 7, 0.9, 0.9, '#E0A23A');
    }
  }

  function pine(c, gx, gy, seed) {
    const [x, y] = P(gx + 0.5, gy + 0.5, 0);
    shadowEll(c, x, y, 10);
    c.fillStyle = '#6E4F38'; c.fillRect(x - 2, y - 8, 4, 8);
    const g = ['#4F7A62', '#47705A', '#587F68'][Math.floor(seed * 3) % 3];
    for (let i = 0; i < 3; i++) {
      const w = 14 - i * 3.5, yy = y - 7 - i * 10;
      poly(c, [[x - w, yy], [x, yy], [x, yy - 16]], mix(g, '#F4F0B8', 0.12), null);
      poly(c, [[x, yy], [x + w, yy], [x, yy - 16]], mix(g, '#2C3A2A', 0.3), null);
    }
  }
  // isi hutan liar di luar wilayah desa (statis, jadi aman di-cache)
  function wildKind(gx, gy, biome) {
    const h = hash(gx, gy, 3);
    if (biome === 'tinggi') return h < 0.36 ? 'cemara' : h < 0.46 ? 'bush' : h < 0.56 ? 'rock' : null;
    if (biome === 'pesisir') return h < 0.12 ? 'kelapa' : h < 0.2 ? 'bush' : h < 0.27 ? 'rock' : null;
    return h < 0.34 ? 'tree' : h < 0.44 ? 'bush' : h < 0.49 ? 'rock' : null;
  }
  function wildDraw(c, gx, gy, kind, seed) {
    const h = seed != null ? seed : hash(gx, gy, 17);
    if (kind === 'tree') tree(c, gx, gy, 'bg', 0, h);
    else if (kind === 'cemara') pine(c, gx, gy, h);
    else if (kind === 'kelapa') tree(c, gx, gy, 'kelapa', 0, h);
    else if (kind === 'bush') bush(c, gx, gy, h);
    else rock(c, gx, gy, h);
  }

  // ---------- tanah, jalan, sawah, kebun, kolam ----------
  // Biome = warna tanah + isi hutan liar di luar wilayah desa.
  const BIOME = {
    hijau:   { name: 'Dataran hijau',  village: 'Village Hijau',          inside: ['#ABC090', '#A3BA89', '#B2C697'], outside: ['#8DA678', '#859F72', '#93AC7D'], tuft: '#5E7F4E', bg: '#8DA678' },
    tinggi:  { name: 'Dataran tinggi', village: 'Village Dataran Tinggi', inside: ['#B3C7A8', '#AABFA0', '#BBCFB0'], outside: ['#8EA593', '#869E8C', '#96AD9B'], tuft: '#587A62', bg: '#8EA593' },
    pesisir: { name: 'Pesisir',        village: 'Village Pesisir',        inside: ['#DDD0A3', '#D6C99B', '#E3D7AC'], outside: ['#C9BC90', '#C1B488', '#CFC297'], tuft: '#A89B6E', bg: '#C9BC90' },
  };
  function ground(c, gx, gy, inside, biome) {
    const B = BIOME[biome] || BIOME.hijau, h = hash(gx, gy, 1);
    const pal = inside ? B.inside : B.outside;
    const col = pal[Math.floor(h * 3) % 3];
    const pts = [P(gx, gy, 0), P(gx + 1, gy, 0), P(gx + 1, gy + 1, 0), P(gx, gy + 1, 0)];
    poly(c, pts, col, null);
    c.strokeStyle = col; c.lineWidth = 1.2; c.stroke();   // tutup celah antar petak
    if (h > 0.55) {
      c.strokeStyle = mix(col, B.tuft, 0.45); c.lineWidth = 1.1;
      c.beginPath();
      for (let i = 0; i < 3; i++) {
        const [x, y] = P(gx + 0.2 + hash(gx, gy, 5 + i) * 0.6, gy + 0.2 + hash(gx, gy, 9 + i) * 0.6, 0);
        c.moveTo(x - 1.5, y); c.lineTo(x - 0.5, y - 3.5); c.moveTo(x + 1.5, y); c.lineTo(x + 0.5, y - 3.2);
      }
      c.stroke();
    }
  }
  function road(c, gx, gy, nb) {
    const cx = gx + 0.5, cy = gy + 0.5, wdt = 0.2;
    const arms = [];
    if (nb.xp) arms.push([cx, cy, gx + 1, cy]); if (nb.xm) arms.push([gx, cy, cx, cy]);
    if (nb.yp) arms.push([cx, cy, cx, gy + 1]); if (nb.ym) arms.push([cx, gy, cx, cy]);
    const pass = (w, col) => {
      topQuad(c, cx - w, cy - w, cx + w, cy + w, 0, col, null);
      arms.forEach(([x0, y0, x1, y1]) => {
        if (y0 === y1) topQuad(c, Math.min(x0, x1), cy - w, Math.max(x0, x1), cy + w, 0, col, null);
        else topQuad(c, cx - w, Math.min(y0, y1), cx + w, Math.max(y0, y1), 0, col, null);
      });
    };
    pass(wdt + 0.06, '#B9A67F'); pass(wdt, COL.dirt); pass(wdt - 0.08, '#DCC9A4');
    for (let i = 0; i < 3; i++) {
      const [x, y] = P(gx + 0.3 + hash(gx, gy, 70 + i) * 0.4, gy + 0.3 + hash(gx, gy, 80 + i) * 0.4, 0);
      ell(c, x, y, 1.4, 0.8, 'rgba(140,120,90,0.45)');
    }
  }
  function bunds(c, gx, gy, nb, col) {
    const w = 0.07, t = tone(col);
    if (!nb.ym) topQuad(c, gx, gy, gx + 1, gy + w, 0.6, t.top, null);
    if (!nb.xm) topQuad(c, gx, gy, gx + w, gy + 1, 0.6, t.top, null);
    if (!nb.yp) { topQuad(c, gx, gy + 1 - w, gx + 1, gy + 1, 0.6, t.l, null); }
    if (!nb.xp) { topQuad(c, gx + 1 - w, gy, gx + 1, gy + 1, 0.6, t.r, null); }
  }
  function sawah(c, gx, gy, nb, t) {
    const stage = Math.floor(((t / 5400000) + hash(gx >> 1, gy >> 1, 3) * 4) % 4); // ganti fase tiap beberapa jam
    topQuad(c, gx, gy, gx + 1, gy + 1, 0, stage === 0 ? '#8FB1A8' : '#8A7A52', null);
    if (stage === 0) { c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1; const [x, y] = P(gx + 0.5 + Math.sin(t / 1100 + gx) * 0.15, gy + 0.5, 0); c.beginPath(); c.ellipse(x, y, 7, 3, 0, 0, 6.3); c.stroke(); }
    else {
      const hgt = stage === 1 ? 3.5 : stage === 2 ? 6 : 7;
      c.strokeStyle = ['', '#8DBB62', '#6FA64F', '#D6B85A'][stage]; c.lineWidth = 1.6; c.lineCap = 'round';
      c.beginPath();                                           // satu path per petak: jauh lebih ringan
      for (let r = 0; r < 4; r++) for (let k = 0; k < 5; k++) {
        const fx = gx + 0.1 + k * 0.2 + (r % 2) * 0.05, fy = gy + 0.14 + r * 0.24;
        const [x, y] = P(fx, fy, 0), s = Math.sin(t / 650 + fx * 3 + fy * 2) * 1.2;
        c.moveTo(x, y); c.lineTo(x + s, y - hgt); c.moveTo(x, y); c.lineTo(x - 1.4 + s * 0.7, y - hgt + 0.8); c.moveTo(x, y); c.lineTo(x + 1.6 + s * 0.7, y - hgt + 0.8);
      }
      c.stroke();
    }
    bunds(c, gx, gy, nb, '#B59C6B');
  }
  function kebun(c, gx, gy, nb, t) {
    topQuad(c, gx, gy, gx + 1, gy + 1, 0, '#8A6A4C', null);
    for (let r = 0; r < 4; r++) {
      const fy = gy + 0.17 + r * 0.22;
      topQuad(c, gx + 0.06, fy - 0.045, gx + 0.94, fy + 0.045, 0.4, '#755639', null);
      for (let k = 0; k < 4; k++) {
        const [x, y] = P(gx + 0.17 + k * 0.22, fy, 0.4), s = Math.sin(t / 800 + k + r) * 0.6;
        const isC = hash(gx + k, gy + r, 7) > 0.55;
        ell(c, x + s, y - 3.5, 3.1, 2.7, isC ? '#74A85A' : '#6C9F55'); ell(c, x + s - 0.8, y - 4.3, 1.6, 1.3, '#9CC47A');
        if (isC) ell(c, x + s + 1.6, y - 2.4, 1.1, 1.1, '#D9604A');
      }
    }
    bunds(c, gx, gy, nb, '#9B7B55');
  }
  function kolam(c, gx, gy, nb, t) {
    const w = 0.09;
    topQuad(c, gx, gy, gx + 1, gy + 1, 0, '#A8A07E', null);
    topQuad(c, gx + (nb.xm ? 0 : w), gy + (nb.ym ? 0 : w), gx + 1 - (nb.xp ? 0 : w), gy + 1 - (nb.yp ? 0 : w), 0.4, COL.water, null);
    c.save(); c.beginPath();
    const pts = [P(gx, gy, 0.4), P(gx + 1, gy, 0.4), P(gx + 1, gy + 1, 0.4), P(gx, gy + 1, 0.4)];
    pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.clip();
    c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 1;
    for (let i = 0; i < 2; i++) {
      const ph = ((t / 2400 + i * 0.5 + hash(gx, gy, 2)) % 1);
      const [x, y] = P(gx + 0.5, gy + 0.5, 0.4); c.globalAlpha = 1 - ph; c.beginPath(); c.ellipse(x, y, 4 + ph * 16, 2 + ph * 8, 0, 0, 6.3); c.stroke();
    }
    c.globalAlpha = 1;
    const fa = t / 1500 + hash(gx, gy, 4) * 6;
    const [fx, fy] = P(gx + 0.5 + Math.cos(fa) * 0.28, gy + 0.5 + Math.sin(fa) * 0.28, 0.4);
    ell(c, fx, fy - 1, 3.2, 1.6, '#E88C4A'); ell(c, fx - Math.cos(fa) * 3, fy - 1, 1.5, 1.1, '#E88C4A');
    c.restore();
  }

  // ---------- bangunan ----------
  function rumah(c, gx, gy, lv, t, seed) {
    const wall = lv >= 2 ? (seed > 0.5 ? '#E2B9A0' : COL.brick) : (seed > 0.5 ? COL.plank : COL.wood);
    const roof = lv >= 3 ? COL.roofGrey : ROOFS[Math.floor(seed * 3) % 2];
    const x0 = gx + 0.17, y0 = gy + 0.2, w = 0.66, d = 0.58, hh = lv >= 3 ? 30 : 17;
    shadow(c, x0, y0, w, d);
    if (lv >= 2) { box(c, x0 + 0.05, y0 + d, 0.36, 0.17, 0, 3, '#C9BFAE'); post(c, x0 + 0.08, y0 + d + 0.15, 3, 15, '#E8DCC4'); post(c, x0 + 0.38, y0 + d + 0.15, 3, 15, '#E8DCC4'); }
    box(c, x0, y0, w, d, 0, hh, wall);
    if (lv >= 3) box(c, x0 + w, y0 + 0.12, 0.22, 0.34, 0, 14, mix(wall, '#FFF3D6', 0.1));
    faceY(c, y0 + d, x0 + 0.1, x0 + 0.22, 0, 10, COL.door);
    windowY(c, y0 + d, x0 + 0.34, x0 + 0.54, 6.5, 12.5);
    windowX(c, x0 + w, y0 + 0.14, y0 + 0.32, 6.5, 12.5);
    if (lv >= 3) { windowY(c, y0 + d, x0 + 0.12, x0 + 0.26, 19, 26); windowY(c, y0 + d, x0 + 0.38, x0 + 0.52, 19, 26); windowX(c, x0 + w, y0 + 0.14, y0 + 0.32, 19, 26); }
    if (lv >= 2) { box(c, x0 + 0.46, y0 + 0.08, 0.1, 0.1, hh, hh + 12, '#B9604B'); }
    gable(c, x0, y0, w, d, hh, lv >= 3 ? 13 : 11, roof, wall, 0.11);
  }
  function rumahSmoke(c, gx, gy, lv, t) {
    if (lv < 2) return;
    const hh = lv >= 3 ? 30 : 17, [sx, sy] = P(gx + 0.17 + 0.5, gy + 0.2 + 0.13, hh + 12), ph = (t / 1800) % 1;
    ell(c, sx + ph * 5, sy - ph * 12, 2 + ph * 3, 2 + ph * 3, `rgba(240,236,228,${0.5 * (1 - ph)})`);
  }
  function lumbung(c, gx, gy, lv) {
    const x0 = gx + 0.2, y0 = gy + 0.2, w = 0.6, d = 0.6;
    shadow(c, x0, y0, w, d);
    [[x0 + 0.06, y0 + 0.06], [x0 + w - 0.06, y0 + 0.06], [x0 + 0.06, y0 + d - 0.06], [x0 + w - 0.06, y0 + d - 0.06]].forEach((p) => post(c, p[0], p[1], 0, 9, '#8F6B49', 0.04));
    box(c, x0 - 0.02, y0 - 0.02, w + 0.04, d + 0.04, 9, 23, '#C6A06E');
    for (let i = 1; i < 4; i++) { c.strokeStyle = 'rgba(80,55,35,0.25)'; c.beginPath(); c.moveTo(...P(x0 - 0.02, y0 + d + 0.02, 9 + i * 3.5)); c.lineTo(...P(x0 + w + 0.02, y0 + d + 0.02, 9 + i * 3.5)); c.stroke(); }
    faceY(c, y0 + d + 0.02, x0 + 0.22, x0 + 0.38, 11, 18, '#6E4B3A');
    hip(c, x0 - 0.02, y0 - 0.02, w + 0.04, d + 0.04, 23, lv >= 2 ? 22 : 18, COL.roofThatch, 0.14);
  }
  function gardu(c, gx, gy) {
    const x0 = gx + 0.2, y0 = gy + 0.2, w = 0.6, d = 0.6;
    shadow(c, x0, y0, w, d);
    [[x0 + 0.04, y0 + 0.04], [x0 + w - 0.04, y0 + 0.04], [x0 + 0.04, y0 + d - 0.04], [x0 + w - 0.04, y0 + d - 0.04]].forEach((p) => post(c, p[0], p[1], 0, 24, '#8F6B49', 0.035));
    box(c, x0, y0, w, d, 8, 10, '#BF9A6A');
    hip(c, x0, y0, w, d, 24, 13, COL.roofRed, 0.14);
    const [kx, ky] = P(x0 + 0.18, y0 + d - 0.12, 15); ell(c, kx, ky, 2.6, 6, '#7C5A3C');
  }
  function warung(c, gx, gy, t) {
    const x0 = gx + 0.15, y0 = gy + 0.2, w = 0.7, d = 0.5;
    shadow(c, x0, y0, w, d);
    box(c, x0, y0, w, d, 0, 16, COL.plank);
    faceY(c, y0 + d, x0 + 0.08, x0 + 0.62, 5, 12, '#5E463A');
    box(c, x0 + 0.04, y0 + d, 0.62, 0.1, 0, 5, '#A98258');
    const o = 0.14, zA = 15, zB = 22, n = 6, wA = (w + 0.1) / n;
    for (let i = 0; i < n; i++) {
      const xa = x0 - 0.05 + i * wA, xb = xa + wA, col = i % 2 ? '#F1E9D8' : '#CB6A52';
      poly(c, [P(xa, y0 + d + o, zA), P(xb, y0 + d + o, zA), P(xb, y0 + 0.05, zB), P(xa, y0 + 0.05, zB)], col, LINE);
    }
    c.fillStyle = 'rgba(0,0,0,0.0)';
    [['#D9604A', 0.2], ['#E3B04F', 0.34], ['#7FA85A', 0.48]].forEach(([col, off]) => { const [x, y] = P(x0 + off, y0 + d + 0.05, 5.8); ell(c, x, y - 1.6, 2.1, 2.1, col); });
  }
  function posyandu(c, gx, gy) {
    const x0 = gx + 0.16, y0 = gy + 0.2, w = 0.68, d = 0.6;
    shadow(c, x0, y0, w, d);
    box(c, x0, y0, w, d, 0, 18, '#F1ECE0');
    faceY(c, y0 + d, x0 + 0.08, x0 + 0.2, 0, 10, '#6E8F8A');
    const cxm = x0 + 0.46;
    faceY(c, y0 + d, cxm - 0.045, cxm + 0.045, 6, 15, '#6FA98F'); faceY(c, y0 + d, cxm - 0.13, cxm + 0.13, 9.2, 11.8, '#6FA98F');
    windowX(c, x0 + w, y0 + 0.15, y0 + 0.33, 7, 13);
    gable(c, x0, y0, w, d, 18, 10, COL.roofGreen, '#F1ECE0', 0.1);
  }
  function sumur(c, gx, gy) {
    const [x, y] = P(gx + 0.5, gy + 0.5, 0);
    shadowEll(c, x, y, 11);
    c.fillStyle = '#9F998C'; c.beginPath(); c.ellipse(x, y - 8, 9, 4.6, 0, 0, 6.3); c.fill();
    c.fillStyle = '#B9B2A4'; c.fillRect(x - 9, y - 8, 18, 8); c.beginPath(); c.ellipse(x, y, 9, 4.6, 0, 0, Math.PI); c.fill();
    c.fillStyle = '#CFC8B8'; c.beginPath(); c.ellipse(x, y - 8, 9, 4.6, 0, 0, 6.3); c.fill();
    c.fillStyle = '#4C7C84'; c.beginPath(); c.ellipse(x, y - 8, 6.2, 3, 0, 0, 6.3); c.fill();
    c.strokeStyle = '#7A5A3E'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(x - 8, y - 8); c.lineTo(x - 8, y - 26); c.moveTo(x + 8, y - 8); c.lineTo(x + 8, y - 26); c.moveTo(x - 9, y - 26); c.lineTo(x + 9, y - 26); c.stroke();
    c.strokeStyle = '#6F5A44'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y - 26); c.lineTo(x, y - 17); c.stroke(); ell(c, x, y - 15, 2.4, 2.2, '#8F6B49');
  }
  function lampu(c, gx, gy, t, night) {
    const [x, y] = P(gx + 0.5, gy + 0.5, 0);
    shadowEll(c, x, y, 5);
    c.strokeStyle = '#5E5650'; c.lineWidth = 2.2; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 30); c.quadraticCurveTo(x, y - 34, x + 4, y - 34); c.stroke();
    if (night) { const g = c.createRadialGradient(x + 4, y - 31, 1, x + 4, y - 31, 26); g.addColorStop(0, 'rgba(255,224,150,0.7)'); g.addColorStop(1, 'rgba(255,224,150,0)'); c.fillStyle = g; c.fillRect(x - 24, y - 58, 56, 56); }
    ell(c, x + 4, y - 31, 3.4, 2.8, night ? '#FFE9A8' : '#EFE6C8');
  }
  function bendera(c, gx, gy, t) {
    const [x, y] = P(gx + 0.5, gy + 0.5, 0);
    shadowEll(c, x, y, 6);
    box(c, gx + 0.4, gy + 0.4, 0.2, 0.2, 0, 3, '#B8B1A2');
    c.strokeStyle = '#E9E4DA'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y - 3); c.lineTo(x, y - 52); c.stroke();
    ell(c, x, y - 53, 1.8, 1.8, '#E3B04F');
    for (let i = 0; i < 2; i++) {
      c.fillStyle = i ? '#F4EFE6' : '#CC4B3F'; c.beginPath();
      const y0 = y - 50 + i * 5;
      c.moveTo(x, y0);
      for (let k = 0; k <= 8; k++) c.lineTo(x + k * 2.5, y0 + Math.sin(t / 260 + k * 0.7) * 1.4);
      for (let k = 8; k >= 0; k--) c.lineTo(x + k * 2.5, y0 + 5 + Math.sin(t / 260 + k * 0.7) * 1.4);
      c.closePath(); c.fill();
    }
  }
  function kandang(c, gx, gy, t) {
    topQuad(c, gx + 0.04, gy + 0.04, gx + 0.96, gy + 0.96, 0, '#B8A57A', null);
    const f = (x0, y0, x1, y1) => { c.strokeStyle = COL.bamboo; c.lineWidth = 1.6; c.beginPath(); c.moveTo(...P(x0, y0, 7)); c.lineTo(...P(x1, y1, 7)); c.moveTo(...P(x0, y0, 3.5)); c.lineTo(...P(x1, y1, 3.5)); c.stroke(); };
    f(gx + 0.04, gy + 0.04, gx + 0.96, gy + 0.04); f(gx + 0.04, gy + 0.04, gx + 0.04, gy + 0.96);
    box(c, gx + 0.1, gy + 0.1, 0.34, 0.34, 0, 11, '#C99D68');
    gable(c, gx + 0.1, gy + 0.1, 0.34, 0.34, 11, 7, COL.roofClay, '#C99D68', 0.07);
    for (let i = 0; i < 3; i++) {
      const ph = t / 700 + i * 2.1, fx = gx + 0.55 + hash(gx, gy, i) * 0.3 + Math.sin(ph * 0.4) * 0.05, fy = gy + 0.5 + i * 0.14;
      const [x, y] = P(fx, fy, 0), peck = Math.max(0, Math.sin(ph * 2)) * 2;
      ell(c, x, y - 3 + peck * 0.4, 3.4, 2.6, i === 1 ? '#EFE2C8' : '#F6F1E8'); ell(c, x + 2.6, y - 5 + peck, 1.6, 1.6, i === 1 ? '#EFE2C8' : '#F6F1E8'); ell(c, x + 2.6, y - 6.5 + peck, 0.9, 0.7, '#D9604A');
    }
    f(gx + 0.96, gy + 0.04, gx + 0.96, gy + 0.96); f(gx + 0.04, gy + 0.96, gx + 0.96, gy + 0.96);
  }
  function surau(c, gx, gy) {
    const x0 = gx + 0.2, y0 = gy + 0.25, w = 1.45, d = 1.35;
    shadow(c, x0, y0, w, d);
    box(c, x0, y0, w, d, 0, 22, '#F0E9D8');
    for (let i = 0; i < 3; i++) windowY(c, y0 + d, x0 + 0.2 + i * 0.4, x0 + 0.42 + i * 0.4, 8, 17);
    faceY(c, y0 + d, x0 + 1.1, x0 + 1.3, 0, 13, '#5F7F6E');
    windowX(c, x0 + w, y0 + 0.3, y0 + 0.55, 8, 17); windowX(c, x0 + w, y0 + 0.8, y0 + 1.05, 8, 17);
    hip(c, x0, y0, w, d, 22, 16, COL.roofGreen, 0.12);
    const [dx, dy] = P(x0 + w / 2, y0 + d / 2, 38); ell(c, dx, dy - 1, 8.5, 7, '#E6D8A8'); ell(c, dx - 2, dy - 3, 4.5, 3.4, '#F6EBC6'); ell(c, dx, dy - 9, 1.4, 2.4, '#E3B04F');
    box(c, x0 + w - 0.02, y0 + d - 0.22, 0.26, 0.26, 0, 52, '#F0E9D8');
    hip(c, x0 + w - 0.04, y0 + d - 0.24, 0.3, 0.3, 52, 11, COL.roofGreen, 0.03);
    ell(c, ...P(x0 + w + 0.11, y0 + d - 0.09, 66), 1.4, 1.4, '#E3B04F');
  }
  function balai(c, gx, gy, t) {
    const x0 = gx + 0.15, y0 = gy + 0.3, w = 1.7, d = 1.1;
    shadow(c, x0, y0, w, d);
    box(c, x0, y0, w, d, 0, 20, '#EFE4CB');
    box(c, x0 + 0.1, y0 + d, w - 0.2, 0.24, 0, 3, '#CFC5B0');
    for (let i = 0; i < 6; i++) post(c, x0 + 0.16 + i * ((w - 0.32) / 5), y0 + d + 0.2, 3, 19, '#F4EDDA', 0.04);
    faceY(c, y0 + d, x0 + w / 2 - 0.12, x0 + w / 2 + 0.12, 0, 12, COL.door);
    for (let i = 0; i < 2; i++) { windowY(c, y0 + d, x0 + 0.25 + i * 0.28, x0 + 0.45 + i * 0.28, 7, 14); windowY(c, y0 + d, x0 + w - 0.7 + i * 0.28, x0 + w - 0.5 + i * 0.28, 7, 14); }
    windowX(c, x0 + w, y0 + 0.25, y0 + 0.45, 7, 14); windowX(c, x0 + w, y0 + 0.65, y0 + 0.85, 7, 14);
    hip(c, x0, y0, w, d + 0.1, 20, 15, COL.roofRed, 0.14);
    faceY(c, y0 + d + 0.1 + 0.14, x0 + w / 2 - 0.3, x0 + w / 2 + 0.3, 21.5, 25, '#F3EBD6');
    const [fx, fy] = P(gx + 0.1, gy + 1.9, 0);
    c.strokeStyle = '#E9E4DA'; c.lineWidth = 2; c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx, fy - 50); c.stroke();
    for (let i = 0; i < 2; i++) { c.fillStyle = i ? '#F4EFE6' : '#CC4B3F'; c.beginPath(); const y1 = fy - 49 + i * 5; c.moveTo(fx, y1); for (let k = 0; k <= 8; k++) c.lineTo(fx + k * 2.4, y1 + Math.sin(t / 260 + k * 0.7) * 1.3); for (let k = 8; k >= 0; k--) c.lineTo(fx + k * 2.4, y1 + 5 + Math.sin(t / 260 + k * 0.7) * 1.3); c.closePath(); c.fill(); }
  }
  function sekolah(c, gx, gy, t) {
    const x0 = gx + 0.15, y0 = gy + 0.35, w = 1.7, d = 0.8;
    shadow(c, x0, y0, w, d);
    box(c, x0, y0, w, d, 0, 19, '#F0DE9F');
    box(c, x0, y0, w, d, 0, 4, '#D7C27E', true);
    for (let i = 0; i < 4; i++) windowY(c, y0 + d, x0 + 0.17 + i * 0.4, x0 + 0.37 + i * 0.4, 8, 15);
    faceY(c, y0 + d, x0 + w - 0.42, x0 + w - 0.22, 0, 12, '#7A5E7E');
    windowX(c, x0 + w, y0 + 0.2, y0 + 0.4, 8, 15); windowX(c, x0 + w, y0 + 0.5, y0 + 0.7, 8, 15);
    gable(c, x0, y0, w, d, 19, 12, COL.roofGrey, '#F0DE9F', 0.12);
    faceY(c, y0 + d + 0.12, x0 + 0.6, x0 + 1.1, 20.5, 25, '#F7F1DE');
    const [fx, fy] = P(gx + 1.85, gy + 1.45, 0);
    c.strokeStyle = '#E9E4DA'; c.lineWidth = 2; c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx, fy - 40); c.stroke();
    c.fillStyle = '#CC4B3F'; c.fillRect(fx, fy - 40, 11, 4); c.fillStyle = '#F4EFE6'; c.fillRect(fx, fy - 36, 11, 4);
  }
  function pasar(c, gx, gy, t) {
    topQuad(c, gx + 0.08, gy + 0.08, gx + 1.92, gy + 1.92, 0, '#CFC3AA', null);
    const stall = (x0, y0, a, b) => {
      box(c, x0, y0 + 0.28, 0.62, 0.12, 0, 6, '#A98258');
      post(c, x0 + 0.03, y0 + 0.02, 0, 20, '#8F6B49', 0.03); post(c, x0 + 0.59, y0 + 0.02, 0, 20, '#8F6B49', 0.03);
      post(c, x0 + 0.03, y0 + 0.4, 0, 20, '#8F6B49', 0.03); post(c, x0 + 0.59, y0 + 0.4, 0, 20, '#8F6B49', 0.03);
      for (let i = 0; i < 5; i++) {
        const xa = x0 - 0.04 + i * 0.14;
        poly(c, [P(xa, y0 + 0.5, 19), P(xa + 0.14, y0 + 0.5, 19), P(xa + 0.14, y0 - 0.06, 25), P(xa, y0 - 0.06, 25)], i % 2 ? '#F1E9D8' : a, LINE);
      }
      [[b, 0.14], ['#E3B04F', 0.28], ['#7FA85A', 0.42]].forEach(([col, off]) => { const [x, y] = P(x0 + off, y0 + 0.34, 6); ell(c, x, y - 1.6, 2.4, 2.2, col); });
    };
    stall(gx + 0.15, gy + 0.2, '#CB6A52', '#D9604A'); stall(gx + 1.05, gy + 0.15, '#5F8F9A', '#E8A05A'); stall(gx + 0.5, gy + 1.0, '#C99A3F', '#8FB06A');
    box(c, gx + 1.45, gy + 1.45, 0.22, 0.22, 0, 7, '#B28A5C'); box(c, gx + 1.3, gy + 1.6, 0.2, 0.2, 0, 5, '#C39A68');
  }
  function lapangan(c, gx, gy, t) {
    topQuad(c, gx + 0.05, gy + 0.05, gx + 1.95, gy + 1.95, 0, '#8CB06F', null);
    for (let i = 0; i < 4; i++) topQuad(c, gx + 0.05, gy + 0.05 + i * 0.475, gx + 1.95, gy + 0.05 + i * 0.475 + 0.2375, 0, '#94B777', null);
    c.strokeStyle = 'rgba(248,244,232,0.85)'; c.lineWidth = 1.4;
    const r = [P(gx + 0.25, gy + 0.3, 0), P(gx + 1.75, gy + 0.3, 0), P(gx + 1.75, gy + 1.7, 0), P(gx + 0.25, gy + 1.7, 0)];
    c.beginPath(); r.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.stroke();
    c.beginPath(); c.moveTo(...P(gx + 1, gy + 0.3, 0)); c.lineTo(...P(gx + 1, gy + 1.7, 0)); c.stroke();
    const [cx, cy] = P(gx + 1, gy + 1, 0); c.beginPath(); c.ellipse(cx, cy, 14, 7, 0, 0, 6.3); c.stroke();
    [[gx + 0.25, gy + 1], [gx + 1.75, gy + 1]].forEach(([x, y]) => { c.strokeStyle = '#F4EFE6'; c.lineWidth = 2; const a = P(x, y - 0.17, 0), b = P(x, y + 0.17, 0); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(a[0], a[1] - 12); c.lineTo(b[0], b[1] - 12); c.lineTo(b[0], b[1]); c.stroke(); });
  }
  function pagar(c, gx, gy, edge) {
    const f = (x0, y0, x1, y1) => {
      c.strokeStyle = '#B79A68'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(...P(x0, y0, 8)); c.lineTo(...P(x1, y1, 8)); c.moveTo(...P(x0, y0, 4)); c.lineTo(...P(x1, y1, 4)); c.stroke();
      c.lineWidth = 2.2; for (let i = 0; i <= 3; i++) { const px = x0 + (x1 - x0) * i / 3, py = y0 + (y1 - y0) * i / 3; c.beginPath(); c.moveTo(...P(px, py, 0)); c.lineTo(...P(px, py, 11)); c.stroke(); }
    };
    if (edge.ym) f(gx, gy, gx + 1, gy); if (edge.xm) f(gx, gy, gx, gy + 1);
    if (edge.yp) f(gx, gy + 1, gx + 1, gy + 1); if (edge.xp) f(gx + 1, gy, gx + 1, gy + 1);
  }

  // ---------- tempat ibadah (enam agama di Indonesia; semuanya 2x2, harga dan level sama) ----------
  function roseWin(c, x, y, z, r) {
    const [px, py] = P(x, y, z);
    c.save(); c.translate(px, py); c.transform(1, 0.5, 0, 1, 0, 0);
    c.beginPath(); c.arc(0, 0, r, 0, 6.3); c.fillStyle = '#8FB7C9'; c.fill(); c.strokeStyle = LINE; c.lineWidth = 1; c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.moveTo(-r, 0); c.lineTo(r, 0); c.moveTo(0, -r); c.lineTo(0, r); c.stroke();
    c.restore();
  }
  function crossAt(c, x, y, z, hgt) {
    const [px, py] = P(x, y, z);
    c.strokeStyle = '#EFE9DA'; c.lineWidth = 2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(px, py); c.lineTo(px, py - hgt); c.moveTo(px - hgt * 0.34, py - hgt * 0.68); c.lineTo(px + hgt * 0.34, py - hgt * 0.68); c.stroke();
  }
  function gereja(c, gx, gy) {                       // Kristen Protestan: satu menara, puncak salib
    const x0 = gx + 0.3, y0 = gy + 0.25, w = 1.45, d = 0.95;
    shadow(c, x0, y0, w, d + 0.5);
    box(c, x0, y0, w, d, 0, 20, '#F2EEE4');
    for (let i = 0; i < 3; i++) windowY(c, y0 + d, x0 + 0.62 + i * 0.28, x0 + 0.78 + i * 0.28, 6, 15);
    windowX(c, x0 + w, y0 + 0.2, y0 + 0.36, 6, 15); windowX(c, x0 + w, y0 + 0.56, y0 + 0.72, 6, 15);
    gable(c, x0, y0, w, d, 20, 13, '#6F7C8A', '#F2EEE4', 0.1);
    const tx = x0 - 0.04, ty = y0 + d - 0.12, tw = 0.46, td = 0.5;
    box(c, tx, ty, tw, td, 0, 44, '#F4F0E6');
    faceY(c, ty + td, tx + 0.12, tx + 0.34, 0, 12, COL.door);
    windowY(c, ty + td, tx + 0.15, tx + 0.31, 22, 36);
    hip(c, tx, ty, tw, td, 44, 26, '#5F6C7A', 0.04);
    crossAt(c, tx + tw / 2, ty + td / 2, 70, 11);
  }
  function gerejaKatolik(c, gx, gy) {                // Katolik: dua menara + jendela mawar, atap terakota
    const x0 = gx + 0.2, y0 = gy + 0.3, w = 1.6, d = 0.9;
    shadow(c, x0, y0, w, d + 0.5);
    box(c, x0, y0, w, d, 0, 19, '#EDDDB8');
    for (let i = 0; i < 2; i++) windowX(c, x0 + w, y0 + 0.2 + i * 0.32, y0 + 0.36 + i * 0.32, 6, 14);
    gable(c, x0, y0, w, d, 19, 12, '#B5604B', '#EDDDB8', 0.1);
    [x0 - 0.03, x0 + w - 0.43].forEach((tx) => {
      const ty = y0 + d - 0.1;
      box(c, tx, ty, 0.46, 0.46, 0, 38, '#F1E3C0');
      windowY(c, ty + 0.46, tx + 0.15, tx + 0.31, 22, 32);
      hip(c, tx, ty, 0.46, 0.46, 38, 16, '#B5604B', 0.04);
      crossAt(c, tx + 0.23, ty + 0.23, 54, 9);
    });
    const xm = x0 + w / 2;
    faceY(c, y0 + d, xm - 0.13, xm + 0.13, 0, 10, COL.door);
    roseWin(c, xm, y0 + d, 16, 5.2);
  }
  function pura(c, gx, gy) {                         // Hindu: meru bertingkat + candi bentar + umbul-umbul
    box(c, gx + 0.12, gy + 0.12, 1.76, 1.76, 0, 3, '#BDB6A6');
    shadow(c, gx + 0.3, gy + 0.3, 1.4, 1.4);
    const banner = (x, y) => {
      const [px, py] = P(x, y, 3);
      c.strokeStyle = '#8F6B49'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(px, py); c.lineTo(px, py - 38); c.stroke();
      poly(c, [[px, py - 38], [px + 11, py - 33], [px, py - 24]], '#E58A2E', LINE);
    };
    banner(gx + 0.28, gy + 0.28);
    const cx = gx + 1, cy = gy + 0.95;
    box(c, cx - 0.24, cy - 0.24, 0.48, 0.48, 3, 13, '#B9B2A2');
    for (let i = 0; i < 3; i++) {
      const sz = 0.78 - i * 0.2, z = 13 + i * 11;
      if (i) { post(c, cx - 0.06, cy + 0.06, z - 5, z, '#5A4A3C', 0.03); post(c, cx + 0.06, cy - 0.06, z - 5, z, '#5A4A3C', 0.03); }
      hip(c, cx - sz / 2, cy - sz / 2, sz, sz, z + (i ? 0 : 0), 6, '#463F3B', 0.02);
    }
    ell(c, ...P(cx, cy, 13 + 3 * 11 + 3), 2, 3, '#E3B04F');
    [[gx + 0.52, gy + 1.55], [gx + 1.18, gy + 1.55]].forEach(([x, y]) => {   // candi bentar: dua sisi bertangga
      box(c, x, y, 0.3, 0.22, 3, 9, '#C9C0AC'); box(c, x + 0.03, y + 0.02, 0.24, 0.18, 9, 15, '#C3BAA6'); box(c, x + 0.06, y + 0.04, 0.18, 0.14, 15, 20, '#BDB4A0');
    });
    banner(gx + 1.72, gy + 1.72);
  }
  function vihara(c, gx, gy) {                       // Buddha: stupa di atas pelataran bertingkat
    box(c, gx + 0.14, gy + 0.14, 1.72, 1.72, 0, 3, '#C2BBAA');
    box(c, gx + 0.32, gy + 0.32, 1.36, 1.36, 3, 6, '#CFC8B8');
    shadow(c, gx + 0.4, gy + 0.4, 1.2, 1.2);
    const stupa = (x, y, s, z0) => {
      const bw = 0.42 * s; box(c, x - bw / 2, y - bw / 2, bw, bw, z0, z0 + 7 * s, '#D8D1C0');
      const [px, py] = P(x, y, z0 + 7 * s);
      ell(c, px + 2, py - 3 * s + 2, 15 * s, 11 * s, '#B9B2A1'); ell(c, px, py - 3 * s, 15 * s, 11 * s, '#CFC8B6'); ell(c, px - 4 * s, py - 7 * s, 7 * s, 4.6 * s, '#E8E2D2');
      box(c, x - 0.06 * s, y - 0.06 * s, 0.12 * s, 0.12 * s, z0 + 7 * s + 14 * s, z0 + 7 * s + 19 * s, '#D9B24E');
      for (let i = 0; i < 3; i++) ell(c, px, py - 19 * s - i * 4 * s, (6 - i * 1.6) * s, 2.4 * s, i % 2 ? '#E3B04F' : '#D6A844');
      ell(c, px, py - 33 * s, 1.6 * s, 2.2 * s, '#E3B04F');
    };
    stupa(gx + 0.62, gy + 1.38, 0.55, 6); stupa(gx + 1.38, gy + 0.62, 0.55, 6);
    stupa(gx + 1, gy + 1, 1, 6);
  }
  function klenteng(c, gx, gy) {                     // Konghucu: aula merah beratap emas, lampion
    box(c, gx + 0.12, gy + 0.2, 1.76, 1.62, 0, 3, '#C9BFAE');
    shadow(c, gx + 0.3, gy + 0.4, 1.4, 1.0);
    const x0 = gx + 0.32, y0 = gy + 0.42, w = 1.36, d = 0.88;
    box(c, x0, y0, w, d, 3, 21, '#B8433A');
    faceY(c, y0 + d, x0 + w / 2 - 0.15, x0 + w / 2 + 0.15, 3, 15, '#8E2F2A');
    faceY(c, y0 + d, x0 + w / 2 - 0.19, x0 + w / 2 - 0.15, 3, 16, '#D9A441'); faceY(c, y0 + d, x0 + w / 2 + 0.15, x0 + w / 2 + 0.19, 3, 16, '#D9A441');
    windowY(c, y0 + d, x0 + 0.2, x0 + 0.36, 9, 16); windowY(c, y0 + d, x0 + w - 0.36, x0 + w - 0.2, 9, 16);
    windowX(c, x0 + w, y0 + 0.25, y0 + 0.45, 9, 16);
    for (let i = 0; i < 4; i++) post(c, x0 + 0.06 + i * ((w - 0.12) / 3), y0 + d + 0.1, 3, 20, '#A93A32', 0.035);
    hip(c, x0 - 0.1, y0 - 0.1, w + 0.2, d + 0.2, 21, 8, '#D9A441', 0.1);
    [[x0 - 0.2, y0 - 0.2], [x0 + w + 0.2, y0 - 0.2], [x0 - 0.2, y0 + d + 0.2], [x0 + w + 0.2, y0 + d + 0.2]].forEach(([x, y]) => {
      const [px, py] = P(x, y, 21); poly(c, [[px - 3, py], [px + 3, py], [px + (x > x0 + w / 2 ? 6 : -6), py - 6]], '#E3B552', LINE);
    });
    const ux = x0 + 0.38, uy = y0 + 0.24, uw = w - 0.76, ud = 0.4;
    box(c, ux, uy, uw, ud, 29, 38, '#B8433A');
    hip(c, ux - 0.08, uy - 0.08, uw + 0.16, ud + 0.16, 38, 9, '#D9A441', 0.08);
    ell(c, ...P(ux + uw / 2, uy + ud / 2, 49), 2.2, 3, '#E3B04F');
    [x0 + 0.28, x0 + w - 0.28].forEach((x) => {
      const [px, py] = P(x, y0 + d + 0.14, 19); c.strokeStyle = '#8F6B49'; c.lineWidth = 1; c.beginPath(); c.moveTo(px, py); c.lineTo(px, py + 3); c.stroke();
      ell(c, px, py + 8, 4.2, 5, '#D8392F'); ell(c, px - 1.2, py + 6.4, 1.5, 2, 'rgba(255,255,255,0.35)'); c.fillStyle = '#E3B04F'; c.fillRect(px - 1, py + 13, 2, 3);
    });
    box(c, gx + 0.9, gy + 1.62, 0.2, 0.2, 3, 9, '#8A5A3A');
  }

  // ------------------------------------------------------------
  // KATALOG BANGUNAN
  // ------------------------------------------------------------
  const CATS = [
    { id: 'dasar', name: 'Dasar' },
    { id: 'tani', name: 'Tani & Ternak' },
    { id: 'fasum', name: 'Fasilitas' },
    { id: 'ibadah', name: 'Ibadah' },
    { id: 'hias', name: 'Hiasan' },
  ];
  // kind: flat = digambar di lapisan tanah (menyambung dengan tetangga sejenis)
  const CATALOG = {
    jalan:    { name: 'Jalan tanah', cat: 'dasar', cost: 2,   size: 1, unlock: 1, flat: true, drag: true, desc: 'Menyambungkan rumah dan fasilitas. Otomatis nyambung ke jalan di sebelahnya.' },
    rumah:    { name: 'Rumah warga', cat: 'dasar', cost: 30,  size: 1, unlock: 1, upg: [0, 60, 140], desc: 'Rumah kayu sederhana. Bisa ditingkatkan jadi rumah bata, lalu rumah dua lantai.' },
    sawah:    { name: 'Sawah', cat: 'tani', cost: 12, size: 1, unlock: 1, flat: true, drag: true, desc: 'Petak sawah yang nyambung dengan petak sebelahnya. Padinya ganti fase seiring waktu.' },
    kebun:    { name: 'Kebun sayur', cat: 'tani', cost: 10, size: 1, unlock: 1, flat: true, drag: true, desc: 'Bedengan sayur dan cabai.' },
    kolam:    { name: 'Kolam ikan', cat: 'tani', cost: 20, size: 1, unlock: 2, flat: true, drag: true, desc: 'Kolam yang menyatu dengan kolam di sebelahnya.' },
    kandang:  { name: 'Kandang ayam', cat: 'tani', cost: 26, size: 1, unlock: 2, desc: 'Ayam kampung yang mematuk-matuk di dalam pagar bambu.' },
    lumbung:  { name: 'Lumbung padi', cat: 'tani', cost: 50, size: 1, unlock: 3, upg: [0, 90], desc: 'Lumbung panggung beratap ijuk. Tingkatkan buat atap yang lebih tinggi.' },
    warung:   { name: 'Warung', cat: 'fasum', cost: 40, size: 1, unlock: 3, desc: 'Warung kecil dengan tenda bergaris.' },
    gardu:    { name: 'Pos ronda', cat: 'fasum', cost: 24, size: 1, unlock: 3, desc: 'Pos jaga dengan kentongan.' },
    posyandu: { name: 'Posyandu', cat: 'fasum', cost: 80, size: 1, unlock: 4, desc: 'Pos layanan kesehatan desa.' },
    sumur:    { name: 'Sumur', cat: 'fasum', cost: 14, size: 1, unlock: 4, desc: 'Sumur batu beratap kayu.' },
    surau:    { name: 'Masjid desa', cat: 'ibadah', cost: 110, size: 2, unlock: 4, desc: 'Tempat ibadah umat Islam: masjid berkubah dengan menara kecil.' },
    gereja:   { name: 'Gereja Protestan', cat: 'ibadah', cost: 110, size: 2, unlock: 4, desc: 'Tempat ibadah umat Kristen Protestan: satu menara dengan puncak salib.' },
    gerejakatolik: { name: 'Gereja Katolik', cat: 'ibadah', cost: 110, size: 2, unlock: 4, desc: 'Tempat ibadah umat Katolik: dua menara dan jendela mawar.' },
    pura:     { name: 'Pura', cat: 'ibadah', cost: 110, size: 2, unlock: 4, desc: 'Tempat ibadah umat Hindu: meru bertingkat dan gerbang candi bentar.' },
    vihara:   { name: 'Vihara', cat: 'ibadah', cost: 110, size: 2, unlock: 4, desc: 'Tempat ibadah umat Buddha: stupa di atas pelataran bertingkat.' },
    klenteng: { name: 'Klenteng', cat: 'ibadah', cost: 110, size: 2, unlock: 4, desc: 'Tempat ibadah umat Konghucu: aula merah beratap emas dan lampion.' },
    sekolah:  { name: 'Sekolah dasar', cat: 'fasum', cost: 170, size: 2, unlock: 5, desc: 'SD desa dengan tiang bendera.' },
    pasar:    { name: 'Pasar desa', cat: 'fasum', cost: 150, size: 2, unlock: 5, desc: 'Tiga lapak dengan tenda warna-warni.' },
    balai:    { name: 'Balai desa', cat: 'fasum', cost: 220, size: 2, unlock: 6, desc: 'Pusat desa, lengkap dengan bendera.' },
    lapangan: { name: 'Lapangan', cat: 'fasum', cost: 120, size: 2, unlock: 6, flat: true, desc: 'Lapangan bola buat warga.' },
    pohon:    { name: 'Pohon mangga', cat: 'hias', cost: 6, size: 1, unlock: 1, drag: true, desc: 'Peneduh, kadang berbuah.' },
    kelapa:   { name: 'Pohon kelapa', cat: 'hias', cost: 8, size: 1, unlock: 1, drag: true, desc: 'Pohon kelapa yang melambai.' },
    bunga:    { name: 'Taman bunga', cat: 'hias', cost: 5, size: 1, unlock: 2, drag: true, desc: 'Bunga liar warna-warni.' },
    lampu:    { name: 'Lampu jalan', cat: 'hias', cost: 6, size: 1, unlock: 2, drag: true, desc: 'Menyala sendiri di tema gelap.' },
    bendera:  { name: 'Tiang bendera', cat: 'hias', cost: 16, size: 1, unlock: 6, desc: 'Merah putih berkibar.' },
  };

  // ctx gambar satu benda pada petak (gx, gy). env = { t, night, nb:{xp,xm,yp,ym} }
  function drawThing(c, key, gx, gy, lv, env) {
    const t = env.t || 0, seed = env.seed != null ? env.seed : hash(gx, gy, 11), nb = env.nb || {};
    switch (key) {
      case 'jalan': return road(c, gx, gy, nb);
      case 'sawah': return sawah(c, gx, gy, nb, t);
      case 'kebun': return kebun(c, gx, gy, nb, t);
      case 'kolam': return kolam(c, gx, gy, nb, t);
      case 'lapangan': return lapangan(c, gx, gy, t);
      case 'rumah': rumah(c, gx, gy, lv || 1, t, seed); if (!env.noSmoke) rumahSmoke(c, gx, gy, lv || 1, t); return;
      case 'lumbung': return lumbung(c, gx, gy, lv || 1);
      case 'gardu': return gardu(c, gx, gy);
      case 'warung': return warung(c, gx, gy, t);
      case 'posyandu': return posyandu(c, gx, gy);
      case 'sumur': return sumur(c, gx, gy);
      case 'lampu': return lampu(c, gx, gy, t, env.night);
      case 'bendera': return bendera(c, gx, gy, t);
      case 'kandang': return kandang(c, gx, gy, t);
      case 'surau': return surau(c, gx, gy);
      case 'gereja': return gereja(c, gx, gy);
      case 'gerejakatolik': return gerejaKatolik(c, gx, gy);
      case 'pura': return pura(c, gx, gy);
      case 'vihara': return vihara(c, gx, gy);
      case 'klenteng': return klenteng(c, gx, gy);
      case 'balai': return balai(c, gx, gy, t);
      case 'sekolah': return sekolah(c, gx, gy, t);
      case 'pasar': return pasar(c, gx, gy, t);
      case 'pohon': return tree(c, gx, gy, 'mangga', t, seed);
      case 'kelapa': return tree(c, gx, gy, 'kelapa', t, seed);
      case 'bunga': return flowers(c, gx, gy, seed, t);
    }
  }

  const engine = { HW, HH, P, hash, ground, tree, bush, rock, pagar, drawThing, CATALOG, CATS, poly, mix, BIOME, wildKind, wildDraw, rumahSmoke };

  // ============ (bagian 2 ditambahkan di bawah) ============
  if (typeof module !== 'undefined' && module.exports) module.exports = engine;
  // ------------------------------------------------------------
  // 2) LOGIKA SESI, KOIN, DUNIA, DAN TAMPILAN
  // ------------------------------------------------------------
  if (typeof module !== 'undefined' && module.exports) module.exports = engine;
  if (typeof document === 'undefined') return;

  // Mode Fokus: toleransi keluar dari Readlify. Desktop: 0 (sekali keluar, koin sesi hangus).
  // Android: 15 detik, supaya dialog sistem / notifikasi yang sekejap tidak langsung menghanguskan koin.
  const FOCUS_GRACE_SEC = (typeof window !== 'undefined' && window.api && window.api.platform === 'android') ? 15 : 0;
  const PLAIN_RATE = 0.5;      // Pomodoro biasa (di luar Mode Fokus): koin = setengah dari Mode Fokus
  const PAUSE_CAP_SEC = 180;   // total jeda yang masih dianggap wajar dalam satu sesi
  const START_R = 4, MAX_WORLDS = 12, CH = 8, MIN_Z = 0.7, MAX_Z = 1.9;

  let api = null;              // { getState, persist, toast, goToView, ach }
  const achv = (type, meta) => { try { if (api && api.ach) api.ach(type, meta); } catch (e) { /* jangan ganggu desa */ } };
  let V = null;                // state.village: dompet koin + daftar dunia
  let W = null;                // dunia yang lagi aktif
  let occ = {};                // "x,y" -> kunci jangkar
  let flatList = [], objList = [];   // daftar gambar yang sudah terurut (dibangun ulang hanya saat desa berubah)
  let curLevel = 1, totalPts = 0;
  let tool = null, selected = null, cat = 'dasar';
  let hover = null, cam = { x: 0, y: 40, z: 1 };
  let canvas, ctx, stage, running = false, lastDraw = 0, dirty = true, lastInput = 0;
  let animSeen = true, lowFx = false, emaMs = 8, fastFrames = 0, lastNight = false;
  const popAt = new Map();     // animasi muncul
  const chunks = new Map(), sprites = new Map();
  let dragInfo = null, paint = false, lastPaintKey = '', frameNo = 0;

  // ---- sesi pomodoro ----
  const sess = { active: false, running: false, away: false, full: false, mark: 0, awaySec: 0, pausedSec: 0, warned: false };
  function settle(now) {
    if (!sess.active) return;
    const dt = Math.max(0, (now - sess.mark) / 1000);
    if (sess.running && sess.away) sess.awaySec += dt;
    else if (!sess.running) sess.pausedSec += dt;
    sess.mark = now;
  }
  // Keluar dari Readlify cuma dihitung kalau sesinya Mode Fokus (full). Jeda terlalu lama berlaku di dua-duanya.
  const leftApp = () => sess.full && sess.awaySec > FOCUS_GRACE_SEC;
  const isClean = () => !leftApp() && sess.pausedSec <= PAUSE_CAP_SEC;
  function sessionStart(full) { Object.assign(sess, { active: true, running: true, away: false, full: !!full, mark: Date.now(), awaySec: 0, pausedSec: 0, warned: false }); refreshLive(); }
  function sessionPause() { if (!sess.active) return; settle(Date.now()); sess.running = false; refreshLive(); }
  function sessionResume() { if (!sess.active) return; settle(Date.now()); sess.running = true; refreshLive(); }
  function sessionCancel() { if (!sess.active) return; sess.active = false; refreshLive(); }
  // Mode Fokus berakhir di tengah sesi: sisa sesinya dihitung sebagai pomodoro biasa (koin setengah).
  function focusEnded() { if (!sess.active) return; settle(Date.now()); sess.full = false; refreshLive(); }
  function setPresence(away) {
    settle(Date.now()); sess.away = !!away; dirty = true;
    if (!away && sess.active && sess.running && !sess.warned && leftApp()) {
      sess.warned = true;
      api && api.toast(['Kamu keluar dari Readlify saat Mode Fokus, jadi koin sesi ini hangus.', 'Lanjutin aja, Village-mu tetap aman.']);
    }
    refreshLive();
  }
  function sessionFinish(workSec) {
    if (!sess.active || !V) return null;
    settle(Date.now()); sess.active = false;
    const full = sess.full, mins = Math.floor(workSec / 60), clean = isClean(), left = leftApp();
    let coins = 0, bonus = 0;
    V.sessions += 1;
    if (clean && mins > 0) {
      if (full) {
        V.cleanStreak += 1; V.cleanSessions += 1;
        bonus = Math.min(10, V.cleanStreak - 1);
        coins = mins + bonus;
      } else coins = Math.floor(mins * PLAIN_RATE);
      V.coins += coins; V.earned += coins;
    } else if (!clean && full) V.cleanStreak = 0;
    if (coins > 0) achv('village_coins', { coins, level: curLevel });
    V.last = { coins, clean, full, reason: clean ? '' : (left ? 'away' : 'pause'), away: Math.round(sess.awaySec), at: Date.now() };
    api.persist();
    if (clean && coins > 0) {
      if (full) api.toast([`+${coins} koin masuk ke kas Village`, bonus ? `Bertahan di Readlify sepanjang Mode Fokus, plus bonus beruntun +${bonus}. Ketuk buat lihat Village-mu.` : 'Kamu bertahan di Readlify sepanjang Mode Fokus. Ketuk buat lihat Village-mu.'], () => api.goToView('desa'));
      else api.toast([`+${coins} koin masuk ke kas Village`, 'Pomodoro biasa dapat setengah koin Mode Fokus. Ketuk buat lihat Village-mu.'], () => api.goToView('desa'));
    }
    else if (clean) api.toast(`Sesinya terlalu singkat buat menghasilkan koin (minimal ${full ? 1 : 2} menit).`);
    else api.toast([left ? 'Sesi ini nggak menghasilkan koin: kamu sempat keluar dari Readlify saat Mode Fokus.' : `Sesi ini nggak menghasilkan koin: timernya dijeda lebih dari ${Math.round(PAUSE_CAP_SEC / 60)} menit.`, 'Nggak apa-apa, Village-mu tetap aman. Coba lagi di sesi berikutnya.']);
    renderHud(); renderBar(); refreshLive();
    return V.last;
  }
  function liveText() {
    const st = api.getState(), mins = Math.floor((st.pomodoro.workSec || 0) / 60), half = Math.floor(mins * PLAIN_RATE);
    if (!sess.active) return mins > 0 ? `Mode Fokus: ${mins} koin kalau kamu tetap di Readlify sepanjang sesi. Pomodoro biasa: ${half} koin, dan boleh buka aplikasi lain.` : 'Sesi fokus kurang dari 1 menit nggak menghasilkan koin.';
    settle(Date.now());
    if (sess.pausedSec > PAUSE_CAP_SEC) return 'Jedanya kelamaan, jadi koin sesi ini hangus. Lanjut aja, Village tetap aman.';
    if (!sess.full) return sess.running ? `Pomodoro biasa: boleh buka aplikasi lain, koinnya setengah dari Mode Fokus (${half}).` : 'Timer dijeda. Jeda wajar sampai beberapa menit.';
    if (leftApp() || (sess.away && sess.running)) return 'Koin Mode Fokus sesi ini hangus karena kamu keluar dari Readlify. Lanjut aja, Village tetap aman.';
    return sess.running ? 'Mode Fokus aman. Tetap di Readlify sampai sesi selesai buat dapat semua koinnya.' : 'Timer dijeda. Jeda wajar sampai beberapa menit.';
  }
  let lastLive = '';
  function refreshLive() {
    if (!api) return;
    const t = liveText(); if (t === lastLive && !sess.active) return; lastLive = t;
    ['desaLive', 'desaLiveHud'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) { if (el.textContent !== t) el.textContent = t; const bad = sess.active && (!isClean() || (sess.full && sess.away && sess.running)); el.classList.toggle('is-bad', bad); el.classList.toggle('is-on', sess.active && !bad); }
    });
  }

  // ---- data desa & dunia ----
  const STARTER = () => ({ '0,0': { t: 'rumah', l: 1 }, '1,0': { t: 'jalan' }, '2,0': { t: 'jalan' }, '3,0': { t: 'jalan' }, '-1,0': { t: 'jalan' }, '2,-1': { t: 'pohon' } });
  const wid = () => 'w' + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36);
  const newWorld = (biome, name) => ({ id: wid(), name, biome, R: START_R, expansions: 0, tiles: STARTER(), cam: { x: 0, y: 40, z: 1 } });
  const DEFAULT_V = () => { const w = newWorld('hijau', BIOME.hijau.village); return { v: 2, coins: 20, earned: 20, cleanStreak: 0, cleanSessions: 0, sessions: 0, last: null, active: w.id, worlds: [w] }; };
  function normalize(v) {
    if (!v || typeof v !== 'object') return DEFAULT_V();
    if (!Array.isArray(v.worlds)) {                   // migrasi dari versi satu dunia
      if (!v.tiles) return DEFAULT_V();
      const w = newWorld('hijau', BIOME.hijau.village); w.R = v.R || START_R; w.expansions = v.expansions || 0; w.tiles = v.tiles; if (v.cam) w.cam = v.cam;
      ['R', 'expansions', 'tiles', 'cam'].forEach((k) => delete v[k]); v.worlds = [w]; v.active = w.id; v.v = 2;
    }
    if (!v.worlds.length) { const w = newWorld('hijau', BIOME.hijau.village); v.worlds = [w]; v.active = w.id; }
    if (!v.worlds.some((w) => w.id === v.active)) v.active = v.worlds[0].id;
    return v;
  }
  const sizeOf = (k) => CATALOG[k].size;
  const valueOf = (e) => { const c = CATALOG[e.t]; if (!c) return 0; let v = c.cost; if (c.upg) for (let i = 1; i < (e.l || 1); i++) v += c.upg[i]; return v; };
  const worldScore = (w) => Object.values(w.tiles).reduce((a, e) => a + valueOf(e), 0);
  const levelOf = (score) => Math.floor(Math.sqrt(score / 25)) + 1;
  const levelBase = (lv) => 25 * (lv - 1) * (lv - 1);
  const expandCost = () => Math.round(40 * Math.pow(1.3, W.expansions));
  const newWorldCost = () => 100 * V.worlds.length;
  const inside = (x, y) => x >= -W.R && x <= W.R && y >= -W.R && y <= W.R;

  // Daftar gambar diurutkan sekali di sini, bukan tiap frame.
  function rebuild() {
    occ = {}; flatList = []; objList = [];
    Object.keys(W.tiles).forEach((key) => {
      const e = W.tiles[key], sp = CATALOG[e.t];
      if (!sp) { delete W.tiles[key]; return; }
      const [x, y] = key.split(',').map(Number);
      for (let i = 0; i < sp.size; i++) for (let j = 0; j < sp.size; j++) occ[(x + i) + ',' + (y + j)] = key;
      const n = { k: 'thing', x, y, key, e, sp, d: x + y + (sp.flat ? 0 : sp.size - 1 + 0.5) };
      (sp.flat ? flatList : objList).push(n);
    });
    const R = W.R;                                   // cincin hutan dekat batas + pagar bambu digambar live, sisanya di-cache
    for (let x = -R - 2; x <= R + 2; x++) for (let y = -R - 2; y <= R + 2; y++) {
      if (!inside(x, y)) { const k = wildKind(x, y, W.biome); if (k) objList.push({ k: 'wild', kind: k, x, y, d: x + y }); }
      else if (x === -R || x === R || y === -R || y === R) objList.push({ k: 'fence', x, y, d: x + y + 0.8, e: { xm: x === -R, xp: x === R, ym: y === -R, yp: y === R } });
    }
    flatList.sort((a, b) => a.d - b.d); objList.sort((a, b) => a.d - b.d);
    totalPts = V.worlds.reduce((a, w) => a + worldScore(w), 0); curLevel = levelOf(totalPts);
    dirty = true;
  }
  function setActive(id, initial) {
    if (!initial && W) W.cam = { x: cam.x, y: cam.y, z: cam.z };
    W = V.worlds.find((w) => w.id === id) || V.worlds[0]; V.active = W.id;
    cam = Object.assign({ x: 0, y: 40, z: 1 }, W.cam); selected = null; tool = null;
    chunks.clear(); popAt.clear(); rebuild();
  }
  function loadState() {
    const st = api.getState(); st.village = normalize(st.village); V = st.village; setActive(V.active, true);
  }
  function canPlace(key, ax, ay) {
    const s = sizeOf(key);
    for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) { if (!inside(ax + i, ay + j) || occ[(ax + i) + ',' + (ay + j)]) return false; }
    return true;
  }
  function place(key, ax, ay) {
    const spec = CATALOG[key];
    if (curLevel < spec.unlock || !canPlace(key, ax, ay)) return false;
    if (V.coins < spec.cost) { flashCoins(); return false; }
    V.coins -= spec.cost; W.tiles[ax + ',' + ay] = spec.upg ? { t: key, l: 1 } : { t: key };
    popAt.set(ax + ',' + ay, performance.now());
    rebuild(); api.persist(); renderHud(); renderBar();
    achv('village_build', { key, level: curLevel });
    return true;
  }
  function remove(anchor) {
    const e = W.tiles[anchor]; if (!e) return;
    V.coins += Math.floor(CATALOG[e.t].cost / 2); delete W.tiles[anchor];
    if (selected === anchor) selected = null;
    rebuild(); api.persist(); renderHud(); renderBar(); renderInfo();
  }
  function upgrade(anchor) {
    const e = W.tiles[anchor], spec = CATALOG[e.t]; if (!spec.upg) return;
    const next = (e.l || 1) + 1; if (next > spec.upg.length) return;
    if (V.coins < spec.upg[next - 1]) { flashCoins(); return; }
    V.coins -= spec.upg[next - 1]; e.l = next; popAt.set(anchor, performance.now());
    rebuild(); api.persist(); renderHud(); renderBar(); renderInfo();
  }
  function expand() {
    const c = expandCost(); if (V.coins < c) { flashCoins(); return; }
    V.coins -= c; W.expansions += 1; W.R += 1; chunks.clear();
    rebuild(); api.persist(); renderHud(); renderBar();
    achv('village_expand', { level: curLevel });
  }
  function addWorld(biome) {
    const cost = newWorldCost();
    if (!BIOME[biome] || V.worlds.length >= MAX_WORLDS) return;
    if (V.coins < cost) { flashCoins(); return; }
    V.coins -= cost;
    const base = BIOME[biome].village; let name = base, n = 1;
    while (V.worlds.some((w) => w.name === name)) name = `${base} ${++n}`;
    const w = newWorld(biome, name); V.worlds.push(w);
    setActive(w.id); api.persist(); closeWorlds(); renderHud(); renderBar();
    achv('village_world', { count: V.worlds.length, level: curLevel });
  }
  function flashCoins() { const el = document.getElementById('desaCoins'); if (!el) return; el.classList.remove('is-short'); void el.offsetWidth; el.classList.add('is-short'); }

  // ---- cache: potongan tanah/hutan (chunk) dan sprite bangunan statis ----
  const SPRITE = new Set(['rumah', 'lumbung', 'gardu', 'warung', 'posyandu', 'sumur', 'lampu', 'surau', 'gereja', 'gerejakatolik', 'pura', 'vihara', 'klenteng', 'sekolah', 'pasar', 'pohon', 'kelapa']);
  const ANIM = new Set(['sawah', 'kolam', 'kandang', 'bendera', 'balai', 'bunga']);
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
  function spriteFor(k, size, fn) {
    let sp = sprites.get(k); if (sp) return sp;
    const S = +k.slice(k.lastIndexOf('|') + 1), ox = size * 32 + 40, oy = 100, w = size * 64 + 80, h = oy + size * 32 + 16;
    const cv = mk(w * S, h * S), c = cv.getContext('2d'); c.scale(S, S); c.translate(ox, oy); fn(c);
    sp = { cv, ox, oy, w, h }; sprites.set(k, sp); return sp;
  }
  const maskOf = (nb) => (nb.xp ? 1 : 0) | (nb.xm ? 2 : 0) | (nb.yp ? 4 : 0) | (nb.ym ? 8 : 0);
  const nbFromMask = (m) => ({ xp: !!(m & 1), xm: !!(m & 2), yp: !!(m & 4), ym: !!(m & 8) });
  function getSprite(key, lv, seed, night, S) {
    const v = Math.min(3, Math.floor(seed * 4)), nt = night && key === 'lampu';
    return spriteFor(key + '|' + lv + '|' + v + '|' + (nt ? 1 : 0) + '|' + S, sizeOf(key), (c) =>
      drawThing(c, key, 0, 0, lv, { t: 0, night: nt, nb: {}, seed: (v + 0.5) / 4, noSmoke: true }));
  }
  function getChunk(cx, cy, S) {
    const key = cx + ',' + cy; let ck = chunks.get(key);
    if (ck && ck.S === S) { ck.use = frameNo; return ck; }
    const x0 = cx * CH, y0 = cy * CH, left = (x0 - (y0 + CH)) * HW - 6, right = ((x0 + CH) - y0) * HW + 6, top = (x0 + y0) * HH - 3, bottom = ((x0 + CH) + (y0 + CH)) * HH + 4;
    const g = mk((right - left) * S, (bottom - top) * S), gc = g.getContext('2d'); gc.scale(S, S); gc.translate(-left, -top);
    const R = W.R, far = (x, y) => x < -R - 2 || x > R + 2 || y < -R - 2 || y > R + 2;
    const decor = [];
    for (let x = x0; x < x0 + CH; x++) for (let y = y0; y < y0 + CH; y++) {
      ground(gc, x, y, inside(x, y), W.biome);
      if (far(x, y)) { const k = wildKind(x, y, W.biome); if (k) decor.push([x, y, k]); }
    }
    let d = null;
    if (decor.length) {
      const dTop = top - 70; d = mk((right - left) * S, (bottom - dTop) * S); const dc = d.getContext('2d'); dc.scale(S, S); dc.translate(-left, -dTop);
      decor.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1])).forEach(([x, y, k]) => wildDraw(dc, x, y, k));
      ck = { g, d, left, top, dTop, S, use: frameNo }; chunks.set(key, ck); return ck;
    }
    ck = { g, d: null, left, top, dTop: top, S, use: frameNo }; chunks.set(key, ck); return ck;
  }
  function trimCache() {
    if (chunks.size <= 72) return;
    [...chunks.entries()].sort((a, b) => a[1].use - b[1].use).slice(0, chunks.size - 56).forEach(([k]) => chunks.delete(k));
  }

  // ---- gambar scene ----
  const isNight = () => document.documentElement.getAttribute('data-theme') === 'cozy-dark' || document.body.getAttribute('data-theme') === 'cozy-dark';
  const nbOf = (n) => {
    const same = (x, y) => { const a = occ[x + ',' + y]; return !!a && W.tiles[a].t === n.e.t; };
    return { xp: same(n.x + 1, n.y), xm: same(n.x - 1, n.y), yp: same(n.x, n.y + 1), ym: same(n.x, n.y - 1) };
  };
  function screenToGrid(sx, sy) {
    const wx = (sx - canvas.clientWidth / 2) / cam.z - cam.x, wy = (sy - canvas.clientHeight / 2) / cam.z - cam.y;
    return [Math.floor((wy / HH + wx / HW) / 2), Math.floor((wy / HH - wx / HW) / 2)];
  }
  function drawEntry(c, n, now, night, S) {
    if (n.k === 'wild') {
      const v = Math.min(3, Math.floor(hash(n.x, n.y, 17) * 4)), p = P(n.x, n.y);
      const s = spriteFor('w|' + n.kind + '|' + v + '|' + W.biome + '|' + S, 1, (g) => wildDraw(g, 0, 0, n.kind, (v + 0.5) / 4));
      c.drawImage(s.cv, p[0] - s.ox, p[1] - s.oy, s.w, s.h); return;
    }
    if (n.k === 'fence') {
      const m = (n.e.xm ? 2 : 0) | (n.e.xp ? 1 : 0) | (n.e.ym ? 8 : 0) | (n.e.yp ? 4 : 0), p = P(n.x, n.y);
      const s = spriteFor('f|' + m + '|' + S, 1, (g) => pagar(g, 0, 0, nbFromMask(m)));
      c.drawImage(s.cv, p[0] - s.ox, p[1] - s.oy, s.w, s.h); return;
    }
    const e = n.e, sp = n.sp, lv = e.l || 1, born = popAt.get(n.key);
    let k = 1;
    if (born !== undefined) { k = Math.min(1, (now - (born + (performance.timeOrigin || 0))) / 260); if (k >= 1) popAt.delete(n.key); else dirty = true; }
    if (ANIM.has(e.t)) animSeen = true;
    c.save();
    if (born !== undefined && k < 1) { c.globalAlpha = 0.4 + 0.6 * Math.max(0, k); c.translate(0, -(1 - Math.max(0, k)) * 12); }
    if (e.t === 'jalan' || e.t === 'kebun') {                      // statis, cuma beda sambungan -> sprite per topeng tetangga
      const m = maskOf(nbOf(n)), p = P(n.x, n.y);
      const s = spriteFor(e.t + '|m' + m + '|' + S, 1, (g) => drawThing(g, e.t, 0, 0, 1, { t: 0, nb: nbFromMask(m) }));
      c.drawImage(s.cv, p[0] - s.ox, p[1] - s.oy, s.w, s.h);
    } else if (SPRITE.has(e.t)) {
      const s = getSprite(e.t, lv, hash(n.x, n.y, 11), night, S), p = P(n.x, n.y);
      c.drawImage(s.cv, p[0] - s.ox, p[1] - s.oy, s.w, s.h);
      if (e.t === 'rumah' && lv >= 2) { rumahSmoke(c, n.x, n.y, lv, now); animSeen = true; }
    } else drawThing(c, e.t, n.x, n.y, lv, { t: now, night, nb: sp.flat ? nbOf(n) : null });
    c.restore();
    if (selected === n.key) outline(c, n.x, n.y, sp.size, '#FFFFFF');
  }
  function draw(now) {
    const t0 = performance.now(); frameNo++;
    const vw = canvas.clientWidth, vh = canvas.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, lowFx ? 1 : 1.25);
    if (canvas.width !== Math.round(vw * dpr) || canvas.height !== Math.round(vh * dpr)) { canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr); }
    const S = cam.z * dpr > 1.05 ? 2 : 1, c = ctx, night = isNight();
    animSeen = false;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = BIOME[W.biome].bg; c.fillRect(0, 0, vw, vh);
    c.save(); c.translate(vw / 2, vh / 2); c.scale(cam.z, cam.z); c.translate(cam.x, cam.y);
    const vl = -(vw / 2) / cam.z - cam.x, vr = (vw / 2) / cam.z - cam.x, vt = -(vh / 2) / cam.z - cam.y, vb = (vh / 2) / cam.z - cam.y;
    const gxs = [], gys = [];
    [[vl, vt], [vr, vt], [vl, vb], [vr, vb]].forEach(([wx, wy]) => { gxs.push((wy / HH + wx / HW) / 2); gys.push((wy / HH - wx / HW) / 2); });
    const gx0 = Math.floor(Math.min(...gxs)) - 2, gx1 = Math.ceil(Math.max(...gxs)) + 2, gy0 = Math.floor(Math.min(...gys)) - 2, gy1 = Math.ceil(Math.max(...gys)) + 2;
    // tanah + hutan jauh dari cache
    const vis = []; let built = 0;
    for (let cx = Math.floor(gx0 / CH); cx <= Math.floor(gx1 / CH); cx++) for (let cy = Math.floor(gy0 / CH); cy <= Math.floor(gy1 / CH); cy++) {
      const x0 = cx * CH, y0 = cy * CH;
      const l = (x0 - (y0 + CH)) * HW - 6, r = ((x0 + CH) - y0) * HW + 6, tp = (x0 + y0) * HH - 75, bt = ((x0 + CH) + (y0 + CH)) * HH + 4;
      if (r < vl || l > vr || bt < vt || tp > vb) continue;
      const have = chunks.get(cx + ',' + cy);
      if (!(have && have.S === S)) { if (built >= 14) { dirty = true; continue; } built++; }
      vis.push([cx, cy, getChunk(cx, cy, S)]);
    }
    vis.forEach(([, , ck]) => c.drawImage(ck.g, ck.left, ck.top, ck.g.width / ck.S, ck.g.height / ck.S));
    vis.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1])).forEach(([, , ck]) => { if (ck.d) c.drawImage(ck.d, ck.left, ck.dTop, ck.d.width / ck.S, ck.d.height / ck.S); });
    // benda di desa (urut sekali di rebuild(), di sini cuma dipotong sesuai layar)
    const vis2 = (n) => !(n.x < gx0 - 8 || n.x > gx1 + 2 || n.y < gy0 - 8 || n.y > gy1 + 2);
    for (let i = 0; i < flatList.length; i++) if (vis2(flatList[i])) drawEntry(c, flatList[i], now, night, S);
    for (let i = 0; i < objList.length; i++) if (vis2(objList[i])) drawEntry(c, objList[i], now, night, S);
    // pratinjau penempatan
    if (hover && tool && tool !== 'bongkar') {
      const spec = CATALOG[tool], ok = canPlace(tool, hover[0], hover[1]) && V.coins >= spec.cost && curLevel >= spec.unlock;
      c.save(); c.globalAlpha = 0.62; drawThing(c, tool, hover[0], hover[1], 1, { t: now, night, nb: {} }); c.restore();
      outline(c, hover[0], hover[1], spec.size, ok ? '#B6F0A4' : '#F2A08E', ok ? 'rgba(160,230,140,0.28)' : 'rgba(240,120,100,0.3)');
    } else if (hover && tool === 'bongkar' && occ[hover[0] + ',' + hover[1]]) {
      const a = occ[hover[0] + ',' + hover[1]], [x, y] = a.split(',').map(Number);
      outline(c, x, y, sizeOf(W.tiles[a].t), '#F2A08E', 'rgba(240,120,100,0.3)');
    } else if (hover && !tool) outline(c, hover[0], hover[1], 1, 'rgba(255,255,255,0.7)');
    c.restore();
    if (night) { c.fillStyle = 'rgba(24,32,70,0.30)'; c.fillRect(0, 0, vw, vh); }
    lastNight = night; trimCache();
    // pantau beban: kalau laptop terengah-engah, otomatis hemat (resolusi & animasi dikurangi)
    const ms = performance.now() - t0; emaMs = emaMs * 0.9 + ms * 0.1;
    if (!lowFx && emaMs > 20) { lowFx = true; fastFrames = 0; chunks.clear(); }
    else if (lowFx) { fastFrames = emaMs < 6 ? fastFrames + 1 : 0; if (fastFrames > 200) { lowFx = false; fastFrames = 0; chunks.clear(); } }
  }
  function outline(c, x, y, s, col, fill) {
    const pts = [P(x, y, 0), P(x + s, y, 0), P(x + s, y + s, 0), P(x, y + s, 0)];
    poly(c, pts, fill || null, null); c.strokeStyle = col; c.lineWidth = 2; c.lineJoin = 'round'; c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.stroke();
  }
  // Gambar ulang hanya kalau ada yang berubah; kalau cuma animasi pelan, ~11 fps; kalau jendela nggak fokus, hampir berhenti.
  function loop(ts) {
    if (!running) return;
    requestAnimationFrame(loop);
    const active = ts - lastInput < 800, focused = document.hasFocus() && !document.hidden;
    const need = dirty ? (lowFx ? 50 : 24) : active ? (lowFx ? 50 : 33) : !focused ? 1500 : animSeen ? (lowFx ? 170 : 90) : 900;
    if (ts - lastDraw < need) return;
    lastDraw = ts; dirty = false; draw(Date.now());
  }
  function start() { if (running || !canvas) return; running = true; resize(); dirty = true; requestAnimationFrame(loop); refreshLive(); }
  function stop() { running = false; }
  function resize() { if (stage) { canvas.style.width = stage.clientWidth + 'px'; canvas.style.height = stage.clientHeight + 'px'; dirty = true; updateNav(); } }

  // ---- input ----
  function pos(e) { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  function touch() { lastInput = performance.now(); dirty = true; }
  function tryPaint(g) {
    if (!tool || tool === 'bongkar') return;
    const k = g[0] + ',' + g[1]; if (k === lastPaintKey) return; lastPaintKey = k;
    place(tool, g[0], g[1]);
  }
  // Sentuh: satu jari = geser/ketuk, dua jari = cubit untuk zoom.
  const ptrs = new Map(); let pinch = null;
  function pinchDist() { const a = [...ptrs.values()]; return Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]); }
  function onDown(e) {
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 2) { dragInfo = null; paint = false; pinch = { d: pinchDist() || 1, z: cam.z }; try { canvas.setPointerCapture(e.pointerId); } catch (_) {} return; }
    if (ptrs.size > 2) return;
    canvas.setPointerCapture(e.pointerId); touch();
    const [sx, sy] = pos(e), g = screenToGrid(sx, sy);
    dragInfo = { sx, sy, cx: cam.x, cy: cam.y, moved: false, button: e.button, g };
    if (e.button === 0 && tool && tool !== 'bongkar' && CATALOG[tool].drag) { paint = true; lastPaintKey = ''; tryPaint(g); }
  }
  function onMove(e) {
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && ptrs.size === 2) {
      const a = [...ptrs.values()], r = canvas.getBoundingClientRect();
      setZoom(pinch.z * pinchDist() / pinch.d, (a[0][0] + a[1][0]) / 2 - r.left, (a[0][1] + a[1][1]) / 2 - r.top);
      return;
    }
    if (ptrs.size > 1) return;
    const [sx, sy] = pos(e), g = screenToGrid(sx, sy);
    if (!hover || hover[0] !== g[0] || hover[1] !== g[1]) { hover = g; touch(); }
    if (!dragInfo) return;
    const dx = sx - dragInfo.sx, dy = sy - dragInfo.sy;
    if (!dragInfo.moved && Math.hypot(dx, dy) > 4) dragInfo.moved = true;
    if (paint) { tryPaint(g); return; }
    if (dragInfo.moved && (dragInfo.button !== 0 || !tool || tool === 'bongkar' || !CATALOG[tool].drag)) {
      if (dragInfo.button === 0 && tool && tool !== 'bongkar') return;      // klik-tahan saat pilih bangunan: jangan geser
      cam.x = dragInfo.cx + dx / cam.z; cam.y = dragInfo.cy + dy / cam.z; canvas.style.cursor = 'grabbing'; touch();
    }
  }
  function onUp(e) {
    if (e && ptrs.has(e.pointerId)) ptrs.delete(e.pointerId);
    if (pinch) { if (ptrs.size < 2) { pinch = null; if (W) { W.cam = { x: cam.x, y: cam.y, z: cam.z }; api.persist(); } } return; }
    if (!dragInfo) return;
    const d = dragInfo; dragInfo = null; canvas.style.cursor = ''; const wasPaint = paint; paint = false;
    if (d.moved || d.button !== 0 || wasPaint) { W.cam = { x: cam.x, y: cam.y, z: cam.z }; api.persist(); return; }
    const g = d.g, a = occ[g[0] + ',' + g[1]];
    if (tool === 'bongkar') { if (a) remove(a); }
    else if (tool) place(tool, g[0], g[1]);
    else { selected = a || null; renderInfo(); touch(); }
  }
  function setZoom(z, sx, sy) {
    sx = sx == null ? canvas.clientWidth / 2 : sx; sy = sy == null ? canvas.clientHeight / 2 : sy;
    const before = [(sx - canvas.clientWidth / 2) / cam.z - cam.x, (sy - canvas.clientHeight / 2) / cam.z - cam.y];
    cam.z = Math.max(MIN_Z, Math.min(MAX_Z, z));
    cam.x = (sx - canvas.clientWidth / 2) / cam.z - before[0]; cam.y = (sy - canvas.clientHeight / 2) / cam.z - before[1]; touch();
  }
  function onWheel(e) { e.preventDefault(); const [sx, sy] = pos(e); setZoom(cam.z * (e.deltaY < 0 ? 1.1 : 1 / 1.1), sx, sy); }
  function setTool(k) {
    tool = tool === k ? null : k; selected = null; canvas.style.cursor = tool ? 'crosshair' : '';
    renderBar(); renderInfo(); touch();
  }

  // ---- HUD, bar bangun, panel info, daftar dunia ----
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const COIN = '<svg class="dc-coin" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.2"/><circle cx="10" cy="10" r="5.4" class="in"/><path d="M10 12.6V8.2m0 0c-.9-1.5-2.2-1.8-3.1-1.5.1 1.3 1.1 2.2 3.1 1.5Zm0 0c.9-1.3 2.1-1.6 3-1.3-.1 1.2-1 2-3 1.3Z"/></svg>';
  function renderHud() {
    if (!V || !W) return;
    const base = levelBase(curLevel), nxt = levelBase(curLevel + 1);
    $('desaCoins').innerHTML = `${COIN}<strong>${V.coins}</strong>`;
    $('desaLevel').textContent = `Village level ${curLevel}`;
    $('desaLevelFill').style.width = Math.round(100 * (totalPts - base) / (nxt - base)) + '%';
    $('desaLevelText').textContent = `${nxt - totalPts} poin lagi ke level ${curLevel + 1}`;
    $('desaWorldName').textContent = W.name;
    const ec = expandCost(), b = $('desaExpand');
    b.innerHTML = `Perluas Village ${COIN}<strong>${ec}</strong>`; b.classList.toggle('is-poor', V.coins < ec);
    const lst = V.last; $('desaLast').textContent = lst ? (lst.clean ? (lst.coins ? `Sesi terakhir (${lst.full === false ? 'Pomodoro' : 'Mode Fokus'}): +${lst.coins} koin` : 'Sesi terakhir terlalu singkat') : (lst.reason === 'pause' ? 'Sesi terakhir: jeda terlalu lama, tanpa koin' : 'Sesi terakhir: keluar dari Readlify, tanpa koin')) : 'Belum ada sesi yang selesai';
    $('desaStreak').textContent = V.cleanStreak ? `${V.cleanStreak} sesi utuh beruntun` : 'Mulai deret sesi utuh';
    dirty = true;
  }
  function closeWorlds() { const b = $('desaWorlds'); if (b) b.hidden = true; }
  function renderWorlds() {
    const box = $('desaWorlds'), cost = newWorldCost();
    let h = '<div class="dw-list">';
    V.worlds.forEach((w) => { h += `<button type="button" class="dw-item${w.id === W.id ? ' is-active' : ''}" data-id="${w.id}"><span class="dw-sw" style="background:${BIOME[w.biome].inside[0]}"></span><span class="dw-name">${esc(w.name)}</span><span class="dw-sc">${worldScore(w)} poin</span></button>`; });
    h += `</div><label class="dw-rename"><span>Nama dunia ini</span><input id="dwName" maxlength="22" value="${esc(W.name)}" /></label>`;
    if (V.worlds.length >= MAX_WORLDS) h += `<p class="dw-note">Sudah ${MAX_WORLDS} dunia, itu batas maksimalnya.</p>`;
    else {
      h += `<div class="dw-new"><strong>Tambah dunia baru</strong><span>${COIN}${cost}</span></div><div class="dw-biomes">`;
      Object.keys(BIOME).forEach((k) => { h += `<button type="button" class="dw-biome${V.coins < cost ? ' is-poor' : ''}" data-biome="${k}"><span class="dw-sw" style="background:${BIOME[k].inside[0]}"></span>${BIOME[k].name}</button>`; });
      h += '</div><p class="dw-note">Koin dipakai bersama di semua dunia. Level Village dihitung dari total semua dunia.</p>';
    }
    box.innerHTML = h;
    box.querySelectorAll('.dw-item').forEach((b) => { b.onclick = () => { if (b.dataset.id !== W.id) { setActive(b.dataset.id); api.persist(); renderHud(); renderBar(); renderInfo(); } closeWorlds(); }; });
    box.querySelectorAll('.dw-biome').forEach((b) => { b.onclick = () => addWorld(b.dataset.biome); });
    $('dwName').oninput = (e) => { W.name = e.target.value.slice(0, 22) || 'Village'; $('desaWorldName').textContent = W.name; api.persist(); };
  }
  function thumb(key, size) {
    const cv = document.createElement('canvas'), w = 84, h = 70; cv.width = w * 2; cv.height = h * 2; cv.style.width = w + 'px'; cv.style.height = h + 'px';
    const c = cv.getContext('2d'), s = size === 2 ? 0.62 : 1.0;
    c.scale(2, 2); c.translate(w / 2, size === 2 ? 14 : 30); c.scale(s, s);
    for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) ground(c, i, j, true);
    drawThing(c, key, 0, 0, 1, { t: 2000, night: false, nb: {} });
    return cv;
  }
  const thumbCache = {};
  function cloneCanvas(src) { const n = document.createElement('canvas'); n.width = src.width; n.height = src.height; n.style.width = src.style.width; n.style.height = src.style.height; n.getContext('2d').drawImage(src, 0, 0); return n; }
  // tombol geser pengganti scrollbar di bar bangun
  let barCat = null;
  function updateNav() {
    const l = $('desaItems'), p = $('desaPrev'), n = $('desaNext'); if (!l || !p || !n) return;
    const over = l.scrollWidth > l.clientWidth + 2;
    p.classList.toggle('is-hidden', !over); n.classList.toggle('is-hidden', !over);
    p.disabled = l.scrollLeft <= 2; n.disabled = l.scrollLeft + l.clientWidth >= l.scrollWidth - 2;
  }
  function renderBar() {
    if (!V || !W) return;
    const tabs = $('desaTabs'); tabs.innerHTML = '';
    CATS.forEach((ct) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'dt-tab' + (cat === ct.id ? ' is-active' : ''); b.textContent = ct.name; b.onclick = () => { cat = ct.id; renderBar(); }; tabs.appendChild(b); });
    const bo = document.createElement('button'); bo.type = 'button'; bo.className = 'dt-tab dt-del' + (tool === 'bongkar' ? ' is-active' : ''); bo.textContent = 'Bongkar'; bo.onclick = () => setTool('bongkar'); tabs.appendChild(bo);
    const list = $('desaItems'); list.innerHTML = '';
    if (barCat !== cat) { list.style.scrollBehavior = 'auto'; list.scrollLeft = 0; list.style.scrollBehavior = ''; barCat = cat; }
    Object.keys(CATALOG).filter((k) => CATALOG[k].cat === cat).forEach((k) => {
      const sp = CATALOG[k], locked = curLevel < sp.unlock, poor = V.coins < sp.cost;
      const b = document.createElement('button'); b.type = 'button';
      b.className = 'di' + (tool === k ? ' is-active' : '') + (locked ? ' is-locked' : '') + (poor && !locked ? ' is-poor' : '');
      const th = thumbCache[k] || (thumbCache[k] = thumb(k, sp.size)); b.appendChild(cloneCanvas(th));
      const nm = document.createElement('span'); nm.className = 'di-name'; nm.textContent = sp.name; b.appendChild(nm);
      const pr = document.createElement('span'); pr.className = 'di-price'; pr.innerHTML = locked ? `Level ${sp.unlock}` : `${COIN}${sp.cost}`; b.appendChild(pr);
      b.title = sp.desc; b.disabled = locked; b.onclick = () => setTool(k);
      list.appendChild(b);
    });
    requestAnimationFrame(updateNav);
  }
  function renderInfo() {
    const box = $('desaInfo'); if (!V) return;
    if (tool && tool !== 'bongkar') { const sp = CATALOG[tool]; box.hidden = false; box.innerHTML = `<h3>${sp.name}</h3><p>${sp.desc}</p><p class="di-hint">Ketuk petak di Village buat membangun${sp.drag ? ', atau seret buat membangun beberapa sekaligus' : ''}. Ketuk lagi alat yang sama buat batal.</p>`; return; }
    if (tool === 'bongkar') { box.hidden = false; box.innerHTML = '<h3>Bongkar</h3><p>Ketuk bangunan buat membongkarnya. Kamu dapat setengah harga belinya kembali.</p><p class="di-hint">Ketuk lagi alat yang sama buat batal.</p>'; return; }
    if (!selected || !W.tiles[selected]) { box.hidden = true; return; }
    const e = W.tiles[selected], sp = CATALOG[e.t], lv = e.l || 1;
    let html = `<h3>${sp.name}${sp.upg ? ` <span class="di-lv">Lv ${lv}</span>` : ''}</h3><p>${sp.desc}</p><div class="di-actions">`;
    if (sp.upg && lv < sp.upg.length) html += `<button type="button" class="btn-primary" id="diUp">Tingkatkan ${COIN}<strong>${sp.upg[lv]}</strong></button>`;
    html += `<button type="button" class="btn-ghost" id="diDel">Bongkar (+${Math.floor(sp.cost / 2)})</button></div>`;
    box.hidden = false; box.innerHTML = html;
    const up = $('diUp'); if (up) up.onclick = () => upgrade(selected);
    $('diDel').onclick = () => remove(selected);
  }

  function init(opts) {
    api = opts; loadState();
    canvas = $('desaCanvas'); stage = $('desaStage'); if (!canvas || !stage) return;
    ctx = canvas.getContext('2d');
    canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; dragInfo = null; paint = false; });
    canvas.addEventListener('pointerleave', () => { hover = null; dirty = true; });
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && running && (tool || selected)) { tool = null; selected = null; canvas.style.cursor = ''; renderBar(); renderInfo(); touch(); } });
    document.addEventListener('click', (e) => { const b = $('desaWorlds'); if (b && !b.hidden && !b.contains(e.target) && !$('desaWorldBtn').contains(e.target)) closeWorlds(); });
    document.addEventListener('visibilitychange', () => { dirty = true; });
    $('desaWorldBtn').onclick = () => { const b = $('desaWorlds'); if (b.hidden) { renderWorlds(); b.hidden = false; } else b.hidden = true; };
    const shelf = $('desaItems');
    shelf.addEventListener('scroll', updateNav, { passive: true });
    shelf.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); shelf.scrollBy({ left: e.deltaY, behavior: 'auto' }); } }, { passive: false });
    $('desaPrev').onclick = () => shelf.scrollBy({ left: -shelf.clientWidth * 0.8, behavior: 'smooth' });
    $('desaNext').onclick = () => shelf.scrollBy({ left: shelf.clientWidth * 0.8, behavior: 'smooth' });
    $('desaExpand').onclick = expand;
    $('desaZoomIn').onclick = () => setZoom(cam.z * 1.2); $('desaZoomOut').onclick = () => setZoom(cam.z / 1.2);
    $('desaCenter').onclick = () => { cam.x = 0; cam.y = 40; cam.z = 1; touch(); };
    new ResizeObserver(resize).observe(stage);
    const view = $('view-desa');
    new MutationObserver(() => {
      if (view.classList.contains('is-active')) { start(); renderHud(); renderBar(); }
      else { stop(); W.cam = { x: cam.x, y: cam.y, z: cam.z }; api.persist(); chunks.clear(); }   // lepas memori saat menu Desa ditutup
    }).observe(view, { attributes: true, attributeFilter: ['class'] });
    if (window.api && window.api.onPresence) window.api.onPresence((p) => setPresence(p && p.away));
    renderHud(); renderBar(); refreshLive();
  }
  function resync() { loadState(); selected = null; tool = null; renderHud(); renderBar(); renderInfo(); refreshLive(); }
  const _debug = () => ({ chunks: chunks.size, sprites: sprites.size, lowFx, emaMs, animSeen });
  const _bench = (n) => { draw(Date.now()); const t = performance.now(); for (let i = 0; i < n; i++) draw(Date.now() + i * 90); return (performance.now() - t) / n; };

  Object.assign(engine, { init, resync, sessionStart, sessionPause, sessionResume, sessionCancel, focusEnded, sessionFinish, refreshLive, FOCUS_GRACE_SEC, _debug, _bench });
  root.Desa = engine;

})(typeof window !== 'undefined' ? window : this);
