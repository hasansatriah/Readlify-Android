// Memeriksa bahwa kode web aman untuk WebView lama (mis. tablet Huawei tanpa layanan Google,
// yang WebView-nya bisa tertinggal jauh dari Chrome terbaru).
//   JS : harus lolos diurai sebagai ES2019 (tanpa ?. ?? dll.) + tidak memakai API baru yang berisiko.
//   CSS: tidak boleh memakai fitur yang baru (inset, :has, :is/:where, @container, dvh, aspect-ratio).
//        color-mix() boleh, asal ada deklarasi cadangan tepat sebelumnya (dibuat otomatis oleh pembuat CSS).
// Jalankan:  npm run check
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';

const www = join(dirname(fileURLToPath(import.meta.url)), '..', 'www');
let problems = 0;
const fail = (file, msg) => { problems++; console.error(`✗ ${file}: ${msg}`); };

// ---- JS ----
const SKIP = new Set(['capacitor.js']); // dibuat oleh Capacitor
const BANNED_JS = [
  [/\.replaceAll\(/, 'String.replaceAll (Chrome 85+)'],
  [/\.at\(-?\d/, 'Array/String.at (Chrome 92+)'],
  [/structuredClone\(/, 'structuredClone (Chrome 98+)'],
  [/Object\.hasOwn\(/, 'Object.hasOwn (Chrome 93+)'],
  [/\.findLast(Index)?\(/, 'findLast (Chrome 97+)'],
  [/\.toSorted\(|\.toReversed\(/, 'toSorted/toReversed (Chrome 110+)'],
  [/\bcrypto\.randomUUID\(/, 'crypto.randomUUID (Chrome 92+, hanya konteks aman)'],
  [/\bnew AbortSignal\.timeout|AbortSignal\.timeout\(/, 'AbortSignal.timeout (Chrome 103+)'],
];
for (const f of readdirSync(www).filter((n) => n.endsWith('.js') && !SKIP.has(n))) {
  const src = readFileSync(join(www, f), 'utf8');
  try { parse(src, { ecmaVersion: 2019, sourceType: 'script', allowHashBang: true }); }
  catch (e) { fail(f, `bukan ES2019 yang valid: ${e.message}`); continue; }
  // buang komentar & string sederhana supaya tidak salah deteksi
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  for (const [re, why] of BANNED_JS) if (re.test(code)) fail(f, `memakai ${why}`);
}

// ---- CSS ----
{
  const css = readFileSync(join(www, 'styles.css'), 'utf8');
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const BANNED_CSS = [
    [/(^|[;{\s])inset\s*:/m, 'inset (Chrome 87+) — pakai top/right/bottom/left'],
    [/:has\(/, ':has() (Chrome 105+)'],
    [/:is\(|:where\(/, ':is()/:where() (Chrome 88+)'],
    [/@container/, '@container (Chrome 105+)'],
    [/\b\d+(\.\d+)?d?vh\b.*dvh|\bdvh\b|\bsvh\b|\blvh\b/, 'satuan dvh/svh/lvh (Chrome 108+)'],
    [/aspect-ratio\s*:/, 'aspect-ratio (Chrome 88+)'],
    [/@layer\b/, '@layer (Chrome 99+)'],
  ];
  for (const [re, why] of BANNED_CSS) if (re.test(stripped)) fail('styles.css', `memakai ${why}`);
  // setiap color-mix() di luar custom property & @supports harus didahului deklarasi cadangan
  const lines = stripped.split('\n');
  lines.forEach((ln, i) => {
    if (!/color-mix\(/.test(ln)) return;
    if (/@supports/.test(ln) || /--[\w-]+\s*:\s*color-mix\(/.test(ln)) return;
    if (!/;\s*[\w-]+\s*:[^;]*color-mix\(/.test(ln) && !/rgba?\(|var\(--/.test(ln.split('color-mix')[0])) {
      fail('styles.css', `baris ${i + 1}: color-mix() tanpa deklarasi cadangan`);
    }
  });
}

// ---- HTML: semua id yang dipakai app.js harus ada ----
{
  const html = readFileSync(join(www, 'index.html'), 'utf8');
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const app = readFileSync(join(www, 'app.js'), 'utf8');
  const DYNAMIC = new Set(['appToast', 'toastStack']);
  for (const m of app.matchAll(/getElementById\('([^']+)'\)/g)) {
    if (!ids.has(m[1]) && !DYNAMIC.has(m[1])) fail('app.js', `id "${m[1]}" tidak ada di index.html`);
  }
}

if (problems) { console.error(`\n${problems} masalah kompatibilitas.`); process.exit(1); }
console.log('✓ Kompatibilitas WebView lama: JS ES2019, CSS aman, id lengkap.');
