/* ==========================================================================
   docs-parse.js — pembaca dokumen Word / OpenDocument / RTF untuk EdDOC.

   Di Windows pekerjaan ini dikerjakan proses utama Electron (lib-docs.js, Node). Di Android
   semuanya jalan di WebView: .docx lewat mammoth (vendor/mammoth.js), .odt lewat JSZip
   (vendor/jszip.min.js), .rtf lewat pengurai kecil di bawah. File dibaca apa adanya dan
   tidak pernah diubah.

   Hasilnya sama persis dengan versi Windows, jadi eddoc.js tidak tahu bedanya:
     { ok:true, kind:'html', html }                 -> jadi blok judul/paragraf/daftar
     { ok:true, kind:'text', text, style:'lines' }  -> tiap baris tak kosong = satu paragraf
   Format .doc lama (biner OLE2) belum didukung di Android: simpan ulang sebagai .docx.
   ========================================================================== */
(() => {
  'use strict';

  const MAX_PARSE = 60 * 1024 * 1024; // di HP lebih kecil daripada di PC (memori terbatas)

  const extOf = (name) => { const m = /\.([a-z0-9]+)$/i.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; };

  const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  function decodeXml(s) {
    return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, g) => {
      if (g[0] === '#') {
        const code = g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
        try { return String.fromCodePoint(code); } catch (e) { return ''; }
      }
      return Object.prototype.hasOwnProperty.call(ENTITIES, g.toLowerCase()) ? ENTITIES[g.toLowerCase()] : m;
    });
  }
  const escHtml = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const latin1 = (buf, from, to) => {
    let s = '';
    const end = Math.min(buf.length, to == null ? buf.length : to);
    for (let i = from || 0; i < end; i++) s += String.fromCharCode(buf[i]);
    return s;
  };

  async function parseDocx(buf) {
    const mammoth = window.mammoth;
    if (!mammoth) throw new Error('pembaca Word belum termuat');
    // Gambar dibuang: yang dibutuhkan cuma teks & strukturnya, dan base64 gambar bikin data jadi raksasa.
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const res = await mammoth.convertToHtml({ arrayBuffer: ab }, { convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: '' })) });
    return { kind: 'html', html: res.value };
  }

  // .odt = zip berisi content.xml. Judul (text:h), paragraf (text:p), dan butir daftar (text:list-item) diambil berurutan.
  async function parseOdt(buf) {
    if (!window.JSZip) throw new Error('pembaca ODT belum termuat');
    const zip = await window.JSZip.loadAsync(buf);
    const f = zip.file('content.xml');
    if (!f) throw new Error('File ODT ini nggak punya isi yang bisa dibaca.');
    const xml = await f.async('string');
    const body = (/<office:text[^>]*>([\s\S]*?)<\/office:text>/.exec(xml) || [null, xml])[1];
    const out = [];
    const re = /<text:(h|p)\b([^>]*)>([\s\S]*?)<\/text:\1>|<text:list-item\b[^>]*>/g;
    let m, inItem = false;
    while ((m = re.exec(body))) {
      if (!m[1]) { inItem = true; continue; }
      const inner = m[3]
        .replace(/<text:s\b[^>]*?(?:text:c="(\d+)")?[^>]*\/>/g, (_x, n) => ' '.repeat(Math.min(+n || 1, 20)))
        .replace(/<text:tab\s*\/>/g, '\t')
        .replace(/<text:line-break\s*\/>/g, '\n')
        .replace(/<[^>]+>/g, '');
      const text = decodeXml(inner).trim();
      if (!text) continue;
      if (m[1] === 'h') {
        const lv = /text:outline-level="(\d+)"/.exec(m[2]);
        const n = Math.min(6, Math.max(1, lv ? +lv[1] : 1));
        out.push('<h' + n + '>' + escHtml(text) + '</h' + n + '>');
        inItem = false;
      } else if (inItem) { out.push('<li>' + escHtml(text) + '</li>'); inItem = false; }
      else out.push('<p>' + escHtml(text) + '</p>');
    }
    return { kind: 'html', html: out.join('\n') };
  }

  // RTF: buang kontrol & grup yang bukan teks, ambil isinya. Cukup buat baca; bukan penampil RTF lengkap.
  function parseRtf(buf) {
    const src = latin1(buf, 0);
    const SKIP = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'header', 'footer', 'footnote', 'themedata', 'datastore', 'latentstyles', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'xmlnstbl', 'mmathPr', 'fldinst', 'bkmkstart', 'bkmkend', 'object']);
    let out = '';
    const stack = [];
    let skip = 0, uc = 1, i = 0;
    const n = src.length;
    let cp1252 = null;
    try { cp1252 = new TextDecoder('windows-1252'); } catch (e) { cp1252 = null; }
    const byteChar = (b) => (cp1252 ? cp1252.decode(Uint8Array.of(b)) : String.fromCharCode(b));
    while (i < n) {
      const ch = src[i];
      if (ch === '{') { stack.push({ skip, uc }); i++; if (src[i] === '\\' && src[i + 1] === '*') skip++; continue; }
      if (ch === '}') { const t = stack.pop(); if (t) { skip = t.skip; uc = t.uc; } i++; continue; }
      if (ch === '\\') {
        const nx = src[i + 1];
        if (nx === '\\' || nx === '{' || nx === '}') { if (!skip) out += nx; i += 2; continue; }
        if (nx === '\'') { const hex = src.substr(i + 2, 2); if (!skip) out += byteChar(parseInt(hex, 16) || 63); i += 4; continue; }
        if (nx === '~') { if (!skip) out += ' '; i += 2; continue; }
        if (nx === '_' || nx === '-') { if (!skip && nx === '_') out += '-'; i += 2; continue; }
        const w = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(src.slice(i, i + 40));
        if (!w) { i += 2; continue; }
        const word = w[1], arg = w[2] == null ? null : parseInt(w[2], 10);
        i += w[0].length;
        if (SKIP.has(word)) { skip++; continue; }
        if (word === 'uc' && arg != null) uc = arg;
        else if (word === 'u' && arg != null) {
          if (!skip) { try { out += String.fromCodePoint(arg < 0 ? arg + 65536 : arg); } catch (e) { /* abaikan */ } }
          // lewati karakter pengganti (biasanya "?")
          let k = uc;
          while (k > 0 && i < n) { if (src[i] === '\\' && src[i + 1] === '\'') i += 4; else i++; k--; }
        } else if (!skip && (word === 'par' || word === 'line' || word === 'sect' || word === 'page')) out += '\n';
        else if (!skip && (word === 'tab' || word === 'cell')) out += '\t';
        else if (!skip && word === 'row') out += '\n';
        else if (!skip && word === 'emdash') out += '—';
        else if (!skip && word === 'endash') out += '–';
        else if (!skip && word === 'lquote') out += '‘';
        else if (!skip && word === 'rquote') out += '’';
        else if (!skip && word === 'ldblquote') out += '“';
        else if (!skip && word === 'rdblquote') out += '”';
        else if (!skip && word === 'bullet') out += '•';
        continue;
      }
      if (ch === '\r' || ch === '\n') { i++; continue; }
      if (!skip) out += ch;
      i++;
    }
    return { kind: 'text', style: 'lines', text: out.replace(/\n{3,}/g, '\n\n') };
  }

  async function parseDocument(name, data) {
    const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
    try {
      if (!buf.length) throw new Error('File kosong.');
      if (buf.length > MAX_PARSE) throw new Error('File terlalu besar buat dibuka sebagai dokumen teks di HP.');
      const ext = extOf(name);
      const isZip = buf[0] === 0x50 && buf[1] === 0x4b;
      if (ext === 'docx') return Object.assign({ ok: true }, await parseDocx(buf));
      if (ext === 'doc') {
        // Beberapa file ".doc" sebenarnya .docx / RTF yang diganti nama. Kenali dari isinya.
        if (isZip) return Object.assign({ ok: true }, await parseDocx(buf));
        if (latin1(buf, 0, 8).indexOf('{\\rtf') >= 0) return Object.assign({ ok: true }, parseRtf(buf));
        return { ok: false, error: 'Format .doc lama (biner) belum bisa dibuka di Android. Simpan ulang sebagai .docx dulu, lalu buka lagi.' };
      }
      if (ext === 'odt') return Object.assign({ ok: true }, await parseOdt(buf));
      if (ext === 'rtf') return Object.assign({ ok: true }, parseRtf(buf));
      return { ok: false, error: 'Jenis dokumen ini belum didukung.' };
    } catch (e) {
      const msg = (e && e.message) || String(e);
      if (/password|encrypt/i.test(msg)) return { ok: false, error: 'Dokumen ini dikunci password, jadi belum bisa dibuka di sini.' };
      return { ok: false, error: 'Dokumen ini gagal dibaca (' + msg.slice(0, 120) + '). Mungkin filenya rusak?' };
    }
  }

  if (window.api) window.api.parseDocument = parseDocument;
  window.ReadlifyDocParse = { parseDocument, _parseRtf: parseRtf };
})();
