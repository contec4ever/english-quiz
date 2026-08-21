// Celebration effects: canvas confetti + balloons, and synthesized sound effects (no external assets).
// Public API: celebrate(score) — picks the right show for the score band.

(function(){
"use strict";

/* ---------------- sound: synthesized with WebAudio ---------------- */
let actx = null;
function ac(){
  if(actx) return actx;
  const C = window.AudioContext || window.webkitAudioContext;
  if(!C) return null;
  actx = new C();
  return actx;
}
function resumeAudio(){ const a = ac(); if(a && a.state === "suspended") a.resume(); }

// short tone
function tone(freq, start, dur, type, gain){
  const a = ac(); if(!a) return;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type || "sine";
  o.frequency.setValueAtTime(freq, a.currentTime + start);
  g.gain.setValueAtTime(0, a.currentTime + start);
  g.gain.linearRampToValueAtTime(gain == null ? 0.18 : gain, a.currentTime + start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  o.connect(g); g.connect(a.destination);
  o.start(a.currentTime + start); o.stop(a.currentTime + start + dur + 0.02);
}
// noise burst through a filter — used for applause and pops
function noise(start, dur, filterType, freq, gain){
  const a = ac(); if(!a) return;
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for(let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource(); src.buffer = buf;
  const f = a.createBiquadFilter(); f.type = filterType || "bandpass"; f.frequency.value = freq || 1200;
  const g = a.createGain();
  g.gain.setValueAtTime(gain == null ? 0.25 : gain, a.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  src.connect(f); f.connect(g); g.connect(a.destination);
  src.start(a.currentTime + start); src.stop(a.currentTime + start + dur + 0.02);
}

const SFX = {
  applause: function(seconds){
    const total = seconds || 2.2;
    // a dense stream of tiny claps = applause
    for(let t = 0; t < total; t += 0.018 + Math.random() * 0.02){
      noise(t, 0.05 + Math.random() * 0.05, "bandpass", 900 + Math.random() * 2600, 0.05 + Math.random() * 0.07);
    }
  },
  fanfare: function(){
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C E G C
    notes.forEach((f, i) => tone(f, i * 0.13, i === 3 ? 0.6 : 0.22, "triangle", 0.2));
    tone(1318.5, 0.55, 0.5, "sine", 0.12);
  },
  pop: function(at){
    const t = at || 0;
    noise(t, 0.07, "bandpass", 500 + Math.random() * 900, 0.3);
    tone(160 + Math.random() * 120, t, 0.09, "sine", 0.12);
  },
  chime: function(){
    [784, 988, 1319].forEach((f, i) => tone(f, i * 0.11, 0.5, "sine", 0.15));
  },
  cheerUp: function(){ // gentle rising "you can do it"
    const a = ac(); if(!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(392, a.currentTime);
    o.frequency.linearRampToValueAtTime(587.33, a.currentTime + 0.45);
    g.gain.setValueAtTime(0.0001, a.currentTime);
    g.gain.linearRampToValueAtTime(0.14, a.currentTime + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.6);
    o.connect(g); g.connect(a.destination);
    o.start(); o.stop(a.currentTime + 0.65);
  }
};

/* ---------------- visuals: one full-screen canvas ---------------- */
const COLORS = ["#2563eb","#16a34a","#f59e0b","#dc2626","#a855f7","#06b6d4","#ec4899","#facc15"];
let cv = null, ctx = null, parts = [], raf = 0, running = false;

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
function rnd(a, b){ return a + Math.random() * (b - a); }

function addConfetti(n){
  for(let i = 0; i < n; i++){
    parts.push({
      kind: "confetti",
      // spread across the top third and just above it, so the burst is visible immediately
      x: rnd(0, innerWidth), y: rnd(-260, innerHeight * 0.25),
      vx: rnd(-0.8, 0.8), vy: rnd(2.2, 5),
      w: rnd(6, 11), h: rnd(9, 16),
      rot: rnd(0, Math.PI * 2), vr: rnd(-0.16, 0.16),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      life: rnd(2.6, 4.6)
    });
  }
}
function addBalloons(n, popAfter){
  for(let i = 0; i < n; i++){
    parts.push({
      kind: "balloon",
      x: rnd(40, Math.max(60, innerWidth - 40)), y: innerHeight - rnd(0, innerHeight * 0.35),
      vy: -rnd(1.2, 2.4), sway: rnd(0, Math.PI * 2), swaySpeed: rnd(0.01, 0.03),
      r: rnd(19, 30),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      popAt: popAfter ? rnd(1.4, 3.6) : 0, age: 0, popped: 0, life: 12
    });
  }
}
function addBurst(x, y, color){
  for(let i = 0; i < 14; i++){
    const ang = rnd(0, Math.PI * 2), sp = rnd(1.5, 4.5);
    parts.push({
      kind: "spark", x: x, y: y,
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      r: rnd(2, 4.5), color: color, life: rnd(0.5, 0.9)
    });
  }
}
function addStars(n){
  for(let i = 0; i < n; i++){
    parts.push({
      kind: "star", x: rnd(0, innerWidth), y: rnd(0, innerHeight * 0.7),
      r: rnd(6, 14), twinkle: rnd(0, Math.PI * 2), life: rnd(1.4, 2.6),
      color: ["#facc15","#fde68a","#fff"][Math.floor(Math.random() * 3)]
    });
  }
}

function drawStar(x, y, r, color, alpha){
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color;
  ctx.beginPath();
  for(let i = 0; i < 10; i++){
    const rr = i % 2 ? r * 0.45 : r;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    ctx[i ? "lineTo" : "moveTo"](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill(); ctx.restore();
}

function loop(){
  if(!running) return;
  const dt = 1 / 60;
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  for(let i = parts.length - 1; i >= 0; i--){
    const p = parts[i];
    p.life -= dt;
    if(p.kind === "confetti"){
      p.x += p.vx; p.y += p.vy; p.vy += 0.02; p.rot += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.color; ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
      if(p.y > innerHeight + 40 || p.life <= 0) parts.splice(i, 1);
    } else if(p.kind === "balloon"){
      p.age += dt; p.sway += p.swaySpeed;
      p.y += p.vy; p.x += Math.sin(p.sway) * 0.7;
      if(p.popAt && p.age > p.popAt){
        addBurst(p.x, p.y, p.color); SFX.pop(0);
        parts.splice(i, 1); continue;
      }
      ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r, p.r * 1.2, 0, 0, Math.PI * 2);
      ctx.fillStyle = p.color; ctx.fill();
      ctx.beginPath(); ctx.ellipse(p.x - p.r * 0.32, p.y - p.r * 0.42, p.r * 0.22, p.r * 0.3, -0.5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.fill();
      ctx.beginPath(); ctx.moveTo(p.x, p.y + p.r * 1.2);
      ctx.quadraticCurveTo(p.x + 8, p.y + p.r * 1.2 + 22, p.x, p.y + p.r * 1.2 + 44);
      ctx.strokeStyle = "rgba(100,116,139,0.6)"; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.restore();
      if(p.y < -90 || p.life <= 0) parts.splice(i, 1);
    } else if(p.kind === "spark"){
      p.x += p.vx; p.y += p.vy; p.vy += 0.08;
      ctx.save(); ctx.globalAlpha = Math.max(0, p.life * 1.4);
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if(p.life <= 0) parts.splice(i, 1);
    } else if(p.kind === "star"){
      p.twinkle += 0.12;
      drawStar(p.x, p.y, p.r * (0.85 + Math.sin(p.twinkle) * 0.15), p.color, Math.max(0, Math.min(1, p.life)) * 0.9);
      if(p.life <= 0) parts.splice(i, 1);
    }
  }
  if(parts.length) raf = requestAnimationFrame(loop);
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
  parts = [];
  stop();
  try{ if(actx) { actx.close(); actx = null; } }catch(e){}
}

/* ---------------- shows by score band ---------------- */
function celebrate(score, opts){
  const o = opts || {};
  const sound = o.sound !== false, visual = o.visual !== false;
  if(sound) resumeAudio();
  if(visual) start();

  if(score >= 100){
    if(visual){ addConfetti(160); addBalloons(12, true); addStars(14); setTimeout(() => { addConfetti(90); }, 900); }
    if(sound){ SFX.fanfare(); setTimeout(() => SFX.applause(3), 550); }
  } else if(score >= 90){
    if(visual){ addConfetti(110); addBalloons(8, true); addStars(8); }
    if(sound){ SFX.fanfare(); setTimeout(() => SFX.applause(2), 500); }
  } else if(score >= 80){
    if(visual){ addConfetti(80); addBalloons(6, false); }
    if(sound){ SFX.chime(); setTimeout(() => SFX.applause(1.6), 350); }
  } else if(score >= 70){
    if(visual){ addConfetti(50); addBalloons(4, false); }
    if(sound) SFX.chime();
  } else if(score >= 60){
    if(visual) addBalloons(4, false);
    if(sound) SFX.chime();
  } else {
    if(visual) addBalloons(3, false);
    if(sound) SFX.cheerUp();
  }
}

window.celebrate = celebrate;
window.stopCelebration = stopCelebration;
window.CELEBRATE_SFX = SFX;
window.celebrateResumeAudio = resumeAudio;
})();
