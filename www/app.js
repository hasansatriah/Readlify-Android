/* Readlify untuk Android — logika aplikasi.
   Diturunkan dari renderer.js versi Windows (Electron) 1.3.0: state, tugas, Pomodoro, Mode Fokus, daftar pustaka,
   EdDOC, Pencapaian, Village, catatan, dan pesan-pesannya sama. Yang berbeda hanya lapisan platform
   (lihat bridge.js) dan tata letak: tablet = tampilan desktop, HP = tab bar bawah. */
(() => {
  'use strict';

  // Versi teks Syarat & Ketentuan yang sedang berlaku (tanggal pembaruan).
  const TERMS_VERSION = '2026-10-09';

  // Mode tata letak: tablet (sisi terpendek layar >= 500 dp) memakai tampilan desktop,
  // HP memakai satu kolom + tab bar. Diputuskan sekali di awal & dipasang di <html>.
  // (Huawei MatePad T8 potret ~533 dp: tablet. HP biasa 360-430 dp: HP.)
  const WIDE_MIN_SHORT_SIDE = 500;
  let wideMode = false;
  function computeWide() {
    const sw = (window.screen && window.screen.width) || window.innerWidth;
    const sh = (window.screen && window.screen.height) || window.innerHeight;
    const short = Math.min(sw, sh, window.innerWidth || 9999, Math.max(window.innerWidth || 0, window.innerHeight || 0));
    return short >= WIDE_MIN_SHORT_SIDE;
  }
  function applyLayoutMode() {
    const w = computeWide();
    const root = document.documentElement;
    const changed = w !== wideMode || !(root.classList.contains('is-wide') || root.classList.contains('is-phone'));
    wideMode = w;
    root.classList.toggle('is-wide', w);
    root.classList.toggle('is-phone', !w);
    return changed;
  }
  function isWide() { return wideMode; }
  applyLayoutMode();

  // ============================================================
  // STATE
  // ============================================================
  const DEFAULT_STATE = () => ({
    userName: '',
    termsAccepted: false,
    termsAcceptedAt: '',
    termsVersion: '',
    termsHistory: [],
    theme: 'cozy-light',
    soundEnabled: true,
    tasks: [],
    citations: [],
    citationStyle: 'apa7',
    ach: null,
    village: null,
    notes: [],
    mood: { date: '', value: '' },
    pomodoro: {
      workSec: 25 * 60, shortSec: 5 * 60, longSec: 15 * 60, cycles: 4,
      sessionsToday: [], // {taskId, seconds, completedAt}
      streakDays: 0,
      lastActiveDate: '',
      streakToleranceLeft: 2,
      streakToleranceAnchor: '',
      soundVolume: 0.6,
      soundPreset: 'ting-lembut',
    },
    focusSettings: {
      blockEnabled: false,
      blockMode: 'preset', // 'preset' | 'custom'
      customSites: [],     // array of SOCIAL_SITES ids
      locked: false,       // "kunci pengaturan selagi Mode Fokus aktif"
    },
    focusScratch: '',
    reminders: {
      studyEnabled: false,
      studyTimes: [],
      idleNudgeEnabled: true,
      idleNudgeMinutes: 45,
      deadlineEnabled: true,
      deadlineLeadDays: [3, 1, 0],
      overdueEnabled: true,
    },
    reminderLog: {
      date: '',
      studyFiredTimes: [],
      idleLastFireAt: 0,
      deadlineFired: [],
      overdueFired: [],
      deadlineAt: {},
      overdueAt: {},
    },
    timerRun: null,      // keadaan timer Pomodoro, supaya bertahan saat app ditutup
    navPad: 0,           // jarak cadangan (dp) di atas tombol navigasi HP
    notifAsked: false,
    exactAsked: false,
  });

  let state = DEFAULT_STATE();
  let saveTimer = null;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => window.api.saveData(state), 300);
    scheduleReminderSync();
  }

  // Tulis ke penyimpanan sekarang juga (dipanggil saat app ke latar belakang).
  function flushSave() {
    clearTimeout(saveTimer);
    return window.api.saveData(state);
  }

  // Tanggal HARI INI menurut jam lokal (YYYY-MM-DD). Versi Windows memakai
  // toISOString() yang berbasis UTC, sehingga di WIB (UTC+7) "hari ini" baru
  // berganti pukul 07.00 pagi — berdampak ke deret harian & pengingat.
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function fmtDue(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    const today = new Date(); today.setHours(0,0,0,0);
    const diffDays = Math.round((d - today) / 86400000);
    const label = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    if (diffDays === 0) return `Hari ini`;
    if (diffDays === 1) return `Besok`;
    if (diffDays < 0) return `Telat · ${label}`;
    return label;
  }

  function fmtMMSS(totalSeconds) {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ============================================================
  // BOOTSTRAP
  // ============================================================
  async function boot() {
    const loaded = await window.api.loadData();
    if (loaded) {
      state = Object.assign(DEFAULT_STATE(), loaded, {
        pomodoro: Object.assign(DEFAULT_STATE().pomodoro, loaded.pomodoro || {}),
        focusSettings: Object.assign(DEFAULT_STATE().focusSettings, loaded.focusSettings || {}),
        reminders: Object.assign(DEFAULT_STATE().reminders, loaded.reminders || {}),
        reminderLog: Object.assign(DEFAULT_STATE().reminderLog, loaded.reminderLog || {}),
      });
      if (loaded.termsAccepted === undefined && loaded.eulaAccepted) {
        state.termsAccepted = true;
        state.termsVersion = 'EULA-lama';
        state.termsHistory = [{ version: 'EULA-lama', acceptedAt: '' }];
      }
      migrateOldPomodoroShape(loaded);
      migrateOldCicilanIntoTasks(loaded);
      migrateGeneralTaskTypes();
    }

    rolloverDailyThings();
    applyTheme();
    initNav();
    initHome();
    initTasks();
    initPomodoro();
    initCitations();
    initEdDoc();
    initAchievements();
    initDesa();
    initDonate();
    initFocus();
    initNotes();
    initSettings();
    initSoundSettings();
    initReminders();
    initMobile();

    renderAll();
    initTermsModal();
    runStartupGates();
  }

  // ============================================================
  // Syarat & Ketentuan — wajib disetujui sebelum bisa lanjut, dan
  // bisa dibaca ulang kapan aja lewat Pengaturan → Legal.
  // ============================================================
  function initTermsModal() {
    const modal = document.getElementById('termsModalOverlay');
    const checkbox = document.getElementById('termsAcceptCheckbox');
    const acceptBtn = document.getElementById('btnTermsAccept');
    const closeBtn = document.getElementById('btnTermsClose');
    if (!modal || !checkbox || !acceptBtn || !closeBtn) return;

    renderTermsStatus();

    checkbox.addEventListener('change', () => {
      acceptBtn.disabled = !checkbox.checked;
    });

    acceptBtn.addEventListener('click', () => {
      if (!checkbox.checked) return;
      const now = new Date().toISOString();
      state.termsAccepted = true;
      state.termsAcceptedAt = now;
      state.termsVersion = TERMS_VERSION;
      if (!Array.isArray(state.termsHistory)) state.termsHistory = [];
      state.termsHistory.push({ version: TERMS_VERSION, acceptedAt: now });
      // Catatan persetujuan langsung ditulis ke file lokal, tanpa menunggu
      // jeda penyimpanan biasa, supaya tidak hilang kalau app ditutup cepat.
      clearTimeout(saveTimer);
      window.api.saveData(state);
      renderTermsStatus();
      modal.classList.remove('is-open');
      runStartupGates();
    });

    closeBtn.addEventListener('click', () => {
      modal.classList.remove('is-open');
    });

    document.getElementById('btnViewTerms').addEventListener('click', () => {
      // Dibuka dari Pengaturan: mode "baca aja", checkbox & tombol setuju
      // gak wajib dipencet lagi karena Syarat & Ketentuannya udah pernah disetujui.
      openTermsModal({ requireAccept: false });
    });
  }

  function openTermsModal({ requireAccept }) {
    const modal = document.getElementById('termsModalOverlay');
    const acceptRow = document.getElementById('termsAcceptRow');
    const acceptBtn = document.getElementById('btnTermsAccept');
    const closeBtn = document.getElementById('btnTermsClose');
    const checkbox = document.getElementById('termsAcceptCheckbox');
    const body = document.getElementById('termsBody');

    const info = document.getElementById('termsAcceptedInfo');

    // Mode wajib setuju: checkbox kosong dan bisa dicentang.
    // Mode baca ulang (dari Pengaturan): checkbox tetap tercentang (terkunci)
    // beserta keterangan kapan disetujui, diambil dari file data lokal.
    acceptRow.hidden = false;
    acceptBtn.hidden = !requireAccept;
    closeBtn.hidden = requireAccept;
    checkbox.checked = !requireAccept && !!state.termsAccepted;
    checkbox.disabled = !requireAccept;
    acceptBtn.disabled = requireAccept;
    if (info) {
      info.textContent = termsAcceptedLabel();
      info.hidden = requireAccept || !state.termsAccepted;
    }
    body.scrollTop = 0;
    modal.classList.add('is-open');
  }

  // Teks keterangan persetujuan, mis. "Disetujui pada 8 Oktober 2026 14.05".
  function termsAcceptedLabel() {
    if (!state.termsAccepted) return '';
    if (!state.termsAcceptedAt) return 'Disetujui (tanggal tidak tercatat).';
    const d = new Date(state.termsAcceptedAt);
    if (isNaN(d)) return 'Disetujui.';
    const when = d.toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' });
    return `Disetujui pada ${when}.`;
  }

  // Tampilkan status persetujuan di kartu Legal (Pengaturan).
  function renderTermsStatus() {
    const el = document.getElementById('termsStatusText');
    if (!el) return;
    el.textContent = state.termsAccepted ? `✅ ${termsAcceptedLabel()}` : '';
    el.hidden = !state.termsAccepted;
  }

  // Jalanin gate onboarding secara berurutan: Syarat & Ketentuan dulu (kalau belum pernah
  // disetujui), baru nama panggilan (kalau belum pernah diisi). Dipanggil
  // ulang tiap satu gate kelar, biar gate berikutnya otomatis nyusul.
  function runStartupGates() {
    if (!state.termsAccepted) {
      openTermsModal({ requireAccept: true });
      return;
    }
    initOnboarding();
  }

  // ============================================================
  // ONBOARDING (tanya nama pas pertama kali buka aplikasi)
  // ============================================================
  function initOnboarding() {
    if (state.userName && state.userName.trim()) return; // udah pernah isi nama

    const modal = document.getElementById('onboardingModalOverlay');
    const input = document.getElementById('onboardingNameInput');
    const btn = document.getElementById('btnOnboardingSave');
    if (!modal || !input || !btn) return;

    modal.classList.add('is-open');
    setTimeout(() => input.focus(), 50);

    const save = () => {
      const name = input.value.trim();
      if (!name) {
        input.focus();
        input.classList.add('input-error');
        return;
      }
      state.userName = name;
      persist();
      modal.classList.remove('is-open');
      initHome();
      renderHome();
      syncProfileNameInput();
      promptNotifPermissionOnce();
    };

    btn.addEventListener('click', save);
    input.addEventListener('keydown', (e) => {
      input.classList.remove('input-error');
      if (e.key === 'Enter') save();
    });
  }

  // Older saved data stored whole minutes as `work`/`short`/`long`. Convert
  // those to the new *Sec fields so existing users don't lose their settings.
  function migrateOldPomodoroShape(loaded) {
    const old = loaded.pomodoro || {};
    if (old.workSec === undefined && typeof old.work === 'number') state.pomodoro.workSec = old.work * 60;
    if (old.shortSec === undefined && typeof old.short === 'number') state.pomodoro.shortSec = old.short * 60;
    if (old.longSec === undefined && typeof old.long === 'number') state.pomodoro.longSec = old.long * 60;
    // Older session log entries used `minutes` instead of `seconds`.
    state.pomodoro.sessionsToday = (state.pomodoro.sessionsToday || []).map(s =>
      s.seconds === undefined && s.minutes !== undefined ? { ...s, seconds: s.minutes * 60 } : s
    );
  }

  // "Cicil Duluan" dulu halaman terpisah buat nyicil tugas yang belum
  // resmi ditugaskan. Sekarang itu cukup dibuat lewat Tugas biasa (tenggat
  // boleh dikosongin kalau belum pasti) — satu fitur aja, gak dobel. Kalau
  // ada data cicilan lama, pindahin otomatis jadi Tugas sekali jalan biar
  // progres yang udah dikerjain gak hilang.
  function migrateOldCicilanIntoTasks(loaded) {
    const old = loaded.cicilan;
    if (Array.isArray(old) && old.length) {
      old.forEach(p => {
        state.tasks.push({
          id: p.id || uid(),
          status: (p.steps || []).some(s => s.done) ? 'berjalan' : 'belum',
          createdAt: p.createdAt || Date.now(),
          title: p.title || 'Tugas tanpa judul',
          type: p.type || 'lainnya',
          course: '',
          due: p.target || '',
          priority: 'normal',
          subtasks: (p.steps || []).map(s => ({ id: s.id || uid(), text: s.text, done: !!s.done })),
        });
      });
    }
    delete state.cicilan;
  }

    // Jenis tugas lama (praktikum/makalah/tugas biasa) -> jenis umum, supaya tugas yang sudah ada tetap tampil rapi.
  function migrateGeneralTaskTypes() {
    (state.tasks || []).forEach(t => {
      if (OLD_TASK_TYPE[t.type]) t.type = OLD_TASK_TYPE[t.type];
      else if (!TASK_TYPE_LABEL[t.type]) t.type = 'lainnya';
    });
  }

// Selisih hari kalender antara dua tanggal 'YYYY-MM-DD' (b - a).
  function daysBetween(a, b) {
    return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
  }

  function rolloverDailyThings() {
    const today = todayStr();
    const p = state.pomodoro;

    // --- Toleransi deret harian: tiap 7 hari di-refill balik ke 2, gak
    // numpuk/akumulasi — jadi jatahnya selalu maksimal 2 kapan pun dicek. ---
    if (!p.streakToleranceAnchor) {
      p.streakToleranceAnchor = today; // titik mulai jendela 7-harian pertama
    } else if (daysBetween(p.streakToleranceAnchor, today) >= 7) {
      p.streakToleranceLeft = 2;
      p.streakToleranceAnchor = today;
    }

    if (p.lastActiveDate && p.lastActiveDate !== today) {
      const gap = daysBetween(p.lastActiveDate, today);
      // Hari yang pasti bolong total (app gak dibuka sama sekali di
      // antaranya), ditambah hari terakhir kalau ternyata gak ada sesi
      // yang kelar di hari itu juga.
      let missedDays = Math.max(0, gap - 1);
      if (p.sessionsToday.length === 0) missedDays += 1;

      if (missedDays > 0) {
        if (p.streakToleranceLeft >= missedDays) {
          // Toleransi nutupin hari yang bolong — deret tetep sama, gak
          // balik ke nol.
          p.streakToleranceLeft -= missedDays;
        } else {
          p.streakDays = 0;
        }
      }
      p.sessionsToday = [];
    }
    if (state.mood.date !== today) state.mood = { date: today, value: '' };
    p.lastActiveDate = today;

    // Reminder log resets daily so jam-belajar reminders can fire again on
    // a fresh day. Also piggyback here to forget deadline/overdue entries
    // for tasks that got deleted or finished, so the log doesn't grow
    // forever.
    const rl = state.reminderLog;
    if (rl.date !== today) {
      rl.date = today;
      rl.studyFiredTimes = [];
    }
    const liveTaskIds = new Set(state.tasks.map(x => x.id));
    rl.deadlineFired = (rl.deadlineFired || []).filter(k => liveTaskIds.has(k.split(':')[0]));
    rl.overdueFired = (rl.overdueFired || []).filter(k => liveTaskIds.has(k.split(':')[0]));
    ['deadlineAt', 'overdueAt'].forEach(f => {
      if (!rl[f] || typeof rl[f] !== 'object' || Array.isArray(rl[f])) rl[f] = {};
      Object.keys(rl[f]).forEach(k => { if (!liveTaskIds.has(k.split(':')[0])) delete rl[f][k]; });
    });
  }

  function renderAll() {
    renderHome();
    renderTasks();
    renderPomodoroPanel();
    renderCitations();
    renderFocusTaskOptions();
    renderNotes();
    applyFocusLockUI();
  }

  // ============================================================
  // NAVIGATION
  //  - HP     : tab bar bawah; Village/Pustaka/Pencapaian/Catatan/Pengaturan ada di menu "Lainnya"
  //  - tablet : sidebar kiri persis seperti aplikasi desktop
  // ============================================================
  const TAB_OF = {
    beranda: 'beranda', tugas: 'tugas', pomodoro: 'pomodoro', fokus: 'pomodoro', eddoc: 'eddoc',
    lainnya: 'lainnya', sitasi: 'lainnya', pencapaian: 'lainnya', desa: 'lainnya', catatan: 'lainnya', pengaturan: 'lainnya',
  };
  const SUBVIEWS = new Set(['sitasi', 'pencapaian', 'desa', 'catatan', 'pengaturan']);
  let currentView = 'beranda';

  function initNav() {
    document.querySelectorAll('.tab-item[data-view], .nav-item[data-view]').forEach(btn => {
      btn.addEventListener('click', () => goToView(btn.dataset.view));
    });
    document.querySelectorAll('[data-goto]').forEach(btn => {
      btn.addEventListener('click', () => goToView(btn.dataset.goto));
    });
    let resizeT = null;
    const onResize = () => {
      clearTimeout(resizeT);
      resizeT = setTimeout(() => {
        if (applyLayoutMode()) { goToView(currentView); renderTasks(); }
      }, 150);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    goToView('beranda');
  }

  function goToView(name) {
    if (!TAB_OF[name]) name = 'beranda';
    if (name === 'lainnya' && isWide()) name = 'beranda'; // di tablet tidak ada menu "Lainnya"
    currentView = name;
    const tab = TAB_OF[name];
    document.querySelectorAll('.tab-item[data-view]').forEach(b => b.classList.toggle('is-active', b.dataset.view === tab));
    document.querySelectorAll('.nav-item[data-view]').forEach(b => b.classList.toggle('is-active', b.dataset.view === name || (name === 'fokus' && b.dataset.view === 'pomodoro')));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('is-active', v.id === `view-${name}`));
    document.body.dataset.view = name;
    const content = document.getElementById('content');
    if (content && name !== 'fokus') content.scrollTop = 0;
    updateFocusShell();
    syncDocOpenClass();
    if (name === 'pengaturan') refreshNotifStatus();
  }

  // Padding .content untuk dokumen terbuka (pengganti :has() yang tidak ada di WebView lama).
  function syncDocOpenClass() {
    const v = document.getElementById('view-eddoc'), c = document.getElementById('content');
    if (!v || !c) return;
    c.classList.toggle('eddoc-doc-open', v.classList.contains('is-active') && v.classList.contains('has-doc'));
  }

  // ------------------------------------------------------------
  // MODE FOKUS = SESI LAYAR PENUH (status bar & tombol navigasi disembunyikan, layar tetap menyala).
  // Keluar (tombol Selesai / tombol kembali) = sesi berakhir dan timer dijeda.
  // ------------------------------------------------------------
  let focusFullscreen = false;  // lagi layar penuh
  let focusMode = false;        // sesi Mode Fokus lagi aktif
  const isFocusViewActive = () => document.getElementById('view-fokus').classList.contains('is-active');
  function updateFocusShell() {
    const sh = document.querySelector('.shell');
    if (sh) {
      sh.classList.toggle('is-focus-session', focusMode);
      sh.classList.toggle('is-focus-full', focusMode && isFocusViewActive());
    }
    const hud = document.getElementById('focusHud');
    if (hud) hud.hidden = !(focusMode && !isFocusViewActive());
  }
  async function enterFocusMode(taskId) {
    if (taskId) {
      timer.linkedTaskId = taskId;
      const cfg = document.getElementById('cfgLinkedTask'); if (cfg) cfg.value = taskId;
    }
    document.getElementById('focusTaskSelect').value = timer.linkedTaskId || '';
    focusMode = true;
    goToView('fokus');
    try { await window.api.setFullScreen(true); } catch (e) { onFullScreenChange(true); }
  }
  function endFocusMode() {
    if (!focusMode) return;
    const wasRunning = timer.running;
    if (wasRunning) toggleTimer();            // jeda timer
    stopFocusBlockingIfNeeded();
    focusMode = false;
    desa('focusEnded');                       // sisa sesi dihitung sebagai pomodoro biasa (koin setengah)
    if (focusFullscreen) { focusFullscreen = false; window.api.setFullScreen(false); }
    if (isFocusViewActive()) goToView('pomodoro'); else updateFocusShell();
    if (wasRunning) appToast('Keluar dari Mode Fokus, jadi timernya dijeda ⏸️ Lanjut kapan pun kamu siap.');
  }
  function onFullScreenChange(isFull) {
    focusFullscreen = !!isFull;
    if (!focusFullscreen && focusMode) endFocusMode(); else updateFocusShell();
  }
  function requestExitFocus() {
    if (focusFullscreen) window.api.setFullScreen(false); // event layar penuh yang melanjutkan
    else endFocusMode();
  }

  // Toast kecil buat info singkat (dipakai pencapaian & Mode Fokus)
  let appToastTimer = null;
  function appToast(lines, onClick) {
    let t = document.getElementById('appToast');
    if (!t) {
      t = document.createElement('div'); t.id = 'appToast'; t.className = 'app-toast';
      t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite');
      document.body.appendChild(t);
    }
    const arr = Array.isArray(lines) ? lines : [lines];
    t.textContent = '';
    arr.forEach((ln) => { const p = document.createElement('p'); p.textContent = ln; t.appendChild(p); });
    t.classList.toggle('is-click', !!onClick);
    t.onclick = onClick ? () => { t.classList.remove('is-show'); onClick(); } : null;
    t.classList.add('is-show');
    clearTimeout(appToastTimer);
    appToastTimer = setTimeout(() => t.classList.remove('is-show'), 5200);
  }

  // ============================================================
  // HOME
  // ============================================================
  function initHome() {
    document.querySelectorAll('.mood-btn').forEach(btn => {
      if (btn.dataset.bound) return; // initHome() dipanggil ulang saat nama diubah
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => {
        state.mood = { date: todayStr(), value: btn.dataset.mood };
        persist();
        renderHome();
      });
    });

    const hour = new Date().getHours();
    const greetWord = hour < 11 ? 'Pagi' : hour < 15 ? 'Siang' : hour < 18 ? 'Sore' : 'Malam';
    const uname = (state.userName || '').trim();
    document.getElementById('greeting').textContent = uname ? `Met ${greetWord.toLowerCase()}, ${uname}! ✨` : `Met ${greetWord.toLowerCase()}! ✨`;
    document.getElementById('todayLine').textContent = new Date().toLocaleDateString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
  }

  const MOOD_NOTES = {
    lelah: 'Chill dulu, gak harus rampung semua hari ini. Satu langkah kecil aja udah menang.',
    biasa: 'Nice, tetep gas pelan-pelan juga sampai kok.',
    semangat: 'Gaskeun! Ini momen yang pas buat mulai sesi fokus, jangan disia-siain.',
    cemas: 'Tarik napas dulu bestie. Coba Mode Fokus biar distraksi pada minggir.',
  };

  function renderHome() {
    const active = state.tasks.filter(t => t.status !== 'selesai');
    document.getElementById('statActiveTasks').textContent = active.length;
    renderHomeHero();
    ['navTugasBadge', 'navTugasBadgeTab'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = active.length || ''; });

    const sessions = state.pomodoro.sessionsToday;
    document.getElementById('statSessionsToday').textContent = sessions.length;
    const totalSec = sessions.reduce((a, s) => a + (s.seconds || 0), 0);
    document.getElementById('statMinutesToday').textContent = `${Math.round(totalSec / 60)} menit`;
    document.getElementById('statStreak').textContent = state.pomodoro.streakDays;

    const list = document.getElementById('homeTaskList');
    const sorted = [...active].sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')).slice(0, 5);
    list.innerHTML = '';
    sorted.forEach(t => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="dot" style="background:var(--sage)"></span>${escapeHtml(t.title)}<span class="due">${fmtDue(t.due)}</span>`;
      list.appendChild(li);
    });
    document.getElementById('homeTaskEmpty').hidden = sorted.length > 0;

    document.querySelectorAll('.mood-btn').forEach(b => b.classList.toggle('is-active', b.dataset.mood === state.mood.value));
    document.getElementById('moodNote').textContent = state.mood.value ? MOOD_NOTES[state.mood.value] : '';
  }

  // Kartu "Mulai fokus" di Beranda HP: mengikuti keadaan timer.
  function renderHomeHero() {
    const t = document.getElementById('hhTime');
    if (!t) return;
    t.textContent = fmtMMSS(timer.remaining);
    const started = timer.remaining < timer.total;
    document.getElementById('hhMode').textContent = timer.running ? MODE_LABELS[timer.mode] + ' · berjalan' : (started ? MODE_LABELS[timer.mode] + ' · dijeda' : 'Siap fokus?');
    const n = state.pomodoro.sessionsToday.length, active = state.tasks.filter(x => x.status !== 'selesai').length;
    document.getElementById('hhSub').textContent = n + ' sesi hari ini · ' + active + ' tugas aktif';
    document.getElementById('hhBtn').textContent = timer.running ? 'Lihat timer' : (started ? 'Lanjut' : 'Mulai fokus');
  }

  // ============================================================
  // TASKS
  // ============================================================
  let currentFilter = 'semua';
  let showDone = false;
  let statusTab = 'belum';   // HP: tab status yang sedang dibuka
  let editingTaskId = null;
  let subtaskDraft = [];
  let expandedTaskIds = new Set();

  const TASK_TYPE_LABEL = { kerja: 'Kerja', belajar: 'Belajar', pribadi: 'Pribadi', lainnya: 'Lainnya' };
  // Jenis tugas versi lama (waktu aplikasi ini masih khusus kuliah) dipetakan ke jenis yang umum.
  const OLD_TASK_TYPE = { praktikum: 'belajar', makalah: 'belajar', tugas: 'lainnya' };

  function initTasks() {
    document.querySelectorAll('.chip[data-filter]').forEach(chip => {
      chip.addEventListener('click', () => {
        currentFilter = chip.dataset.filter;
        document.querySelectorAll('.chip[data-filter]').forEach(c => c.classList.toggle('is-active', c === chip));
        renderTasks();
      });
    });
    document.getElementById('chipShowDone').addEventListener('click', (e) => {
      showDone = !showDone;
      e.target.classList.toggle('is-active', showDone);
      renderTasks();
    });

    ['btnAddTask', 'btnFab'].forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener('click', () => openTaskModal()); });
    document.querySelectorAll('#taskSeg .seg-btn').forEach(b => {
      b.addEventListener('click', () => { statusTab = b.dataset.status; renderTasks(); });
    });
    document.getElementById('btnCancelTask').addEventListener('click', closeTaskModal);
    document.getElementById('btnSaveTask').addEventListener('click', saveTaskFromModal);
    document.getElementById('btnAddSubtask').addEventListener('click', () => addSubtaskRow(''));
    document.getElementById('taskModalOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'taskModalOverlay') closeTaskModal();
    });

    // "Pecah tugas jadi beberapa bagian" — paste banyak baris sekaligus,
    // satu baris langsung jadi satu langkah kecil.
    document.getElementById('btnBulkSubtask').addEventListener('click', () => {
      const ta = document.getElementById('subtaskBulkInput');
      const applyBtn = document.getElementById('btnBulkSubtaskApply');
      const show = ta.hidden;
      ta.hidden = !show;
      applyBtn.hidden = !show;
      if (show) ta.focus();
    });
    document.getElementById('btnBulkSubtaskApply').addEventListener('click', () => {
      const ta = document.getElementById('subtaskBulkInput');
      const lines = ta.value.split('\n').map(s => s.trim()).filter(Boolean);
      lines.forEach(line => addSubtaskRow(line));
      ta.value = '';
      ta.hidden = true;
      document.getElementById('btnBulkSubtaskApply').hidden = true;
    });
  }

  function openTaskModal(task, focusBreakdown) {
    editingTaskId = task ? task.id : null;
    document.getElementById('taskModalTitle').textContent = task ? 'Edit tugas' : 'Tugas baru';
    document.getElementById('taskTitle').value = task ? task.title : '';
    document.getElementById('taskType').value = task ? task.type : 'belajar';
    document.getElementById('taskCourse').value = task ? task.course : '';
    document.getElementById('taskDue').value = task ? task.due : '';
    document.getElementById('taskPriority').value = task ? task.priority : 'normal';

    subtaskDraft = task ? task.subtasks.map(s => ({ ...s })) : [];
    const editor = document.getElementById('subtaskEditor');
    editor.innerHTML = '';
    subtaskDraft.forEach((s) => addSubtaskRow(s.text));
    if (subtaskDraft.length === 0) addSubtaskRow('');

    const bulkInput = document.getElementById('subtaskBulkInput');
    bulkInput.value = '';
    bulkInput.hidden = true;
    document.getElementById('btnBulkSubtaskApply').hidden = true;

    document.getElementById('taskModalOverlay').classList.add('is-open');

    if (focusBreakdown) {
      setTimeout(() => {
        bulkInput.hidden = false;
        document.getElementById('btnBulkSubtaskApply').hidden = false;
        bulkInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        bulkInput.focus();
      }, 60);
    }
  }

  // insertAfterRow: when given, the new row lands right below it (so hitting
  // Enter mid-list drops the next step where you're looking, not at the
  // bottom). Omit it to just append — used for initial population/bulk-paste.
  function addSubtaskRow(text, insertAfterRow) {
    const editor = document.getElementById('subtaskEditor');
    const row = document.createElement('div');
    row.className = 'subtask-row';
    row.innerHTML = `<input type="text" value="${escapeHtml(text)}" placeholder="Langkah kecil…" />
                      <button type="button" title="Hapus">✕</button>`;
    const input = row.querySelector('input');
    row.querySelector('button').addEventListener('click', () => row.remove());

    // Enter = "tambahin langkah baru", biar nggak perlu bolak-balik klik
    // "+ Tambah langkah" tiap mau nulis satu poin lagi.
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const newRow = addSubtaskRow('', row);
      newRow.querySelector('input').focus();
    });

    if (insertAfterRow && insertAfterRow.parentElement === editor) {
      editor.insertBefore(row, insertAfterRow.nextSibling);
    } else {
      editor.appendChild(row);
    }
    return row;
  }

  function closeTaskModal() {
    document.getElementById('taskModalOverlay').classList.remove('is-open');
    editingTaskId = null;
  }

  function saveTaskFromModal() {
    const title = document.getElementById('taskTitle').value.trim();
    if (!title) { document.getElementById('taskTitle').focus(); return; }

    const subtasksText = [...document.querySelectorAll('#subtaskEditor input')]
      .map(i => i.value.trim()).filter(Boolean);

    const existing = editingTaskId ? state.tasks.find(t => t.id === editingTaskId) : null;
    const prevSubtasks = existing ? existing.subtasks : [];

    const subtasks = subtasksText.map(text => {
      const match = prevSubtasks.find(s => s.text === text);
      return { id: match ? match.id : uid(), text, done: match ? match.done : false };
    });

    const payload = {
      title,
      type: document.getElementById('taskType').value,
      course: document.getElementById('taskCourse').value.trim(),
      due: document.getElementById('taskDue').value,
      priority: document.getElementById('taskPriority').value,
      subtasks,
    };

    if (existing) {
      Object.assign(existing, payload);
    } else {
      const newTask = { id: uid(), status: 'belum', createdAt: Date.now(), ...payload };
      state.tasks.push(newTask);
      statusTab = 'belum';
      recordAch('task_created', { id: newTask.id });
    }
    persist();
    closeTaskModal();
    renderTasks(); renderHome(); renderFocusTaskOptions(); renderPomodoroLinkedOptions();
  }

  const SEG_COUNT_ID = { belum: 'segCountBelum', berjalan: 'segCountBerjalan', selesai: 'segCountSelesai' };
  const EMPTY_TASK_HINT = {
    belum: 'Gak ada tugas yang nunggu. Tekan tombol + buat nambah satu 🌿',
    berjalan: 'Belum ada tugas yang lagi jalan. Tekan “Gas” di salah satu tugas.',
    selesai: 'Belum ada tugas yang kelar.',
  };

  function renderTasks() {
    const board = document.getElementById('taskBoard');
    board.innerHTML = '';
    const passFilter = t => currentFilter === 'semua' || t.type === currentFilter;
    const byDue = (a, b) => (a.due || '9999').localeCompare(b.due || '9999');

    if (isWide()) {
      // Tablet: papan 3 kolom seperti di desktop; kolom "Kelar" lewat chip.
      [
        { key: 'belum', label: 'Belum dikerjakan' },
        { key: 'berjalan', label: 'Sedang jalan' },
        { key: 'selesai', label: 'Kelar' },
      ].forEach(col => {
        if (col.key === 'selesai' && !showDone) return;
        const wrap = document.createElement('div');
        wrap.className = 'task-col';
        const items = state.tasks.filter(t => t.status === col.key && passFilter(t));
        wrap.innerHTML = `<div class="task-col-head">${col.label} <span class="count">${items.length}</span></div>`;
        items.sort(byDue);
        items.forEach(t => wrap.appendChild(renderTaskCard(t)));
        board.appendChild(wrap);
      });
      return;
    }

    // HP: satu daftar per tab status.
    Object.keys(SEG_COUNT_ID).forEach(k => {
      const el = document.getElementById(SEG_COUNT_ID[k]);
      if (el) el.textContent = state.tasks.filter(t => t.status === k && passFilter(t)).length;
    });
    document.querySelectorAll('#taskSeg .seg-btn').forEach(b => b.classList.toggle('is-active', b.dataset.status === statusTab));
    const wrap = document.createElement('div');
    wrap.className = 'task-col';
    const items = state.tasks.filter(t => t.status === statusTab && passFilter(t));
    items.sort(byDue);
    items.forEach(t => wrap.appendChild(renderTaskCard(t)));
    if (!items.length) {
      const p = document.createElement('p');
      p.className = 'empty-hint';
      p.textContent = EMPTY_TASK_HINT[statusTab];
      wrap.appendChild(p);
    }
    board.appendChild(wrap);
  }

  function renderTaskCard(t) {
    const card = document.createElement('div');
    card.className = 'task-card' + (t.status === 'selesai' ? ' is-done' : '');
    const done = t.subtasks.filter(s => s.done).length;
    const total = t.subtasks.length;
    const isOpen = expandedTaskIds.has(t.id);

    card.innerHTML = `
      <div class="row-top">
        <button class="task-check ${t.status === 'selesai' ? 'is-checked' : ''}">${t.status === 'selesai' ? '✓' : ''}</button>
        <span class="task-title">${escapeHtml(t.title)}</span>
      </div>
      <div class="task-meta">
        <span class="tag tag-${t.type}">${TASK_TYPE_LABEL[t.type]}</span>
        ${t.priority === 'penting' ? '<span class="tag tag-prio-penting">Penting</span>' : ''}
        ${t.course ? `<span>${escapeHtml(t.course)}</span>` : ''}
        ${t.due ? `<span>· ${fmtDue(t.due)}</span>` : ''}
      </div>
      ${total ? `
      <button class="subtask-toggle" data-act="toggle-subtasks" type="button">
        <span class="subtask-caret">${isOpen ? '▾' : '▸'}</span>
        <span class="subtask-progress">${done}/${total} langkah kelar</span>
      </button>
      <div class="subtask-mini-bar"><div class="subtask-mini-fill" style="width:${Math.round((done/total)*100)}%"></div></div>
      <ul class="subtask-checklist" ${isOpen ? '' : 'hidden'}>
        ${t.subtasks.map(s => `
          <li class="${s.done ? 'is-done' : ''}">
            <label>
              <input type="checkbox" data-subtask-id="${s.id}" ${s.done ? 'checked' : ''} />
              <span>${escapeHtml(s.text)}</span>
            </label>
          </li>`).join('')}
      </ul>` : ''}
      <div class="task-actions">
        ${t.status === 'belum' ? '<button class="btn-ghost" data-act="mulai">Gas</button>' : ''}
        ${t.status === 'berjalan' ? '<button class="btn-ghost" data-act="fokus">Fokusin</button>' : ''}
        ${t.status !== 'selesai' ? '<button class="btn-ghost" data-act="pecah">Pecah</button>' : ''}
        <button class="btn-ghost" data-act="edit">Edit</button>
        <button class="btn-ghost" data-act="hapus">Hapus</button>
      </div>
    `;

    card.querySelector('.task-check').addEventListener('click', () => {
      const justCompleted = t.status !== 'selesai';
      t.status = t.status === 'selesai' ? 'berjalan' : 'selesai';
      persist(); renderTasks(); renderHome();
      if (justCompleted && t.status === 'selesai') { showPraiseToast(t); window.api.tap(); }
      if (t.status === 'selesai') {
        recordAch('task_done', { id: t.id, ageMs: Date.now() - (t.createdAt || 0), subtasks: t.subtasks.length, subDone: t.subtasks.filter(x => x.done).length });
      }
    });
    card.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.act;
        if (act === 'mulai') { t.status = 'berjalan'; persist(); renderTasks(); }
        if (act === 'edit') openTaskModal(t);
        if (act === 'pecah') openTaskModal(t, true);
        if (act === 'hapus') { state.tasks = state.tasks.filter(x => x.id !== t.id); persist(); renderTasks(); renderHome(); renderFocusTaskOptions(); }
        if (act === 'fokus') enterFocusMode(t.id);
        if (act === 'toggle-subtasks') {
          if (expandedTaskIds.has(t.id)) expandedTaskIds.delete(t.id); else expandedTaskIds.add(t.id);
          renderTasks();
        }
      });
    });
    card.querySelectorAll('.subtask-checklist input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const sub = t.subtasks.find(s => s.id === cb.dataset.subtaskId);
        if (!sub) return;
        sub.done = cb.checked;
        persist();
        renderTasks();
        if (sub.done) recordAch('subtask_done', { id: sub.id });
      });
    });

    return card;
  }

  // ============================================================
  // POMODORO ENGINE (dipakai kartu Pomodoro, Mode Fokus, dan HUD)
  // Android: hitungan mundur memakai WAKTU AKHIR (endAt), bukan "kurangi 1 tiap detik".
  // Saat layar mati / app di latar belakang, JavaScript bisa dibekukan sistem; dengan
  // endAt sisa waktu tetap benar begitu app dibuka lagi, dan notifikasi terjadwal
  // yang membunyikan alarm-nya.
  // ============================================================
  const MODE_LABELS = { work: 'Fokus', short: 'Istirahat Kilat', long: 'Istirahat Santuy' };
  let timer = {
    mode: 'work', remaining: 25 * 60, total: 25 * 60, running: false,
    cycleCount: 0, linkedTaskId: '', interval: null, endAt: 0,
  };
  const ID_TIMER_WORK = 9001, ID_TIMER_BREAK = 9002, ID_IDLE = 9100, ID_FOCUS_GUARD = 9200;

  function initPomodoro() {
    syncPomodoroInputsFromState();

    const durationIds = ['cfgWorkMin', 'cfgWorkSec', 'cfgShortMin', 'cfgShortSec', 'cfgLongMin', 'cfgLongSec'];
    durationIds.forEach(id => {
      const el = document.getElementById(id);
      el.addEventListener('change', () => applyPomodoroDurationInputs(id));
      guardNumberInput(el);
    });
    const cyclesEl = document.getElementById('cfgCycles');
    cyclesEl.addEventListener('change', (e) => {
      state.pomodoro.cycles = Math.max(1, parseInt(e.target.value) || 1);
      persist();
    });
    guardNumberInput(cyclesEl);

    document.getElementById('cfgLinkedTask').addEventListener('change', (e) => {
      timer.linkedTaskId = e.target.value;
    });

    document.getElementById('btnStartPause').addEventListener('click', toggleTimer);
    document.getElementById('btnResetTimer').addEventListener('click', () => resetTimerToMode(timer.mode));
    document.getElementById('btnSkipTimer').addEventListener('click', skipTimer);
    const miniBtn = document.getElementById('btnOpenMiniWidget'); if (miniBtn) miniBtn.hidden = true; // widget mengambang cuma ada di desktop
    document.getElementById('btnEnterFocusMode').addEventListener('click', () => (focusMode ? goToView('fokus') : enterFocusMode()));

    renderPomodoroLinkedOptions();
    restoreTimer();
  }

  function syncPomodoroInputsFromState() {
    const p = state.pomodoro;
    document.getElementById('cfgWorkMin').value = Math.floor(p.workSec / 60);
    document.getElementById('cfgWorkSec').value = p.workSec % 60;
    document.getElementById('cfgShortMin').value = Math.floor(p.shortSec / 60);
    document.getElementById('cfgShortSec').value = p.shortSec % 60;
    document.getElementById('cfgLongMin').value = Math.floor(p.longSec / 60);
    document.getElementById('cfgLongSec').value = p.longSec % 60;
    document.getElementById('cfgCycles').value = p.cycles;
  }

  // Reads the two mm/ss inputs for whichever duration just changed, clamps
  // the total to a sane minimum (5 seconds), saves it, and — if that mode
  // isn't currently mid-countdown — refreshes the on-screen timer right away.
  function applyPomodoroDurationInputs(changedId) {
    const group = changedId.startsWith('cfgWork') ? 'work' : changedId.startsWith('cfgShort') ? 'short' : 'long';
    const minEl = document.getElementById(`cfg${capitalize(group)}Min`);
    const secEl = document.getElementById(`cfg${capitalize(group)}Sec`);
    let min = Math.max(0, parseInt(minEl.value) || 0);
    let sec = Math.max(0, Math.min(59, parseInt(secEl.value) || 0));
    let total = min * 60 + sec;
    if (total < 5) { total = 5; min = 0; sec = 5; }
    minEl.value = min;
    secEl.value = sec;

    state.pomodoro[`${group}Sec`] = total;
    persist();

    if (!timer.running && timer.mode === group) {
      resetTimerToMode(group);
    }
  }

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // Pengingat "balik fokus": di Android dikerjakan lewat notifikasi terjadwal saat app
  // pindah ke latar belakang selagi sesi fokus berjalan (lihat onAppInactive).
  function syncFocusGuard() { /* tidak ada yang perlu disinkronkan terus-menerus di HP */ }

  // ------------------------------------------------------------
  // Sound cue + pilihan suara alarm
  // ------------------------------------------------------------
  let audioCtx = null;
  function unlockAudio() {
    // Browsers only allow audio to start after a real user gesture (the
    // "Gas" click). We unlock it here so the *automatic* ting later,
    // when the countdown hits zero on its own, is allowed to play.
    try {
      if (!audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        audioCtx = new Ctx();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { /* no Web Audio support — silently skip sound */ }
  }

  // A handful of synthesized alarm sounds (no audio files bundled — every
  // preset is just oscillators, scaled by `vol` which comes from the
  // volume slider in Pengaturan). Each preset's own peak gain is tuned so
  // that vol=1 feels "loud but not clipping" for that particular timbre.
  const SOUND_PRESETS = {
    'ting-lembut': {
      label: 'Ting Lembut',
      play(ctx, now, vol) {
        [880, 1318.51].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          const start = now + i * 0.14;
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.linearRampToValueAtTime(0.22 * vol, start + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
          osc.connect(gain).connect(ctx.destination);
          osc.start(start);
          osc.stop(start + 0.34);
        });
      },
    },
    'bel-klasik': {
      label: 'Bel Klasik',
      play(ctx, now, vol) {
        [523.25, 659.25, 783.99].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.value = freq;
          const start = now + i * 0.11;
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.linearRampToValueAtTime(0.25 * vol, start + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
          osc.connect(gain).connect(ctx.destination);
          osc.start(start);
          osc.stop(start + 0.42);
        });
      },
    },
    'kring-digital': {
      label: 'Kring Digital',
      play(ctx, now, vol) {
        [1046.5, 1046.5, 1046.5].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'square';
          osc.frequency.value = freq;
          const start = now + i * 0.16;
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.linearRampToValueAtTime(0.16 * vol, start + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.1);
          osc.connect(gain).connect(ctx.destination);
          osc.start(start);
          osc.stop(start + 0.12);
        });
      },
    },
    'marimba-riang': {
      label: 'Marimba Riang',
      play(ctx, now, vol) {
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          const start = now + i * 0.09;
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.linearRampToValueAtTime(0.2 * vol, start + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
          osc.connect(gain).connect(ctx.destination);
          osc.start(start);
          osc.stop(start + 0.3);
        });
      },
    },
    'bel-timer-analog': {
      label: 'Bel Timer Analog 🔔',
      // Niruin bunyi klasik timer dapur/pomodoro analog (yang model puter
      // angka itu lho): bel logam yang digetok cepet berkali-kali sama
      // palu kecil di dalamnya sampai jadi bunyi "brrriiing" yang
      // bergetar, bukan nada musik yang bersih kayak preset lain.
      play(ctx, now, vol) {
        const pulseCount = 18;
        const pulseGap = 0.085; // ~11-12 ketokan/detik, mirip getaran bel mekanik asli
        for (let i = 0; i < pulseCount; i++) {
          const start = now + i * pulseGap;
          // Dua harmonik logam (nada dasar + kuint di atasnya) numpuk jadi
          // satu ketokan bel, biar gak terdengar kayak beep sintetis.
          [2500, 3750].forEach((freq, h) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = freq;
            const peak = (h === 0 ? 0.19 : 0.09) * vol;
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.linearRampToValueAtTime(peak, start + 0.003);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.075);
            osc.connect(gain).connect(ctx.destination);
            osc.start(start);
            osc.stop(start + 0.08);
          });
        }
      },
    },
  };

  // Shared by the real end-of-session chime and the "Coba bunyi" preview
  // button in Pengaturan. Boosted 2x flat on top of the volume slider —
  // sebelumnya kerasa kurang nendang walau slider udah full ke kanan.
  const ALARM_VOLUME_BOOST = 2;
  function playChime() {
    if (!audioCtx) return;
    try {
      const preset = SOUND_PRESETS[state.pomodoro.soundPreset] || SOUND_PRESETS['ting-lembut'];
      preset.play(audioCtx, audioCtx.currentTime, state.pomodoro.soundVolume * ALARM_VOLUME_BOOST);
    } catch (e) { /* never let a sound glitch break the timer */ }
  }

  function playSessionEndChime() {
    if (!state.soundEnabled) return;
    playChime();
  }

  // Chrome/Electron's <input type="number"> silently bumps its value when the
  // mouse wheel scrolls over it (even without a click first) — the classic
  // reason "aku ngetik durasinya tapi kayak nggak kesimpen / balik berubah
  // lagi" happens: scrolling the settings card nudges whatever field the
  // cursor happens to be hovering. We stop that, and let Enter confirm the
  // value right away instead of waiting for the field to lose focus.
  function guardNumberInput(el) {
    el.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') el.blur();
    });
  }

  function renderPomodoroLinkedOptions() {
    const sel = document.getElementById('cfgLinkedTask');
    const cur = sel.value;
    sel.innerHTML = '<option value="">Gak dikaitin</option>';
    state.tasks.filter(t => t.status !== 'selesai').forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id; opt.textContent = t.title;
      sel.appendChild(opt);
    });
    sel.value = cur;
  }

  function secForMode(mode) {
    return { work: state.pomodoro.workSec, short: state.pomodoro.shortSec, long: state.pomodoro.longSec }[mode];
  }

  function saveTimerRun() {
    state.timerRun = {
      date: todayStr(), mode: timer.mode, total: timer.total, remaining: timer.remaining,
      cycleCount: timer.cycleCount, linkedTaskId: timer.linkedTaskId, running: timer.running, endAt: timer.endAt,
    };
    persist();
    syncTimerNotifications();
  }

  function startTick() {
    clearInterval(timer.interval);
    timer.interval = setInterval(tickTimer, 500);
  }

  function resetTimerToMode(mode) {
    clearInterval(timer.interval);
    timer.mode = mode;
    timer.running = false;
    timer.endAt = 0;
    desa('sessionCancel');
    timer.total = secForMode(mode);
    timer.remaining = timer.total;
    renderTimerUI();
    saveTimerRun();
  }

  function toggleTimer() {
    if (timer.running) {
      pauseTimer();
    } else {
      // Memulai sesi = "sudah gerak": reset jam dorongan lembut.
      state.reminderLog.idleLastFireAt = Date.now();
      if (timer.mode === 'work') { if (timer.remaining === timer.total) desa('sessionStart', focusMode); else desa('sessionResume'); }
      startTimerRunning();
      ensureTimerPermissions();
    }
  }

  function pauseTimer() {
    timer.remaining = Math.max(1, Math.ceil((timer.endAt - Date.now()) / 1000));
    timer.running = false;
    timer.endAt = 0;
    clearInterval(timer.interval);
    desa('sessionPause');
    renderTimerUI();
    saveTimerRun();
  }

  // fromTime: dipakai saat istirahat harus dihitung mulai dari detik sesi fokus
  // berakhir (mis. berakhir saat app di latar belakang), bukan dari "sekarang".
  function startTimerRunning(fromTime) {
    if (timer.running) return;
    unlockAudio();
    timer.running = true;
    timer.endAt = (fromTime || Date.now()) + timer.remaining * 1000;
    startTick();
    renderTimerUI();
    saveTimerRun();
  }

  function tickTimer() {
    timer.remaining = Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000));
    if (timer.remaining <= 0) {
      completeTimerSegment(false, timer.endAt);
      return;
    }
    renderTimerUI();
  }

  // silent=true: segmen ini selesai saat app tidak dilihat (notifikasi sudah berbunyi),
  // jadi tidak perlu membunyikan alarm dalam-aplikasi lagi.
  function completeTimerSegment(silent, finishedAt) {
    clearInterval(timer.interval);
    const doneAt = finishedAt || Date.now();
    if (!silent) { playSessionEndChime(); window.api.vibrate(350); }
    if (timer.mode === 'work') {
      state.pomodoro.sessionsToday.push({
        taskId: timer.linkedTaskId || null,
        seconds: state.pomodoro.workSec,
        completedAt: doneAt,
      });
      if (state.pomodoro.sessionsToday.length === 1) state.pomodoro.streakDays += 1;
      desa('sessionFinish', state.pomodoro.workSec);
      timer.cycleCount += 1;
      persist();
      renderHome(); renderPomodoroPanel();
      recordAch('session_done', { seconds: state.pomodoro.workSec, hour: new Date(doneAt).getHours(), fullscreen: focusMode && focusFullscreen });
      const nextMode = (timer.cycleCount % state.pomodoro.cycles === 0) ? 'long' : 'short';
      resetTimerToMode(nextMode);
      // Sesi fokus abis -> lanjut istirahat otomatis, gak perlu klik Gas lagi.
      startTimerRunning(doneAt);
    } else {
      // Balik ke sesi fokus tetep manual (klik Gas pas emang udah siap lagi).
      resetTimerToMode('work');
    }
  }

  // Dipanggil saat app dibuka lagi: kejar ketertinggalan (sesi fokus selesai -> istirahat
  // otomatis jalan -> mungkin istirahatnya juga sudah selesai).
  function reconcileTimer() {
    let guard = 0;
    while (timer.running && Date.now() >= timer.endAt && guard++ < 4) {
      const doneAt = timer.endAt;
      completeTimerSegment(Date.now() - doneAt > 4000, doneAt);
    }
    if (timer.running) timer.remaining = Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000));
    renderTimerUI();
  }

  function restoreTimer() {
    const r = state.timerRun;
    const valid = r && typeof r === 'object' && ['work', 'short', 'long'].includes(r.mode) && r.total > 0
      && (r.date === todayStr() || (r.running && r.endAt > 0));
    if (!valid) { resetTimerToMode('work'); return; }
    timer.mode = r.mode;
    timer.total = r.total;
    timer.cycleCount = r.cycleCount || 0;
    timer.linkedTaskId = r.linkedTaskId || '';
    timer.running = !!r.running && r.endAt > 0;
    timer.endAt = timer.running ? r.endAt : 0;
    timer.remaining = r.remaining > 0 ? Math.min(r.remaining, r.total) : r.total;
    const sel = document.getElementById('cfgLinkedTask');
    if (sel && timer.linkedTaskId) sel.value = timer.linkedTaskId;
    if (timer.running) { startTick(); reconcileTimer(); } else { renderTimerUI(); }
    syncTimerNotifications();
  }

  function skipTimer() {
    clearInterval(timer.interval);
    if (timer.mode === 'work') {
      resetTimerToMode((timer.cycleCount % state.pomodoro.cycles === 0 && timer.cycleCount > 0) ? 'long' : 'short');
    } else {
      resetTimerToMode('work');
    }
  }

  const RING_CIRC = 553;
  function renderTimerUI() {
    const txt = fmtMMSS(timer.remaining);
    const timerTimeEl = document.getElementById('timerTime');
    const timerModeEl = document.getElementById('timerMode');
    const focusTimeEl = document.getElementById('focusTime');
    if (timerTimeEl) timerTimeEl.textContent = txt;
    if (timerModeEl) timerModeEl.textContent = MODE_LABELS[timer.mode];
    if (focusTimeEl) focusTimeEl.textContent = txt;
    const focusModeEl = document.getElementById('focusModeLabel');
    if (focusModeEl) focusModeEl.textContent = MODE_LABELS[timer.mode];
    const fhTime = document.getElementById('fhTime');
    if (fhTime) {
      fhTime.textContent = txt;
      document.getElementById('fhLabel').textContent = MODE_LABELS[timer.mode];
      const tg = document.getElementById('fhToggle');
      tg.textContent = timer.running ? '⏸' : '▶';
      tg.setAttribute('aria-label', timer.running ? 'Jeda timer' : 'Lanjutkan timer');
    }

    const ring = document.getElementById('ringProgress');
    if (ring) {
      const frac = timer.remaining / timer.total;
      ring.style.strokeDashoffset = String(RING_CIRC * (1 - frac));
    }
    const label = timer.running ? 'Jeda' : (timer.remaining < timer.total ? 'Lanjut' : 'Gas');
    const btn = document.getElementById('btnStartPause');
    if (btn) btn.textContent = label;
    const fbtn = document.getElementById('focusStartPause');
    if (fbtn) fbtn.textContent = label;
    desa('refreshLive');
    renderHomeHero();
  }

  function renderPomodoroPanel() {
    const list = document.getElementById('pomodoroHistory');
    const sessions = state.pomodoro.sessionsToday;
    list.innerHTML = '';
    [...sessions].reverse().forEach(s => {
      const li = document.createElement('li');
      const task = state.tasks.find(t => t.id === s.taskId);
      const time = new Date(s.completedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      li.innerHTML = `<span class="dot" style="background:var(--honey)"></span>${fmtMMSS(s.seconds || 0)}${task ? ' · ' + escapeHtml(task.title) : ''}<span class="due">${time}</span>`;
      list.appendChild(li);
    });
    document.getElementById('pomodoroHistoryEmpty').hidden = sessions.length > 0;
  }

  // ============================================================
  // FOCUS MODE (reuses the same timer engine) + site blocking
  // ============================================================
  // WhatsApp is intentionally never in this catalog — "blokir semua
  // (kecuali WhatsApp)" is enforced simply by it never being offered here.
  const SOCIAL_SITES = [
    { id: 'instagram', label: 'Instagram', domains: ['instagram.com', 'www.instagram.com'] },
    { id: 'tiktok', label: 'TikTok', domains: ['tiktok.com', 'www.tiktok.com'] },
    { id: 'facebook', label: 'Facebook', domains: ['facebook.com', 'www.facebook.com', 'm.facebook.com'] },
    { id: 'twitter', label: 'X / Twitter', domains: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'] },
    { id: 'snapchat', label: 'Snapchat', domains: ['snapchat.com', 'www.snapchat.com'] },
    { id: 'youtube', label: 'YouTube', domains: ['youtube.com', 'www.youtube.com', 'm.youtube.com'] },
    { id: 'reddit', label: 'Reddit', domains: ['reddit.com', 'www.reddit.com'] },
    { id: 'discord', label: 'Discord (web)', domains: ['discord.com', 'www.discord.com'] },
  ];

  const LOCK_PRAISES = [
    '🔥 Gila sih, niat kamu buat komit emang beda level. Salut!',
    '👏 Mantap banget! Ini baru namanya serius sama diri sendiri.',
    '✨ Respect! Kamu baru aja upgrade diri jadi versi paling disiplin.',
    '💪 Nice choice! Masa depan kamu bakal makasih banget soal ini.',
  ];

  let focusSessionActive = false; // true from first "Gas" until exit/reset

  function initFocus() {
    document.getElementById('focusStartPause').addEventListener('click', async () => {
      const isFreshStart = !timer.running && timer.remaining === timer.total;
      toggleTimer();
      if (timer.running && isFreshStart) await startFocusBlockingIfNeeded();
    });
    document.getElementById('focusReset').addEventListener('click', async () => {
      resetTimerToMode(timer.mode);
      await stopFocusBlockingIfNeeded();
    });
    document.getElementById('btnExitFocus').addEventListener('click', requestExitFocus);
    document.getElementById('fhToggle').addEventListener('click', () => toggleTimer());
    document.getElementById('fhBack').addEventListener('click', () => goToView('fokus'));
    document.getElementById('fhExit').addEventListener('click', requestExitFocus);
    if (window.api.onFullScreenChange) window.api.onFullScreenChange(onFullScreenChange);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isFocusViewActive()) { e.preventDefault(); requestExitFocus(); }
    });
    document.getElementById('focusTaskSelect').addEventListener('change', (e) => {
      timer.linkedTaskId = e.target.value;
      document.getElementById('cfgLinkedTask').value = e.target.value;
    });
    document.getElementById('focusBrainDump').addEventListener('input', (e) => {
      state.focusScratch = e.target.value;
      persist();
    });
    if (state.focusScratch) document.getElementById('focusBrainDump').value = state.focusScratch;
  }

  function renderFocusTaskOptions() {
    const sel = document.getElementById('focusTaskSelect');
    const cur = sel.value;
    sel.innerHTML = '<option value="">Mau fokus ke tugas apa nih…</option>';
    state.tasks.filter(t => t.status !== 'selesai').forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id; opt.textContent = t.title;
      sel.appendChild(opt);
    });
    sel.value = cur;
  }

  function getBlockDomains() {
    const fset = state.focusSettings;
    if (!fset.blockEnabled) return [];
    const ids = fset.blockMode === 'preset' ? SOCIAL_SITES.map(s => s.id) : fset.customSites;
    return SOCIAL_SITES.filter(s => ids.includes(s.id)).flatMap(s => s.domains);
  }

  function setFocusBlockStatus(text) {
    const el = document.getElementById('focusBlockStatus');
    if (!el) return;
    el.hidden = !text;
    el.textContent = text;
  }

  async function startFocusBlockingIfNeeded() {
    focusSessionActive = true;
    applyFocusLockUI();
    const domains = getBlockDomains();
    if (!domains.length) return;
    try {
      await window.api.blockSites(domains);
      setFocusBlockStatus('🧠 Reminder nyala: jauhin dulu medsos-nya sampai sesi ini kelar. WhatsApp tetep aman kok.');
    } catch (e) {
      // purely a soft in-app reminder now — nothing to actually fail at.
    }
  }

  async function stopFocusBlockingIfNeeded() {
    if (!focusSessionActive) return;
    focusSessionActive = false;
    applyFocusLockUI();
    setFocusBlockStatus('');
    try { await window.api.unblockSites(); } catch (e) { /* best effort */ }
  }

  // Disables Focus-Mode-affecting controls while a locked session is live —
  // the point is you can't quietly weaken your own commitment mid-sesi.
  function applyFocusLockUI() {
    const locked = state.focusSettings.locked && focusSessionActive;
    const taskSelect = document.getElementById('focusTaskSelect');
    if (taskSelect) taskSelect.disabled = locked;

    ['cfgBlockEnabled', 'blockModePreset', 'blockModeCustom', 'focusLockNo', 'focusLockYes'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = locked;
    });
    document.querySelectorAll('#siteChecklist input').forEach(el => { el.disabled = locked; });

    const note = document.getElementById('focusLockActiveNote');
    if (note) note.hidden = !locked;
  }

  // ============================================================
  // DAFTAR PUSTAKA (APA 7 / MLA 9 / Chicago / IEEE / Vancouver)
  // Data sumber disimpan mentah (authors, year, title, dst.). Teks daftar
  // pustaka & kutipan in-text dihitung ulang tiap render sesuai gaya yang
  // lagi dipilih, jadi ganti gaya = seluruh daftar langsung ikut berubah.
  // ============================================================
  const CITE_STYLES = [
    { id: 'apa7', label: 'APA 7th (nama–tahun)', numbered: false,
      hint: 'Gaya bawaan dan paling umum dipakai (sistem Harvard/nama–tahun). Kutipan: (Nama Tahun). Daftar diurutkan abjad.' },
    { id: 'mla9', label: 'MLA 9th', numbered: false,
      hint: 'MLA pakai nama + halaman tanpa tahun: (Nama 12). Daftar diurutkan abjad.' },
    { id: 'chicago', label: 'Chicago 17th (nama–tahun)', numbered: false,
      hint: 'Chicago nama–tahun: (Nama Tahun, 12). Daftar diurutkan abjad.' },
    { id: 'ieee', label: 'IEEE (bernomor)', numbered: true,
      hint: 'IEEE pakai nomor: [1]. Daftar berurutan sesuai kapan kamu nambahin sumbernya.' },
    { id: 'vancouver', label: 'Vancouver (bernomor)', numbered: true,
      hint: 'Vancouver pakai nomor: (1). Daftar berurutan sesuai kapan kamu nambahin sumbernya.' },
  ];

  const CITE_TYPES = [
    { id: 'buku', label: 'Buku' },
    { id: 'jurnal', label: 'Artikel jurnal' },
    { id: 'prosiding', label: 'Artikel prosiding/seminar' },
    { id: 'skripsi', label: 'Skripsi/Tesis/Disertasi' },
    { id: 'internet', label: 'Artikel internet' },
  ];

  const CITE_EXTRA_FIELDS = {
    buku: [
      { id: 'edition', label: 'Edisi/cetakan (opsional)', ph: 'Edisi Pertama' },
      { id: 'publisher', label: 'Penerbit', ph: 'Kanisius' },
      { id: 'city', label: 'Kota terbit', ph: 'Yogyakarta' },
    ],
    jurnal: [
      { id: 'journal', label: 'Nama jurnal', ph: 'Jurnal Ilmu Komputer' },
      { id: 'volume', label: 'Volume', ph: '10' },
      { id: 'issue', label: 'Nomor (opsional)', ph: '1' },
      { id: 'pages', label: 'Halaman', ph: '31-38' },
    ],
    prosiding: [
      { id: 'proceeding', label: 'Nama prosiding/seminar', ph: 'Prosiding Seminar Nasional Teknologi' },
      { id: 'eventDate', label: 'Tanggal & bulan pelaksanaan', ph: '7 Juli 2011' },
      { id: 'organizer', label: 'Penyelenggara (opsional)', ph: 'Fakultas Teknik Universitas Contoh' },
      { id: 'pages', label: 'Halaman', ph: '71-84' },
    ],
    skripsi: [
      { id: 'workType', label: 'Jenis karya', ph: '', type: 'select', options: ['Skripsi', 'Tesis', 'Disertasi'] },
      { id: 'program', label: 'Program studi & institusi', ph: 'Fakultas Teknik, Universitas Contoh' },
      { id: 'city', label: 'Kota', ph: 'Bandung' },
    ],
    internet: [
      { id: 'url', label: 'Alamat (URL)', ph: 'https://...' },
      { id: 'accessDate', label: 'Tanggal & jam diakses', ph: '27 Januari 2026 (15:23 WIB)' },
    ],
  };

  function getCiteStyle() {
    return CITE_STYLES.some(s => s.id === state.citationStyle) ? state.citationStyle : 'apa7';
  }

  function initCitations() {
    const typeSel = document.getElementById('citeType');
    typeSel.addEventListener('change', renderCiteExtraFields);
    renderCiteExtraFields();

    const styleSel = document.getElementById('citeStyleSelect');
    styleSel.innerHTML = CITE_STYLES.map(s => `<option value="${s.id}">${s.label}</option>`).join('');
    styleSel.value = getCiteStyle();
    styleSel.addEventListener('change', () => {
      state.citationStyle = styleSel.value;
      persist();
      renderCitations();
    });

    document.getElementById('btnAddCitation').addEventListener('click', addCitation);
    document.getElementById('btnCopyAllCitations').addEventListener('click', () => {
      const text = citationEntries().map(e => e.reference).join('\n\n');
      navigator.clipboard.writeText(text);
      flashButton('btnCopyAllCitations', 'Tersalin!');
    });
  }

  function renderCiteExtraFields() {
    const type = document.getElementById('citeType').value;
    const wrap = document.getElementById('citeExtraFields');
    wrap.innerHTML = '';
    (CITE_EXTRA_FIELDS[type] || []).forEach(f => {
      const row = document.createElement('div');
      row.className = 'field-row';
      if (f.type === 'select') {
        row.innerHTML = `<label>${f.label}</label><select id="extra_${f.id}">${f.options.map(o => `<option value="${o}">${o}</option>`).join('')}</select>`;
      } else {
        row.innerHTML = `<label>${f.label}</label><input type="text" id="extra_${f.id}" placeholder="${f.ph}" />`;
      }
      wrap.appendChild(row);
    });
  }

  // ---------- name helpers (input format: "Nama belakang, Inisial.") ----------
  function parseAuthor(a) {
    const i = a.indexOf(',');
    return { last: (i < 0 ? a : a.slice(0, i)).trim(), ini: i < 0 ? '' : a.slice(i + 1).trim() };
  }
  function lastFirst(a) { const p = parseAuthor(a); return p.ini ? `${p.last}, ${p.ini}` : p.last; }
  function initialsFirst(a) { const p = parseAuthor(a); return p.ini ? `${p.ini} ${p.last}` : p.last; }
  function vancouverName(a) {
    const p = parseAuthor(a);
    const letters = p.ini.replace(/[^\p{L}]/gu, '');
    return letters ? `${p.last} ${letters}` : p.last;
  }
  const cg = (f, k) => String(f[k] == null ? '' : f[k]).trim();
  const joinParts = (parts, sep) => parts.filter(Boolean).join(sep == null ? ' ' : sep);
  function endDot(s) { s = (s || '').trim(); return s && !/[.!?]$/.test(s) ? s + '.' : s; }
  function quoted(s) { s = (s || '').trim().replace(/[.,]$/, ''); return s ? `"${s}."` : ''; }
  function quotedComma(s) { s = (s || '').trim().replace(/[.,]$/, ''); return s ? `"${s},"` : ''; }
  function cityPub(f) {
    const city = cg(f, 'city'), pub = cg(f, 'publisher');
    return pub ? (city ? `${city}: ${pub}` : pub) : city;
  }

  // ---------- APA 7 (Harvard / nama–tahun) — gaya bawaan ----------
  function formatAuthorsForReference(authors) {
    if (authors.length <= 1) return authors[0] || '';
    if (authors.length <= 6) return authors.slice(0, -1).join(', ') + ' dan ' + authors[authors.length - 1];
    return authors.join(', ');
  }

  function formatAuthorsForInText(authors) {
    const lastNames = authors.map(a => a.split(',')[0].trim());
    if (lastNames.length === 1) return lastNames[0];
    if (lastNames.length === 2) return `${lastNames[0]} dan ${lastNames[1]}`;
    if (lastNames.length === 3) return `${lastNames[0]}, ${lastNames[1]}, dan ${lastNames[2]}`;
    return `${lastNames[0]} et al.`;
  }

  function refApa7(type, f) {
    // inisial penulis sudah berakhiran titik ("Fatisa, Y."), jangan dobel jadi "Y.."
    const authorsRef = formatAuthorsForReference(f.authors).replace(/\.+$/, '');
    switch (type) {
      case 'buku':
        return `${authorsRef}. (${f.year}). ${f.title}.${f.edition ? ' ' + f.edition + '.' : ''} ${f.publisher}. ${f.city}.`;
      case 'jurnal':
        return `${authorsRef}. (${f.year}). ${f.title}. ${f.journal}, ${f.volume}${f.issue ? '(' + f.issue + ')' : ''}: ${f.pages}.`;
      case 'prosiding':
        return `${authorsRef}. (${f.year}). ${f.title}. ${f.proceeding}. ${f.eventDate}.${f.organizer ? ' ' + f.organizer + ':' : ''} ${f.pages}.`;
      case 'skripsi':
        return `${authorsRef}. (${f.year}). ${f.title}. ${f.workType}. ${f.program}. ${f.city}.`;
      case 'internet':
        return `${authorsRef}. (${f.year}). ${f.title}. ${f.url}. Diakses ${f.accessDate}.`;
      default:
        return `${authorsRef}. (${f.year}). ${f.title}.`;
    }
  }

  // ---------- MLA 9 ----------
  function mlaAuthors(a) {
    if (a.length <= 1) return a[0] ? lastFirst(a[0]) : '';
    if (a.length === 2) return `${lastFirst(a[0])}, and ${initialsFirst(a[1])}`;
    return `${lastFirst(a[0])}, et al.`;
  }
  function refMla9(type, f) {
    const au = endDot(mlaAuthors(f.authors));
    const y = cg(f, 'year');
    switch (type) {
      case 'buku':
        return joinParts([au, endDot(f.title), endDot(joinParts([cg(f, 'edition'), cg(f, 'publisher'), y], ', '))]);
      case 'jurnal': {
        const vol = cg(f, 'volume') ? `vol. ${cg(f, 'volume')}` : '';
        const no = cg(f, 'issue') ? `no. ${cg(f, 'issue')}` : '';
        const pp = cg(f, 'pages') ? `pp. ${cg(f, 'pages')}` : '';
        return joinParts([au, quoted(f.title), endDot(joinParts([cg(f, 'journal'), vol, no, y, pp], ', '))]);
      }
      case 'prosiding': {
        const pp = cg(f, 'pages') ? `pp. ${cg(f, 'pages')}` : '';
        return joinParts([au, quoted(f.title), endDot(joinParts([cg(f, 'proceeding'), cg(f, 'organizer'), cg(f, 'eventDate') || y, pp], ', '))]);
      }
      case 'skripsi':
        return joinParts([au, endDot(f.title), endDot(y), endDot(joinParts([cg(f, 'program'), cg(f, 'city'), cg(f, 'workType')], ', '))]);
      case 'internet':
        return joinParts([au, quoted(f.title), endDot(joinParts([y, cg(f, 'url')], ', ')), cg(f, 'accessDate') ? `Accessed ${cg(f, 'accessDate')}.` : '']);
      default:
        return joinParts([au, quoted(f.title), endDot(y)]);
    }
  }

  // ---------- Chicago 17 (nama–tahun) ----------
  function chicagoAuthors(a) {
    if (a.length <= 1) return a[0] ? lastFirst(a[0]) : '';
    const shown = a.length > 10 ? a.slice(0, 7) : a;
    const names = shown.map((x, i) => (i === 0 ? lastFirst(x) : initialsFirst(x)));
    if (a.length > 10) return names.join(', ') + ', et al.';
    return names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
  }
  function refChicago(type, f) {
    const au = endDot(chicagoAuthors(f.authors));
    const y = endDot(cg(f, 'year'));
    switch (type) {
      case 'buku':
        return joinParts([au, y, endDot(f.title), endDot(cg(f, 'edition')), endDot(cityPub(f))]);
      case 'jurnal': {
        const vi = cg(f, 'volume') + (cg(f, 'issue') ? ` (${cg(f, 'issue')})` : '');
        const tail = joinParts([cg(f, 'journal'), vi], ' ') + (cg(f, 'pages') ? `: ${cg(f, 'pages')}` : '');
        return joinParts([au, y, quoted(f.title), endDot(tail)]);
      }
      case 'prosiding': {
        const inPart = `In ${cg(f, 'proceeding')}` + (cg(f, 'pages') ? `, ${cg(f, 'pages')}` : '');
        return joinParts([au, y, quoted(f.title), endDot(inPart), endDot(joinParts([cg(f, 'organizer'), cg(f, 'eventDate')], ', '))]);
      }
      case 'skripsi':
        return joinParts([au, y, quoted(f.title), endDot(joinParts([cg(f, 'workType'), cg(f, 'program'), cg(f, 'city')], ', '))]);
      case 'internet':
        return joinParts([au, y, quoted(f.title), cg(f, 'accessDate') ? `Accessed ${cg(f, 'accessDate')}.` : '', endDot(cg(f, 'url'))]);
      default:
        return joinParts([au, y, quoted(f.title)]);
    }
  }

  // ---------- IEEE ----------
  function ieeeAuthors(a) {
    const n = a.map(initialsFirst);
    if (n.length <= 1) return n[0] || '';
    if (n.length === 2) return `${n[0]} and ${n[1]}`;
    if (n.length <= 6) return n.slice(0, -1).join(', ') + ', and ' + n[n.length - 1];
    return `${n[0]} et al.`;
  }
  function refIeee(type, f) {
    const au = ieeeAuthors(f.authors);
    const y = cg(f, 'year');
    switch (type) {
      case 'buku': {
        const cp = cityPub(f);
        return `${au}, ${cg(f, 'title')}${cg(f, 'edition') ? ', ' + cg(f, 'edition') : ''}. ${cp ? cp + ', ' : ''}${y}.`;
      }
      case 'jurnal': {
        const vol = cg(f, 'volume') ? `vol. ${cg(f, 'volume')}` : '';
        const no = cg(f, 'issue') ? `no. ${cg(f, 'issue')}` : '';
        const pp = cg(f, 'pages') ? `pp. ${cg(f, 'pages')}` : '';
        return `${au}, ${quotedComma(f.title)} ${joinParts([cg(f, 'journal'), vol, no, pp, y], ', ')}.`;
      }
      case 'prosiding': {
        const pp = cg(f, 'pages') ? `pp. ${cg(f, 'pages')}` : '';
        return `${au}, ${quotedComma(f.title)} in ${joinParts([cg(f, 'proceeding'), cg(f, 'organizer'), cg(f, 'eventDate') || y, pp], ', ')}.`;
      }
      case 'skripsi':
        return `${au}, ${quotedComma(f.title)} ${joinParts([cg(f, 'workType'), cg(f, 'program'), cg(f, 'city'), y], ', ')}.`;
      case 'internet':
        return `${au}, ${quotedComma(f.title)} ${y}. [Online]. Available: ${cg(f, 'url')}${cg(f, 'accessDate') ? `. [Accessed: ${cg(f, 'accessDate')}]` : ''}.`;
      default:
        return `${au}, ${quotedComma(f.title)} ${y}.`;
    }
  }

  // ---------- Vancouver ----------
  function vancouverAuthors(a) {
    const n = a.map(vancouverName);
    return n.length > 6 ? n.slice(0, 6).join(', ') + ', et al.' : n.join(', ');
  }
  function refVancouver(type, f) {
    const au = endDot(vancouverAuthors(f.authors));
    const y = cg(f, 'year');
    switch (type) {
      case 'buku': {
        const city = cg(f, 'city'), pub = cg(f, 'publisher');
        const place = pub ? (city ? `${city}: ${pub}` : pub) : city;
        return joinParts([au, endDot(f.title), endDot(cg(f, 'edition')), `${place ? place + '; ' : ''}${y}.`]);
      }
      case 'jurnal': {
        const vi = cg(f, 'volume') + (cg(f, 'issue') ? `(${cg(f, 'issue')})` : '');
        return joinParts([au, endDot(f.title), endDot(cg(f, 'journal')), `${y};${vi}${cg(f, 'pages') ? ':' + cg(f, 'pages') : ''}.`]);
      }
      case 'prosiding':
        return joinParts([au, endDot(f.title), `In: ${joinParts([cg(f, 'proceeding'), cg(f, 'eventDate') || y, cg(f, 'organizer')], '; ')}.`, cg(f, 'pages') ? `p. ${cg(f, 'pages')}.` : '']);
      case 'skripsi': {
        const city = cg(f, 'city');
        return joinParts([au, `${cg(f, 'title').replace(/[.]$/, '')} [${cg(f, 'workType') || 'Skripsi'}].`, `${city ? city + ': ' : ''}${cg(f, 'program')}; ${y}.`]);
      }
      case 'internet':
        return joinParts([au, `${cg(f, 'title').replace(/[.]$/, '')} [Internet].`, `${y}${cg(f, 'accessDate') ? ` [cited ${cg(f, 'accessDate')}]` : ''}.`, cg(f, 'url') ? `Available from: ${cg(f, 'url')}` : '']);
      default:
        return joinParts([au, endDot(f.title), `${y}.`]);
    }
  }

  function buildReference(style, type, f, num) {
    switch (style) {
      case 'mla9': return refMla9(type, f);
      case 'chicago': return refChicago(type, f);
      case 'ieee': return `[${num}] ${refIeee(type, f)}`;
      case 'vancouver': return `${num}. ${refVancouver(type, f)}`;
      default: return refApa7(type, f);
    }
  }

  // ---------- kutipan in-text ----------
  // page (opsional) diisi dari EdDOC kalau kutipannya diambil dari halaman PDF tertentu (dokumen non-PDF nggak punya halaman).
  function buildInText(style, f, num, page) {
    const lastNames = f.authors.map(a => parseAuthor(a).last);
    const pg = page ? String(page) : '';
    switch (style) {
      case 'mla9': {
        const au = lastNames.length === 1 ? lastNames[0]
          : lastNames.length === 2 ? `${lastNames[0]} and ${lastNames[1]}` : `${lastNames[0]} et al.`;
        return `(${au}${pg ? ' ' + pg : ''})`;
      }
      case 'chicago': {
        const au = lastNames.length === 1 ? lastNames[0]
          : lastNames.length === 2 ? `${lastNames[0]} and ${lastNames[1]}`
          : lastNames.length === 3 ? `${lastNames[0]}, ${lastNames[1]}, and ${lastNames[2]}` : `${lastNames[0]} et al.`;
        return `(${au} ${f.year}${pg ? ', ' + pg : ''})`;
      }
      case 'ieee': return `[${num}${pg ? ', p. ' + pg : ''}]`;
      case 'vancouver': return `(${num}${pg ? ', p. ' + pg : ''})`;
      default: return `(${formatAuthorsForInText(f.authors)} ${f.year}${pg ? ', hlm. ' + pg : ''})`;
    }
  }

  // Daftar terurut sesuai gaya: bernomor -> urutan ditambahkan; lainnya -> abjad.
  function citationEntries() {
    const style = getCiteStyle();
    const meta = CITE_STYLES.find(s => s.id === style);
    const withIdx = state.citations.map((c, i) => ({ c, i }));
    if (meta.numbered) {
      withIdx.sort((a, b) => ((a.c.addedAt || 0) - (b.c.addedAt || 0)) || (a.i - b.i));
    } else {
      const key = (c) => (c.fields.authors || []).map(lastFirst).join(' ').toLowerCase() + ' ' + (c.fields.year || '');
      withIdx.sort((a, b) => key(a.c).localeCompare(key(b.c)) || (a.i - b.i));
    }
    return withIdx.map(({ c }, idx) => {
      const num = idx + 1;
      return {
        c, num,
        reference: buildReference(style, c.type, c.fields, num),
        inText: buildInText(style, c.fields, num, null),
      };
    });
  }

  function inTextForCitation(id, page) {
    const style = getCiteStyle();
    const entry = citationEntries().find(e => e.c.id === id);
    return entry ? buildInText(style, entry.c.fields, entry.num, page) : '';
  }

  function addCitation() {
    const type = document.getElementById('citeType').value;
    const authors = document.getElementById('citeAuthors').value.split('\n').map(s => s.trim()).filter(Boolean);
    const year = document.getElementById('citeYear').value.trim();
    const title = document.getElementById('citeTitle').value.trim();
    if (!authors.length || !year || !title) return;

    const extra = {};
    (CITE_EXTRA_FIELDS[type] || []).forEach(f => {
      const el = document.getElementById(`extra_${f.id}`);
      if (el) extra[f.id] = el.value.trim();
    });

    const fields = { authors, year, title, ...extra };
    const newCite = { id: uid(), type, fields, addedAt: Date.now() };
    state.citations.push(newCite);
    persist();
    renderCitations();
    recordAch('citation_added', { id: newCite.id });

    document.getElementById('citeAuthors').value = '';
    document.getElementById('citeYear').value = '';
    document.getElementById('citeTitle').value = '';
    renderCiteExtraFields();
  }

  function renderCitations() {
    const list = document.getElementById('citationList');
    list.innerHTML = '';
    const entries = citationEntries();
    const meta = CITE_STYLES.find(s => s.id === getCiteStyle());
    const hint = document.getElementById('citeStyleHint');
    if (hint) hint.textContent = meta.hint;
    entries.forEach(({ c, reference, inText }) => {
      const li = document.createElement('li');
      li.className = 'citation-item';
      li.innerHTML = `<button class="del" data-id="${c.id}" title="Hapus" aria-label="Hapus sumber ini">✕</button>${escapeHtml(reference)}<span class="in-text">${escapeHtml(inText)}</span>`;
      li.addEventListener('click', (e) => {
        if (e.target.classList.contains('del')) return;
        navigator.clipboard.writeText(inText);
      });
      li.querySelector('.del').addEventListener('click', () => {
        state.citations = state.citations.filter(x => x.id !== c.id);
        persist(); renderCitations();
        if (window.EdDOC && window.EdDOC.onCitationRemoved) window.EdDOC.onCitationRemoved(c.id);
      });
      list.appendChild(li);
    });
    document.getElementById('citationEmpty').hidden = entries.length > 0;
  }


  // ============================================================
  // JEMBATAN KE EdDOC (eddoc.js) — EdDOC cuma lewat sini buat nyentuh
  // state, Daftar Pustaka, dan navigasi.
  // ============================================================
  function initEdDoc() {
    if (!window.EdDOC) return;
    window.EdDOC.init({
      getState: () => state,
      persist,
      uid,
      goToView,
      citeTypes: CITE_TYPES,
      citeExtraFields: CITE_EXTRA_FIELDS,
      // Tambah sumber ke Daftar Pustaka, atau perbarui kalau id-nya sudah ada.
      upsertCitation(id, type, fields) {
        const existing = id && state.citations.find(c => c.id === id);
        if (existing) {
          existing.type = type;
          existing.fields = fields;
        } else {
          id = uid();
          state.citations.push({ id, type, fields, addedAt: Date.now(), from: 'eddoc' });
          recordAch('citation_added', { id });
        }
        persist();
        renderCitations();
        return id;
      },
      inText: (id, page) => inTextForCitation(id, page),
      ach: (type, meta) => recordAch(type, meta),
    });
  }

  // ============================================================
  // PENCAPAIAN (achievements.js) — dicatat lewat recordAch, aman kalau modulnya belum ada
  // ============================================================
  function recordAch(type, meta) {
    try { if (window.Achievements) window.Achievements.record(type, meta || {}); } catch (e) { /* jangan sampai ganggu fitur utama */ }
  }
  function initAchievements() {
    if (!window.Achievements) return;
    window.Achievements.init({
      getState: () => state,
      persist,
      goToView,
      toast: appToast,
    });
  }

  // ============================================================
  // DESA (desa.js) — koin dari sesi fokus yang dijalani tanpa keluar dari Readlify
  // ============================================================
  // DESA (desa.js) — koin dari sesi fokus yang dijalani tanpa keluar dari Readlify
  // ============================================================
  function desa(fn, ...args) {
    try { if (window.Desa && window.Desa[fn]) return window.Desa[fn](...args); } catch (e) { /* jangan sampai ganggu timer */ }
  }
  function initDesa() {
    if (!window.Desa) return;
    window.Desa.init({ getState: () => state, persist, goToView, toast: appToast, ach: (type, meta) => recordAch(type, meta) });
  }

  function flashButton(id, text) {
    const btn = document.getElementById(id);
    const original = btn.textContent;
    btn.textContent = text;
    setTimeout(() => (btn.textContent = original), 1200);
  }

  // ============================================================
  // DUKUNG READLIFY: popup dulu, baru buka halaman donasi di browser
  // ============================================================
  function initDonate() {
    const ov = document.getElementById('donateOverlay');
    if (!ov) return;
    const goBtn = document.getElementById('donateGo'), laterBtn = document.getElementById('donateLater');
    const hide = () => ov.classList.remove('is-open');
    document.querySelectorAll('[data-donate-open]').forEach(b => b.addEventListener('click', () => ov.classList.add('is-open')));
    laterBtn.addEventListener('click', hide);
    goBtn.addEventListener('click', async () => {
      hide();
      if (window.api.openDonatePage) await window.api.openDonatePage();
    });
    ov.addEventListener('click', (e) => { if (e.target === ov) hide(); });
  }

  // ============================================================
  // CATATAN (ala Google Keep: kartu berwarna, sematkan, daftar centang, cari, simpan .txt)
  // ============================================================
  const NOTE_COLORS = [
    { id: 'default', label: 'Polos' },
    { id: 'sage', label: 'Hijau sage' },
    { id: 'honey', label: 'Madu' },
    { id: 'clay', label: 'Tanah liat' },
    { id: 'rose', label: 'Mawar' },
    { id: 'lilac', label: 'Lilac' },
    { id: 'sky', label: 'Langit' },
  ];
  let noteQuery = '';
  let noteModalEl = null;     // jendela edit catatan yang sudah ada
  let noteModalId = null;
  let composerDraft = null;   // draft catatan baru (null = bar "Buat catatan…" tertutup)

  function newNoteDraft(type) {
    const now = Date.now();
    return { id: uid(), type: type === 'list' ? 'list' : 'text', title: '', text: '', items: [], color: 'default', pinned: false, createdAt: now, updatedAt: now };
  }
  // Catatan lama (versi "Catatan Cepat") cuma punya {id, text, createdAt}; lengkapi field barunya.
  function normalizeNote(n) {
    if (!n.id) n.id = uid();
    if (n.type !== 'list') n.type = 'text';
    if (typeof n.title !== 'string') n.title = '';
    if (typeof n.text !== 'string') n.text = '';
    if (!Array.isArray(n.items)) n.items = [];
    if (!NOTE_COLORS.some(c => c.id === n.color)) n.color = 'default';
    n.pinned = !!n.pinned;
    if (!n.createdAt) n.createdAt = Date.now();
    if (!n.updatedAt) n.updatedAt = n.createdAt;
    return n;
  }
  function pruneNote(n) {
    n.title = n.title.trim();
    n.items = n.items.filter(i => (i.text || '').trim());
  }
  const noteIsEmpty = (n) => !n.title.trim() && (n.type === 'list' ? !n.items.some(i => (i.text || '').trim()) : !n.text.trim());
  const noteColorClass = (c) => 'nc-' + c;

  // ---------- simpan sebagai .txt ----------
  function noteToText(n) {
    const lines = [];
    if (n.title.trim()) lines.push(n.title.trim(), '');
    if (n.type === 'list') {
      n.items.filter(i => (i.text || '').trim()).forEach(i => lines.push(`[${i.done ? 'x' : ' '}] ${i.text.trim()}`));
    } else {
      lines.push(n.text.replace(/\s+$/, ''));
    }
    return lines.join('\n').replace(/\r?\n/g, '\r\n');
  }
  function noteFileName(n) {
    const firstLine = n.type === 'list'
      ? ((n.items.find(i => (i.text || '').trim()) || {}).text || '')
      : (n.text.split(/\r?\n/).find(l => l.trim()) || '');
    let base = (n.title.trim() || firstLine || 'Catatan')
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60).trim();
    base = base.replace(/[. ]+$/, ''); // Windows nggak boleh nama file berakhir titik/spasi
    return (base || 'Catatan') + '.txt';
  }
  function downloadText(filename, text) {
    // Android: tulis ke berkas sementara lalu buka lembar "Bagikan / Simpan ke…".
    window.api.exportBackup('﻿' + text, filename).then((r) => {
      if (r === 'downloaded') appToast('Catatan tersimpan ke folder Unduhan.');
    }).catch(() => appToast('Catatannya gagal disimpan. Coba lagi ya.'));
  }
  function downloadNote(n) {
    if (noteIsEmpty(n)) { appToast('Catatannya masih kosong, belum ada yang bisa disimpan.'); return; }
    downloadText(noteFileName(n), noteToText(n));
  }
  function sortedNotes(list) {
    return [...list].sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || ((b.updatedAt || 0) - (a.updatedAt || 0)));
  }
  function exportAllNotes() {
    const list = sortedNotes(state.notes.filter(n => !noteIsEmpty(n)));
    if (!list.length) { appToast('Belum ada catatan yang bisa disimpan.'); return; }
    const sep = '\r\n\r\n' + '='.repeat(32) + '\r\n\r\n';
    downloadText(`Catatan Readlify ${new Date().toLocaleDateString('sv-SE')}.txt`, list.map(noteToText).join(sep));
  }

  // ---------- editor (dipakai bar "Buat catatan…" dan jendela edit) ----------
  function autoGrow(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, Math.round(window.innerHeight * 0.5)) + 'px'; }

  function buildNoteEditor(note, opts) {
    const root = document.createElement('div');
    root.className = 'note-editor ' + noteColorClass(note.color);
    const changed = () => { note.updatedAt = Date.now(); if (opts.onChange) opts.onChange(note); };

    // judul + sematan
    const head = document.createElement('div'); head.className = 'ne-head';
    const title = document.createElement('input');
    title.type = 'text'; title.className = 'ne-title'; title.placeholder = 'Judul'; title.maxLength = 120; title.value = note.title;
    title.addEventListener('input', () => { note.title = title.value; changed(); });
    title.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      const first = body.querySelector('textarea, .ne-item-text, .ne-additem'); if (first) first.focus();
    });
    const pin = document.createElement('button'); pin.type = 'button'; pin.className = 'ne-icon'; pin.textContent = '📌';
    const paintPin = () => { pin.classList.toggle('is-on', note.pinned); pin.title = note.pinned ? 'Lepas sematan' : 'Sematkan di atas'; pin.setAttribute('aria-label', pin.title); pin.setAttribute('aria-pressed', String(note.pinned)); };
    pin.addEventListener('click', () => { note.pinned = !note.pinned; paintPin(); changed(); });
    paintPin();
    head.append(title, pin);

    // isi: teks biasa atau daftar centang
    const body = document.createElement('div'); body.className = 'ne-body';
    function itemRow(it) {
      const li = document.createElement('li'); li.className = 'ne-item' + (it.done ? ' is-done' : '');
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!it.done; cb.setAttribute('aria-label', 'Tandai selesai');
      const tx = document.createElement('input'); tx.type = 'text'; tx.className = 'ne-item-text'; tx.value = it.text || ''; tx.placeholder = 'Item';
      const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'ne-item-rm'; rm.textContent = '✕'; rm.title = 'Hapus item'; rm.setAttribute('aria-label', 'Hapus item');
      cb.addEventListener('change', () => { it.done = cb.checked; li.classList.toggle('is-done', it.done); changed(); });
      tx.addEventListener('input', () => { it.text = tx.value; changed(); });
      tx.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          const nxt = { id: uid(), text: '', done: false };
          note.items.splice(note.items.indexOf(it) + 1, 0, nxt);
          const row = itemRow(nxt); li.after(row); row.querySelector('.ne-item-text').focus(); changed();
        } else if (e.key === 'Backspace' && !tx.value) {
          e.preventDefault();
          const prev = li.previousElementSibling;
          note.items = note.items.filter(x => x !== it); li.remove(); changed();
          const pt = prev && prev.querySelector('.ne-item-text'); if (pt) pt.focus();
        }
      });
      rm.addEventListener('click', () => { note.items = note.items.filter(x => x !== it); li.remove(); changed(); });
      li.append(cb, tx, rm);
      return li;
    }
    function renderBody() {
      body.textContent = '';
      if (note.type === 'list') {
        const ul = document.createElement('ul'); ul.className = 'ne-items';
        note.items.forEach(it => ul.appendChild(itemRow(it)));
        const add = document.createElement('input'); add.type = 'text'; add.className = 'ne-additem'; add.placeholder = '+ Tambah item (Enter)';
        add.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter' || e.ctrlKey || e.metaKey) return;
          e.preventDefault();
          const v = add.value.trim(); if (!v) return;
          const it = { id: uid(), text: v, done: false };
          note.items.push(it); add.value = ''; ul.appendChild(itemRow(it)); changed();
        });
        body.append(ul, add);
      } else {
        const ta = document.createElement('textarea'); ta.className = 'ne-text'; ta.placeholder = 'Tulis catatan…'; ta.rows = 4; ta.value = note.text;
        ta.addEventListener('input', () => { note.text = ta.value; autoGrow(ta); changed(); });
        body.appendChild(ta);
        requestAnimationFrame(() => autoGrow(ta));
      }
    }

    // bar bawah: warna, jenis, simpan .txt, hapus, selesai
    const bar = document.createElement('div'); bar.className = 'ne-bar';
    const colors = document.createElement('div'); colors.className = 'ne-colors'; colors.setAttribute('role', 'group'); colors.setAttribute('aria-label', 'Warna catatan');
    const swatches = NOTE_COLORS.map((c) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ne-swatch ' + noteColorClass(c.id);
      b.title = c.label; b.setAttribute('aria-label', 'Warna ' + c.label);
      b.addEventListener('click', () => { note.color = c.id; root.className = 'note-editor ' + noteColorClass(c.id); paintSwatches(); changed(); });
      colors.appendChild(b); return { b, id: c.id };
    });
    const paintSwatches = () => swatches.forEach(s => { s.b.classList.toggle('is-on', s.id === note.color); s.b.setAttribute('aria-pressed', String(s.id === note.color)); });
    paintSwatches();

    const typeBtn = document.createElement('button'); typeBtn.type = 'button'; typeBtn.className = 'ne-chip';
    const paintType = () => { typeBtn.textContent = note.type === 'list' ? '📝 Jadikan teks' : '☑ Jadikan daftar centang'; };
    typeBtn.addEventListener('click', () => {
      if (note.type === 'text') {
        note.items = note.text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(t => ({ id: uid(), text: t, done: false }));
        note.text = ''; note.type = 'list';
      } else {
        note.text = note.items.map(i => i.text).filter(t => (t || '').trim()).join('\n');
        note.items = []; note.type = 'text';
      }
      paintType(); renderBody(); changed();
      const f = body.querySelector('textarea, .ne-additem'); if (f) f.focus();
    });
    paintType();

    const dl = document.createElement('button'); dl.type = 'button'; dl.className = 'ne-chip'; dl.textContent = '💾 Simpan .txt'; dl.title = 'Simpan catatan ini jadi file .txt';
    dl.addEventListener('click', () => downloadNote(note));

    const spacer = document.createElement('span'); spacer.className = 'ne-spacer';
    bar.append(colors, typeBtn, dl);
    if (opts.onDelete) {
      const del = document.createElement('button'); del.type = 'button'; del.className = 'ne-chip ne-chip-danger'; del.textContent = '🗑 Hapus';
      del.addEventListener('click', opts.onDelete); bar.appendChild(del);
    }
    const done = document.createElement('button'); done.type = 'button'; done.className = 'btn-primary'; done.textContent = opts.isNew ? 'Simpan' : 'Selesai';
    done.addEventListener('click', opts.onDone);
    bar.append(spacer, done);

    renderBody();
    root.append(head, body, bar);
    return {
      el: root,
      focus() { const f = note.type === 'list' ? title : body.querySelector('textarea'); (f || title).focus(); },
    };
  }

  // ---------- bar "Buat catatan…" ----------
  function renderComposer() {
    const host = document.getElementById('noteComposer');
    if (!host) return;
    host.textContent = '';
    if (!composerDraft) {
      host.classList.remove('is-open');
      const row = document.createElement('div'); row.className = 'nc-collapsed';
      const ph = document.createElement('button'); ph.type = 'button'; ph.className = 'nc-placeholder'; ph.textContent = 'Buat catatan…';
      ph.addEventListener('click', () => openComposer('text'));
      const lst = document.createElement('button'); lst.type = 'button'; lst.className = 'ne-icon nc-list-btn'; lst.textContent = '☑'; lst.title = 'Buat daftar centang'; lst.setAttribute('aria-label', 'Buat daftar centang');
      lst.addEventListener('click', () => openComposer('list'));
      row.append(ph, lst); host.appendChild(row);
      return;
    }
    host.classList.add('is-open');
    const ed = buildNoteEditor(composerDraft, { isNew: true, onDone: closeComposer });
    host.appendChild(ed.el);
    ed.focus();
  }
  function openComposer(type) { composerDraft = newNoteDraft(type); renderComposer(); }
  function closeComposer() {
    const d = composerDraft; composerDraft = null;
    if (d) {
      pruneNote(d);
      if (!noteIsEmpty(d)) {
        d.updatedAt = Date.now();
        state.notes.unshift(d);
        persist();
        recordAch('note_added', { id: 'qn_' + d.id });
      }
    }
    renderComposer(); renderNotes();
  }

  // ---------- jendela edit ----------
  function openNoteModal(id) {
    const note = state.notes.find(n => n.id === id);
    if (!note) return;
    if (noteModalEl) closeNoteModal();
    noteModalId = id;
    const ov = document.createElement('div'); ov.className = 'note-modal'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Edit catatan');
    const card = document.createElement('div'); card.className = 'note-modal-card';
    const ed = buildNoteEditor(note, {
      isNew: false,
      onChange: () => persist(),
      onDone: () => closeNoteModal(),
      onDelete: () => {
        if (!confirm('Hapus catatan ini?')) return;
        state.notes = state.notes.filter(x => x.id !== note.id);
        noteModalId = null; closeNoteModal();
      },
    });
    card.appendChild(ed.el); ov.appendChild(card); document.body.appendChild(ov);
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) closeNoteModal(); });
    noteModalEl = ov;
    ed.focus();
  }
  function closeNoteModal() {
    if (!noteModalEl) return;
    const id = noteModalId;
    noteModalEl.remove(); noteModalEl = null; noteModalId = null;
    const n = state.notes.find(x => x.id === id);
    if (n) { pruneNote(n); if (noteIsEmpty(n)) state.notes = state.notes.filter(x => x !== n); }
    persist(); renderNotes();
  }

  // ---------- daftar kartu ----------
  function noteMatches(n, q) {
    if (!q) return true;
    return [n.title, n.text, ...n.items.map(i => i.text)].join('\n').toLowerCase().includes(q);
  }
  function noteCard(n) {
    const card = document.createElement('article');
    card.className = 'note-card ' + noteColorClass(n.color);
    card.tabIndex = 0; card.setAttribute('role', 'button');
    card.setAttribute('aria-label', 'Buka catatan' + (n.title ? ': ' + n.title : ''));

    if (n.title) { const h = document.createElement('h3'); h.className = 'note-card-title'; h.textContent = n.title; card.appendChild(h); }
    if (n.type === 'list') {
      const items = n.items.filter(i => (i.text || '').trim());
      const ul = document.createElement('ul'); ul.className = 'note-card-items';
      items.slice(0, 8).forEach((i) => {
        const li = document.createElement('li'); li.className = i.done ? 'is-done' : '';
        li.textContent = (i.done ? '☑ ' : '☐ ') + i.text; ul.appendChild(li);
      });
      if (items.length > 8) { const more = document.createElement('li'); more.className = 'note-card-more'; more.textContent = `+${items.length - 8} item lagi`; ul.appendChild(more); }
      card.appendChild(ul);
    } else if (n.text.trim()) {
      const p = document.createElement('div'); p.className = 'note-card-text'; p.textContent = n.text; card.appendChild(p);
    }

    const foot = document.createElement('div'); foot.className = 'note-card-foot';
    const time = document.createElement('span'); time.className = 'note-card-time';
    time.textContent = new Date(n.updatedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    const acts = document.createElement('div'); acts.className = 'note-card-actions';
    const mk = (txt, label, fn, on) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ne-icon' + (on ? ' is-on' : ''); b.textContent = txt; b.title = label; b.setAttribute('aria-label', label);
      b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
      b.addEventListener('keydown', (e) => e.stopPropagation());
      return b;
    };
    acts.append(
      mk('📌', n.pinned ? 'Lepas sematan' : 'Sematkan di atas', () => { n.pinned = !n.pinned; persist(); renderNotes(); }, n.pinned),
      mk('💾', 'Simpan jadi .txt', () => downloadNote(n)),
      mk('🗑', 'Hapus catatan', () => { if (!confirm('Hapus catatan ini?')) return; state.notes = state.notes.filter(x => x.id !== n.id); persist(); renderNotes(); })
    );
    foot.append(time, acts); card.appendChild(foot);

    card.addEventListener('click', () => openNoteModal(n.id));
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openNoteModal(n.id); } });
    return card;
  }
  function renderNotes() {
    const pinnedGrid = document.getElementById('notePinnedGrid');
    if (!pinnedGrid) return;
    const otherGrid = document.getElementById('noteOtherGrid');
    state.notes.forEach(normalizeNote);
    const q = noteQuery.trim().toLowerCase();
    const list = sortedNotes(state.notes.filter(n => noteMatches(n, q)));
    const pinned = list.filter(n => n.pinned), others = list.filter(n => !n.pinned);
    pinnedGrid.textContent = ''; otherGrid.textContent = '';
    pinned.forEach(n => pinnedGrid.appendChild(noteCard(n)));
    others.forEach(n => otherGrid.appendChild(noteCard(n)));
    document.getElementById('notePinnedWrap').hidden = pinned.length === 0;
    document.getElementById('noteOtherLabel').hidden = pinned.length === 0 || others.length === 0;
    const empty = document.getElementById('noteEmpty');
    empty.hidden = list.length > 0;
    empty.textContent = state.notes.length ? 'Nggak ada catatan yang cocok sama pencarianmu.' : 'Belum ada catatan. Ketuk “Buat catatan…” di atas buat mulai.';
  }

  function initNotes() {
    state.notes.forEach(normalizeNote);
    renderComposer();
    const search = document.getElementById('noteSearch');
    search.addEventListener('input', () => { noteQuery = search.value; renderNotes(); });
    document.getElementById('btnNotesExportAll').addEventListener('click', exportAllNotes);
    document.getElementById('noteComposer').addEventListener('keydown', (e) => {
      if (!composerDraft) return;
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); e.stopPropagation(); closeComposer(); }
    });
    document.addEventListener('keydown', (e) => {
      if (!noteModalEl) return;
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); e.stopPropagation(); closeNoteModal(); }
    }, true);
  }

  // ============================================================
  // SETTINGS
  // ============================================================
  function initSettings() {
    const nameInput = document.getElementById('cfgUserName');
    const nameStatus = document.getElementById('cfgUserNameStatus');
    syncProfileNameInput();
    document.getElementById('btnSaveUserName').addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) { nameInput.focus(); nameInput.classList.add('input-error'); return; }
      nameInput.classList.remove('input-error');
      state.userName = name;
      persist();
      initHome();
      renderHome();
      if (nameStatus) {
        nameStatus.textContent = 'Tersimpan ✓';
        clearTimeout(nameStatus._t);
        nameStatus._t = setTimeout(() => { nameStatus.textContent = ''; }, 2000);
      }
    });
    nameInput.addEventListener('keydown', (e) => {
      nameInput.classList.remove('input-error');
      if (e.key === 'Enter') document.getElementById('btnSaveUserName').click();
    });

    const sel = document.getElementById('cfgTheme');
    sel.value = state.theme;
    sel.addEventListener('change', () => {
      state.theme = sel.value;
      persist();
      applyTheme();
    });

    window.api.getVersion().then((v) => {
      document.querySelectorAll('#appVersion').forEach(e => { if (v) e.textContent = 'v' + v; });
      document.querySelectorAll('.app-ver').forEach(e => { if (v) e.textContent = v; });
    }).catch(() => {});

    window.api.deviceInfo().then((info) => {
      const line = document.getElementById('deviceLine');
      if (line) {
        const bits = [info.manufacturer, info.model, info.osVersion ? 'Android ' + info.osVersion : '', info.webViewVersion ? 'WebView ' + info.webViewVersion : ''].filter(Boolean);
        line.textContent = bits.join(' · ');
        line.hidden = !bits.length;
      }
      const hw = document.getElementById('oemHuawei');
      if (hw && info.isHuawei) hw.open = true;
    }).catch(() => {});

    document.getElementById('btnResetData').addEventListener('click', () => {
      if (!confirm('Hapus semua data (tugas, daftar pustaka, catatan, pencapaian, Village)? Nama panggilanmu tetap disimpan. Tindakan ini gak bisa dibatalin.')) return;
      const keepName = state.userName;
      const keepTerms = {
        termsAccepted: state.termsAccepted, termsAcceptedAt: state.termsAcceptedAt,
        termsVersion: state.termsVersion, termsHistory: state.termsHistory,
      };
      state = DEFAULT_STATE();
      state.userName = keepName;
      Object.assign(state, keepTerms);
      clearTimeout(saveTimer);
      window.api.saveData(state).then(() => location.reload());
    });

    initFocusSettings();
  }

  function syncProfileNameInput() {
    const nameInput = document.getElementById('cfgUserName');
    if (nameInput) nameInput.value = state.userName || '';
  }

  function initFocusSettings() {
    const fset = state.focusSettings;

    const blockEnabled = document.getElementById('cfgBlockEnabled');
    blockEnabled.checked = fset.blockEnabled;
    document.getElementById('blockModeGroup').hidden = !fset.blockEnabled;
    blockEnabled.addEventListener('change', (e) => {
      fset.blockEnabled = e.target.checked;
      persist();
      document.getElementById('blockModeGroup').hidden = !fset.blockEnabled;
      syncFocusGuard();
    });

    document.getElementById('blockModePreset').checked = fset.blockMode === 'preset';
    document.getElementById('blockModeCustom').checked = fset.blockMode === 'custom';
    [['blockModePreset', 'preset'], ['blockModeCustom', 'custom']].forEach(([id, val]) => {
      document.getElementById(id).addEventListener('change', () => {
        if (!document.getElementById(id).checked) return;
        fset.blockMode = val;
        persist();
        renderSiteChecklist();
      });
    });
    renderSiteChecklist();

    document.getElementById('focusLockNo').checked = !fset.locked;
    document.getElementById('focusLockYes').checked = fset.locked;
    document.getElementById('focusLockNo').addEventListener('change', () => {
      if (!document.getElementById('focusLockNo').checked) return;
      fset.locked = false;
      persist();
      document.getElementById('focusLockPraise').textContent = '';
    });
    document.getElementById('focusLockYes').addEventListener('change', () => {
      if (!document.getElementById('focusLockYes').checked) return;
      fset.locked = true;
      persist();
      document.getElementById('focusLockPraise').textContent = LOCK_PRAISES[Math.floor(Math.random() * LOCK_PRAISES.length)];
    });

    applyFocusLockUI();
  }

  function renderSiteChecklist() {
    const wrap = document.getElementById('siteChecklist');
    const show = state.focusSettings.blockMode === 'custom';
    wrap.hidden = !show;
    if (!show) return;
    wrap.innerHTML = '';
    SOCIAL_SITES.forEach(site => {
      const row = document.createElement('label');
      row.className = 'site-check';
      const checked = state.focusSettings.customSites.includes(site.id);
      row.innerHTML = `<input type="checkbox" ${checked ? 'checked' : ''} /> ${site.label}`;
      row.querySelector('input').addEventListener('change', (e) => {
        const set = new Set(state.focusSettings.customSites);
        if (e.target.checked) set.add(site.id); else set.delete(site.id);
        state.focusSettings.customSites = [...set];
        persist();
      });
      wrap.appendChild(row);
    });
  }

  function applyTheme() {
    let effective = state.theme;
    if (effective === 'system') {
      effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'cozy-dark' : 'cozy-light';
    }
    document.body.setAttribute('data-theme', effective);
    window.api.setSystemBars(effective === 'cozy-dark' ? 'dark' : 'light');
  }

  // ============================================================
  // SOUND SETTINGS (volume + pilihan suara alarm Pomodoro)
  // ============================================================
  function initSoundSettings() {
    const soundToggle = document.getElementById('cfgSoundEnabled');
    soundToggle.addEventListener('change', () => {
      state.soundEnabled = soundToggle.checked;
      persist();
      syncTimerNotifications();
    });

    const presetSel = document.getElementById('cfgSoundPreset');
    Object.entries(SOUND_PRESETS).forEach(([key, p]) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = p.label;
      presetSel.appendChild(opt);
    });
    presetSel.addEventListener('change', () => {
      state.pomodoro.soundPreset = presetSel.value;
      persist();
      syncTimerNotifications();
    });

    const volumeSlider = document.getElementById('cfgSoundVolume');
    // 'input' updates live while dragging so "Coba bunyi" previews the
    // in-progress value; the actual save only happens on 'change' (drag
    // release) so we're not writing to disk on every pixel of movement.
    volumeSlider.addEventListener('input', () => {
      state.pomodoro.soundVolume = parseInt(volumeSlider.value, 10) / 100;
    });
    volumeSlider.addEventListener('change', () => persist());

    document.getElementById('btnTestSound').addEventListener('click', () => {
      unlockAudio();
      playChime();
    });

    syncSoundInputsFromState();
  }

  function syncSoundInputsFromState() {
    document.getElementById('cfgSoundEnabled').checked = state.soundEnabled;
    document.getElementById('cfgSoundPreset').value = state.pomodoro.soundPreset;
    document.getElementById('cfgSoundVolume').value = String(Math.round(state.pomodoro.soundVolume * 100));
  }

  // ============================================================
  // REMINDERS — pengingat jam belajar & deadline tugas
  // ------------------------------------------------------------
  // Ditulis biar ramah buat otak ADHD: kalimatnya dirandom dari beberapa
  // variasi (biar gak jadi "wallpaper" yang otomatis di-skip begitu udah
  // hafal bunyinya), gak nge-judge kalau telat, dan tiap pengingat cuma
  // nembak sekali per slot/hari (dicatat di state.reminderLog) biar gak
  // berasa nge-spam.
  // ============================================================
  const STUDY_REMINDER_MESSAGES = [
    'Waktunya belajar. Tidak perlu langsung yang berat; mulai dari satu langkah kecil saja.',
    'Waktunya duduk sebentar. Buka satu tugas yang paling mudah dulu supaya fokusmu mulai terbentuk.',
    'Pengingat jam belajar. Jika terasa berat untuk mulai, coba atur timer 5 menit dulu, lalu lanjutkan jika masih mau.',
    'Sudah waktunya. Tidak apa-apa jika pikiranmu masih ramai; tulis dulu di Catatan Cepat, lalu mulai pelan-pelan.',
    'Jam belajarmu sudah tiba. Kamu tidak harus langsung produktif; duduk dan mulai saja sudah cukup.',
  ];

  const IDLE_NUDGE_MESSAGES = [
    'Masih di sana? Tidak apa-apa jika belum bergerak. Coba satu langkah kecil dulu.',
    'Sekadar mengingatkan: jika sulit memulai, coba atur timer Pomodoro 5 menit dulu.',
    'Kamu belum mulai apa pun. Tidak apa-apa; tarik napas, lalu pilih satu tugas paling kecil untuk dimulai.',
    'Jika sulit fokus, itu wajar. Coba mulai dari langkah yang paling ringan.',
  ];

  const DEADLINE_MESSAGES = {
    3: [
      "Tenggat '{title}' tinggal 3 hari lagi. Masih longgar, tetapi sebaiknya mulai dicicil dari sekarang.",
      "'{title}' jatuh tempo 3 hari lagi. Pecah menjadi langkah-langkah kecil supaya tidak menumpuk di akhir.",
    ],
    1: [
      "Besok tenggat '{title}'. Malam ini bisa disiapkan sedikit supaya besok tidak terburu-buru.",
      "H-1 untuk '{title}'. Tidak perlu selesai semuanya sekarang, tetapi sedikit kemajuan malam ini akan sangat membantu besok.",
    ],
    0: [
      "Hari ini tenggat '{title}'. Kerjakan satu langkah di depanmu dulu; kamu pasti bisa.",
      "'{title}' harus selesai hari ini. Fokus ke satu langkah di depan mata; tidak perlu memikirkan semuanya sekaligus.",
    ],
  };

  const OVERDUE_MESSAGES = [
    "'{title}' sudah melewati tenggat. Tidak apa-apa; ini bukan soal gagal. Lanjutkan dari bagian terakhir yang kamu kerjakan.",
    "Pengingat lembut: '{title}' masih menunggu, meski tenggatnya sudah lewat. Satu langkah kecil sekarang tetap berarti.",
  ];

  function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function fillTemplate(tpl, task) { return tpl.replace('{title}', task ? task.title : 'tugas kamu'); }

  // Di Windows, pengingat dicek tiap 30 detik selagi app terbuka. Di HP app sering
  // tertutup/tidur, jadi pengingat DIJADWALKAN ke sistem (AlarmManager) dan berbunyi
  // sendiri. Prinsipnya sama: sekali per jadwal, kalimat diacak, tidak menghakimi.
  const REMINDER_HORIZON_DAYS = 14;  // jam belajar dijadwalkan 14 hari ke depan, disegarkan tiap app dibuka
  const DEADLINE_HOUR = 8;           // pengingat tenggat muncul pukul 08.00
  const OVERDUE_HOUR = 9;            // pengingat lembut setelah lewat tenggat: 09.00

  function hashId(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return 100000 + ((h >>> 0) % 2000000000); // < 2^31 dan di atas ID khusus timer (9001, 9002, 9100)
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function fmtLocalDate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
  function addDays(dateStr, n) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return fmtLocalDate(new Date(y, m - 1, d + n));
  }
  function atLocal(dateStr, hour, minute) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d, hour, minute || 0, 0, 0);
  }

  function buildReminderPlan() {
    const r = state.reminders;
    const rl = state.reminderLog;
    const nowMs = Date.now();
    const today = todayStr();
    const items = [];
    let changed = false;

    // 1) Jam belajar tetap — 14 hari ke depan, kalimat diacak per hari
    if (r.studyEnabled) {
      for (let d = 0; d < REMINDER_HORIZON_DAYS; d++) {
        const day = addDays(today, d);
        r.studyTimes.forEach(hhmm => {
          const [hh, mm] = hhmm.split(':').map(Number);
          const at = atLocal(day, hh, mm);
          if (at.getTime() > nowMs + 5000) {
            items.push({ id: hashId(`study:${day}:${hhmm}`), title: 'Jam belajar 📚', body: pickRandom(STUDY_REMINDER_MESSAGES),
              at, channelId: 'pengingat', goto: 'beranda' });
          }
        });
      }
    }

    // 2) Tenggat mendekat (H-3 / H-1 / Hari H)
    if (r.deadlineEnabled) {
      state.tasks.filter(t => t.status !== 'selesai' && t.due).forEach(t => {
        r.deadlineLeadDays.forEach(lead => {
          const key = `${t.id}:${lead}:${t.due}`;
          let fireAt = rl.deadlineAt[key];
          if (fireAt === undefined) {
            const target = atLocal(addDays(t.due, -lead), DEADLINE_HOUR).getTime();
            if (target > nowMs + 5000) fireAt = target;
            else if (fmtLocalDate(new Date(target)) === today) fireAt = nowMs + 4000; // harinya hari ini tapi jam 08.00 lewat -> tembak sekarang, sekali
            else fireAt = 0;                                                         // harinya sudah lewat -> lewati
            rl.deadlineAt[key] = fireAt;
            changed = true;
          }
          if (fireAt > nowMs + 1000) {
            const pool = DEADLINE_MESSAGES[lead] || DEADLINE_MESSAGES[0];
            items.push({ id: hashId('dl:' + key), title: 'Pengingat tenggat ⏰', body: fillTemplate(pickRandom(pool), t),
              at: new Date(fireAt), channelId: 'pengingat', goto: 'tugas' });
          }
        });
      });
    }

    // 3) Sudah lewat tenggat — dorongan lembut, 3 hari ke depan dari hari ini
    if (r.overdueEnabled) {
      state.tasks.filter(t => t.status !== 'selesai' && t.due).forEach(t => {
        for (let k = 0; k < 3; k++) {
          const day = addDays(today, k);
          if (day <= t.due) continue; // belum lewat tenggat pada hari itu
          const key = `${t.id}:${day}`;
          let fireAt = rl.overdueAt[key];
          if (fireAt === undefined) {
            const target = atLocal(day, OVERDUE_HOUR).getTime();
            if (target > nowMs + 5000) fireAt = target;
            else if (day === today) fireAt = nowMs + 4000;
            else fireAt = 0;
            rl.overdueAt[key] = fireAt;
            changed = true;
          }
          if (fireAt > nowMs + 1000) {
            items.push({ id: hashId('od:' + key), title: 'Pengingat lembut 🌧️', body: fillTemplate(pickRandom(OVERDUE_MESSAGES), t),
              at: new Date(fireAt), channelId: 'pengingat', goto: 'tugas' });
          }
        }
      });
    }
    return { items, changed };
  }

  let reminderSig = '';
  let reminderSyncing = false;
  let reminderTimer = null;
  function scheduleReminderSync() {
    clearTimeout(reminderTimer);
    reminderTimer = setTimeout(() => syncReminders(false), 1200);
  }

  async function syncReminders(force) {
    const n = window.api.notif;
    if (!n.supported) return;
    const sig = JSON.stringify([todayStr(), state.reminders, state.tasks.map(t => [t.id, t.title, t.due, t.status])]);
    if (!force && sig === reminderSig) return;
    if (reminderSyncing) { scheduleReminderSync(); return; }
    reminderSyncing = true;
    try {
      const plan = buildReminderPlan();
      const keep = new Set([ID_TIMER_WORK, ID_TIMER_BREAK, ID_IDLE]);
      const pending = await n.pendingIds();
      await n.cancel(pending.filter(id => !keep.has(id)));
      await n.schedule(plan.items);
      reminderSig = sig;
      if (plan.changed) persist();
    } catch (e) {
      console.warn('syncReminders gagal:', e);
    } finally {
      reminderSyncing = false;
    }
  }

  // ---- Notifikasi timer Pomodoro (dijadwalkan tiap timer berjalan) ----
  // Alarm dalam-aplikasi tetap berbunyi seperti di Windows. Notifikasi sistem sengaja
  // dijadwalkan 1,2 dtk SETELAH waktunya: kalau app sedang dilihat, tick berikutnya
  // membatalkannya (tidak ada bunyi ganda); kalau app di latar belakang/layar mati,
  // JavaScript tidak jalan dan notifikasi inilah yang membunyikan alarm.
  const TIMER_NOTIF_LAG_MS = 1200;
  let timerNotifChain = Promise.resolve();
  function syncTimerNotifications() {
    timerNotifChain = timerNotifChain.then(doSyncTimerNotifications).catch(() => {});
    return timerNotifChain;
  }

  function fmtDuration(sec) {
    const m = Math.floor(sec / 60), s = sec % 60;
    if (!m) return `${s} detik`;
    return s ? `${m} menit ${s} detik` : `${m} menit`;
  }

  async function doSyncTimerNotifications() {
    const n = window.api.notif;
    if (!n.supported) return;
    await n.cancel([ID_TIMER_WORK, ID_TIMER_BREAK]);
    if (!timer.running || timer.endAt <= Date.now()) return;
    const preset = state.soundEnabled ? (state.pomodoro.soundPreset || 'ting-lembut') : 'senyap';
    const channelId = 'timer-' + preset;
    const exact = (await n.exactPermission()) === 'granted';
    const items = [];
    const breakDone = (at) => ({ id: ID_TIMER_BREAK, title: 'Istirahat selesai ☕', body: 'Siap lanjut fokus? Mulai pelan-pelan saja.',
      at: new Date(at), channelId, goto: 'pomodoro', exact });
    if (timer.mode === 'work') {
      const nextMode = ((timer.cycleCount + 1) % state.pomodoro.cycles === 0) ? 'long' : 'short';
      const breakSec = secForMode(nextMode);
      items.push({ id: ID_TIMER_WORK, title: 'Sesi fokus selesai 🎉', body: `Kerja bagus! Saatnya istirahat ${fmtDuration(breakSec)}.`,
        at: new Date(timer.endAt + TIMER_NOTIF_LAG_MS), channelId, goto: 'pomodoro', exact });
      items.push(breakDone(timer.endAt + breakSec * 1000 + TIMER_NOTIF_LAG_MS));
    } else {
      items.push(breakDone(timer.endAt + TIMER_NOTIF_LAG_MS));
    }
    await n.schedule(items);
  }

  // ---- Izin notifikasi ----
  async function promptNotifPermissionOnce() {
    if (!window.api.notif.supported || state.notifAsked) return;
    state.notifAsked = true;
    persist();
    const perm = await window.api.notif.request();
    if (perm === 'granted') syncReminders(true);
    refreshNotifStatus();
  }

  async function ensureTimerPermissions() {
    const n = window.api.notif;
    if (!n.supported) return;
    let perm = await n.permission();
    if (perm === 'prompt') {
      state.notifAsked = true;
      perm = await n.request();
      if (perm === 'granted') syncReminders(true);
    }
    if (perm !== 'granted') return;
    syncTimerNotifications();
    const exact = await n.exactPermission();
    if ((exact === 'prompt' || exact === 'denied') && !state.exactAsked) {
      state.exactAsked = true;
      persist();
      if (confirm('Supaya alarm timer berbunyi tepat waktu saat layar mati, izinkan “Alarm & pengingat” untuk Readlify. Buka pengaturannya sekarang?')) {
        await n.openExactSettings();
      }
    }
  }

  async function refreshNotifStatus() {
    const text = document.getElementById('notifStatusText');
    const btn = document.getElementById('btnNotifPermission');
    const row = document.getElementById('notifStatusRow');
    const exactRow = document.getElementById('exactStatusRow');
    const exactText = document.getElementById('exactStatusText');
    const exactBtn = document.getElementById('btnExactAlarm');
    if (!text) return;
    const n = window.api.notif;
    if (!n.supported) {
      text.textContent = 'Notifikasi hanya tersedia di aplikasi Android.';
      btn.hidden = true; exactRow.hidden = true; row.classList.remove('is-ok');
      return;
    }
    const perm = await n.permission();
    row.classList.toggle('is-ok', perm === 'granted');
    if (perm === 'granted') {
      text.textContent = '✅ Notifikasi diizinkan';
      btn.hidden = true;
    } else if (perm === 'denied') {
      text.textContent = 'Notifikasi diblokir. Kalau tombol di samping tidak memunculkan dialog, aktifkan lewat Pengaturan HP → Aplikasi → Readlify → Notifikasi.';
      btn.hidden = false;
    } else {
      text.textContent = 'Notifikasi belum diizinkan, jadi pengingat dan alarm timer tidak akan muncul saat aplikasi tertutup.';
      btn.hidden = false;
    }
    const exact = perm === 'granted' ? await n.exactPermission() : 'unsupported';
    exactRow.hidden = exact === 'unsupported';
    if (exact !== 'unsupported') {
      exactRow.classList.toggle('is-ok', exact === 'granted');
      exactText.textContent = exact === 'granted'
        ? '✅ Alarm timer tepat waktu diizinkan'
        : 'Alarm & pengingat belum diizinkan: notifikasi timer bisa terlambat beberapa menit saat layar mati.';
      exactBtn.hidden = exact === 'granted';
    }
  }

  function initReminders() {
    document.getElementById('cfgStudyReminderEnabled').addEventListener('change', (e) => {
      state.reminders.studyEnabled = e.target.checked;
      persist();
    });
    document.getElementById('btnAddStudyTime').addEventListener('click', () => {
      const input = document.getElementById('cfgStudyTimeInput');
      const val = input.value;
      if (!val) return;
      if (!state.reminders.studyTimes.includes(val)) {
        state.reminders.studyTimes.push(val);
        state.reminders.studyTimes.sort();
        persist();
        renderStudyTimeList();
      }
    });
    document.getElementById('cfgIdleNudgeEnabled').addEventListener('change', (e) => {
      state.reminders.idleNudgeEnabled = e.target.checked;
      persist();
    });
    document.getElementById('cfgIdleNudgeMinutes').addEventListener('change', (e) => {
      state.reminders.idleNudgeMinutes = parseInt(e.target.value, 10) || 45;
      persist();
    });
    document.getElementById('cfgDeadlineEnabled').addEventListener('change', (e) => {
      state.reminders.deadlineEnabled = e.target.checked;
      persist();
    });
    document.getElementById('cfgOverdueEnabled').addEventListener('change', (e) => {
      state.reminders.overdueEnabled = e.target.checked;
      persist();
    });
    document.querySelectorAll('.lead-day-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const day = parseInt(chip.dataset.lead, 10);
        const set = new Set(state.reminders.deadlineLeadDays);
        if (set.has(day)) set.delete(day); else set.add(day);
        state.reminders.deadlineLeadDays = [...set].sort((a, b) => b - a);
        chip.classList.toggle('is-active', set.has(day));
        persist();
      });
    });

    syncReminderInputsFromState();
    renderStudyTimeList();

    document.getElementById('btnNotifPermission').addEventListener('click', async () => {
      state.notifAsked = true;
      persist();
      const perm = await window.api.notif.request();
      if (perm === 'granted') { syncReminders(true); syncTimerNotifications(); }
      refreshNotifStatus();
    });
    document.getElementById('btnExactAlarm').addEventListener('click', async () => {
      await window.api.notif.openExactSettings();
      refreshNotifStatus();
    });
    refreshNotifStatus();
  }

  function syncReminderInputsFromState() {
    const r = state.reminders;
    document.getElementById('cfgStudyReminderEnabled').checked = r.studyEnabled;
    document.getElementById('cfgIdleNudgeEnabled').checked = r.idleNudgeEnabled;
    document.getElementById('cfgIdleNudgeMinutes').value = String(r.idleNudgeMinutes);
    document.getElementById('cfgDeadlineEnabled').checked = r.deadlineEnabled;
    document.getElementById('cfgOverdueEnabled').checked = r.overdueEnabled;
    document.querySelectorAll('.lead-day-chip').forEach(chip => {
      chip.classList.toggle('is-active', r.deadlineLeadDays.includes(parseInt(chip.dataset.lead, 10)));
    });
  }

  function renderStudyTimeList() {
    const wrap = document.getElementById('studyTimeList');
    wrap.innerHTML = '';
    state.reminders.studyTimes.forEach(t => {
      const chip = document.createElement('span');
      chip.className = 'time-chip';
      chip.innerHTML = `${t}<button type="button" title="Hapus">✕</button>`;
      chip.querySelector('button').addEventListener('click', () => {
        state.reminders.studyTimes = state.reminders.studyTimes.filter(x => x !== t);
        persist();
        renderStudyTimeList();
      });
      wrap.appendChild(chip);
    });
    document.getElementById('studyTimeEmpty').hidden = state.reminders.studyTimes.length > 0;
  }

  // ============================================================
  // PRAISE TOAST — pesan pujian random & general (gak digantungin ke
  // gender tertentu) tiap berhasil nyelesain tugas.
  // ============================================================
  const PRAISE_MESSAGES = [
    'Satu tugas selesai. Kemajuanmu nyata.',
    "'{title}' selesai! Kamu berhasil melawan rasa malas untuk memulai, dan itu kemenangan besar.",
    'Selesai! Sekecil apa pun langkahnya, tetap kemajuan.',
    'Bagus. Kamu menyelesaikan sesuatu hari ini, dan itu layak dihargai.',
    "'{title}' sudah dicentang ✓. Otakmu bekerja keras untuk sampai sini; beri dirimu apresiasi dulu.",
    'Satu beban lepas dari daftar. Nikmati momen ini sebentar.',
    'Kamu baru saja membuktikan pada dirimu sendiri bahwa kamu bisa.',
    "'{title}' resmi selesai, dan itu hasil usahamu sendiri.",
    'Konsistensi kecil seperti ini lama-lama menumpuk menjadi besar.',
    'Menyelesaikan tugas saat sulit fokus itu tidak mudah, dan kamu tetap melakukannya.',
  ];

  function showPraiseToast(task) {
    showToast(fillTemplate(pickRandom(PRAISE_MESSAGES), task), { kind: 'praise', emoji: '🎉' });
  }

  function showToast(text, opts = {}) {
    let stack = document.getElementById('toastStack');
    if (!stack) {
      stack = document.createElement('div'); stack.id = 'toastStack'; stack.className = 'toast-stack';
      stack.setAttribute('aria-live', 'polite');
      document.body.appendChild(stack);
    }
    const el = document.createElement('div');
    el.className = 'toast' + (opts.kind ? ` toast-${opts.kind}` : '');
    el.innerHTML = `${opts.emoji ? `<span class="toast-emoji">${opts.emoji}</span>` : ''}<span class="toast-text">${escapeHtml(text)}</span>`;
    stack.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-shown'));
    setTimeout(() => {
      el.classList.remove('is-shown');
      setTimeout(() => el.remove(), 250);
    }, 4200);
  }

  // ============================================================
  // ANDROID — siklus hidup app, tombol kembali, cadangan data
  // ============================================================
  function copyText(text) {
    const legacy = () => {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (_) { /* abaikan */ }
      ta.remove();
    };
    try {
      const p = navigator.clipboard && navigator.clipboard.writeText(text);
      if (p && p.catch) p.catch(legacy); else if (!p) legacy();
    } catch (_) { legacy(); }
  }

  const SOUND_FILES = {
    'ting-lembut': 'ting_lembut', 'bel-klasik': 'bel_klasik', 'kring-digital': 'kring_digital',
    'marimba-riang': 'marimba_riang', 'bel-timer-analog': 'bel_timer_analog',
  };

  // Android 8+: bunyi notifikasi melekat pada "channel", jadi tiap suara alarm punya channel sendiri.
  function setupNotifChannels() {
    const channels = [{
      id: 'pengingat', name: 'Pengingat belajar & tenggat',
      description: 'Jam belajar, tenggat tugas, dan dorongan lembut', importance: 3, vibration: false,
    }];
    Object.keys(SOUND_PRESETS).forEach(key => {
      channels.push({
        id: 'timer-' + key, name: 'Alarm Pomodoro: ' + SOUND_PRESETS[key].label,
        description: 'Bunyi saat sesi fokus atau istirahat selesai',
        importance: 4, vibration: true, sound: (SOUND_FILES[key] || 'ting_lembut') + '.wav',
      });
    });
    channels.push({
      id: 'timer-senyap', name: 'Alarm Pomodoro: senyap',
      description: 'Tanpa bunyi, hanya getar', importance: 4, vibration: true,
    });
    window.api.notif.createChannels(channels);
  }

  const FOCUS_GUARD_DELAY_MS = 25000;
  const FOCUS_GUARD_MESSAGES = [
    'Timer fokusmu masih jalan. Yuk balik ke Readlify 🌿',
    'Lagi sesi fokus nih. Sebentar lagi kelar, lanjut yuk!',
    'Kamu keluar dari Readlify pas sesi fokus. Balik pelan-pelan aja ya.',
  ];

  function handleBack() {
    const opens = document.querySelectorAll('.modal-overlay.is-open');
    const open = opens.length ? opens[opens.length - 1] : null;
    if (open) {
      if (open.id === 'taskModalOverlay') closeTaskModal();
      else if (open.id === 'termsModalOverlay') {
        const closeBtn = document.getElementById('btnTermsClose');
        if (closeBtn && !closeBtn.hidden) closeBtn.click(); // mode wajib-setuju tidak bisa ditutup
      } else if (open.id === 'noteModalOverlay') closeNoteModal();
      else if (open.id !== 'onboardingModalOverlay') open.classList.remove('is-open');
      return true;
    }
    if (window.EdDOC && window.EdDOC.back && window.EdDOC.back()) return true;
    if (focusMode && isFocusViewActive()) {
      if (confirm('Keluar dari Mode Fokus? Timernya akan dijeda.')) requestExitFocus();
      return true;
    }
    if (SUBVIEWS.has(currentView) && !isWide()) { goToView('lainnya'); return true; }
    if (currentView !== 'beranda') { goToView('beranda'); return true; }
    return false; // di Beranda: aplikasi diminimalkan oleh bridge
  }

  function onAppActive() {
    rolloverDailyThings();
    initHome();
    if (timer.running) reconcileTimer();
    renderAll();
    window.api.notif.cancel([ID_IDLE, ID_FOCUS_GUARD]);
    syncTimerNotifications();
    syncReminders(false);
    unlockAudio();
    if (currentView === 'pengaturan') refreshNotifStatus();
  }

  function onAppInactive() {
    flushSave();
    const n = window.api.notif;
    if (!n.supported) return;
    // "Balik fokus": sesi fokus berjalan lalu kamu pindah ke app lain.
    if (timer.running && timer.mode === 'work' && state.focusSettings.blockEnabled && timer.endAt - Date.now() > FOCUS_GUARD_DELAY_MS + 5000) {
      n.cancel([ID_FOCUS_GUARD]).then(() => n.schedule([{
        id: ID_FOCUS_GUARD, title: 'Balik fokus yuk 🎯', body: pickRandom(FOCUS_GUARD_MESSAGES),
        at: new Date(Date.now() + FOCUS_GUARD_DELAY_MS), channelId: 'pengingat', goto: 'pomodoro',
      }]));
    }
    if (timer.running) return;
    // "Dorongan lembut": sekali saja setelah kamu meninggalkan app, kalau masih ada tugas dan timer tidak jalan.
    if (state.reminders.idleNudgeEnabled && state.tasks.some(t => t.status !== 'selesai')) {
      n.cancel([ID_IDLE]).then(() => n.schedule([{
        id: ID_IDLE, title: 'Dorongan lembut 🌿', body: pickRandom(IDLE_NUDGE_MESSAGES),
        at: new Date(Date.now() + state.reminders.idleNudgeMinutes * 60000), channelId: 'pengingat', goto: 'pomodoro',
      }]));
    }
  }

  function applyNavPad() {
    document.documentElement.style.setProperty('--safe-bottom-min', (Number(state.navPad) || 0) + 'px');
  }

  function initMobile() {
    applyNavPad();
    const navSel = document.getElementById('cfgNavPad');
    navSel.value = String(Number(state.navPad) || 0);
    navSel.addEventListener('change', () => { state.navPad = Number(navSel.value) || 0; applyNavPad(); persist(); });
    setupNotifChannels();
    window.api.notif.onTap((goto) => { if (goto) goToView(goto); });
    window.api.onBack(handleBack);
    window.api.onAppState((active) => { if (active) onAppActive(); else onAppInactive(); });
    window.api.onFullScreenChange(onFullScreenChange);
    document.addEventListener('pointerdown', unlockAudio, { passive: true });
    window.addEventListener('pagehide', () => { flushSave(); });

    // tema "ikuti sistem" ikut berubah saat perangkat pindah mode gelap/terang
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (state.theme === 'system') applyTheme(); });
    } catch (_) { /* abaikan */ }

    // keyboard muncul: pastikan kolom yang sedang diketik tidak tertutup
    document.addEventListener('focusin', (e) => {
      if (e.target && e.target.matches && e.target.matches('input, textarea, select')) {
        setTimeout(() => { try { e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {} }, 320);
      }
    });

    // sembunyikan tombol + (FAB) selama ada modal terbuka
    const syncModalFlag = () => document.body.classList.toggle('has-modal', !!document.querySelector('.modal-overlay.is-open'));
    const mo = new MutationObserver(syncModalFlag);
    document.querySelectorAll('.modal-overlay').forEach(el => mo.observe(el, { attributes: true, attributeFilter: ['class'] }));

    // EdDOC: kelas pembuka dokumen dipasang di .content (pengganti :has())
    const ev = document.getElementById('view-eddoc');
    if (ev) new MutationObserver(syncDocOpenClass).observe(ev, { attributes: true, attributeFilter: ['class'] });
    syncDocOpenClass();

    // Village (HP): dok bangun bisa dilipat, dan teks status sesi bisa dibuka penuh dengan ketukan
    const dockBtn = document.getElementById('desaDockToggle'), desaStage = document.getElementById('desaStage');
    if (dockBtn && desaStage) {
      dockBtn.addEventListener('click', () => {
        const open = desaStage.classList.toggle('dock-open');
        dockBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        window.dispatchEvent(new Event('resize'));
      });
    }
    const desaSess = document.querySelector('.desa-session');
    if (desaSess) desaSess.addEventListener('click', () => desaSess.classList.toggle('is-open'));

    initDataIO();
    setTimeout(() => { syncReminders(false); }, 1500);
  }

  // ---- Ekspor / impor cadangan ----
  function initDataIO() {
    const status = document.getElementById('dataIoStatus');
    const say = (t) => { status.textContent = t || ''; status.hidden = !t; };

    document.getElementById('btnExportData').addEventListener('click', async () => {
      try {
        await flushSave();
        const payload = { app: 'readlify', exportVersion: 1, exportedAt: new Date().toISOString(), data: state };
        const res = await window.api.exportBackup(JSON.stringify(payload, null, 2), `readlify-cadangan-${todayStr()}.json`);
        say(res === 'canceled' ? '' : 'Cadangan siap ✓');
      } catch (e) {
        say('Gagal membuat cadangan: ' + (e && e.message ? e.message : e));
      }
    });

    const fileInput = document.getElementById('importFileInput');
    document.getElementById('btnImportData').addEventListener('click', () => { fileInput.value = ''; fileInput.click(); });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      try {
        if (file.size > 8 * 1024 * 1024) throw new Error('berkas terlalu besar');
        const parsed = JSON.parse(await file.text());
        // Terima cadangan dari app ini ({app, data}) maupun berkas readlify-data.json mentah dari Windows.
        const obj = parsed && parsed.app === 'readlify' && parsed.data ? parsed.data : parsed;
        const looksRight = obj && typeof obj === 'object' && !Array.isArray(obj)
          && (Array.isArray(obj.tasks) || Array.isArray(obj.citations) || Array.isArray(obj.notes));
        if (!looksRight) throw new Error('bukan berkas cadangan Readlify');
        if (!confirm('Impor akan MENGGANTI semua data saat ini (tugas, daftar pustaka, catatan, pencapaian, Village, pengaturan) dengan isi berkas ini. Lanjutkan?')) return;

        const base = DEFAULT_STATE();
        const incoming = Object.assign(base, obj, {
          pomodoro: Object.assign(DEFAULT_STATE().pomodoro, obj.pomodoro || {}),
          reminders: Object.assign(DEFAULT_STATE().reminders, obj.reminders || {}),
          reminderLog: Object.assign(DEFAULT_STATE().reminderLog, obj.reminderLog || {}),
          focusSettings: Object.assign(DEFAULT_STATE().focusSettings, obj.focusSettings || {}),
        });
        incoming.tasks = (Array.isArray(obj.tasks) ? obj.tasks : []).filter(t => t && typeof t === 'object').map(t => ({
          ...t,
          id: t.id || uid(),
          title: String(t.title || 'Tugas tanpa judul'),
          type: OLD_TASK_TYPE[t.type] || (TASK_TYPE_LABEL[t.type] ? t.type : 'lainnya'),
          status: ['belum', 'berjalan', 'selesai'].includes(t.status) ? t.status : 'belum',
          priority: ['santai', 'normal', 'penting'].includes(t.priority) ? t.priority : 'normal',
          course: t.course || '', due: t.due || '',
          subtasks: Array.isArray(t.subtasks) ? t.subtasks.filter(s => s && s.text).map(s => ({ ...s, id: s.id || uid(), done: !!s.done })) : [],
        }));
        incoming.citations = Array.isArray(obj.citations) ? obj.citations : [];
        incoming.notes = Array.isArray(obj.notes) ? obj.notes.map(normalizeNote) : [];
        incoming.mood = obj.mood && typeof obj.mood === 'object' ? obj.mood : { date: '', value: '' };
        incoming.reminderLog.deadlineAt = {}; incoming.reminderLog.overdueAt = {};
        incoming.timerRun = null;
        // Persetujuan S&K milik perangkat ini tetap dipakai (sudah disetujui di sini).
        ['termsAccepted', 'termsAcceptedAt', 'termsVersion', 'termsHistory'].forEach(k => { incoming[k] = state[k]; });
        incoming.notifAsked = state.notifAsked; incoming.exactAsked = state.exactAsked;

        clearTimeout(saveTimer);
        await window.api.saveData(incoming);
        location.reload();
      } catch (e) {
        say('Gagal mengimpor: ' + (e && e.message ? e.message : e));
      }
    });
  }

  function showFatal(e) {
    console.error(e);
    const c = document.getElementById('content');
    if (c) c.insertAdjacentHTML('afterbegin',
      '<div class="card" style="margin-bottom:14px"><strong>Ups, ada yang tidak beres saat memulai.</strong>' +
      '<p class="hint-text" style="margin-top:6px">Data kamu tidak dihapus. Coba tutup lalu buka lagi aplikasinya. Detail: ' +
      escapeHtml(String(e && e.message ? e.message : e)) + '</p></div>');
  }

  boot().catch(showFatal);
})();
