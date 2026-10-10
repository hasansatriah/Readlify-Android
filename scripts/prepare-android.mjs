#!/usr/bin/env node
/**
 * Menyiapkan proyek android/ (hasil `npx cap add android`) untuk Readlify.
 * Aman dijalankan berulang kali. Dipakai lokal maupun di GitHub Actions.
 *
 *  1. Menyalin ikon notifikasi (res/drawable) dan 5 suara alarm (res/raw)
 *  2. Mengisi versionName (dari package.json) dan versionCode (env VERSION_CODE / GITHUB_RUN_NUMBER)
 *  3. Mengaktifkan tampilan edge-to-edge di MainActivity (disarankan Capacitor 8)
 *       -> matikan dengan EDGE_TO_EDGE=0 kalau build bermasalah
 *  4. Kalau env KEYSTORE_PATH diisi: pasang signing config untuk build release
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (...p) => path.join(root, ...p);
const read = (p) => fs.readFileSync(p, 'utf8');

const androidDir = rel('android');
if (!fs.existsSync(path.join(androidDir, 'app'))) {
  console.error('Folder android/ belum ada. Jalankan dulu:  npx cap add android');
  process.exit(1);
}

const cfg = JSON.parse(read(rel('capacitor.config.json')));
const pkg = JSON.parse(read(rel('package.json')));
const res = path.join(androidDir, 'app', 'src', 'main', 'res');

// 1) resource tambahan ------------------------------------------------------
function copyDir(from, to) {
  if (!fs.existsSync(from)) return 0;
  fs.mkdirSync(to, { recursive: true });
  let n = 0;
  for (const f of fs.readdirSync(from)) { fs.copyFileSync(path.join(from, f), path.join(to, f)); n++; }
  return n;
}
const nDraw = copyDir(rel('resources', 'native', 'drawable'), path.join(res, 'drawable'));
const nRaw = copyDir(rel('resources', 'native', 'raw'), path.join(res, 'raw'));
console.log(`• resource: ${nDraw} drawable, ${nRaw} suara alarm disalin`);
if (nDraw < 1 || nRaw < 5) {
  console.error('! resources/native/ tidak lengkap (butuh 1 drawable + 5 file .wav). Pastikan folder itu ikut ter-commit.');
  process.exit(1);
}

// 2) versi + dependensi + signing -------------------------------------------
const gradlePath = path.join(androidDir, 'app', 'build.gradle');
let g = read(gradlePath);
const versionCode = parseInt(process.env.VERSION_CODE || process.env.GITHUB_RUN_NUMBER || '1', 10) || 1;
g = g.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
     .replace(/versionName\s+"[^"]*"/, `versionName "${pkg.version}"`);
console.log(`• versi: ${pkg.version} (code ${versionCode})`);

// androidx.activity dibutuhkan MainActivity untuk EdgeToEdge
if (!g.includes('androidx.activity:activity')) {
  g = g.replace(/(\n\s*implementation project\(':capacitor-android'\))/,
    `$1\n    implementation "androidx.activity:activity:$androidxActivityVersion"`);
}

if (process.env.KEYSTORE_PATH) {
  if (!g.includes('signingConfigs')) {
    g = g.replace(/android\s*\{/, `android {
    signingConfigs {
        release {
            storeFile file(System.getenv("KEYSTORE_PATH"))
            storePassword System.getenv("KEYSTORE_PASSWORD")
            keyAlias System.getenv("KEY_ALIAS")
            keyPassword System.getenv("KEY_PASSWORD")
        }
    }`);
    g = g.replace(/(buildTypes\s*\{\s*release\s*\{)/, `$1\n            signingConfig signingConfigs.release`);
  }
  console.log('• signing release: aktif (keystore dari env)');
}
fs.writeFileSync(gradlePath, g);

// 3) MainActivity: edge-to-edge ---------------------------------------------
if (process.env.EDGE_TO_EDGE !== '0') {
  const pkgPath = cfg.appId.split('.').join(path.sep);
  const mainPath = path.join(androidDir, 'app', 'src', 'main', 'java', pkgPath, 'MainActivity.java');
  if (fs.existsSync(mainPath)) {
    if (!read(mainPath).includes('EdgeToEdge')) {
      fs.writeFileSync(mainPath, `package ${cfg.appId};

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
    }
}
`);
    }
    console.log('• MainActivity: edge-to-edge aktif');
  } else {
    console.warn('! MainActivity.java tidak ditemukan di', mainPath);
  }
}
console.log('Selesai.');
