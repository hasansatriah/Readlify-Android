/* ==========================================================================
   docs-store.js — pustaka dokumen EdDOC (folder & file milik Readlify).

   Di Windows ini lib-store.js (Node) yang menyimpan file di Dokumen/Readlify/Dokumen. Di Android
   file disimpan di penyimpanan privat aplikasi (Readlify/Dokumen) lewat plugin Capacitor
   Filesystem. Di browser biasa (uji coba di PC) jatuh ke IndexedDB, jadi pustaka tetap bisa dicoba.

   Aturannya sama dengan versi Windows: semua operasi dikunci ke dalam folder pustaka, nama
   berbahaya ditolak/dibersihkan, isi file dicek sesuai ekstensinya, dan nama bentrok diberi
   nomor otomatis. Semua fungsi mengembalikan { ok:true, ... } atau { ok:false, error }.

   Catatan: penyimpanan privat aplikasi ikut terhapus kalau Readlify di-uninstall. Pakai
   "Bagikan / simpan" di menu file (⋯) untuk menyalin dokumen penting keluar dari aplikasi.
   ========================================================================== */
(() => {
  'use strict';
  if (!window.api) return;
  const api = window.api;

  const ROOT = 'Readlify/Dokumen';
  const DIR = 'DATA';
  const MAX_FILE = 200 * 1024 * 1024;

  const ILLEGAL = /[\\/:*?"<>|\u0000-\u001f]/g;
  const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  const EXT_TEXT = ['txt', 'text', 'md', 'markdown', 'log', 'csv', 'tsv', 'json', 'xml', 'yml', 'yaml', 'ini', 'cfg', 'tex', 'rst', 'srt', 'html', 'htm'];
  const SUPPORTED = ['pdf', 'docx', 'doc', 'odt', 'rtf'].concat(EXT_TEXT);
  const SUPPORTED_RE = new RegExp('\\.(' + SUPPORTED.join('|') + ')$', 'i');
  const extOf = (name) => { const m = /\.([a-z0-9]+)$/i.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; };
  const isSupportedName = (name) => SUPPORTED_RE.test(String(name || ''));

  function sanitizeSegment(name) {
    let s = String(name == null ? '' : name);
    try { s = s.normalize('NFC'); } catch (e) { /* abaikan */ }
    s = s.replace(ILLEGAL, '-').trim().replace(/[. ]+$/, '');
    if (!s || s === '.' || s === '..') return '';
    if (s.length > 120) s = s.slice(0, 120).trim();
    if (RESERVED.test(s)) s += '_';
    return s;
  }
  const withExt = (n, ext) => (ext && new RegExp('\\.' + ext + '$', 'i').test(n) ? n : n + (ext ? '.' + ext : ''));
  const joinRel = (a, b) => [a, b].filter(Boolean).join('/');
  const parentOf = (p) => (p.indexOf('/') >= 0 ? p.slice(0, p.lastIndexOf('/')) : '');
  const nameOf = (p) => p.slice(p.lastIndexOf('/') + 1);

  function headStr(buf, n) {
    let s = '';
    const end = Math.min(buf.length, n);
    for (let i = 0; i < end; i++) s += String.fromCharCode(buf[i]);
    return s;
  }
  // Cek singkat isi file sesuai ekstensinya, biar file rusak / salah jenis nggak masuk pustaka.
  function bytesMatchExt(buf, ext) {
    const h = headStr(buf, 1024);
    if (ext === 'pdf') return h.indexOf('%PDF-') >= 0;
    if (ext === 'docx' || ext === 'odt') return buf[0] === 0x50 && buf[1] === 0x4b; // zip: "PK"
    if (ext === 'doc') return buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0 || (buf[0] === 0x50 && buf[1] === 0x4b) || h.slice(0, 8).indexOf('{\\rtf') >= 0;
    if (ext === 'rtf') return h.slice(0, 8).indexOf('{\\rtf') >= 0;
    if ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff)) return true; // teks UTF-16 (punya BOM)
    return h.indexOf('\u0000') < 0; // file teks: nggak boleh ada byte nol (biasanya tanda file biner)
  }

  // Path relatif ('Proyek/Bab 2/a.pdf') -> bagian-bagian yang dijamin aman di dalam pustaka.
  function resolveRel(rel) {
    const parts = String(rel == null ? '' : rel).split('/').filter(Boolean);
    for (const p of parts) if (p === '.' || p === '..' || /[\\/:*?"<>|\u0000-\u001f]/.test(p)) throw new Error('Nama folder/file tidak valid.');
    if (parts.length > 10) throw new Error('Folder terlalu dalam.');
    return { parts, rel: parts.join('/') };
  }

  // ------------------------------------------------------------------------
  // Adapter 1: Capacitor Filesystem (Android)
  // ------------------------------------------------------------------------
  function nativeAdapter(FS) {
    const full = (rel) => (rel ? ROOT + '/' + rel : ROOT);
    const isDirType = (t) => t === 'directory' || t === 'dir';
    const blobToBase64 = (blob) => new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => { const s = String(fr.result || ''); resolve(s.slice(s.indexOf(',') + 1)); };
      fr.onerror = () => reject(fr.error || new Error('gagal membaca data'));
      fr.readAsDataURL(blob);
    });
    function base64ToBytes(b64) {
      const bin = atob(b64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    return {
      native: true,
      label: 'Penyimpanan aplikasi › ' + ROOT,
      async stat(rel) {
        try {
          const s = await FS.stat({ path: full(rel), directory: DIR });
          return { type: isDirType(s.type) ? 'dir' : 'file', size: s.size || 0, mtimeMs: Number(s.mtime) || 0, uri: s.uri };
        } catch (e) { return null; }
      },
      async readdir(rel) {
        const r = await FS.readdir({ path: full(rel), directory: DIR });
        return (r.files || []).map((f) => ({ name: f.name, type: isDirType(f.type) ? 'dir' : 'file', size: f.size || 0, mtimeMs: Number(f.mtime) || 0 }));
      },
      async mkdirp(rel) {
        try { await FS.mkdir({ path: full(rel), directory: DIR, recursive: true }); }
        catch (e) { if (!/exist/i.test(String((e && e.message) || e))) throw e; }
      },
      async write(rel, bytes) {
        const data = await blobToBase64(new Blob([bytes]));
        await FS.writeFile({ path: full(rel), directory: DIR, data, recursive: true });
      },
      async read(rel) {
        // Jalur cepat: ambil lewat server lokal WebView (tanpa base64 lewat jembatan).
        try {
          const u = await FS.getUri({ path: full(rel), directory: DIR });
          const url = window.Capacitor.convertFileSrc(u.uri);
          const res = await fetch(url);
          if (res.ok) return new Uint8Array(await res.arrayBuffer());
        } catch (e) { /* jatuh ke cara biasa */ }
        const r = await FS.readFile({ path: full(rel), directory: DIR });
        if (typeof r.data === 'string') return base64ToBytes(r.data);
        return new Uint8Array(await r.data.arrayBuffer());
      },
      async rename(from, to) { await FS.rename({ from: full(from), to: full(to), directory: DIR, toDirectory: DIR }); },
      async remove(rel, isDir) {
        if (isDir) await FS.rmdir({ path: full(rel), directory: DIR, recursive: true });
        else await FS.deleteFile({ path: full(rel), directory: DIR });
      },
      async uri(rel) { const u = await FS.getUri({ path: full(rel), directory: DIR }); return u.uri; },
    };
  }

  // ------------------------------------------------------------------------
  // Adapter 2: IndexedDB (browser biasa, untuk uji coba di PC)
  // ------------------------------------------------------------------------
  function idbAdapter() {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((resolve, reject) => {
      const rq = indexedDB.open('readlify-docs', 1);
      rq.onupgradeneeded = () => { rq.result.createObjectStore('entries', { keyPath: 'path' }); };
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
    }));
    const tx = async (mode, fn) => {
      const db = await open();
      return new Promise((resolve, reject) => {
        const t = db.transaction('entries', mode);
        let out;
        Promise.resolve(fn(t.objectStore('entries'))).then((v) => { out = v; }, reject);
        t.oncomplete = () => resolve(out);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error || new Error('transaksi dibatalkan'));
      });
    };
    const req = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const all = () => tx('readonly', (s) => req(s.getAll()));
    return {
      native: false,
      label: 'Penyimpanan browser (uji coba)',
      async stat(rel) {
        if (!rel) return { type: 'dir', size: 0, mtimeMs: 0 };
        const e = await tx('readonly', (s) => req(s.get(rel)));
        return e ? { type: e.type, size: e.size || 0, mtimeMs: e.mtimeMs || 0 } : null;
      },
      async readdir(rel) {
        const rows = await all();
        return rows.filter((e) => parentOf(e.path) === rel).map((e) => ({ name: nameOf(e.path), type: e.type, size: e.size || 0, mtimeMs: e.mtimeMs || 0 }));
      },
      async mkdirp(rel) {
        const parts = rel.split('/').filter(Boolean);
        for (let i = 1; i <= parts.length; i++) {
          const p = parts.slice(0, i).join('/');
          await tx('readwrite', async (s) => { if (!(await req(s.get(p)))) s.put({ path: p, type: 'dir', mtimeMs: Date.now() }); });
        }
      },
      async write(rel, bytes) {
        const dir = parentOf(rel);
        if (dir) await this.mkdirp(dir);
        await tx('readwrite', (s) => { s.put({ path: rel, type: 'file', size: bytes.length, mtimeMs: Date.now(), data: bytes.slice().buffer }); });
      },
      async read(rel) {
        const e = await tx('readonly', (s) => req(s.get(rel)));
        if (!e || !e.data) throw new Error('File tidak ditemukan.');
        return new Uint8Array(e.data);
      },
      async rename(from, to) {
        const rows = await all();
        await tx('readwrite', (s) => {
          rows.forEach((e) => {
            if (e.path === from || e.path.indexOf(from + '/') === 0) {
              s.delete(e.path);
              s.put(Object.assign({}, e, { path: to + e.path.slice(from.length) }));
            }
          });
        });
      },
      async remove(rel) {
        const rows = await all();
        await tx('readwrite', (s) => { rows.forEach((e) => { if (e.path === rel || e.path.indexOf(rel + '/') === 0) s.delete(e.path); }); });
      },
      async uri() { return ''; },
    };
  }

  let adapter = null;
  function getAdapter() {
    if (adapter) return adapter;
    const FS = api.plug ? api.plug('Filesystem') : null;
    adapter = FS ? nativeAdapter(FS) : idbAdapter();
    return adapter;
  }

  // ------------------------------------------------------------------------
  // Logika pustaka (sama dengan lib-store.js di versi Windows)
  // ------------------------------------------------------------------------
  const exists = async (rel) => !!(await getAdapter().stat(rel));
  async function ensureRoot() { await getAdapter().mkdirp(''); }
  async function uniqueName(dirRel, name) {
    if (!(await exists(joinRel(dirRel, name)))) return name;
    const m = /(\.[^./]+)$/.exec(name);
    const ext = m ? m[1] : '';
    const base = name.slice(0, name.length - ext.length);
    for (let i = 2; i < 1000; i++) { const n = base + ' (' + i + ')' + ext; if (!(await exists(joinRel(dirRel, n)))) return n; }
    throw new Error('Nama file bentrok terus, coba nama lain.');
  }

  async function list() {
    await ensureRoot();
    const A = getAdapter();
    const out = { root: A.label, folders: [], files: [] };
    let count = 0;
    async function walk(rel, depth) {
      if (depth > 10 || count > 5000) return;
      let entries = [];
      try { entries = await A.readdir(rel); } catch (e) { return; }
      for (const e of entries) {
        if (e.name.charAt(0) === '.') continue;
        const p = joinRel(rel, e.name);
        if (e.type === 'dir') { count++; out.folders.push(p); await walk(p, depth + 1); }
        else if (isSupportedName(e.name)) {
          count++;
          out.files.push({ path: p, name: e.name, folder: rel, size: e.size, mtimeMs: e.mtimeMs });
        }
      }
    }
    await walk('', 0);
    return out;
  }

  async function importFile(folderRel, name, data) {
    await ensureRoot();
    const dir = resolveRel(folderRel);
    const safe = sanitizeSegment(name);
    if (!safe) throw new Error('Nama file tidak valid.');
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data || []);
    if (!bytes.length) throw new Error('File kosong.');
    if (bytes.length > MAX_FILE) throw new Error('File terlalu besar (maksimal 200 MB di HP).');
    const ext = extOf(safe);
    if (!isSupportedName(safe)) throw new Error('Jenis file ini belum didukung. Coba PDF, TXT, DOCX, atau format teks lain.');
    if (!bytesMatchExt(bytes, ext)) throw new Error('Isi file nggak cocok dengan ekstensi .' + ext + ', jadi nggak disimpan.');
    if (dir.rel) await getAdapter().mkdirp(dir.rel);
    const finalName = await uniqueName(dir.rel, safe);
    await getAdapter().write(joinRel(dir.rel, finalName), bytes);
    return { path: joinRel(dir.rel, finalName), name: finalName };
  }

  async function mkdir(parentRel, name) {
    await ensureRoot();
    const parent = resolveRel(parentRel);
    const safe = sanitizeSegment(name);
    if (!safe) throw new Error('Nama folder tidak valid.');
    const rel = joinRel(parent.rel, safe);
    if (await exists(rel)) throw new Error('Folder dengan nama itu sudah ada.');
    await getAdapter().mkdirp(rel);
    return { path: rel };
  }

  async function rename(rel, newName) {
    const src = resolveRel(rel);
    if (!src.parts.length) throw new Error('Folder utama nggak bisa diganti namanya.');
    const st = await getAdapter().stat(src.rel);
    if (!st) throw new Error('Item itu nggak ketemu.');
    let safe = sanitizeSegment(newName);
    if (!safe) throw new Error('Nama tidak valid.');
    if (st.type === 'file') safe = withExt(safe, extOf(src.rel));
    const parentRel = src.parts.slice(0, -1).join('/');
    const dest = joinRel(parentRel, safe);
    if (dest !== src.rel && (await exists(dest))) throw new Error('Nama itu sudah dipakai.');
    if (dest !== src.rel) await getAdapter().rename(src.rel, dest);
    return { path: dest };
  }

  async function move(rel, destFolderRel) {
    const src = resolveRel(rel);
    if (!src.parts.length) throw new Error('Folder utama nggak bisa dipindah.');
    const dest = resolveRel(destFolderRel);
    const st = await getAdapter().stat(src.rel);
    if (!st) throw new Error('Item itu nggak ketemu.');
    if (st.type === 'dir' && (dest.rel === src.rel || dest.rel.indexOf(src.rel + '/') === 0)) throw new Error('Folder nggak bisa dipindah ke dalam dirinya sendiri.');
    const name = src.parts[src.parts.length - 1];
    if (parentOf(src.rel) === dest.rel) return { path: src.rel };
    if (dest.rel) await getAdapter().mkdirp(dest.rel);
    let finalName = name;
    if (st.type === 'file') finalName = await uniqueName(dest.rel, name);
    else if (await exists(joinRel(dest.rel, name))) throw new Error('Di folder tujuan sudah ada folder dengan nama yang sama.');
    const to = joinRel(dest.rel, finalName);
    await getAdapter().rename(src.rel, to);
    return { path: to };
  }

  async function remove(rel) {
    const t = resolveRel(rel);
    if (!t.parts.length) throw new Error('Folder utama nggak bisa dihapus.');
    const st = await getAdapter().stat(t.rel);
    if (!st) throw new Error('Item itu nggak ketemu.');
    await getAdapter().remove(t.rel, st.type === 'dir'); // di HP tidak ada Recycle Bin: terhapus permanen
    return {};
  }

  async function read(rel) {
    const t = resolveRel(rel);
    if (!isSupportedName(t.rel)) throw new Error('Jenis file ini belum didukung.');
    const data = await getAdapter().read(t.rel);
    return { data, name: nameOf(t.rel) };
  }

  // Di Windows: "Tampilkan di File Explorer". Di Android: buka lembar "Bagikan / simpan" untuk file itu,
  // supaya dokumen bisa disalin keluar dari penyimpanan aplikasi (ke Drive, Files, WhatsApp, dll.).
  async function reveal(rel) {
    const t = resolveRel(rel);
    if (!t.parts.length) return {};
    const A = getAdapter();
    const st = await A.stat(t.rel);
    if (!st) throw new Error('Item itu nggak ketemu.');
    if (st.type === 'dir') throw new Error('Folder nggak bisa dibagikan sekaligus. Buka foldernya, lalu bagikan file satu per satu.');
    if (!A.native) throw new Error('Fitur bagikan cuma ada di aplikasi Android.');
    const res = await api.shareFile(await A.uri(t.rel), nameOf(t.rel));
    if (res === 'unsupported') throw new Error('Lembar bagikan nggak bisa dibuka di perangkat ini.');
    return {};
  }

  const call = (fn) => async (...args) => {
    try { return Object.assign({ ok: true }, await fn(...args)); }
    catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
  };

  api.libList = call(list);
  api.libImport = call(importFile);
  api.libMkdir = call(mkdir);
  api.libRename = call(rename);
  api.libMove = call(move);
  api.libDelete = call(remove);
  api.libRead = call(read);
  api.libReveal = call(reveal);
  api.libSupportedExts = SUPPORTED.slice();

  window.ReadlifyDocsStore = { _sanitizeSegment: sanitizeSegment, _bytesMatchExt: bytesMatchExt, _resolveRel: resolveRel, _isSupportedName: isSupportedName };
})();
