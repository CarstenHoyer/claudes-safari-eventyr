// Sound effects using Web Audio API

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

// --- 8-bit Safari Background Music ---
let musicPlaying = false;

// Musical note frequencies
const NOTE: Record<string, number> = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00,
  A4: 440.00, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25,
  F5: 349.23 * 2, G5: 392.00 * 2, A5: 440.00 * 2,
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00,
  A3: 220.00, B3: 246.94,
  REST: 0,
};

// Safari melody - upbeat African-inspired tune
const melody: { note: string; dur: number }[] = [
  // Phrase 1 - cheerful safari theme
  { note: "E4", dur: 0.2 }, { note: "G4", dur: 0.2 }, { note: "A4", dur: 0.4 },
  { note: "G4", dur: 0.2 }, { note: "A4", dur: 0.2 }, { note: "C5", dur: 0.4 },
  { note: "A4", dur: 0.2 }, { note: "G4", dur: 0.2 }, { note: "E4", dur: 0.4 },
  { note: "D4", dur: 0.2 }, { note: "E4", dur: 0.2 }, { note: "G4", dur: 0.4 },
  // Phrase 2 - call and response
  { note: "A4", dur: 0.3 }, { note: "C5", dur: 0.3 }, { note: "D5", dur: 0.6 },
  { note: "C5", dur: 0.2 }, { note: "A4", dur: 0.2 }, { note: "G4", dur: 0.4 },
  { note: "E4", dur: 0.3 }, { note: "G4", dur: 0.3 }, { note: "A4", dur: 0.6 },
  { note: "REST", dur: 0.2 },
  // Phrase 3 - adventurous rise
  { note: "C4", dur: 0.2 }, { note: "E4", dur: 0.2 }, { note: "G4", dur: 0.2 },
  { note: "A4", dur: 0.2 }, { note: "C5", dur: 0.4 }, { note: "D5", dur: 0.4 },
  { note: "C5", dur: 0.2 }, { note: "A4", dur: 0.2 }, { note: "G4", dur: 0.2 },
  { note: "E4", dur: 0.2 }, { note: "G4", dur: 0.8 },
  { note: "REST", dur: 0.2 },
  // Phrase 4 - rhythmic groove
  { note: "A4", dur: 0.15 }, { note: "A4", dur: 0.15 }, { note: "REST", dur: 0.1 },
  { note: "G4", dur: 0.15 }, { note: "G4", dur: 0.15 }, { note: "REST", dur: 0.1 },
  { note: "A4", dur: 0.2 }, { note: "C5", dur: 0.2 }, { note: "D5", dur: 0.4 },
  { note: "C5", dur: 0.2 }, { note: "A4", dur: 0.3 }, { note: "G4", dur: 0.3 },
  { note: "E4", dur: 0.4 }, { note: "D4", dur: 0.2 }, { note: "E4", dur: 0.6 },
  { note: "REST", dur: 0.3 },
];

// Bass line
const bassLine: { note: string; dur: number }[] = [
  { note: "C3", dur: 0.4 }, { note: "C3", dur: 0.4 }, { note: "G3", dur: 0.4 }, { note: "G3", dur: 0.4 },
  { note: "A3", dur: 0.4 }, { note: "A3", dur: 0.4 }, { note: "E3", dur: 0.4 }, { note: "E3", dur: 0.4 },
  { note: "F3", dur: 0.4 }, { note: "F3", dur: 0.4 }, { note: "C3", dur: 0.4 }, { note: "C3", dur: 0.4 },
  { note: "G3", dur: 0.4 }, { note: "G3", dur: 0.4 }, { note: "A3", dur: 0.4 }, { note: "A3", dur: 0.4 },
  { note: "C3", dur: 0.4 }, { note: "E3", dur: 0.4 }, { note: "G3", dur: 0.4 }, { note: "A3", dur: 0.4 },
  { note: "F3", dur: 0.4 }, { note: "G3", dur: 0.4 }, { note: "A3", dur: 0.4 }, { note: "G3", dur: 0.4 },
  { note: "A3", dur: 0.3 }, { note: "A3", dur: 0.3 }, { note: "G3", dur: 0.3 }, { note: "G3", dur: 0.3 },
  { note: "F3", dur: 0.4 }, { note: "E3", dur: 0.4 }, { note: "C3", dur: 0.4 }, { note: "G3", dur: 0.4 },
];

function scheduleTrack(
  ctx: AudioContext,
  notes: { note: string; dur: number }[],
  startTime: number,
  type: OscillatorType,
  volume: number
): number {
  let t = startTime;
  for (const n of notes) {
    if (n.note !== "REST" && NOTE[n.note]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(NOTE[n.note], t);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, t);
      gain.gain.setValueAtTime(volume * 0.8, t + n.dur * 0.7);
      gain.gain.exponentialRampToValueAtTime(0.001, t + n.dur * 0.95);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + n.dur);
    }
    t += n.dur;
  }
  return t;
}

function scheduleDrums(ctx: AudioContext, startTime: number, duration: number) {
  const beatInterval = 0.4;
  let t = startTime;
  let beat = 0;
  while (t < startTime + duration) {
    // Kick on 1 and 3
    if (beat % 4 === 0 || beat % 4 === 2) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(80, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.08);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.1);
    }
    // Hi-hat on every beat
    const bufSize = ctx.sampleRate * 0.03;
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const hpf = ctx.createBiquadFilter();
    hpf.type = "highpass";
    hpf.frequency.value = 8000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(beat % 2 === 0 ? 0.04 : 0.025, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    noise.connect(hpf);
    hpf.connect(g);
    g.connect(ctx.destination);
    noise.start(t);
    noise.stop(t + 0.03);

    t += beatInterval;
    beat++;
  }
}

function playMusicLoop() {
  if (!musicPlaying) return;
  const ctx = getCtx();
  const startTime = ctx.currentTime + 0.05;

  const melodyEnd = scheduleTrack(ctx, melody, startTime, "square", 0.08);
  scheduleTrack(ctx, bassLine, startTime, "triangle", 0.07);

  const duration = melodyEnd - startTime;
  scheduleDrums(ctx, startTime, duration);

  // Schedule next loop
  const nextStart = (duration - 0.1) * 1000;
  setTimeout(() => {
    if (musicPlaying) playMusicLoop();
  }, nextStart);
}

export function startMusic() {
  if (musicPlaying) return;
  musicPlaying = true;
  playMusicLoop();
}

export function stopMusic() {
  musicPlaying = false;
}

// --- Grass footstep sound (soft noise burst) ---
let lastStepTime = 0;
export function playGrassStep() {
  const now = Date.now();
  if (now - lastStepTime < 250) return; // Don't play too frequently
  lastStepTime = now;

  const ctx = getCtx();
  const t = ctx.currentTime;

  // Create noise buffer for rustling
  const bufferSize = ctx.sampleRate * 0.08;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.3;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  // Bandpass filter to make it sound like rustling grass
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 2000 + Math.random() * 1500;
  filter.Q.value = 0.8;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.15, t);
  gain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(t);
  noise.stop(t + 0.08);
}

// --- Coin "pling" sound ---
export function playCoinPling() {
  const ctx = getCtx();
  const t = ctx.currentTime;

  // High sparkly tone
  const osc1 = ctx.createOscillator();
  osc1.type = "sine";
  osc1.frequency.setValueAtTime(1200, t);
  osc1.frequency.exponentialRampToValueAtTime(2400, t + 0.08);

  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(1800, t + 0.05);
  osc2.frequency.exponentialRampToValueAtTime(3200, t + 0.15);

  const gain1 = ctx.createGain();
  gain1.gain.setValueAtTime(0.25, t);
  gain1.gain.exponentialRampToValueAtTime(0.01, t + 0.2);

  const gain2 = ctx.createGain();
  gain2.gain.setValueAtTime(0.001, t);
  gain2.gain.setValueAtTime(0.2, t + 0.05);
  gain2.gain.exponentialRampToValueAtTime(0.01, t + 0.3);

  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.start(t);
  osc1.stop(t + 0.2);

  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.start(t + 0.05);
  osc2.stop(t + 0.3);
}

// --- Death "du du duuuu" sound ---
export function playDeath() {
  const ctx = getCtx();
  const t = ctx.currentTime;

  const notes = [
    { freq: 400, start: 0, dur: 0.2 },
    { freq: 350, start: 0.25, dur: 0.2 },
    { freq: 200, start: 0.5, dur: 0.8 },
  ];

  for (const note of notes) {
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(note.freq, t + note.start);
    if (note === notes[2]) {
      // Last note slides down
      osc.frequency.exponentialRampToValueAtTime(100, t + note.start + note.dur);
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, t + note.start);
    gain.gain.setValueAtTime(0.2, t + note.start + note.dur * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.01, t + note.start + note.dur);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t + note.start);
    osc.stop(t + note.start + note.dur);
  }
}

// --- Jump "dooiiinng" sound (spring bounce) ---
export function playJump() {
  const ctx = getCtx();
  const t = ctx.currentTime;

  // Main boing oscillator - sweeps up then wobbles
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(600, t + 0.1);
  osc.frequency.exponentialRampToValueAtTime(400, t + 0.2);
  osc.frequency.exponentialRampToValueAtTime(500, t + 0.25);
  osc.frequency.exponentialRampToValueAtTime(350, t + 0.35);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.25, t);
  gain.gain.setValueAtTime(0.2, t + 0.1);
  gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.4);

  // Add a subtle high "spring" overtone
  const osc2 = ctx.createOscillator();
  osc2.type = "triangle";
  osc2.frequency.setValueAtTime(800, t);
  osc2.frequency.exponentialRampToValueAtTime(1200, t + 0.05);
  osc2.frequency.exponentialRampToValueAtTime(600, t + 0.3);

  const gain2 = ctx.createGain();
  gain2.gain.setValueAtTime(0.08, t);
  gain2.gain.exponentialRampToValueAtTime(0.01, t + 0.3);

  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.start(t);
  osc2.stop(t + 0.3);
}

// --- Sword swing "swoosh" sound ---
export function playSwing() {
  const ctx = getCtx();
  const t = ctx.currentTime;

  const bufferSize = ctx.sampleRate * 0.15;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(800, t);
  filter.frequency.exponentialRampToValueAtTime(2000, t + 0.05);
  filter.frequency.exponentialRampToValueAtTime(400, t + 0.15);
  filter.Q.value = 2;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.3, t);
  gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(t);
  noise.stop(t + 0.15);
}

// --- Hit enemy sound ---
export function playHit() {
  const ctx = getCtx();
  const t = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(200, t);
  osc.frequency.exponentialRampToValueAtTime(80, t + 0.15);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.25, t);
  gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.2);

  // Impact noise
  const bufferSize = ctx.sampleRate * 0.05;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.2, t);
  g2.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
  noise.connect(g2);
  g2.connect(ctx.destination);
  noise.start(t);
  noise.stop(t + 0.05);
}

// --- Pickup weapon sound ---
export function playPickup() {
  const ctx = getCtx();
  const t = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(400, t);
  osc.frequency.exponentialRampToValueAtTime(800, t + 0.1);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.2, t);
  gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.15);
}
