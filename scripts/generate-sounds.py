#!/usr/bin/env python3
"""
Membuat file WAV untuk 5 suara alarm Pomodoro Readlify.

Resepnya SAMA dengan preset suara di app.js (SOUND_PRESETS) — osilator sederhana
dengan envelope naik-linear lalu turun-eksponensial — hanya saja di sini dirender
ke file supaya bisa dipakai sebagai suara notifikasi Android saat aplikasi sedang
di latar belakang (WebAudio tidak jalan kalau aplikasi tidak aktif).

Jalankan:  python3 scripts/generate-sounds.py
Hasil:     resources/native/raw/*.wav  (disalin ke res/raw oleh prepare-android.mjs)
"""
import wave, os
import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'resources', 'native', 'raw')


def osc(kind, freq, t):
    ph = 2 * np.pi * freq * t
    if kind == 'sine':
        return np.sin(ph)
    if kind == 'triangle':
        return (2 / np.pi) * np.arcsin(np.sin(ph))
    if kind == 'square':
        return np.sign(np.sin(ph))
    raise ValueError(kind)


def note(buf, kind, freq, start, peak, attack, end):
    """Satu nada: gain 0.0001 -> peak (linear, `attack` detik) -> 0.0001 (eksponensial, sampai `end`)."""
    n0 = int(start * SR)
    n = int((end + 0.02) * SR)
    t = np.arange(n) / SR
    g = np.where(
        t < attack,
        0.0001 + (peak - 0.0001) * (t / attack),
        peak * (0.0001 / peak) ** np.clip((t - attack) / (end - attack), 0, 1),
    )
    g[t > end] = 0
    seg = osc(kind, freq, t) * g
    buf[n0:n0 + n] += seg[: max(0, len(buf) - n0)] if n0 + n > len(buf) else seg


def render(events, repeats=1, gap=0.0):
    one = max(s + e + 0.05 for (_, _, s, _, _, e) in events)
    total = one * repeats + gap * (repeats - 1) + 0.1
    buf = np.zeros(int(total * SR))
    for r in range(repeats):
        off = r * (one + gap)
        for kind, freq, start, peak, attack, end in events:
            note(buf, kind, freq, start + off, peak, attack, end)
    return buf


def seq(kind, freqs, step, peak, attack, end):
    return [(kind, f, i * step, peak, attack, end) for i, f in enumerate(freqs)]


PRESETS = {
    'ting_lembut':     (seq('sine', [880, 1318.51], 0.14, 0.22, 0.02, 0.32), 2, 0.35),
    'bel_klasik':      (seq('triangle', [523.25, 659.25, 783.99], 0.11, 0.25, 0.015, 0.40), 2, 0.35),
    'kring_digital':   (seq('square', [1046.5] * 3, 0.16, 0.16, 0.01, 0.10), 2, 0.35),
    'marimba_riang':   (seq('sine', [523.25, 659.25, 783.99, 1046.5], 0.09, 0.20, 0.01, 0.28), 2, 0.35),
    # Bel timer analog: 18 ketokan logam cepat (dua harmonik) — sengaja hanya 1x, sudah panjang (~1,6 dtk).
    'bel_timer_analog': (
        [e for i in range(18) for e in (
            ('triangle', 2500, i * 0.085, 0.19, 0.003, 0.075),
            ('triangle', 3750, i * 0.085, 0.09, 0.003, 0.075),
        )], 1, 0.0),
}

os.makedirs(OUT, exist_ok=True)
for name, (events, repeats, gap) in PRESETS.items():
    buf = render(events, repeats, gap)
    buf = buf / (np.max(np.abs(buf)) or 1) * 0.9          # normalisasi: volume ditentukan volume notifikasi HP
    fade = int(0.01 * SR); buf[-fade:] *= np.linspace(1, 0, fade)
    pcm = (buf * 32767).astype('<i2')
    path = os.path.join(OUT, f'{name}.wav')
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    print(f'{name}.wav  {len(buf)/SR:.2f}s  {os.path.getsize(path)//1024} KB')
