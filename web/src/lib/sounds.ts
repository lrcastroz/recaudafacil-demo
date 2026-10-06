/** Sonidos sintetizados con WebAudio (sin archivos externos). */
let ctx: AudioContext | null = null;
let muted = false;

function ac(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.15, delay = 0) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, gain = 0.06, freq = 1200) {
  const a = ac();
  if (!a) return;
  const buffer = a.createBuffer(1, a.sampleRate * dur, a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (0.6 + 0.4 * Math.sin(i / 40));
  const src = a.createBufferSource();
  src.buffer = buffer;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start();
}

export const sounds = {
  tap: () => tone(880, 0.06, 'square', 0.05),
  key: () => tone(1320, 0.05, 'square', 0.04),
  coin: () => {
    tone(2200, 0.12, 'triangle', 0.12);
    tone(3300, 0.18, 'triangle', 0.08, 0.05);
  },
  bill: () => noise(0.7, 0.05, 400),
  error: () => {
    tone(220, 0.18, 'sawtooth', 0.08);
    tone(180, 0.25, 'sawtooth', 0.08, 0.18);
  },
  success: () => {
    tone(660, 0.12, 'sine', 0.12);
    tone(880, 0.12, 'sine', 0.12, 0.12);
    tone(1320, 0.25, 'sine', 0.12, 0.24);
  },
  printer: () => noise(2.2, 0.04, 2500),
  drop: () => {
    tone(1800, 0.08, 'triangle', 0.08);
    tone(1500, 0.08, 'triangle', 0.06, 0.07);
  },
  pinpadBeep: () => tone(2000, 0.15, 'square', 0.05),
  setMuted: (m: boolean) => {
    muted = m;
  },
  isMuted: () => muted,
};
