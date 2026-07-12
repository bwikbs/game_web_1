// WebAudio 절차 생성 효과음 (오디오 파일 없음)
let ctx = null;
let master = null;
let noiseBuf = null;

function ensureCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function playNoise({ freq, q = 1, type = 'lowpass', vol, dur, detune = 0 }) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 1 + detune;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.5, dur + 0.05);
  src.stop(t + dur + 0.1);
}

function playTone({ from, to, vol, dur, type = 'triangle' }) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sfx = {
  unlock: ensureCtx,
  break() {
    playNoise({ freq: 900 + Math.random() * 400, type: 'bandpass', q: 0.8, vol: 0.5, dur: 0.13 });
    playTone({ from: 220, to: 110, vol: 0.15, dur: 0.08, type: 'square' });
  },
  place() {
    playTone({ from: 170, to: 70, vol: 0.4, dur: 0.09 });
    playNoise({ freq: 500, vol: 0.15, dur: 0.05 });
  },
  step() {
    playNoise({ freq: 1100 + Math.random() * 500, vol: 0.1, dur: 0.055, detune: Math.random() * 0.3 });
  },
  jump() {
    playNoise({ freq: 700, vol: 0.12, dur: 0.08 });
  },
  splash() {
    playNoise({ freq: 550, vol: 0.4, dur: 0.35, detune: -0.4 });
    playNoise({ freq: 1800, type: 'highpass', vol: 0.12, dur: 0.25 });
  },
};
