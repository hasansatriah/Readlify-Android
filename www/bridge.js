/* ==========================================================================
   bridge.js — jembatan antara app.js dan Android (Capacitor).

   Di versi Windows, tugas ini dikerjakan preload.js + main.js (Electron):
   menyimpan data ke file JSON, jendela widget, notifikasi OS, buka link
   eksternal. Di Android semua itu diganti plugin Capacitor, tapi app.js
   tetap bicara lewat satu objek `window.api` — jadi logika aplikasinya
   tidak perlu tahu sedang jalan di mana.

   Aplikasi ini tanpa bundler, jadi plugin dipanggil lewat
   Capacitor.registerPlugin('NamaPlugin') (runtime inti dimuat dari
   capacitor.js). Kalau dibuka di browser biasa (untuk uji coba di PC),
   semua fungsi punya cadangan yang aman: penyimpanan jatuh ke localStorage
   dan fitur khusus Android dilewati tanpa error.
   ========================================================================== */
(() => {
  'use strict';

  const Cap = window.Capacitor;
  const native = !!(Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform());

  function plug(name) {
    if (!native || typeof Cap.registerPlugin !== 'function') return null;
    try { return (Cap.Plugins && Cap.Plugins[name]) || Cap.registerPlugin(name); }
    catch (_) { return null; }
  }

  const Prefs      = plug('Preferences');
  const LN         = plug('LocalNotifications');
  const AppPlugin  = plug('App');
  const Browser    = plug('Browser');
  const Share      = plug('Share');
  const FS         = plug('Filesystem');
  const Haptics    = plug('Haptics');
  const SystemBars = plug('SystemBars');

  // ------------------------------------------------------------------------
  // Penyimpanan data (pengganti file JSON di folder userData Electron)
  // ------------------------------------------------------------------------
  const DATA_KEY = 'readlify-data';

  async function readRaw() {
    if (Prefs) { const r = await Prefs.get({ key: DATA_KEY }); return r && r.value ? r.value : null; }
    return localStorage.getItem(DATA_KEY);
  }
  async function writeRaw(key, value) {
    if (Prefs) await Prefs.set({ key, value });
    else localStorage.setItem(key, value);
  }

  async function loadData() {
    let raw = null;
    try { raw = await readRaw(); } catch (e) { console.error('Gagal membaca data:', e); return null; }
    if (!raw) return null;
    try { return JSON.parse(raw); }
    catch (e) {
      // Data rusak: JANGAN langsung ditimpa data kosong. Simpan salinannya dulu
      // supaya masih bisa diselamatkan.
      console.error('Data rusak, disimpan sebagai cadangan:', e);
      try { await writeRaw(DATA_KEY + '.corrupt', raw); } catch (_) { /* abaikan */ }
      return null;
    }
  }

  async function saveData(data) {
    try { await writeRaw(DATA_KEY, JSON.stringify(data)); return true; }
    catch (e) { console.error('Gagal menyimpan data:', e); return false; }
  }

  // ------------------------------------------------------------------------
  // Notifikasi lokal (pengganti Notification milik proses utama Electron)
  // ------------------------------------------------------------------------
  const notif = {
    supported: !!LN,

    // 'granted' | 'denied' | 'prompt' | 'unsupported'
    async permission() {
      if (!LN) return 'unsupported';
      try { const r = await LN.checkPermissions(); return r.display === 'prompt-with-rationale' ? 'prompt' : r.display; }
      catch (_) { return 'unsupported'; }
    },
    async request() {
      if (!LN) return 'unsupported';
      try { const r = await LN.requestPermissions(); return r.display === 'prompt-with-rationale' ? 'prompt' : r.display; }
      catch (_) { return 'denied'; }
    },

    // Izin "Alarm & pengingat" (Android 12+) supaya notifikasi timer tepat waktu.
    // 'granted' | 'denied' | 'prompt' | 'unsupported'
    async exactPermission() {
      if (!LN || typeof LN.checkExactNotificationSetting !== 'function') return 'unsupported';
      try { const r = await LN.checkExactNotificationSetting(); return r.exact_alarm; }
      catch (_) { return 'unsupported'; }
    },
    async openExactSettings() {
      if (!LN || typeof LN.changeExactNotificationSetting !== 'function') return 'unsupported';
      try { const r = await LN.changeExactNotificationSetting(); return r.exact_alarm; }
      catch (_) { return 'unsupported'; }
    },

    // channels: [{ id, name, description, importance, sound, vibration }]
    async createChannels(channels) {
      if (!LN || typeof LN.createChannel !== 'function') return;
      for (const ch of channels) {
        try { await LN.createChannel(ch); } catch (e) { console.warn('Gagal membuat channel', ch.id, e); }
      }
    },

    // items: [{ id, title, body, at:Date, channelId, goto, exact }]
    // Tidak pernah memunculkan dialog izin sendiri: kalau izin belum diberikan, dilewati.
    async schedule(items) {
      if (!LN || !items.length) return false;
      if ((await notif.permission()) !== 'granted') return false;
      try {
        await LN.schedule({
          notifications: items.map(it => ({
            id: it.id,
            title: it.title,
            body: it.body,
            channelId: it.channelId,
            schedule: { at: it.at, allowWhileIdle: true },
            // exact=true hanya untuk timer, dan hanya kalau izinnya sudah ada
            // (kalau belum, plugin akan membuka layar pengaturan secara otomatis).
            isExactNotification: !!it.exact,
            autoCancel: true,
            extra: { goto: it.goto || '' },
          })),
        });
        return true;
      } catch (e) { console.warn('Gagal menjadwalkan notifikasi:', e); return false; }
    },

    async pendingIds() {
      if (!LN) return [];
      try { const r = await LN.getPending(); return (r.notifications || []).map(n => n.id); }
      catch (_) { return []; }
    },
    async cancel(ids) {
      if (!LN || !ids.length) return;
      try { await LN.cancel({ notifications: ids.map(id => ({ id })) }); }
      catch (e) { console.warn('Gagal membatalkan notifikasi:', e); }
    },
    // Notifikasi yang sudah tampil di bilah notifikasi (untuk dibersihkan saat app dibuka).
    async clearDelivered() {
      if (!LN || typeof LN.removeAllDeliveredNotifications !== 'function') return;
      try { await LN.removeAllDeliveredNotifications(); } catch (_) { /* abaikan */ }
    },
    onTap(cb) {
      if (!LN) return;
      LN.addListener('localNotificationActionPerformed', (ev) => {
        const extra = (ev && ev.notification && ev.notification.extra) || {};
        cb(extra.goto || '');
      });
    },
  };

  // ------------------------------------------------------------------------
  // Siklus hidup aplikasi & tombol kembali
  // ------------------------------------------------------------------------
  function onAppState(cb) {
    if (AppPlugin) AppPlugin.addListener('appStateChange', (s) => cb(!!s.isActive));
    else document.addEventListener('visibilitychange', () => cb(document.visibilityState === 'visible'));
  }

  // handler() -> true kalau tombol kembali sudah "dipakai" (tutup modal, pindah layar, dst.).
  // Kalau belum, aplikasi diminimalkan (bukan dimatikan) supaya timer tetap jalan.
  function onBack(handler) {
    if (!AppPlugin) return;
    AppPlugin.addListener('backButton', () => {
      let handled = false;
      try { handled = !!handler(); } catch (e) { console.error(e); }
      if (!handled) {
        const p = typeof AppPlugin.minimizeApp === 'function' ? AppPlugin.minimizeApp() : AppPlugin.exitApp();
        if (p && p.catch) p.catch(() => {});
      }
    });
  }

  // ------------------------------------------------------------------------
  // Hal-hal kecil
  // ------------------------------------------------------------------------
  function openExternal(url) {
    if (!/^https?:\/\//i.test(url)) return; // hanya http(s), sama seperti isSafeExternalUrl di main.js
    if (Browser) { Browser.open({ url }).catch(() => window.open(url, '_blank', 'noopener')); }
    else window.open(url, '_blank', 'noopener');
  }

  function vibrate(ms) {
    if (Haptics) Haptics.vibrate({ duration: ms || 300 }).catch(() => {});
    else if (navigator.vibrate) navigator.vibrate(ms || 300);
  }
  function tap() {
    if (Haptics) Haptics.impact({ style: 'LIGHT' }).catch(() => {});
  }

  // theme: 'dark' | 'light' → warna ikon status bar & bilah navigasi
  function setSystemBars(theme) {
    if (!SystemBars) return;
    SystemBars.setStyle({ style: theme === 'dark' ? 'DARK' : 'LIGHT' }).catch(() => {});
  }

  // ------------------------------------------------------------------------
  // Ekspor / impor cadangan (juga untuk memindahkan data dari versi Windows)
  // ------------------------------------------------------------------------
  async function exportBackup(text, filename) {
    if (FS && Share) {
      const res = await FS.writeFile({ path: filename, data: text, directory: 'CACHE', encoding: 'utf8' });
      try {
        await Share.share({
          title: 'Cadangan Readlify',
          text: 'Cadangan data Readlify',
          files: [res.uri],
          dialogTitle: 'Simpan atau bagikan cadangan',
        });
      } catch (e) {
        if (!/cancel/i.test(String(e && (e.message || e)))) throw e;
        return 'canceled';
      }
      return 'shared';
    }
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return 'downloaded';
  }

  window.api = {
    platform: native ? 'android' : 'web',
    loadData, saveData,
    notif,
    onAppState, onBack,
    openExternal, vibrate, tap, setSystemBars,
    exportBackup,
  };
})();
