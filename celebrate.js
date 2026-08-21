// Celebration effects: six visually distinct shows (canvas) + synthesized sound (no external assets).
// Public API: celebrate(score) | celebrateShow(name) | CELEBRATE_SFX | stopCelebration()
// Shows: fireworks(100) · confetti(90) · balloons(80) · stars(70) · bubbles(60) · sunrise(<60)

(function(){
"use strict";

/* ================= sound ================= */
let actx = null;
function ac(){
  if(actx) return actx;
  const C = window.AudioContext || window.webkitAudioContext;
  if(!C) return null;
  actx = new C();
  return actx;
}
function resumeAudio(){ const a = ac(); if(a && a.state === "suspended") a.resume(); }

function tone(freq, start, dur, type, gain, freqTo){
  const a = ac(); if(!a) return;
  const t0 = a.currentTime + start;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type || "sine";
  o.frequency.setValueAtTime(freq, t0);
  if(freqTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain == null ? 0.18 : gain, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(a.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
function noise(start, dur, filterType, freq, gain, sweepTo){
  const a = ac(); if(!a) return;
  const t0 = a.currentTime + start;
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for(let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource(); src.buffer = buf;
  const f = a.createBiquadFilter(); f.type = filterType || "bandpass";
  f.frequency.setValueAtTime(freq || 1200, t0);
  if(sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t0 + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(gain == null ? 0.25 : gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(a.destination);
  src.start(t0); src.stop(t0 + dur + 0.02);
}

const SFX = {
  applause: function(seconds){
    const total = seconds || 2.2;
    for(let t = 0; t < total; t += 0.018 + Math.random() * 0.02)
      noise(t, 0.05 + Math.random() * 0.05, "bandpass", 900 + Math.random() * 2600, 0.05 + Math.random() * 0.07);
  },
  fanfare: function(){
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.13, i === 3 ? 0.6 : 0.22, "triangle", 0.2));
    tone(1318.5, 0.55, 0.5, "sine", 0.12);
  },
  // firework: whistle up then a boom + crackle
  launch: function(at){
    const t = at || 0;
    tone(320, t, 0.55, "sine", 0.07, 1500);
  },
  boom: function(at){
    const t = at || 0;
    noise(t, 0.5, "lowpass", 900, 0.5, 90);
    tone(70, t, 0.35, "sine", 0.22, 40);
    for(let i = 0; i < 12; i++) noise(t + 0.12 + Math.random() * 0.5, 0.05, "highpass", 2500, 0.06);
  },
  pop: function(at){
    const t = at || 0;
    noise(t, 0.07, "bandpass", 500 + Math.random() * 900, 0.3);
    tone(160 + Math.random() * 120, t, 0.09, "sine", 0.12);
  },
  // party horn / kazoo for the confetti show
  partyHorn: function(at){
    const t = at || 0;
    tone(300, t, 0.45, "sawtooth", 0.13, 760);
    tone(452, t + 0.02, 0.42, "square", 0.05, 900);
  },
  // magical shimmer for the stars show
  sparkle: function(at){
    const t = at || 0;
    [1568, 1976, 2349, 2637, 3136].forEach((f, i) => tone(f, t + i * 0.07, 0.5, "sine", 0.075));
  },
  chime: function(at){
    const t = at || 0;
    [784, 988, 1319].forEach((f, i) => tone(f, t + i * 0.11, 0.5, "sine", 0.15));
  },
  // bubbles: little watery blips
  blip: function(at){
    const t = at || 0;
    tone(420 + Math.random() * 500, t, 0.16, "sine", 0.09, 1100 + Math.random() * 700);
  },
  // warm rising pad for the gentle show
  warmRise: function(){
    const a = ac(); if(!a) return;
    [261.63, 329.63, 392].forEach((f, i) => tone(f, i * 0.18, 1.5, "sine", 0.09, f * 1.5));
  }
};

/* ================= canvas ================= */
const PALETTE = ["#2563eb","#16a34a","#f59e0b","#dc2626","#a855f7","#06b6d4","#ec4899","#facc15"];
let cv = null, ctx = null, parts = [], raf = 0, running = false, bg = null, bgAge = 0;

function ensureCanvas(){
  if(cv) return;
  cv = document.createElement("canvas");
  cv.style.cssText = "position:fixed; inset:0; width:100%; height:100%; pointer-events:none; z-index:80;";
  document.body.appendChild(cv);
  ctx = cv.getContext("2d");
  sizeCanvas();
  window.addEventListener("resize", sizeCanvas);
}
function sizeCanvas(){
  if(!cv) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.floor(innerWidth * dpr);
  cv.height = Math.floor(innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

/* ---------- particle factories ---------- */
function addRocket(delay){
  parts.push({
    kind: "rocket", delay: delay || 0,
    x: rnd(innerWidth * 0.15, innerWidth * 0.85), y: innerHeight + 10,
    targetY: rnd(innerHeight * 0.12, innerHeight * 0.45),
    vy: -rnd(7, 10), color: pick(PALETTE), life: 6, launched: false
  });
}
function explode(x, y, color, n, speed){
  for(let i = 0; i < (n || 46); i++){
    const ang = rnd(0, Math.PI * 2), sp = rnd(1, speed || 5.5);
    parts.push({
      kind: "spark", x: x, y: y,
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      r: rnd(1.6, 3.4), color: color, life: rnd(0.8, 1.6), trail: true
    });
  }
}
function addConfetti(n){
  for(let i = 0; i < n; i++){
    const streamer = Math.random() < 0.3;
    parts.push({
      kind: "confetti", x: rnd(0, innerWidth), y: rnd(-240, innerHeight * 0.2),
      vx: rnd(-1.1, 1.1), vy: rnd(2.2, 5),
      w: streamer ? rnd(3, 5) : rnd(7, 12), h: streamer ? rnd(20, 34) : rnd(9, 15),
      rot: rnd(0, Math.PI * 2), vr: rnd(-0.2, 0.2), wobble: rnd(0, 6.3),
      color: pick(PALETTE), life: rnd(2.6, 4.6)
    });
  }
}
function addBalloons(n, popAfter){
  for(let i = 0; i < n; i++){
    parts.push({
      kind: "balloon", x: rnd(40, Math.max(60, innerWidth - 40)),
      y: innerHeight - rnd(0, innerHeight * 0.3),
      vy: -rnd(1.2, 2.4), sway: rnd(0, 6.3), swaySpeed: rnd(0.01, 0.03),
      r: rnd(20, 34), color: pick(PALETTE),
      popAt: popAfter ? rnd(1.2, 3.4) : 0, age: 0, life: 12
    });
  }
}
function addStars(n){
  for(let i = 0; i < n; i++){
    parts.push({
      kind: "star", x: rnd(20, innerWidth - 20), y: rnd(innerHeight * 0.1, innerHeight * 0.85),
      r: 0, rMax: rnd(10, 26), twinkle: rnd(0, 6.3), spin: rnd(-0.04, 0.04), rot: rnd(0, 6.3),
      born: rnd(0, 1.2), age: 0, life: rnd(2.2, 3.6),
      color: pick(["#facc15","#fde68a","#fff7cc","#fbbf24"])
    });
  }
}
function addBubbles(n){
  for(let i = 0; i < n; i++){
    parts.push({
      kind: "bubble", x: rnd(20, innerWidth - 20), y: innerHeight + rnd(0, 200),
      vy: -rnd(0.8, 2.2), sway: rnd(0, 6.3), swaySpeed: rnd(0.02, 0.05),
      r: rnd(8, 30), life: rnd(4, 7), hue: rnd(180, 260)
    });
  }
}
function addPetals(n){ // gentle drifting petals for the calm show
  for(let i = 0; i < n; i++){
    parts.push({
      kind: "petal", x: rnd(0, innerWidth), y: rnd(-200, innerHeight * 0.3),
      vy: rnd(0.5, 1.2), sway: rnd(0, 6.3), swaySpeed: rnd(0.012, 0.028),
      r: rnd(7, 13), rot: rnd(0, 6.3), vr: rnd(-0.03, 0.03),
      color: pick(["#fbcfe8","#fecdd3","#fde68a","#bbf7d0","#c7d2fe"]), life: rnd(4, 7)
    });
  }
}

/* ---------- drawing helpers ---------- */
function drawStar(x, y, r, color, alpha, rot){
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color;
  ctx.translate(x, y); ctx.rotate(rot || 0);
  ctx.beginPath();
  for(let i = 0; i < 10; i++){
    const rr = i % 2 ? r * 0.45 : r;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    ctx[i ? "lineTo" : "moveTo"](Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

/* ---------- main loop ---------- */
function loop(){
  if(!running) return;
  const dt = 1 / 60;
  ctx.clearRect(0, 0, innerWidth, innerHeight);

  // optional background wash (sunrise show)
  if(bg){
    bgAge += dt;
    const a = Math.min(1, bgAge / 0.8) * Math.max(0, 1 - Math.max(0, bgAge - 3.2) / 1.4);
    if(a <= 0) bg = null;
    else {
      const g = ctx.createLinearGradient(0, innerHeight, 0, 0);
      g.addColorStop(0, "rgba(251,191,36," + (0.30 * a) + ")");
      g.addColorStop(0.5, "rgba(251,146,60," + (0.16 * a) + ")");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, innerWidth, innerHeight);
      const sy = innerHeight * (1.05 - Math.min(0.45, bgAge * 0.14));
      const rg = ctx.createRadialGradient(innerWidth / 2, sy, 0, innerWidth / 2, sy, 190);
      rg.addColorStop(0, "rgba(253,224,71," + (0.55 * a) + ")");
      rg.addColorStop(1, "rgba(253,224,71,0)");
      ctx.fillStyle = rg; ctx.fillRect(0, sy - 220, innerWidth, 440);
    }
  }

  for(let i = parts.length - 1; i >= 0; i--){
    const p = parts[i];
    if(p.delay > 0){ p.delay -= dt; continue; }
    p.life -= dt;

    if(p.kind === "rocket"){
      if(!p.launched){ p.launched = true; SFX.launch(0); }
      p.y += p.vy; p.vy += 0.12;
      ctx.save();
      ctx.globalAlpha = 0.9; ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, 6.3); ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.fillRect(p.x - 1.2, p.y, 2.4, 16);
      ctx.restore();
      if(p.vy >= -1 || p.y <= p.targetY){
        explode(p.x, p.y, p.color, 50, 5.5);
        if(Math.random() < 0.5) explode(p.x, p.y, pick(PALETTE), 22, 3);
        SFX.boom(0);
        parts.splice(i, 1);
      }
    } else if(p.kind === "spark"){
      p.x += p.vx; p.y += p.vy; p.vy += 0.06; p.vx *= 0.99; p.vy *= 0.99;
      const a = Math.max(0, Math.min(1, p.life));
      ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = p.color;
      if(p.trail){ ctx.globalAlpha = a * 0.35; ctx.fillRect(p.x - p.vx * 2.2, p.y - p.vy * 2.2, p.r, p.r); ctx.globalAlpha = a; }
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.3); ctx.fill();
      ctx.restore();
      if(p.life <= 0) parts.splice(i, 1);
    } else if(p.kind === "confetti"){
      p.wobble += 0.1;
      p.x += p.vx + Math.sin(p.wobble) * 0.9; p.y += p.vy; p.vy += 0.015; p.rot += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.color; ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
      if(p.y > innerHeight + 50 || p.life <= 0) parts.splice(i, 1);
    } else if(p.kind === "balloon"){
      p.age += dt; p.sway += p.swaySpeed;
      p.y += p.vy; p.x += Math.sin(p.sway) * 0.8;
      if(p.popAt && p.age > p.popAt){
        explode(p.x, p.y, p.color, 16, 3.5); SFX.pop(0);
        parts.splice(i, 1); continue;
      }
      ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r, p.r * 1.2, Math.sin(p.sway) * 0.12, 0, 6.3);
      ctx.fillStyle = p.color; ctx.fill();
      ctx.beginPath(); ctx.ellipse(p.x - p.r * 0.32, p.y - p.r * 0.42, p.r * 0.22, p.r * 0.3, -0.5, 0, 6.3);
      ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.fill();
      ctx.beginPath(); ctx.moveTo(p.x, p.y + p.r * 1.2);
      ctx.quadraticCurveTo(p.x + 9, p.y + p.r * 1.2 + 24, p.x + Math.sin(p.sway) * 6, p.y + p.r * 1.2 + 48);
      ctx.strokeStyle = "rgba(100,116,139,0.55)"; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.restore();
      if(p.y < -90 || p.life <= 0) parts.splice(i, 1);
    } else if(p.kind === "star"){
      p.age += dt;
      if(p.age < p.born) continue;
      p.twinkle += 0.11; p.rot += p.spin;
      const grow = Math.min(1, (p.age - p.born) / 0.35);
      p.r = p.rMax * grow * (0.86 + Math.sin(p.twinkle) * 0.14);
      const alpha = Math.max(0, Math.min(1, p.life)) * 0.95;
      ctx.save();
      ctx.shadowColor = p.color; ctx.shadowBlur = 18;
      drawStar(p.x, p.y, p.r, p.color, alpha, p.rot);
      ctx.restore();
      if(p.life <= 0) parts.splice(i, 1);
    } else if(p.kind === "bubble"){
      p.sway += p.swaySpeed;
      p.y += p.vy; p.x += Math.sin(p.sway) * 1.1;
      const a = Math.max(0, Math.min(1, p.life)) * 0.85;
      ctx.save(); ctx.globalAlpha = a;
      const g = ctx.createRadialGradient(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.1, p.x, p.y, p.r);
      g.addColorStop(0, "hsla(" + p.hue + ",90%,92%,0.85)");
      g.addColorStop(0.7, "hsla(" + p.hue + ",85%,72%,0.28)");
      g.addColorStop(1, "hsla(" + p.hue + ",85%,60%,0.10)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.3); ctx.fill();
      ctx.strokeStyle = "hsla(" + p.hue + ",90%,80%,0.55)"; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.18, 0, 6.3);
      ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.fill();
      ctx.restore();
      if(p.y < -60 || p.life <= 0){
        if(p.life <= 0 && p.y > 0 && Math.random() < 0.5) SFX.blip(0);
        parts.splice(i, 1);
      }
    } else if(p.kind === "petal"){
      p.sway += p.swaySpeed; p.rot += p.vr;
      p.y += p.vy; p.x += Math.sin(p.sway) * 1.3;
      ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, p.life)) * 0.9;
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, 6.3); ctx.fill();
      ctx.restore();
      if(p.y > innerHeight + 40 || p.life <= 0) parts.splice(i, 1);
    }
  }
  if(parts.length || bg) raf = requestAnimationFrame(loop);
  else stop();
}
function start(){
  ensureCanvas();
  if(!running){ running = true; raf = requestAnimationFrame(loop); }
}
function stop(){
  running = false;
  if(raf) cancelAnimationFrame(raf);
  raf = 0;
  if(ctx) ctx.clearRect(0, 0, innerWidth, innerHeight);
}
function stopCelebration(){
  parts = []; bg = null; bgAge = 0;
  stop();
  try{ if(actx){ actx.close(); actx = null; } }catch(e){}
}

/* ================= the six shows ================= */
const SHOWS = {
  // 100 — fireworks night
  fireworks: function(opt){
    if(opt.visual){
      for(let i = 0; i < 7; i++) addRocket(i * 0.45 + rnd(0, 0.2));
      setTimeout(() => { if(opt.visual) addStars(10); }, 1600);
    }
    if(opt.sound){ SFX.fanfare(); setTimeout(() => SFX.applause(3), 2400); }
  },
  // 90–99 — confetti storm + party horn
  confetti: function(opt){
    if(opt.visual){
      addConfetti(150);
      setTimeout(() => addConfetti(80), 700);
      setTimeout(() => addConfetti(60), 1500);
    }
    if(opt.sound){ SFX.partyHorn(0); SFX.partyHorn(0.5); setTimeout(() => SFX.applause(2), 900); }
  },
  // 80–89 — balloon party (rise and pop)
  balloons: function(opt){
    if(opt.visual){
      addBalloons(14, true);
      setTimeout(() => addBalloons(6, true), 900);
    }
    if(opt.sound){ SFX.chime(0); setTimeout(() => SFX.applause(1.4), 1500); }
  },
  // 70–79 — sparkling stars
  stars: function(opt){
    if(opt.visual){ addStars(26); setTimeout(() => addStars(14), 800); }
    if(opt.sound){ SFX.sparkle(0); SFX.sparkle(0.9); }
  },
  // 60–69 — floating bubbles
  bubbles: function(opt){
    if(opt.visual){ addBubbles(34); setTimeout(() => addBubbles(18), 900); }
    if(opt.sound){ for(let i = 0; i < 9; i++) SFX.blip(i * 0.17 + Math.random() * 0.1); }
  },
  // below 60 — calm sunrise with drifting petals
  sunrise: function(opt){
    if(opt.visual){ bg = true; bgAge = 0; addPetals(26); }
    if(opt.sound) SFX.warmRise();
  }
};

function showForScore(score){
  if(score >= 100) return "fireworks";
  if(score >= 90) return "confetti";
  if(score >= 80) return "balloons";
  if(score >= 70) return "stars";
  if(score >= 60) return "bubbles";
  return "sunrise";
}

function celebrateShow(name, opts){
  const o = opts || {};
  const opt = { sound: o.sound !== false, visual: o.visual !== false };
  const fn = SHOWS[name] || SHOWS.confetti;
  if(opt.sound) resumeAudio();
  if(opt.visual) start();
  fn(opt);
}
function celebrate(score, opts){ celebrateShow(showForScore(score), opts); }

window.celebrate = celebrate;
window.celebrateShow = celebrateShow;
window.stopCelebration = stopCelebration;
window.CELEBRATE_SFX = SFX;
window.CELEBRATE_SHOWS = Object.keys(SHOWS);
window.celebrateResumeAudio = resumeAudio;
})();
