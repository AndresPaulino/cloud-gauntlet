// Pomodoro timer. While a focus block runs, the layout hides the sidebar (focus mode).
// Timer state lives in localStorage (endsAt timestamp) so a reload doesn't lose it.
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useStore } from '../store/store';
import { toast } from './Celebrate';
import { fmtTime } from './bits';

export const PRESETS = [{ focus: 25, rest: 5 }, { focus: 50, rest: 10 }] as const;
type Phase = 'idle' | 'focus' | 'break';

interface FocusState {
  phase: Phase; endsAt: number; preset: number;
  start: () => void; stop: () => void; setPreset: (i: number) => void; tick: () => void;
}

function chime() {
  try {
    const ctx = new AudioContext();
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.25;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.start(t); o.stop(t + 0.55);
    });
  } catch { /* no audio: the toast still shows */ }
}

export const useFocus = create<FocusState>()(persist((set, get) => ({
  phase: 'idle', endsAt: 0, preset: 0,
  start: () => set({ phase: 'focus', endsAt: Date.now() + PRESETS[get().preset].focus * 60_000 }),
  stop: () => set({ phase: 'idle', endsAt: 0 }),
  setPreset: (preset) => set({ preset }),
  tick: () => {
    const { phase, endsAt, preset } = get();
    if (phase === 'idle' || Date.now() < endsAt) return;
    chime();
    if (phase === 'focus') {
      useStore.getState().completeFocus();
      toast({ icon: '🍅', title: 'Focus block done · +15 XP', body: `Take ${PRESETS[preset].rest} minutes. Stand up, look away from the screen.`, big: true });
      set({ phase: 'break', endsAt: Date.now() + PRESETS[preset].rest * 60_000 });
    } else {
      toast({ icon: '⏰', title: 'Break over', body: 'Start another focus block when you are ready.' });
      set({ phase: 'idle', endsAt: 0 });
    }
  },
}), { name: 'cloud-gauntlet-focus' }));

/** Header control: start/stop, countdown, preset. Mount once (it drives the tick). */
export function FocusTimer() {
  const f = useFocus();
  const [, force] = useState(0);
  useEffect(() => {
    if (f.phase === 'idle') return;
    const h = setInterval(() => { useFocus.getState().tick(); force((n) => n + 1); }, 1000);
    return () => clearInterval(h);
  }, [f.phase]);

  const left = Math.max(0, Math.ceil((f.endsAt - Date.now()) / 1000));
  useEffect(() => {
    const base = 'Cloud Gauntlet';
    document.title = f.phase === 'idle' ? base : `${f.phase === 'focus' ? '🍅' : '☕'} ${fmtTime(left)} · ${base}`;
  }, [f.phase, left]);

  if (f.phase === 'idle') {
    return (
      <span className="flex items-center rounded-full border border-line bg-surface text-sm">
        <button onClick={f.start} className="pl-3 pr-2 py-1 rounded-l-full hover:bg-sunk" title="Start a focus block. The sidebar hides until it ends.">🍅 Focus</button>
        <select value={f.preset} onChange={(e) => f.setPreset(+e.target.value)} className="bg-transparent pr-2 py-1 text-muted rounded-r-full" aria-label="Focus length">
          {PRESETS.map((p, i) => <option key={i} value={i}>{p.focus}/{p.rest}</option>)}
        </select>
      </span>
    );
  }
  return (
    <span className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm tabular-nums border ${f.phase === 'focus' ? 'bg-xp/15 border-xp text-xp-ink' : 'bg-ok/10 border-ok text-ok'}`}>
      {f.phase === 'focus' ? '🍅 Focus' : '☕ Break'} {fmtTime(left)}
      <button onClick={f.stop} className="opacity-70 hover:opacity-100" aria-label="Stop timer" title="Stop">✕</button>
    </span>
  );
}
