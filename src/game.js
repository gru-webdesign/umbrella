// Kišobran — one-tap endless faller.
// Tap flips the wind: the umbrella carries you left or right while the city rises past you.
(() => {
  "use strict";

  const W = 180, H = 320;          // logical resolution
  const S = 4;                     // internal render scale (crisp text, pixel-exact sprites)
  const HERO_Y = 92;               // fixed screen height of the hero
  const BEST_KEY = "kisobran.best";

  const canvas = document.getElementById("game");
  canvas.width = W * S;
  canvas.height = H * S;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  // ---------- assets ----------
  const SPRITES = {
    hero_drift: 2, hero_wave: 2, hero_death: 3, hero_dive: 2,
    bird: 2, balloon: 2, plane: 1, dish: 1, pigeon_roof: 2,
  };
  const BACKS = ["bg_day", "bg_dusk", "bg_menu", "bg_street", "clouds", "roofs"];
  const img = {};      // name -> [frames] or single image
  const mask = new Map(); // image -> {w,h,a:Uint8Array}

  function loadImage(src) {
    return new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("Ne mogu da učitam " + src));
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
  }

  // ---------- audio (tiny synth, no files) ----------
  let actx = null;
  let muted = false;
  try { muted = localStorage.getItem("kisobran.muted") === "1"; } catch (e) {}
  function audio() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
    }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
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
  try { best = parseInt(localStorage.getItem(BEST_KEY) || "0", 10) || 0; } catch (e) {}

  const st = {
    mode: "loading",  // loading | menu | play | dying | over
    t: 0,
    score: 0,
    newBest: false,
    hero: { x: W / 2, dir: 1, frame: 0 },
    speed: 55,          // world scroll px/s
    hspeed: 70,         // hero sideways px/s
    toNext: 60,         // px of scroll until next spawn
    obs: [],
    fx: [],             // particles
    decor: [],          // background planes
    cloudY: 0, roofY: 0,
    shake: 0,
    deadT: 0,
    scorePop: 0,
    sky: 0,             // 0 = day, 1 = dusk (eased)
  };

  function reset() {
    st.score = 0; st.newBest = false;
    st.hero.x = W / 2; st.hero.dir = 1;
    st.speed = 55; st.hspeed = 70; st.toNext = 70;
    st.obs = []; st.fx = []; st.deadT = 0; st.shake = 0; st.scorePop = 0;
  }

  // ---------- obstacles ----------
  function frameOf(o) {
    const fr = img[o.kind];
    return fr[((o.anim * o.fps) | 0) % fr.length];
  }

  function addWall(side, y) {
    const kind = Math.random() < 0.5 ? "dish" : "pigeon_roof";
    const f = img[kind][0];
    st.obs.push({
      kind, x: side < 0 ? -2 : W - f.width + 2, y, vx: 0, vy: 0,
      flip: side > 0, anim: Math.random(), fps: 2, scored: false,
    });
  }
  function addBalloon(x, y) {
    st.obs.push({ kind: "balloon", x: x - 6, y, vx: rand(-6, 6), vy: -rand(12, 22), flip: Math.random() < 0.5, anim: Math.random(), fps: 2, scored: false });
  }
  function addBird(y) {
    const fromLeft = Math.random() < 0.5;
    const v = rand(35, 55) + Math.min(40, st.score * 0.8);
    st.obs.push({ kind: "bird", x: fromLeft ? -16 : W + 1, y, vx: fromLeft ? v : -v, vy: 0, flip: !fromLeft, anim: 0, fps: 8, scored: false });
  }

  function spawn() {
    const y = H + 6, s = st.score;
    const pool = ["wall", "wall"];
    if (s >= 3) pool.push("balloons");
    if (s >= 6) pool.push("bird", "bird");
    if (s >= 12) pool.push("gate");
    if (s >= 20) pool.push("squeeze", "squeeze");
    switch (pick(pool)) {
      case "wall": addWall(Math.random() < 0.5 ? -1 : 1, y); break;
      case "balloons": {
        const n = s > 15 ? 2 : 1;
        for (let i = 0; i < n; i++) addBalloon(rand(24, W - 24), y + i * 18);
        break;
      }
      case "bird": addBird(y); break;
      case "gate": addWall(-1, y); addWall(1, y); break;
      case "squeeze": {
        const side = Math.random() < 0.5 ? -1 : 1;
        addWall(side, y);
        addBalloon(side < 0 ? rand(110, 150) : rand(30, 70), y + 4);
        break;
      }
    }
    const lo = Math.max(44, 84 - s * 0.9);
    st.toNext = rand(lo, lo + 36);
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
        try { localStorage.setItem("kisobran.muted", muted ? "1" : "0"); } catch (err) {}
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
    st.mode = "dying"; st.deadT = 0; st.shake = 0.35;
    sfx.hit();
    try { navigator.vibrate && navigator.vibrate(40); } catch (e) {}
    if (st.score > best) {
      best = st.score; st.newBest = st.score > 0;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) {}
    }
  }

  function update(dt) {
    st.t += dt;
    st.shake = Math.max(0, st.shake - dt);
    st.scorePop = Math.max(0, st.scorePop - dt * 4);

    // sky drifts from day to dusk and back every 30 points
    const phase = (st.score % 60) / 30;
    const target = phase < 1 ? Math.min(1, Math.max(0, phase * 2 - 1)) : Math.min(1, Math.max(0, 3 - phase * 2));
    st.sky += (target - st.sky) * Math.min(1, dt * 1.5);

    const scroll = st.mode === "play" ? st.speed : st.mode === "menu" ? 18 : 0;
    st.cloudY = (st.cloudY + scroll * 0.35 * dt) % H;
    st.roofY = (st.roofY + scroll * 0.6 * dt) % H;

    // background planes
    if (Math.random() < dt * 0.06 && st.decor.length < 1) {
      const fromLeft = Math.random() < 0.5;
      st.decor.push({ x: fromLeft ? -30 : W + 30, y: rand(20, 150), vx: fromLeft ? 14 : -14 });
    }
    for (const d of st.decor) { d.x += d.vx * dt; d.y -= scroll * 0.15 * dt; }
    st.decor = st.decor.filter((d) => d.x > -40 && d.x < W + 40 && d.y > -20);

    for (const p of st.fx) { p.x += p.vx * dt; p.y += p.vy * dt - scroll * dt * 0.5; p.vy += (p.g || 0) * dt; p.life -= dt; }
    st.fx = st.fx.filter((p) => p.life > 0);

    if (st.mode === "play") {
      const h = st.hero;
      h.frame = ((st.t * 5) | 0) % 2;
      h.x += h.dir * st.hspeed * dt;
      const half = heroImage().width / 2;
      h.x = Math.max(half - 8, Math.min(W - half + 8, h.x));

      st.toNext -= st.speed * dt;
      if (st.toNext <= 0) spawn();

      const hr = heroRect();
      for (const o of st.obs) {
        o.y += (o.vy - st.speed) * dt;
        o.x += o.vx * dt;
        o.anim += dt;
        const f = frameOf(o);
        if (!o.scored && o.y + f.height < HERO_Y + 10) {
          o.scored = true;
          st.score++; st.scorePop = 1;
          st.speed = Math.min(150, 55 + st.score * 1.5);
          st.hspeed = Math.min(108, 70 + st.score * 0.7);
          sfx.point();
        }
        if (overlap(hr, { x: Math.round(o.x), y: Math.round(o.y), im: f, flip: o.flip })) { die(); break; }
      }
      st.obs = st.obs.filter((o) => o.y > -60 && o.x > -60 && o.x < W + 60);
    } else if (st.mode === "dying") {
      st.deadT += dt;
      if (st.deadT > 1.1) {
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
      draw(img.bg_menu, 0, 0);
    } else {
      draw(img.bg_day, 0, 0);
      if (st.sky > 0.01) draw(img.bg_dusk, 0, 0, false, st.sky);
    }
    for (const d of st.decor) draw(img.plane[0], d.x, d.y, d.vx < 0, 0.8);

    if (st.mode !== "menu") {
      // city walls fade in at dusk
      if (st.sky > 0.05) {
        const ry = -st.roofY;
        draw(img.roofs, 0, ry, false, 0.55 * st.sky);
        draw(img.roofs, 0, ry + H, false, 0.55 * st.sky);
      }
      const cy = -st.cloudY;
      draw(img.clouds, 0, cy, false, 0.45);
      draw(img.clouds, 0, cy + H, false, 0.45);
    }

    for (const o of st.obs) draw(frameOf(o), o.x, o.y, o.flip);
  }

  function drawHero() {
    const h = st.hero;
    if (st.mode === "play") {
      const r = heroRect();
      draw(r.im, r.x, r.y, r.flip);
    } else if (st.mode === "dying" || st.mode === "over") {
      const fr = img.hero_death;
      const i = Math.min(fr.length - 1, (st.deadT / 0.3) | 0);
      const im = fr[st.mode === "over" ? fr.length - 1 : i];
      draw(im, h.x - im.width / 2, HERO_Y + 6, h.dir < 0);
    }
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
    const x = W - 18, y = 6;
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
      draw(fr, W / 2 - fr.width / 2, 120 + bob);
      text("KIŠOBRAN", W / 2, 60, 22, "#ffcd75");
      text("Tapni da promeniš vetar", W / 2, 84, 7, "#fff");
      if (((st.t * 2) | 0) % 2 === 0) text("TAPNI ZA START", W / 2, 196, 10, "#fff");
      if (best > 0) text(`REKORD ${best}`, W / 2, 214, 8, "#73eff7");
      soundIcon();
      return;
    }

    if (st.mode === "play" || st.mode === "dying") {
      const pop = 1 + st.scorePop * 0.25;
      text(String(st.score), W / 2, 24, 18 * pop, "#fff");
      if (st.mode === "play" && st.score === 0 && st.t < 30) {
        text("tap = vetar na drugu stranu", W / 2, 300, 6, "#fff");
      }
    }

    if (st.mode === "over") {
      ctx.save();
      ctx.fillStyle = "rgba(26,28,44,0.45)";
      ctx.fillRect(0, 0, W * S, H * S);
      const px = 24, py = 150, pw = W - 48, ph = 108;
      ctx.fillStyle = "#29366f";
      ctx.fillRect(px * S, py * S, pw * S, ph * S);
      ctx.strokeStyle = "#1a1c2c"; ctx.lineWidth = 2 * S;
      ctx.strokeRect(px * S, py * S, pw * S, ph * S);
      ctx.strokeStyle = "#41a6f6"; ctx.lineWidth = 1 * S;
      ctx.strokeRect((px + 3) * S, (py + 3) * S, (pw - 6) * S, (ph - 6) * S);
      ctx.restore();
      text("KRAJ", W / 2, 130, 20, "#e43b44");
      text("POENI", W / 2 - 34, py + 18, 7, "#94b0c2");
      text("REKORD", W / 2 + 34, py + 18, 7, "#94b0c2");
      text(String(st.score), W / 2 - 34, py + 38, 18, "#fff");
      text(String(best), W / 2 + 34, py + 38, 18, "#ffcd75");
      if (st.newBest) text("NOVI REKORD!", W / 2, py + 64, 9, ((st.t * 4) | 0) % 2 ? "#ffcd75" : "#fff");
      else text(st.score >= best - 3 && best > 0 ? "Skoro! Još jednom." : "Probaj ponovo", W / 2, py + 64, 7, "#fff");
      if (st.t > 0.6) text("TAPNI ZA NASTAVAK", W / 2, py + 88, 8, "#fff");
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
    const k = Math.min(window.innerWidth / W, window.innerHeight / H);
    canvas.style.width = Math.floor(W * k) + "px";
    canvas.style.height = Math.floor(H * k) + "px";
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
  window.__kisobran = { st, spawn, flip };
})();
