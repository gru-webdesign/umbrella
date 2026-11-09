// Umbrella Alley — original chiptune loop, synthesised live with WebAudio (no audio files).
// 8 bars in C major, 132 BPM: C  Am  F  G | C  Em  F  G.
// Exposes window.Music = { start(ctx), stop(), setVolume(v) }.
(() => {
  "use strict";

  const BPM = 132;
  const STEP = 60 / BPM / 2;        // one eighth note in seconds
  const BARS = [
    { root: 48, chord: [60, 64, 67] }, // C
    { root: 45, chord: [57, 60, 64] }, // Am
    { root: 41, chord: [53, 57, 60] }, // F
    { root: 43, chord: [55, 59, 62] }, // G
    { root: 48, chord: [60, 64, 67] }, // C
    { root: 40, chord: [55, 59, 64] }, // Em
    { root: 41, chord: [53, 57, 60] }, // F
    { root: 43, chord: [55, 59, 62] }, // G
  ];
  // melody as [midi, eighths]; 0 = rest. Each bar adds up to 8.
  const MELODY = [
    [76, 2], [79, 2], [84, 2], [79, 1], [76, 1],
    [81, 2], [79, 1], [76, 1], [72, 2], [76, 2],
    [77, 2], [81, 2], [84, 2], [81, 1], [77, 1],
    [79, 3], [77, 1], [76, 2], [74, 2],
    [76, 2], [79, 2], [84, 2], [86, 1], [88, 1],
    [86, 2], [83, 2], [79, 2], [76, 2],
    [77, 1], [79, 1], [81, 2], [84, 2], [81, 2],
    [79, 4], [0, 2], [74, 1], [76, 1],
  ];
  const LOOP = BARS.length * 8;

  // expand melody to a per-step table: note starting at step, its length
  const melodyAt = new Array(LOOP).fill(null);
  (() => {
    let t = 0;
    for (const [n, d] of MELODY) { if (n) melodyAt[t] = [n, d]; t += d; }
  })();

  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  let ac = null, out = null, timer = null, step = 0, nextTime = 0, noiseBuf = null;

  function voice(type, midi, t, dur, vol, attack = 0.005) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(hz(midi), t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function kick(t) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + 0.16);
  }

  function hiss(t, dur, vol, hp) {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf;
    f.type = "highpass"; f.frequency.value = hp;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(out);
    s.start(t); s.stop(t + dur + 0.02);
  }

  function schedule(i, t) {
    const bar = BARS[(i >> 3) % BARS.length];
    const beat = i % 8;
    // bass: root / octave bounce
    voice("triangle", bar.root + (beat % 2 ? 12 : 0), t, STEP * 0.9, 0.22);
    // arpeggio
    const arp = bar.chord[[0, 1, 2, 1][beat % 4]];
    voice("square", arp, t, STEP * 0.5, 0.025);
    // lead
    const m = melodyAt[i % LOOP];
    if (m) voice("square", m[0], t, STEP * m[1] * 0.92, 0.06, 0.01);
    // drums
    if (beat === 0 || beat === 4) kick(t);
    if (beat === 2 || beat === 6) hiss(t, 0.12, 0.12, 1200);
    if (beat % 2 === 1) hiss(t, 0.04, 0.05, 6000);
  }

  function tick() {
    while (nextTime < ac.currentTime + 0.15) {
      schedule(step, nextTime);
      step = (step + 1) % LOOP;
      nextTime += STEP;
    }
  }

  window.Music = {
    start(ctx, volume = 0.5) {
      if (timer || !ctx) return;
      ac = ctx;
      if (!out) {
        out = ac.createGain();
        out.gain.value = volume;
        out.connect(ac.destination);
        const len = ac.sampleRate * 0.3;
        noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      step = 0;
      nextTime = ac.currentTime + 0.05;
      timer = setInterval(tick, 25);
      tick();
    },
    stop() { clearInterval(timer); timer = null; },
    setVolume(v) {
      if (!out) return;
      out.gain.cancelScheduledValues(ac.currentTime);
      out.gain.setTargetAtTime(v, ac.currentTime, 0.15);
    },
    get playing() { return !!timer; },
  };
})();
