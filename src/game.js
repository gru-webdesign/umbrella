// Umbrella Free Fall — one-tap endless faller.
// Tap flips the wind: the umbrella carries you left or right while the city rises past you.
(() => {
  "use strict";

  const W = 180;                   // logical width; height follows the screen shape
  let H = 320;                     // 320..480, set by fit() so the game fills the screen
  let TOP = 0;                     // logical px hidden under a notch / status bar
  const S = 4;                     // internal render scale (crisp text, pixel-exact sprites)
  const HERO_Y = 92;               // fixed screen height of the hero
  const WALL_L = 30, WALL_R = 28;  // building facades on each side (sprite widths)
  const ALLEY_MID = (WALL_L + W - WALL_R) / 2;
  const BEST_KEY = "uff.best";
  const MUTE_KEY = "uff.muted";

  const canvas = document.getElementById("game");
  canvas.width = W * S;
  canvas.height = H * S;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  // ---------- assets ----------
  const SPRITES = {
    hero_drift: 2, hero_wave: 2, hero_death: 3, hero_dive: 2, cloud: 4,
    bird: 2, balloon: 2, plane: 1, dish: 1, pigeon: 2,
  };
  const BACKS = ["bg_day", "bg_dusk", "bg_menu", "facade_left", "facade_right"];
  const img = {};      // name -> [frames] or single image
  const mask = new Map(); // image -> {w,h,a:Uint8Array}

  function loadImage(src) {
    return new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("Could not load " + src));
      i.src = src;
    });
  }

  function buildMask(image) {
    const c = document.createElement("canvas");
    c.width = image.width; c.height = image.height;
    const g = c.getContext("2d");
    g.drawImage(image, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const a = new Uint8Array(c.width * c.height);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] > 128 ? 1 : 0;
    mask.set(image, { w: c.width, h: c.height, a });
  }

  async function loadAll() {
    const jobs = [];
    for (const [name, n] of Object.entries(SPRITES)) {
      img[name] = new Array(n);
      for (let i = 0; i < n; i++) {
        jobs.push(loadImage(`assets/${name}_${i}.png`).then((im) => { img[name][i] = im; buildMask(im); }));
      }
    }
    for (const name of BACKS) jobs.push(loadImage(`assets/${name}.png`).then((im) => (img[name] = im)));
    await Promise.all(jobs);
    img.balcony = img.pigeon.map(buildBalcony);
    img.balcony.forEach(buildMask);
    img.brolly = buildBrolly(img.hero_wave[0]);
  }

  // The open umbrella on its own (canopy + shaft) cut from the waving hero frame,
  // so it can tear away from his hand when he crashes.
  function buildBrolly(src) {
    const c = document.createElement("canvas");
    c.width = src.width; c.height = 23;
    const g = c.getContext("2d");
    g.drawImage(src, 0, 0, src.width, 13, 0, 0, src.width, 13);   // canopy
    g.drawImage(src, 15, 13, 3, 10, 15, 13, 3, 10);              // shaft
    return c;
  }

  // Small iron balcony (drawn in code to match the fire escapes) with a pigeon on the rail.
  // Mounted side is on the left; it is flipped for the right-hand building.
  function buildBalcony(pigeon) {
    const bw = 30, rail = pigeon.height - 1, bh = rail + 11;
    const c = document.createElement("canvas");
    c.width = bw; c.height = bh;
    const g = c.getContext("2d");
    const px = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    px(0, rail, bw, 2, "#1a1c2c");                                        // top rail
    for (let x = 1; x < bw - 1; x += 3) px(x, rail + 2, 1, 5, "#3a4466"); // bars
    px(bw - 1, rail, 1, 7, "#1a1c2c");                                    // end post
    px(0, rail + 7, bw, 1, "#1a1c2c");                                    // slab
    px(0, rail + 8, bw, 1, "#c0cbdc");
    px(0, rail + 9, bw, 1, "#8b9bb4");
    px(0, rail + 10, bw, 1, "#1a1c2c");
    px(0, rail, 2, 11, "#1a1c2c");                                        // wall mount
    g.drawImage(pigeon, bw - pigeon.width - 3, 0);
    return c;
  }

  // ---------- audio (tiny synth, no files) ----------
  let actx = null;
  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === "1"; } catch (e) {}
  function audio() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
    }
    if (actx && actx.state === "suspended") actx.resume();
    if (actx && window.Music && !window.Music.playing) window.Music.start(actx, 0);
    return actx;
  }
  let musicVol = -1;
  function syncMusic() {
    if (!actx || !window.Music) return;
    const v = muted ? 0 : st.mode === "over" || st.mode === "dying" ? 0.12 : 0.4;
    if (v !== musicVol) { window.Music.setVolume(v); musicVol = v; }
  }
  document.addEventListener("visibilitychange", () => {
    if (!actx) return;
    if (document.hidden) actx.suspend(); else actx.resume();
  });
  function tone(freq, dur, type = "square", vol = 0.08, slide = 0) {
    if (muted) return;
    const a = audio(); if (!a) return;
    const t = a.currentTime;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t); o.stop(t + dur);
  }
  function noise(dur, vol = 0.12) {
    if (muted) return;
    const a = audio(); if (!a) return;
    const len = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = a.createBufferSource(), g = a.createGain();
    s.buffer = buf; g.gain.value = vol;
    s.connect(g).connect(a.destination); s.start();
  }
  const sfx = {
    flip: () => tone(520, 0.07, "square", 0.05, 260),
    point: () => { tone(880, 0.06, "square", 0.05); setTimeout(() => tone(1320, 0.08, "square", 0.04), 55); },
    hit: () => { noise(0.35, 0.18); tone(200, 0.4, "sawtooth", 0.08, -150); },
    best: () => [660, 880, 1100, 1320].forEach((f, i) => setTimeout(() => tone(f, 0.12, "square", 0.05), i * 90)),
  };

  // ---------- state ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  let best = 0;
  try { best = parseInt(localStorage.getItem(BEST_KEY) || localStorage.getItem("kisobran.best") || "0", 10) || 0; } catch (e) {}

  const st = {
    mode: "loading",  // loading | menu | play | dying | over
    t: 0,
    score: 0,
    newBest: false,
    hero: { x: ALLEY_MID, dir: 1, frame: 0 },
    speed: 55,          // world scroll px/s
    hspeed: 70,         // hero sideways px/s
    toNext: 60,         // px of scroll until next spawn
    obs: [],
    fx: [],             // particles
    decor: [],          // background planes
    clouds: [],         // single drifting clouds in the alley
    wallY: 0,
    shake: 0,
    deadT: 0,
    scorePop: 0,
    sky: 0,             // 0 = day, 1 = dusk (eased)
  };

  function reset() {
    st.score = 0; st.newBest = false;
    st.hero.x = ALLEY_MID; st.hero.dir = 1;
    st.speed = 55; st.hspeed = 70; st.toNext = 70;
    st.obs = []; st.fx = []; st.deadT = 0; st.shake = 0; st.scorePop = 0;
    st.body = null; st.brolly = null; st.flash = 0; st.hitStop = 0;
    st.fenceRun = 0; st.hole = ALLEY_MID; st.fenceShift = 0;
    st.gust = { phase: "idle", t: rand(5, 8), dir: 1 };
    st.toast = null; st.stage = 0;
  }

  // ---------- obstacles ----------
  function frameOf(o) {
    const fr = img[o.kind];
    return fr[((o.anim * o.fps) | 0) % fr.length];
  }

  // ---------- obstacle rows ----------
  // Every row is checked before it spawns: there must be a free corridor at least
  // CLEAR px wide, and rows are spaced in time so the hero can always reach it.
  const CLEAR = 48;                    // hero umbrella is 37 px wide + margin
  const ALLEY_L = WALL_L, ALLEY_R = W - WALL_R;

  // things mounted on a facade: a satellite dish or a balcony with a pigeon
  function wallItem(side, dy = 0, kind = Math.random() < 0.5 ? "dish" : "balcony") {
    const f = img[kind][0];
    const x = side < 0 ? WALL_L - 2 : W - WALL_R - f.width + 2;
    return {
      kind, wall: true, x, dy, vx: 0, flip: side > 0,
      anim: Math.random() * 3, fps: kind === "balcony" ? 1.3 : 2,
      span: [x, x + f.width], h: f.height,
    };
  }
  // balloons ride with the world and sway a little sideways
  function balloon(cx, dy = 0, amp = 4) {
    const f = img.balloon[0];
    const base = Math.max(ALLEY_L + amp, Math.min(ALLEY_R - f.width - amp, cx - f.width / 2));
    return {
      kind: "balloon", x: base, dy, vx: 0, flip: Math.random() < 0.5, anim: Math.random() * 3, fps: 2,
      sway: { base, amp, ph: rand(0, 6) }, span: [base - amp, base + f.width + amp], h: f.height,
    };
  }
  // birds patrol one half of the alley, so the other half is always open
  function bird(side, dy = 0) {
    const f = img.bird[0], range = 40;
    const minX = side < 0 ? ALLEY_L + 1 : ALLEY_R - f.width - 1 - range;
    const maxX = minX + range;
    const v = rand(30, 42) + Math.min(20, st.score * 0.3);
    const goRight = Math.random() < 0.5;
    return {
      kind: "bird", x: rand(minX, maxX), dy, vx: goRight ? v : -v, flip: !goRight,
      anim: 0, fps: 8, patrol: [minX, maxX], span: [minX, maxX + f.width], h: f.height,
    };
  }

  function widestGap(items) {
    const spans = items.map((o) => o.span).sort((a, b) => a[0] - b[0]);
    let edge = ALLEY_L, widest = 0;
    for (const [a, b] of spans) { widest = Math.max(widest, a - edge); edge = Math.max(edge, b); }
    return Math.max(widest, ALLEY_R - edge);
  }

  const side = () => (Math.random() < 0.5 ? -1 : 1);

  // Difficulty ramps in stages; each new stage is announced once.
  const STAGES = [
    { at: 5,  msg: "BALLOONS!" },
    { at: 10, msg: "BIRDS & GATES" },
    { at: 15, msg: "BALLOON FENCES" },
    { at: 20, msg: "TIGHTER SQUEEZE" },
    { at: 30, msg: "WIND GUSTS!" },
    { at: 45, msg: "STORM ALLEY" },
  ];
  const GUST = 38;                     // px/s sideways push during a gust
  const gustsOn = () => st.score >= 30;
  // sideways speed you can count on even when a gust blows against you
  const safeH = () => st.hspeed - (gustsOn() ? GUST : 0);

  function buildRow() {
    const s = st.score;
    const pool = ["wall", "wall", "wall"];
    if (s >= 5) pool.push("balloon", "balloon");
    if (s >= 10) pool.push("bird", "bird", "gate");
    if (s >= 20) pool.push("squeeze", "squeeze", "pair");
    if (s >= 25) pool.push("nest");
    if (s >= 45) pool.push("nest", "gate");
    const sd = side();
    switch (pick(pool)) {
      case "wall": return [wallItem(sd)];
      case "balloon": return [balloon(rand(ALLEY_L + 10, ALLEY_R - 10))];
      case "bird": return [bird(sd)];
      case "gate": return [wallItem(-1), wallItem(1)];
      case "squeeze": // wall on one side, balloon hugging the other wall
        return [wallItem(sd), balloon(sd < 0 ? rand(ALLEY_R - 22, ALLEY_R - 12) : rand(ALLEY_L + 12, ALLEY_L + 22), 4)];
      case "pair": { // two balloons on the same half
        const c = sd < 0 ? ALLEY_L + 22 : ALLEY_R - 22;
        return [balloon(c + rand(-8, 8)), balloon(c + rand(-8, 8), 20)];
      }
      case "nest": return [wallItem(sd), bird(sd, 18)];
    }
    return [wallItem(sd)];
  }

  // A Flappy-style "pipe": everything is blocked except one hole.
  // Wall pieces cover the edges, a row of balloons fills the rest.
  function fenceRow(hx, cw) {
    const row = [];
    const fill = (sd, len) => {
      if (len < 14) return;
      let cur = 0;                               // distance covered from the wall
      if (len >= 30) {
        const kind = len >= 31 ? pick(["dish", "balcony"]) : "balcony";
        const w = wallItem(sd, rand(0, 4), kind);
        row.push(w);
        cur = w.span[1] - w.span[0] - 2;
      }
      while (len - cur >= 14) {
        const c = cur + 8;
        row.push(balloon(sd < 0 ? ALLEY_L + c : ALLEY_R - c, rand(0, 6), 2));
        cur += 21;
      }
    };
    fill(-1, hx - cw / 2 - ALLEY_L);
    fill(1, ALLEY_R - (hx + cw / 2));
    return row;
  }

  function spawn() {
    const s = st.score;
    let row = null, fence = false;
    if (st.fenceRun === 0 && s >= 15 && Math.random() < Math.min(0.4, 0.14 + (s - 15) * 0.007)) {
      st.fenceRun = 3 + ((Math.random() * (2 + s / 25)) | 0);
      st.hole = rand(ALLEY_L + 40, ALLEY_R - 40);
      st.fenceShift = ALLEY_R - ALLEY_L;           // the first fence follows a normal gap
    }
    if (st.fenceRun > 0) {
      const cw = Math.max(CLEAR + 4, 78 - (s - 15) * 0.55);
      const lo = ALLEY_L + cw / 2, hi = ALLEY_R - cw / 2;
      const shift = Math.min(st.fenceShift, hi - lo);
      const mag = rand(Math.min(18, shift), shift);
      let hx = st.hole + (Math.random() < 0.5 ? -mag : mag);
      if (hx < lo || hx > hi) hx = st.hole - (hx - st.hole);   // bounce back inside
      hx = Math.max(lo, Math.min(hi, hx));
      const r = fenceRow(hx, cw);
      if (widestGap(r) >= CLEAR) { row = r; fence = true; st.hole = hx; }
      st.fenceRun--;
    }
    for (let tries = 0; tries < 10 && !row; tries++) {
      const r = buildRow();
      if (widestGap(r) >= CLEAR) row = r;
    }
    if (!row) row = [wallItem(side())];

    const y = H + 6;
    let rowH = 0, last = row[0];
    for (const o of row) {
      o.y = y + o.dy; o.scored = true;
      if (o.dy + o.h >= rowH) { rowH = o.dy + o.h; last = o; }
      st.obs.push(o);
    }
    last.scored = false;   // one point per row, given when its lowest piece passes

    if (fence && st.fenceRun > 0) {
      // inside a fence run: quicker rhythm, next hole is only as far as you can reach
      const t = rand(0.85, 1.1);
      st.toNext = rowH + st.speed * t;
      st.fenceShift = Math.max(16, safeH() * (t - 0.3));
    } else {
      // time to cross most of the alley plus reaction time, then a little slack
      const tGap = (ALLEY_R - ALLEY_L - CLEAR) / safeH() + 0.25 + rand(0, 0.35);
      st.toNext = rowH + st.speed * tGap;
    }
    st.lastRowGap = widestGap(row);
  }

  // ---------- collision (pixel-perfect) ----------
  function heroImage() {
    const fr = img.hero_drift;
    return fr[st.hero.frame % fr.length];
  }
  function heroRect() {
    const im = heroImage();
    return { x: Math.round(st.hero.x - im.width / 2), y: HERO_Y, im, flip: st.hero.dir < 0 };
  }
  function overlap(a, b) {
    const ma = mask.get(a.im), mb = mask.get(b.im);
    const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y);
    const x1 = Math.min(a.x + ma.w, b.x + mb.w), y1 = Math.min(a.y + ma.h, b.y + mb.h);
    if (x0 >= x1 || y0 >= y1) return false;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        let ax = x - a.x, bx = x - b.x;
        if (a.flip) ax = ma.w - 1 - ax;
        if (b.flip) bx = mb.w - 1 - bx;
        if (ma.a[(y - a.y) * ma.w + ax] && mb.a[(y - b.y) * mb.w + bx]) return true;
      }
    }
    return false;
  }

  // ---------- input ----------
  let lastTap = 0;
  function onTap(e) {
    if (e) e.preventDefault();
    audio();
    const now = performance.now();
    if (now - lastTap < 60) return; // de-dupe touch + mouse
    lastTap = now;

    // mute toggle: top-right corner
    if (e && e.clientX !== undefined && (st.mode === "menu" || st.mode === "over")) {
      const r = canvas.getBoundingClientRect();
      const lx = ((e.clientX - r.left) / r.width) * W, ly = ((e.clientY - r.top) / r.height) * H;
      if (lx > W - 26 && ly < 26) {
        muted = !muted;
        try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch (err) {}
        return;
      }
    }

    if (st.mode === "menu") { reset(); st.mode = "play"; sfx.flip(); return; }
    if (st.mode === "play") { flip(); return; }
    if (st.mode === "over" && st.t > 0.6) { st.mode = "menu"; st.t = 0; }
  }
  function flip() {
    st.hero.dir *= -1;
    sfx.flip();
    for (let i = 0; i < 5; i++) {
      st.fx.push({ kind: "wind", x: st.hero.x + rand(-10, 10), y: HERO_Y + rand(4, 40), vx: st.hero.dir * rand(60, 110), vy: 0, life: 0.35, max: 0.35 });
    }
  }
  canvas.addEventListener("pointerdown", onTap);
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowLeft" || e.code === "ArrowRight" || e.code === "Enter") onTap(e);
  });

  // ---------- update ----------
  function die() {
    const h = st.hero;
    st.mode = "dying"; st.deadT = 0; st.shake = 0.3; st.hitStop = 0.14; st.flash = 1;
    // the umbrella is ripped upward by the wind, he tumbles down out of the frame
    st.body = { x: h.x, y: HERO_Y + 24, vx: -h.dir * 18, vy: -95, rot: 0, vr: h.dir * 6.5, flip: h.dir < 0 };
    st.brolly = { x: h.x + h.dir * 6, y: HERO_Y + 8, vx: h.dir * 30, vy: -115, rot: 0, vr: -h.dir * 2.2, flip: h.dir < 0 };
    sfx.hit();
    try { navigator.vibrate && navigator.vibrate(40); } catch (e) {}
    if (st.score > best) {
      best = st.score; st.newBest = st.score > 0;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) {}
    }
  }

  function updateGust(dt) {
    const g = st.gust;
    if (!gustsOn()) return;
    g.t -= dt;
    if (g.phase === "blow" && Math.random() < dt * 30) {
      st.fx.push({ kind: "wind", x: g.dir > 0 ? ALLEY_L - 6 : ALLEY_R - 2, y: rand(10, H - 10), vx: g.dir * rand(140, 220), vy: 0, life: 0.6, max: 0.6 });
    }
    if (g.t > 0) return;
    if (g.phase === "idle") { g.phase = "warn"; g.t = 0.9; g.dir = side(); tone(300, 0.25, "sawtooth", 0.03, 200); }
    else if (g.phase === "warn") { g.phase = "blow"; g.t = 1.3; noise(0.5, 0.06); }
    else { g.phase = "idle"; g.t = rand(6, 10) - Math.min(3, (st.score - 30) * 0.06); }
  }

  function update(dt) {
    st.t += dt;
    if (st.toast) { st.toast.t += dt; if (st.toast.t > 1.8) st.toast = null; }
    st.shake = Math.max(0, st.shake - dt);
    st.scorePop = Math.max(0, st.scorePop - dt * 4);

    // sky drifts from day to dusk and back every 30 points
    const phase = (st.score % 60) / 30;
    const target = phase < 1 ? Math.min(1, Math.max(0, phase * 2 - 1)) : Math.min(1, Math.max(0, 3 - phase * 2));
    st.sky += (target - st.sky) * Math.min(1, dt * 1.5);

    const scroll = st.mode === "play" ? st.speed : st.mode === "menu" ? 18 : 0;
    st.wallY = (st.wallY + scroll * dt) % 100;

    // background planes
    if (Math.random() < dt * 0.06 && st.decor.length < 1) {
      const fromLeft = Math.random() < 0.5;
      st.decor.push({ x: fromLeft ? -30 : W + 30, y: rand(20, 150), vx: fromLeft ? 14 : -14 });
    }
    for (const d of st.decor) { d.x += d.vx * dt; d.y -= scroll * 0.15 * dt; }
    st.decor = st.decor.filter((d) => d.x > -40 && d.x < W + 40 && d.y > -20);

    // a few loose clouds drifting up slower than the walls
    while (st.clouds.length < 4) {
      const first = st.clouds.length < 4 && st.t < 0.1;
      st.clouds.push({ i: (Math.random() * 4) | 0, x: rand(WALL_L - 8, W - WALL_R - 20), y: first ? rand(0, H) : H + rand(10, 120), k: rand(0.25, 0.45) });
    }
    for (const c of st.clouds) c.y -= scroll * c.k * dt;
    st.clouds = st.clouds.filter((c) => c.y > -30);
    syncMusic();

    for (const p of st.fx) { p.x += p.vx * dt; p.y += p.vy * dt - scroll * dt * 0.5; p.vy += (p.g || 0) * dt; p.life -= dt; }
    st.fx = st.fx.filter((p) => p.life > 0);

    if (st.mode === "play") {
      const h = st.hero;
      h.frame = ((st.t * 5) | 0) % 2;
      h.x += h.dir * st.hspeed * dt;
      updateGust(dt);
      if (st.gust.phase === "blow") h.x += st.gust.dir * GUST * dt;
      const half = heroImage().width / 2;
      h.x = Math.max(WALL_L + half - 4, Math.min(W - WALL_R - half + 4, h.x));

      st.toNext -= st.speed * dt;
      if (st.toNext <= 0) spawn();

      const hr = heroRect();
      for (const o of st.obs) {
        o.y -= st.speed * dt;
        o.anim += dt;
        if (o.sway) o.x = o.sway.base + Math.sin(o.anim * 1.6 + o.sway.ph) * o.sway.amp;
        else o.x += o.vx * dt;
        if (o.patrol) {
          if (o.x < o.patrol[0]) { o.x = o.patrol[0]; o.vx = Math.abs(o.vx); }
          if (o.x > o.patrol[1]) { o.x = o.patrol[1]; o.vx = -Math.abs(o.vx); }
          o.flip = o.vx < 0;
        }
        const f = frameOf(o);
        if (!o.scored && o.y + f.height < HERO_Y + 10) {
          o.scored = true;
          st.score++; st.scorePop = 1;
          if (st.stage < STAGES.length && st.score >= STAGES[st.stage].at) {
            st.toast = { msg: STAGES[st.stage].msg, t: 0 };
            st.stage++;
          }
          st.speed = Math.min(150, 55 + st.score * 1.5);
          st.hspeed = Math.min(108, 70 + st.score * 0.7);
          sfx.point();
        }
        if (overlap(hr, { x: Math.round(o.x), y: Math.round(o.y), im: f, flip: o.flip })) { die(); break; }
      }
      st.obs = st.obs.filter((o) => o.y > -60 && o.x > -60 && o.x < W + 60);
    } else if (st.mode === "dying" || st.mode === "over") {
      if (st.hitStop > 0) { st.hitStop -= dt; return; }
      st.flash = Math.max(0, st.flash - dt * 6);
      const b = st.body, u = st.brolly;
      if (b) {
        b.vy += 560 * dt; b.y += b.vy * dt; b.x += b.vx * dt; b.rot += b.vr * dt;
        u.vy = Math.max(-190, u.vy - 45 * dt);                    // keeps catching wind
        u.y += u.vy * dt; u.x += (u.vx + Math.sin(st.deadT * 7) * 40) * dt;
        u.rot = Math.sin(st.deadT * 5) * 0.5 + u.vr * st.deadT * 0.3;
      }
      if (st.mode === "over") return;
      st.deadT += dt;
      if (st.deadT > 1.0 && (!b || b.y > H + 40)) {
        st.mode = "over"; st.t = 0;
        if (st.newBest) sfx.best();
      }
    }
  }

  // ---------- render ----------
  function draw(image, x, y, flip = false, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    if (flip) {
      ctx.translate((Math.round(x) + image.width) * S, Math.round(y) * S);
      ctx.scale(-S, S);
    } else {
      ctx.translate(Math.round(x) * S, Math.round(y) * S);
      ctx.scale(S, S);
    }
    ctx.drawImage(image, 0, 0);
    ctx.restore();
  }

  // a 180x320 background stretched to cover the current screen (centred, nearest-neighbour)
  function drawCover(image, alpha = 1) {
    const k = Math.max(W / image.width, H / image.height);
    const w = image.width * k, h = image.height * k;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(image, ((W - w) / 2) * S, ((H - h) / 2) * S, w * S, h * S);
    ctx.restore();
  }

  function text(str, x, y, size, color = "#fff", align = "center", outline = "#1a1c2c") {
    ctx.save();
    ctx.font = `700 ${size * S}px "Pixelify Sans", monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(2, size * 0.32) * S;
    ctx.strokeStyle = outline;
    ctx.strokeText(str, x * S, y * S);
    ctx.fillStyle = color;
    ctx.fillText(str, x * S, y * S);
    ctx.restore();
  }

  function drawWorld() {
    if (st.mode === "menu") {
      drawCover(img.bg_menu);
    } else {
      drawCover(img.bg_day);
      if (st.sky > 0.01) drawCover(img.bg_dusk, st.sky);
    }
    for (const d of st.decor) draw(img.plane[0], d.x, d.y, d.vx > 0, 0.8); // sprite faces left
    if (st.mode !== "menu") for (const c of st.clouds) draw(img.cloud[c.i], c.x, c.y, false, 0.9);
    if (st.mode === "menu") return;

    // free-flying things first, so birds come out from behind the buildings
    for (const o of st.obs) if (!o.wall) draw(frameOf(o), o.x, o.y, o.flip);
    drawFacades();
    for (const o of st.obs) if (o.wall) draw(frameOf(o), o.x, o.y, o.flip);
  }

  function drawFacades() {
    const L = img.facade_left, R = img.facade_right;
    for (let y = -st.wallY; y < H; y += L.height) {
      draw(L, 0, y);
      draw(R, W - WALL_R, y);
    }
    ctx.save();
    if (st.sky > 0.01) {            // dusk light on the walls
      ctx.globalAlpha = 0.35 * st.sky;
      ctx.fillStyle = "#29366f";
      ctx.fillRect(0, 0, WALL_L * S, H * S);
      ctx.fillRect((W - WALL_R) * S, 0, WALL_R * S, H * S);
    }
    ctx.globalAlpha = 1;            // inner corner edge and soft shadow on the alley
    ctx.fillStyle = "#1a1c2c";
    ctx.fillRect((WALL_L - 1) * S, 0, S, H * S);
    ctx.fillRect((W - WALL_R) * S, 0, S, H * S);
    ctx.globalAlpha = 0.18;
    ctx.fillRect(WALL_L * S, 0, 3 * S, H * S);
    ctx.fillRect((W - WALL_R - 3) * S, 0, 3 * S, H * S);
    ctx.restore();
  }

  function drawHero() {
    const h = st.hero;
    if (st.mode === "play") {
      const r = heroRect();
      draw(r.im, r.x, r.y, r.flip);
    } else if ((st.mode === "dying" || st.mode === "over") && st.body) {
      const u = st.brolly, b = st.body;
      if (u.y > -40) drawRot(img.brolly, u.x, u.y, u.rot, u.flip);
      if (b.y < H + 40) drawRot(img.hero_death[1], b.x, b.y, b.rot, b.flip);
    }
  }

  function drawRot(image, cx, cy, ang, flip) {
    ctx.save();
    ctx.translate(Math.round(cx) * S, Math.round(cy) * S);
    ctx.rotate(ang);
    ctx.scale(flip ? -S : S, S);
    ctx.drawImage(image, -Math.round(image.width / 2), -Math.round(image.height / 2));
    ctx.restore();
  }

  function drawFx() {
    ctx.save();
    for (const p of st.fx) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = "#f4f4f4";
      ctx.fillRect(Math.round(p.x) * S, Math.round(p.y) * S, 8 * S, 1 * S);
    }
    ctx.restore();
  }

  function soundIcon() {
    const x = W - 18, y = 6 + TOP;
    ctx.save();
    ctx.fillStyle = "rgba(26,28,44,0.55)";
    ctx.fillRect(x * S, y * S, 13 * S, 13 * S);
    ctx.fillStyle = "#fff";
    ctx.fillRect((x + 2) * S, (y + 5) * S, 3 * S, 3 * S);
    ctx.beginPath();
    ctx.moveTo((x + 5) * S, (y + 5) * S); ctx.lineTo((x + 8) * S, (y + 2) * S);
    ctx.lineTo((x + 8) * S, (y + 11) * S); ctx.lineTo((x + 5) * S, (y + 8) * S); ctx.fill();
    if (muted) {
      ctx.strokeStyle = "#e43b44"; ctx.lineWidth = 1.5 * S;
      ctx.beginPath(); ctx.moveTo((x + 1) * S, (y + 1) * S); ctx.lineTo((x + 12) * S, (y + 12) * S); ctx.stroke();
    } else {
      ctx.fillRect((x + 10) * S, (y + 4) * S, 1 * S, 5 * S);
    }
    ctx.restore();
  }

  function drawUI() {
    if (st.mode === "menu") {
      const bob = Math.sin(st.t * 2.2) * 3;
      const fr = img.hero_wave[((st.t * 3) | 0) % 2];
      draw(fr, W / 2 - fr.width / 2, H * 0.4 + bob);
      text("UMBRELLA", W / 2, TOP + H * 0.15, 20, "#ffcd75");
      text("FREE FALL", W / 2, TOP + H * 0.15 + 22, 20, "#f77622");
      text("Tap to switch the wind", W / 2, TOP + H * 0.15 + 44, 7, "#fff");
      if (((st.t * 2) | 0) % 2 === 0) text("TAP TO START", W / 2, H * 0.62, 10, "#fff");
      if (best > 0) text(`BEST ${best}`, W / 2, H * 0.62 + 18, 8, "#73eff7");
      soundIcon();
      return;
    }

    if (st.mode === "play" || st.mode === "dying") {
      const pop = 1 + st.scorePop * 0.25;
      text(String(st.score), W / 2, TOP + 24, 18 * pop, "#fff");
      if (st.mode === "play" && st.score === 0 && st.t < 30) {
        text("tap = flip the wind", W / 2, H - 22, 7, "#fff");
      }
      if (st.toast && st.mode === "play") {
        const k = st.toast.t, y = 140 - Math.min(1, k * 4) * 8;
        if (k < 1.5 || ((k * 8) | 0) % 2) text(st.toast.msg, W / 2, y, 10, "#ffcd75");
      }
      const g = st.gust;
      if (st.mode === "play" && g && (g.phase === "warn" || g.phase === "blow")) {
        const blink = g.phase === "blow" || ((st.t * 8) | 0) % 2;
        if (blink) text(g.dir > 0 ? "GUST >>>" : "<<< GUST", W / 2, TOP + 50, 9, g.phase === "blow" ? "#73eff7" : "#fff");
      }
    }

    if (st.mode === "over") {
      ctx.save();
      ctx.fillStyle = "rgba(26,28,44,0.45)";
      ctx.fillRect(0, 0, W * S, H * S);
      const px = 24, pw = W - 48, ph = 108, py = Math.round((H - ph) / 2) + 14;
      ctx.fillStyle = "#29366f";
      ctx.fillRect(px * S, py * S, pw * S, ph * S);
      ctx.strokeStyle = "#1a1c2c"; ctx.lineWidth = 2 * S;
      ctx.strokeRect(px * S, py * S, pw * S, ph * S);
      ctx.strokeStyle = "#41a6f6"; ctx.lineWidth = 1 * S;
      ctx.strokeRect((px + 3) * S, (py + 3) * S, (pw - 6) * S, (ph - 6) * S);
      ctx.restore();
      text("GAME OVER", W / 2, py - 26, 18, "#e43b44");
      text("SCORE", W / 2 - 34, py + 18, 7, "#94b0c2");
      text("BEST", W / 2 + 34, py + 18, 7, "#94b0c2");
      text(String(st.score), W / 2 - 34, py + 38, 18, "#fff");
      text(String(best), W / 2 + 34, py + 38, 18, "#ffcd75");
      if (st.newBest) text("NEW BEST!", W / 2, py + 64, 9, ((st.t * 4) | 0) % 2 ? "#ffcd75" : "#fff");
      else text(st.score >= best - 3 && best > 0 ? "So close! Once more." : "Try again", W / 2, py + 64, 7, "#fff");
      if (st.t > 0.6) text("TAP TO CONTINUE", W / 2, py + 88, 8, "#fff");
      soundIcon();
    }
  }

  function render() {
    ctx.save();
    if (st.shake > 0) {
      const k = st.shake * 10 * S;
      ctx.translate(rand(-k, k), rand(-k, k));
    }
    drawWorld();
    drawFx();
    drawHero();
    ctx.restore();
    if (st.flash > 0) {
      ctx.save(); ctx.globalAlpha = st.flash * 0.6; ctx.fillStyle = "#f4f4f4";
      ctx.fillRect(0, 0, W * S, H * S); ctx.restore();
    }
    drawUI();
  }

  // ---------- loop ----------
  let last = 0;
  function loop(ts) {
    const dt = Math.min(0.033, (ts - last) / 1000 || 0);
    last = ts;
    if (st.mode !== "loading") { update(dt); render(); }
    requestAnimationFrame(loop);
  }

  function fit() {
    const box = canvas.parentElement;
    const bw = (box && box.clientWidth) || window.innerWidth;
    const bh = (box && box.clientHeight) || window.innerHeight;
    // width always fills; the logical height grows with taller phones (up to 480)
    H = Math.max(320, Math.min(480, Math.round((W * bh) / bw)));
    const k = Math.min(bw / W, bh / H);
    if (canvas.height !== H * S) {
      canvas.height = H * S;
      ctx.imageSmoothingEnabled = false;
    }
    canvas.style.width = Math.round(W * k) + "px";
    canvas.style.height = Math.round(H * k) + "px";
    // keep the score clear of a camera notch
    const probe = document.getElementById("safe-top");
    const inset = probe ? probe.getBoundingClientRect().height : 0;
    TOP = Math.ceil(inset / k);
  }
  window.addEventListener("resize", fit);
  fit();

  ctx.fillStyle = "#41a6f6";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  Promise.all([loadAll(), document.fonts ? document.fonts.load(`700 ${10 * S}px "Pixelify Sans"`).catch(() => {}) : null])
    .then(() => { st.mode = "menu"; st.t = 0; })
    .catch((err) => {
      ctx.fillStyle = "#fff"; ctx.font = `${8 * S}px monospace`;
      ctx.fillText(err.message, 8 * S, 20 * S);
    });
  requestAnimationFrame(loop);

  // test hook
  window.__uff = window.__kisobran = { st, spawn, flip, buildRow, widestGap, CLEAR };
})();
