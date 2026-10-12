// Sons sintetizados na hora (nenhum arquivo de áudio de terceiros).
export function createAudio() {
  let ctx = null;
  let master = null;
  let engine = null;
  let muted = false;
  try {
    muted = localStorage.getItem('tc-mute') === '1';
  } catch {
    /* sem armazenamento: começa com som */
  }

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    return ctx;
  }

  function tone(freq, dur, type = 'square', vol = 0.18, when = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume();
    },
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      try {
        localStorage.setItem('tc-mute', muted ? '1' : '0');
      } catch {
        /* ignora */
      }
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    beep(final = false) {
      tone(final ? 880 : 440, final ? 0.5 : 0.18, 'square', 0.16);
    },
    bump(strength) {
      tone(90 + Math.random() * 30, 0.15, 'triangle', 0.25 * Math.min(1, strength + 0.2));
    },
    lap(final) {
      [523, 659, 784].forEach((f, i) => tone(final ? f * 1.5 : f, 0.12, 'square', 0.12, i * 0.09));
    },
    fanfare(win) {
      const notes = win ? [523, 659, 784, 1047, 784, 1047] : [392, 349, 330, 262];
      notes.forEach((f, i) => tone(f, 0.22, 'square', 0.13, i * 0.14));
    },
    // ronco do motor, contínuo, segue a velocidade
    engine(speed01) {
      if (!ensure() || ctx.state !== 'running') return;
      if (!engine) {
        const o = ctx.createOscillator();
        const o2 = ctx.createOscillator();
        const f = ctx.createBiquadFilter();
        const g = ctx.createGain();
        o.type = 'sawtooth';
        o2.type = 'square';
        f.type = 'lowpass';
        f.frequency.value = 600;
        g.gain.value = 0;
        o.connect(f);
        o2.connect(f);
        f.connect(g).connect(master);
        o.start();
        o2.start();
        engine = { o, o2, f, g };
      }
      const t = ctx.currentTime;
      engine.o.frequency.setTargetAtTime(48 + speed01 * 95, t, 0.08);
      engine.o2.frequency.setTargetAtTime(24 + speed01 * 48, t, 0.08);
      engine.f.frequency.setTargetAtTime(380 + speed01 * 900, t, 0.1);
      engine.g.gain.setTargetAtTime(0.03 + speed01 * 0.06, t, 0.1);
    },
    stopEngine() {
      if (engine && ctx) engine.g.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    },
  };
}
