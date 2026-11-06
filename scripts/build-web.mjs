#!/usr/bin/env node
/**
 * Menyalin pustaka pihak ketiga ke www/ (aplikasi ini tanpa bundler):
 *  - capacitor.js            runtime inti Capacitor
 *  - vendor/pdfjs/*          PDF.js build "legacy" (jalan di WebView lama, mis. Huawei/EMUI tanpa update Chrome)
 *  - vendor/mammoth.js       pembaca .docx
 *  - vendor/jszip.min.js     pembaca .odt (zip)
 * Aman dijalankan berulang kali.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const from = (...p) => path.join(root, 'node_modules', ...p);
const to = (...p) => path.join(root, 'www', ...p);

const jobs = [
  [from('@capacitor', 'core', 'dist', 'capacitor.js'), to('capacitor.js')],
  [from('pdfjs-dist', 'legacy', 'build', 'pdf.min.js'), to('vendor', 'pdfjs', 'pdf.min.js')],
  [from('pdfjs-dist', 'legacy', 'build', 'pdf.worker.min.js'), to('vendor', 'pdfjs', 'pdf.worker.min.js')],
  [from('pdfjs-dist', 'LICENSE'), to('vendor', 'pdfjs', 'LICENSE.txt')],
  [from('mammoth', 'mammoth.browser.min.js'), to('vendor', 'mammoth.js')],
  [from('mammoth', 'LICENSE'), to('vendor', 'MAMMOTH-LICENSE.txt')],
  [from('jszip', 'dist', 'jszip.min.js'), to('vendor', 'jszip.min.js')],
  [from('jszip', 'LICENSE.markdown'), to('vendor', 'JSZIP-LICENSE.txt')],
];

let missing = 0;
for (const [src, dst] of jobs) {
  if (!fs.existsSync(src)) { console.error('! tidak ada:', path.relative(root, src), '(jalankan `npm install` dulu)'); missing++; continue; }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  console.log('•', path.relative(root, dst));
}
process.exit(missing ? 1 : 0);
