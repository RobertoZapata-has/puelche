/* Puelche — Enjambre sobre Mendoza. Shooter vertical estilo 1942. */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const app = $('app'), cv = $('cv'), ctx = cv.getContext('2d');
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const TAU = Math.PI * 2;

/* ---------- Layout ---------- */
let W = 360, H = 640, SCALE = 1, DPR = 1, OFFY = 0;
function layout() {
  const vw = innerWidth, vh = innerHeight;
  let cw = vw < 640 ? vw : Math.min(vw, Math.round(vh * 0.6));
  app.style.width = cw + 'px';
  H = Math.round(clamp(360 * vh / cw, 560, 860));
  const ch = Math.min(vh, cw * H / 360);
  cw = Math.min(cw, ch * 360 / H);
  SCALE = cw / 360;
  OFFY = (vh - ch) / 2;
  cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
  cv.style.left = ((parseFloat(app.style.width) - cw) / 2) + 'px'; cv.style.top = OFFY + 'px';
  DPR = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(cw * DPR); cv.height = Math.round(ch * DPR);
}
addEventListener('resize', () => { layout(); });
layout();

/* ---------- Save ---------- */
const SAVE_KEY = 'puelche-save-v1';
let S = { unlocked: 1, coins: 0, up: {}, best: [0, 0, 0, 0, 0], seen: {}, beaten: false, mute: false };
try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (s) S = Object.assign(S, s); } catch (e) {}
const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {} };

/* ---------- Audio (sintetizado) ---------- */
let AC = null, master = null;
function audioOn() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = 0.45; master.connect(AC.destination); } catch (e) { AC = null; } }
  if (AC && AC.state === 'suspended') AC.resume().catch(() => {});
  if (AC && M.want && (!M.th || M.th !== THEMES[M.want])) playMusic(M.want);
}
function tone(f, dur, type = 'square', vol = 0.08, slide = 0, delay = 0) {
  if (!AC || S.mute) return;
  const t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.linearRampToValueAtTime(Math.max(30, f + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
let noiseBuf = null;
function noise(dur, vol, freq = 1000, delay = 0) {
  if (!AC || S.mute) return;
  if (!noiseBuf) { noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const t = AC.currentTime + delay, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = noiseBuf; s.loop = true; f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(80, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05);
}
let shotTick = 0;
const SFX = {
  shoot() { if ((shotTick++ & 1) === 0) tone(1100, 0.045, 'square', 0.018, -500); },
  hit() { tone(180, 0.05, 'square', 0.03, -60); },
  boom() { noise(0.35, 0.22, 1400); tone(110, 0.25, 'triangle', 0.12, -60); },
  big() { noise(1.1, 0.4, 900); tone(70, 0.9, 'sawtooth', 0.14, -40); },
  coin() { tone(1320, 0.05, 'square', 0.04); tone(1760, 0.08, 'square', 0.04, 0, 0.05); },
  pw() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.09, 'square', 0.05, 0, i * 0.06)); },
  loop() { tone(260, 0.45, 'sawtooth', 0.05, 700); },
  bomb() { noise(1.3, 0.5, 600); tone(55, 1.2, 'sawtooth', 0.18, -20); },
  alarm() { for (let i = 0; i < 3; i++) { tone(660, 0.18, 'square', 0.06, 0, i * 0.4); tone(440, 0.18, 'square', 0.06, 0, i * 0.4 + 0.2); } },
  die() { noise(0.9, 0.35, 700); tone(400, 0.8, 'sawtooth', 0.1, -350); },
  shield() { tone(500, 0.15, 'triangle', 0.08, -300); },
  win() { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(f, 0.14, 'square', 0.05, 0, i * 0.11)); },
};

for (const k of Object.keys(SFX)) { if (k === 'shoot' || k === 'hit') continue; const f = SFX[k]; SFX[k] = (...a) => { f(...a); if (typeof NET !== 'undefined' && NET.role === 'h' && G && G.coop && !G.remote) NET.ev.push(['s', k]); }; }
/* ---------- Música (chiptune sintetizado) ---------- */
function seeded(s) { return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const PENTA = { min: [0, 3, 5, 7, 10, 12, 15, 17], maj: [0, 2, 4, 7, 9, 12, 14, 16] };
function theme(o) {
  const r = seeded(o.seed), sc = PENTA[o.minor ? 'min' : 'maj'], mel = [];
  let last = 2;
  for (let i = 0; i < 64; i++) {
    if (i % 2 || r() > o.dens) { mel.push(null); continue; }
    last = clamp(last + Math.round((r() - 0.5) * 4), 0, sc.length - 1); mel.push(sc[last]);
  }
  for (let i = 32; i < 48; i++) mel[i] = mel[i - 32]; // repite la frase: más pegadiza
  return Object.assign({ mel }, o);
}
const THEMES = {
  menu: theme({ seed: 7, bpm: 104, root: 57, prog: [0, -4, 3, -2], minor: 1, dens: 0.55, bass: 'x...x...x...x.o.', kick: 'x.......x.......', snare: '........', hat: 0 }),
  l0: theme({ seed: 11, bpm: 132, root: 50, prog: [0, -2, -4, -5], minor: 1, dens: 0.7, bass: 'x..x..x.x..x.o.o', kick: 'x...x...x...x...', snare: '....x.......x...', hat: 1 }),
  l1: theme({ seed: 23, bpm: 138, root: 52, prog: [0, 3, -2, 5], minor: 0, dens: 0.75, bass: 'x.ox.ox.x.ox.oxo', kick: 'x...x...x...x...', snare: '....x.......x..x', hat: 1 }),
  l2: theme({ seed: 31, bpm: 126, root: 48, prog: [0, -4, -2, 0], minor: 1, dens: 0.6, bass: 'x...x.x.x...x.xo', kick: 'x.....x.x.......', snare: '....x.......x...', hat: 1 }),
  l3: theme({ seed: 47, bpm: 142, root: 45, prog: [0, 1, -2, 0], minor: 1, dens: 0.7, bass: 'xx.xx.x.xx.xx.xo', kick: 'x...x...x...x...', snare: '....x.......x.x.', hat: 1 }),
  l4: theme({ seed: 59, bpm: 148, root: 47, prog: [0, -4, -5, -2], minor: 1, dens: 0.8, bass: 'x.xox.xox.xox.xo', kick: 'x...x...x...x.x.', snare: '....x.......x...', hat: 1 }),
  boss: theme({ seed: 83, bpm: 162, root: 45, prog: [0, 1, 0, -1], minor: 1, dens: 0.85, bass: 'xoxoxoxoxoxoxoxo', kick: 'x.x.x.x.x.x.x.x.', snare: '....x.......x...', hat: 1 }),
  historia: theme({ seed: 101, bpm: 84, root: 50, prog: [0, -4, -2, -5], minor: 1, dens: 0.45, bass: 'x.......x...x...', kick: '................', snare: '................', hat: 0 }),
  final: theme({ seed: 17, bpm: 112, root: 55, prog: [0, 5, 7, 5], minor: 0, dens: 0.7, bass: 'x...x.o.x...x.o.', kick: 'x.......x.......', snare: '....x.......x...', hat: 1 }),
  l5: theme({ seed: 61, bpm: 120, root: 46, prog: [0, 1, -2, -4], minor: 1, dens: 0.6, bass: 'x..x..x...x..x.o', kick: 'x.....x...x.....', snare: '....x.......x...', hat: 1 }),
  l6: theme({ seed: 71, bpm: 150, root: 53, prog: [0, -2, -4, -2], minor: 0, dens: 0.7, bass: 'x.o.x.o.x.o.x.o.', kick: 'x...x...x...x...', snare: '....x.......x...', hat: 1 }),
  l7: theme({ seed: 91, bpm: 168, root: 57, prog: [0, 5, 3, -2], minor: 0, dens: 0.9, bass: 'xoxoxoxoxoxoxoxo', kick: 'x...x...x...x...', snare: '....x.......x...', hat: 1 }),
  l8: theme({ seed: 13, bpm: 140, root: 55, prog: [0, 5, -3, 7], minor: 0, dens: 0.75, bass: 'x..x..x.x..x..x.', kick: 'x...x...x...x...', snare: '....x.......x...', hat: 1 }),
  over: theme({ seed: 5, bpm: 76, root: 45, prog: [0, -4, -5, -7], minor: 1, dens: 0.4, bass: 'x.......x.......', kick: '................', snare: '................', hat: 0 }),
};
const M = { th: null, want: null, step: 0, t: 0, iv: null, g: null, hold: false };
const mf = n => 440 * Math.pow(2, (n - 69) / 12);
function mv(f, t, dur, type, vol) {
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(M.g); o.start(t); o.stop(t + dur + 0.02);
}
function mnoise(t, dur, vol, hp) {
  if (!noiseBuf) { noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = hp; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(M.g); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}
function kick(t) { const o = AC.createOscillator(), g = AC.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16); o.connect(g); g.connect(M.g); o.start(t); o.stop(t + 0.18); }
function playStep(th, step, t, sp) {
  const bar = Math.floor(step / 16) % th.prog.length, s = step % 16, cr = th.root + th.prog[bar];
  const b = th.bass[s]; if (b === 'x') mv(mf(cr - 12), t, sp * 1.7, 'triangle', 0.32); else if (b === 'o') mv(mf(cr), t, sp * 1.2, 'triangle', 0.24);
  if (s % 2 === 0) { const ch = th.minor ? [0, 3, 7, 12] : [0, 4, 7, 12]; mv(mf(cr + 12 + ch[(s / 2) % 4]), t, sp * 0.8, 'square', 0.035); }
  const m = th.mel[step % 64]; if (m != null) mv(mf(cr + 24 + m), t, sp * 1.9, 'square', 0.055);
  if (th.kick[s] === 'x') kick(t);
  if (th.snare[s] === 'x') mnoise(t, 0.12, 0.22, 1200);
  if (th.hat && s % 2 === 1) mnoise(t, 0.03, 0.06, 7000);
}
function musicTick() {
  if (!M.th || !AC) return;
  const sp = 60 / M.th.bpm / 4;
  if (M.t < AC.currentTime - 0.2) M.t = AC.currentTime + 0.05;
  while (M.t < AC.currentTime + 0.15) { if (!S.mute && !M.hold) playStep(M.th, M.step, M.t, sp); M.step++; M.t += sp; }
}
function playMusic(name) {
  M.want = name; if (!AC) return;
  if (!M.g) { M.g = AC.createGain(); M.g.gain.value = 0.5; M.g.connect(master); }
  if (!M.iv) M.iv = setInterval(musicTick, 25);
  if (M.th === THEMES[name]) return;
  M.th = THEMES[name]; M.step = 0; M.t = AC.currentTime + 0.1;
}
function stopMusic() { M.th = null; M.want = null; }

/* ---------- Assets ---------- */
const IMG = {};
const SPRITES = ['nave', 'bicho-avispa', 'bicho-escarabajo', 'bicho-langosta', 'bicho-libelula', 'bicho-mosquito', 'bicho-oruga', 'bicho-polilla',
  'jefe-1-madre-polilla', 'jefe-2-gran-langosta', 'jefe-3-libelula', 'jefe-4-escarabajo', 'jefe-5-reina',
  'cara-chispa', 'cara-tito', 'cara-bichi', 'cara-ozan', 'cara-reina', 'pw-doble', 'pw-escudo', 'pw-misil', 'pw-vida', 'pw-bomba',
  'fondo-1-vinedos', 'fondo-2-ciudad', 'fondo-3-potrerillos', 'fondo-4-caracoles', 'fondo-5-glaciar',
  'jefe-zonda', 'tren', 'uva', 'uva-dorada', 'fondo-zonda', 'fondo-trasandino', 'fondo-vendimia'];
const url = n => 'a/' + n + '.webp';
function loadImg(n) {
  return new Promise(res => { const i = new Image(); i.onload = () => { IMG[n] = i; res(i); }; i.onerror = () => res(null); i.src = url(n); });
}
const preloaded = new Set();
function preload(list) { list.forEach(n => { if (preloaded.has(n)) return; preloaded.add(n); const i = new Image(); i.src = url(n); }); }

/* prescaled sprite with white-flash and shadow copies */
const PRE = {};
function prep(name, w) {
  const img = IMG[name]; if (!img) return null;
  const pw = Math.round(Math.min(img.width, w * 2.4)), ph = Math.round(pw * img.height / img.width);
  const mk = () => { const c = document.createElement('canvas'); c.width = pw; c.height = ph; return c; };
  const c = mk(), x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, pw, ph);
  const wc = mk(), wx = wc.getContext('2d'); wx.drawImage(c, 0, 0); wx.globalCompositeOperation = 'source-in'; wx.fillStyle = '#fff'; wx.fillRect(0, 0, pw, ph);
  const sc = mk(), sx = sc.getContext('2d'); sx.drawImage(c, 0, 0); sx.globalCompositeOperation = 'source-in'; sx.fillStyle = '#12051f'; sx.fillRect(0, 0, pw, ph);
  return PRE[name] = { c, white: wc, shadow: sc, w, h: w * ph / pw };
}
let BUL = {};
function makeBullets() {
  const mk = (w, h, f) => { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d'), w, h); return c; };
  BUL.p = mk(14, 40, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#fff'); g.addColorStop(0.5, '#7ef3ff'); g.addColorStop(1, 'rgba(24,169,223,0)'); x.fillStyle = g; x.beginPath(); x.ellipse(w / 2, h / 2, w / 2 - 1, h / 2 - 1, 0, 0, TAU); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.ellipse(w / 2, h * 0.32, w * 0.18, h * 0.22, 0, 0, TAU); x.fill(); });
  BUL.m = mk(16, 30, (x, w, h) => { x.fillStyle = '#ffd21f'; x.beginPath(); x.moveTo(w / 2, 0); x.lineTo(w - 3, h * 0.45); x.lineTo(w - 3, h * 0.8); x.lineTo(3, h * 0.8); x.lineTo(3, h * 0.45); x.closePath(); x.fill(); x.strokeStyle = '#120a1f'; x.lineWidth = 2; x.stroke(); x.fillStyle = '#ff8a1f'; x.beginPath(); x.moveTo(4, h * 0.8); x.lineTo(w / 2, h); x.lineTo(w - 4, h * 0.8); x.fill(); });
  const orb = (c1, c2) => mk(28, 28, (x, w) => { const g = x.createRadialGradient(w / 2 - 3, w / 2 - 3, 1, w / 2, w / 2, w / 2 - 2); g.addColorStop(0, '#fff'); g.addColorStop(0.35, c1); g.addColorStop(1, c2); x.fillStyle = g; x.beginPath(); x.arc(w / 2, w / 2, w / 2 - 2, 0, TAU); x.fill(); x.lineWidth = 2.5; x.strokeStyle = '#120a1f'; x.stroke(); });
  BUL.e = orb('#ff5fd2', '#7a1fa8');
  BUL.o = orb('#ffb347', '#c2410c');
  BUL.r = mk(34, 34, (x, w) => { x.fillStyle = '#8a5a3c'; x.beginPath(); for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, r = w / 2 - 3 - (i % 2) * 3; x.lineTo(w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r); } x.closePath(); x.fill(); x.lineWidth = 2.5; x.strokeStyle = '#120a1f'; x.stroke(); x.fillStyle = '#ff8a1f'; x.beginPath(); x.arc(w / 2 + 3, w / 2 - 2, 4, 0, TAU); x.fill(); });
  BUL.ice = orb('#bfefff', '#3a6fd8');
}

/* ---------- Data ---------- */
const CHARS = {
  chispa: { name: 'CHISPA', face: 'cara-chispa' }, tito: { name: 'DON TITO', face: 'cara-tito' }, bichi: { name: 'BICHI', face: 'cara-bichi' },
  ozan: { name: 'DRA. OZÁN', face: 'cara-ozan' }, reina: { name: 'LA REINA', face: 'cara-reina', dark: true },
};
const ET = {
  polilla: { img: 'bicho-polilla', w: 58, hp: 2, sc: 100, move: 'sine', spd: 85, flap: 0.14, shoot: 3.0 },
  oruga: { img: 'bicho-oruga', w: 40, hp: 8, sc: 250, move: 'ground', spd: 0, shoot: 1.7, spread: 2, ground: 1 },
  langosta: { img: 'bicho-langosta', w: 58, hp: 3, sc: 150, move: 'swoop', spd: 175, flap: 0.12, shoot: 2.4 },
  mosquito: { img: 'bicho-mosquito', w: 54, hp: 1, sc: 80, move: 'dive', spd: 90, flap: 0.08 },
  libelula: { img: 'bicho-libelula', w: 68, hp: 4, sc: 180, move: 'zigzag', spd: 95, shoot: 1.6, flap: 0.1 },
  escarabajo: { img: 'bicho-escarabajo', w: 64, hp: 16, sc: 400, move: 'slow', spd: 42, shoot: 1.5, spread: 4, flap: 0.03, heavy: 1 },
  avispa: { img: 'bicho-avispa', w: 58, hp: 5, sc: 220, move: 'hover', spd: 170, shoot: 1.0, flap: 0.12 },
};
const LEVELS = [
  { name: 'Viñedos de Luján y Maipú', bg: 'fondo-1-vinedos', len: 70, mix: { polilla: 5, mosquito: 3, oruga: 2 }, tint: 'rgba(40,10,40,.12)' },
  { name: 'Mendoza 2189', bg: 'fondo-2-ciudad', len: 75, mix: { langosta: 5, polilla: 3, mosquito: 3, oruga: 1 }, tint: 'rgba(40,10,60,.18)' },
  { name: 'Dique Potrerillos', bg: 'fondo-3-potrerillos', len: 80, mix: { mosquito: 4, libelula: 4, langosta: 2 }, tint: 'rgba(30,10,60,.14)' },
  { name: 'Caracoles de Villavicencio', bg: 'fondo-4-caracoles', len: 85, mix: { escarabajo: 3, langosta: 3, libelula: 2, oruga: 2, mosquito: 2 }, tint: 'rgba(40,10,40,.14)' },
  { name: 'Glaciar del Aconcagua', bg: 'fondo-5-glaciar', len: 90, mix: { avispa: 5, libelula: 2, escarabajo: 2, mosquito: 2, langosta: 2 }, tint: 'rgba(20,10,60,.22)' },
  { name: 'Noche de Zonda', bg: 'fondo-zonda', len: 75, mix: { polilla: 4, langosta: 4, escarabajo: 2, mosquito: 2 }, tint: 'rgba(0,0,0,0)', sp: 'zonda', dl: 2, unlock: 3, icon: 'jefe-zonda' },
  { name: 'Escolta del Trasandino', bg: 'fondo-trasandino', len: 70, mix: { langosta: 4, mosquito: 4, libelula: 3, avispa: 2 }, tint: 'rgba(30,10,40,.1)', sp: 'tren', dl: 2, unlock: 4, noBoss: 1, icon: 'tren' },
  { name: 'Nivel fichín', bg: 'fondo-2-ciudad', len: 80, mix: { polilla: 2, langosta: 3, mosquito: 3, libelula: 2, escarabajo: 1, avispa: 2, oruga: 1 }, tint: 'rgba(0,0,0,0)', sp: 'fichin', dl: 3, unlock: 5, icon: 'nave' },
  { name: 'Vendimia bonus', bg: 'fondo-vendimia', len: 45, mix: {}, tint: 'rgba(0,0,0,0)', sp: 'vendimia', dl: 0, unlock: 2, noBoss: 1, icon: 'uva-dorada' },
];
const avail = i => i < 5 ? i < S.unlocked : S.unlocked >= LEVELS[i].unlock;
const levelIcon = i => LEVELS[i].icon || BOSSES[i].img;
const BOSSES = [
  { id: 'madre', img: 'jefe-1-madre-polilla', name: 'la Madre Polilla', w: 250, hp: 450, line: 'Es la Madre Polilla. Apuntale al cuerpo: las alas son puro polvo.' },
  { id: 'langosta', img: 'jefe-2-gran-langosta', name: 'la Gran Langosta', w: 220, hp: 600, line: 'La Gran Langosta embiste. Cuando titile, ¡correte para el costado!' },
  { id: 'libelula', img: 'jefe-3-libelula', name: 'la Libélula Acorazada', w: 240, hp: 760, line: 'La Libélula Acorazada es rapidísima. Seguila y no pares de disparar.' },
  { id: 'escarabajo', img: 'jefe-4-escarabajo', name: 'el Escarabajo Titán', w: 230, hp: 980, line: 'El Escarabajo Titán tiene grietas en el caparazón. ¡Ahí es donde duele!' },
  { id: 'reina', img: 'jefe-5-reina', name: 'La Reina', w: 262, hp: 1400, line: 'Es ella. Si cae La Reina, cae el enjambre. Suerte, Chispa.' },
  { id: 'zonda', img: 'jefe-zonda', name: 'el Torbellino', w: 240, hp: 900, spin: 1, line: 'Es un torbellino vivo. Te chupa para adentro: ¡no te le acerques!' },
  null,
  { id: 'langosta', img: 'jefe-2-gran-langosta', name: 'la Langosta de 8 bits', w: 220, hp: 800, line: '¡Bichi! ¿Qué tocaste? ¡Hasta la langosta quedó pixelada!' },
  null,
];
const PW_LINES = {
  doble: [['tito', 'Tomá, nena. En mi época esto lo hacíamos con alambre.'], ['tito', '¡Más caños! Cuidámela, que es la única que tengo.'], ['chispa', '¡Ahora sí que pica!']],
  escudo: [['chispa', '¡Ahora sí, vengan de a uno!'], ['tito', 'Burbuja de acero. Aguanta tres golpes, no te agrandes.']],
  misil: [['tito', 'Misiles caseros. No preguntes de dónde los saqué.'], ['chispa', '¡Búsquenlos, chiquitos!']],
  vida: [['bichi', '¡Una vida más! ¡Yupiii!'], ['bichi', '¡No te me mueras, eh!']],
  bomba: [['chispa', 'Esta me la guardo para algo grande.'], ['tito', 'Es la última megabomba que me quedaba. Usala bien.']],
};
const WARN_LINES = ['Eh… eh… ¡EH! ¡Arriba!', '¡Vienen un montón! ¡Muchos!', '¡Cuidado, Chispa! ¡Por arriba!'];
const HURT_LINES = [['reina', 'Tu cielo ya es mío, pequeña.'], ['tito', '¡Mi nave! ¡Veinte años la cuidé!'], ['bichi', '¡Aaay! ¿Estás bien?'], ['reina', 'Mi enjambre nunca se cansa.']];
const OVER_LINES = {
  reina: { face: 'cara-reina-burla', name: 'LA REINA', l: ['¿Eso es todo lo que tiene Mendoza?', 'Tu cielo ya es mío, pequeña.', 'Volvé cuando aprendas a volar.', 'Mi enjambre te manda saludos.', 'Qué rápido se apaga una chispa.'] },
  tito: { face: 'cara-tito-derrota', name: 'DON TITO', l: ['¡Levantate, nena, que la nave la arreglo yo!', 'Veinte años la cuidé… ¡veinte!', 'Así no se vuela. Otra vez, y bien.', 'Tranqui, que tengo repuestos. Creo.', 'En mi época no se caía nadie. Bueno, casi nadie.'] },
  bichi: { face: 'cara-bichi-derrota', name: 'BICHI', l: ['¡Buaaaaah! ¡Chispaaaa!', 'Yo te avisé… ¿te avisé?', '¡No me dejes solo con estos bichos!', 'Sniff… ¿jugamos otra?', '¡Dale que la próxima sale!'] },
  chispa: { face: 'cara-chispa-derrota', name: 'CHISPA', l: ['Esto no termina así.', 'Me agarraron distraída. Una más.', 'Ahora es personal.', '¡Dame la revancha!', 'Ya le encontré la vuelta. ¡Otra!'] },
};
const SHOP_LINES = ['Pasá, pasá. Con monedas en mano todo se arregla.', 'Todo esto lo soldé yo, ojo.', 'La Puelche es noble, pero hay que mimarla.', 'En mi época volábamos con menos. Pero bueno, comprá.'];
const UPS = [
  { id: 'canon', name: 'Cañones de Don Tito', d: 'Arrancás cada nivel con más disparos.', icon: 'pw-doble', cost: [120, 350] },
  { id: 'blindaje', name: 'Blindaje', d: 'Arrancás con escudo puesto (aguanta 3 golpes).', icon: 'pw-escudo', cost: [220] },
  { id: 'loop', name: 'Loops extra', d: '+1 loop de invencibilidad por nivel.', icon: 'nave', cost: [100, 280] },
  { id: 'misil', name: 'Misiles de arranque', d: '15 segundos de misiles al empezar.', icon: 'pw-misil', cost: [260] },
  { id: 'iman', name: 'Imán de monedas', d: 'Las monedas vienen solas hacia vos.', icon: 'pw-bomba', cost: [80, 220] },
  { id: 'vida', name: 'Vida extra', d: 'Empezás con una vida más.', icon: 'pw-vida', cost: [500] },
];
const upLv = id => S.up[id] | 0;

/* ---------- Historieta ---------- */
const COMICS = {
  prologo: { title: 'PRÓLOGO', panels: [
    { img: 'prologo-01', cap: 'Mendoza, año 2189. Hace años que no nieva en la cordillera.' },
    { img: 'prologo-02', cap: 'Con el calor, los glaciares se derritieron… y dejaron salir algo que llevaba miles de años congelado.', sfx: { t: 'CRAC…', x: 58, y: 12, r: -6 } },
    { img: 'prologo-03', cap: 'Esa noche, el enjambre bajó de la cordillera.', sfx: { t: 'BZZZZZ', x: 6, y: 68, r: -10 } },
    { img: 'prologo-04', cap: 'Al amanecer, los viñedos de Luján ya no eran viñedos.', bub: { who: 'VIÑATERO', t: '¡Rajemos, compadre!', left: 1 } },
    { img: 'prologo-05', cap: 'Laboratorio de la Dra. Nahir Ozán.', bub: { who: 'DRA. OZÁN', t: 'Son insectos prehistóricos… y el agua del deshielo los hace crecer.' } },
    { img: 'prologo-06', cap: 'Un hangar olvidado en El Plumerillo.', bub: { who: 'DON TITO', t: 'Veinte años esperándote, Puelche.', left: 1 }, sfx: { t: 'FSSSHH', x: 60, y: 8, r: 6 } },
    { img: 'prologo-07', bub: { who: 'CHISPA', t: '¿Así que esta es la nave que nadie se anima a volar?' } },
    { img: 'prologo-08', cap: 'Y un polizón.', bub: { who: 'BICHI', t: '¡No me pises! ¡Soy de los buenos!' }, sfx: { t: '¡¿EH?!', x: 4, y: 6, r: -8 } },
    { img: 'prologo-09', cap: 'Bajo el hielo del Aconcagua, alguien más despertó.', bub: { who: 'LA REINA', t: 'Que vengan. Mi enjambre tiene hambre.' } },
    { img: 'prologo-10', cap: 'Y la Puelche despegó.', bub: { who: 'DON TITO', t: '¡Traémela entera, nena!', left: 1 }, sfx: { t: '¡BRRROOOM!', x: 30, y: 6, r: -6 } },
  ] },
  entre1: { title: 'DESPUÉS DE LOS VIÑEDOS', panels: [
    { img: 'entre-1-01', cap: 'De vuelta en el hangar.', bub: { who: 'DON TITO', t: '¡Mirá cómo me la dejaste! Esto es baba de polilla.', left: 1 } },
    { img: 'entre-1-02', cap: 'Adentro de la Madre Polilla, la doctora encontró algo.', bub: { who: 'DRA. OZÁN', t: 'Este cristal vibra… y la señal viene de la cordillera.' }, sfx: { t: 'VRRRM', x: 60, y: 10, r: 8 } },
    { img: 'entre-1-03', cap: 'Mientras tanto, una manga de langostas avanzaba sobre la ciudad.', bub: { who: 'LA REINA', t: 'Es hora de visitar la ciudad.' } },
  ] },
  entre2: { title: 'DESPUÉS DE LA CIUDAD', panels: [
    { img: 'entre-2-01', cap: 'La ciudad festejó como nunca.', bub: { who: 'LA GENTE', t: '¡Puel-che! ¡Puel-che! ¡Puel-che!' } },
    { img: 'entre-2-02', cap: 'Bichi tenía algo importante que decir.', bub: { who: 'BICHI', t: '¡Toman agua del dique! ¡Así se ponen gigantes!', left: 1 } },
    { img: 'entre-2-03', cap: 'Esa noche, en Potrerillos…', sfx: { t: 'BZZZZZZ', x: 40, y: 8, r: -5 } },
  ] },
  entre3: { title: 'DESPUÉS DEL DIQUE', panels: [
    { img: 'entre-3-01', cap: 'La Puelche no salió entera de Potrerillos.', bub: { who: 'BICHI', t: '¡Arriba, Chispa! ¡Arriba!' }, sfx: { t: '¡PUM!', x: 64, y: 8, r: 8 } },
    { img: 'entre-3-02', cap: 'Don Tito llegó de noche, con la camioneta y una caja de herramientas.', bub: { who: 'DON TITO', t: 'Tomá. Me lo dieron cuando volaba los antigranizo. Nunca me falló.', left: 1 } },
    { img: 'entre-3-03', bub: { who: 'DRA. OZÁN', t: 'La señal sale del Aconcagua. Pero el único camino pasa por los Caracoles.', left: 1 } },
  ] },
  entre4: { title: 'HACIA EL ACONCAGUA', panels: [
    { img: 'entre-4-01', cap: 'Al amanecer, rumbo al techo de América.' },
    { img: 'entre-4-02', cap: 'La Reina intentó recuperar a Bichi.', bub: { who: 'CHISPA', t: '¡Bichi! ¡No la escuches! ¡Quedate conmigo!', left: 1 } },
    { img: 'entre-4-03', cap: 'Bichi eligió su lado.', bub: { who: 'BICHI', t: 'Yo soy de Mendoza. La colmena es por ahí.' } },
  ] },
  esp5: { title: 'NOCHE DE ZONDA', panels: [{ img: 'especial-zonda', cap: 'Bajó el Zonda. Con la tierra no se ve nada… y el enjambre aprovecha.', bub: { who: 'CHISPA', t: '¡Luces prendidas, Puelche! ¡Vamos a ciegas!', left: 1 }, sfx: { t: '¡FIUUUU!', x: 56, y: 8, r: 6 } }] },
  esp6: { title: 'ESCOLTA DEL TRASANDINO', panels: [{ img: 'especial-trasandino', cap: 'El Trasandino volvió a andar. Y el enjambre lo quiere frenar.', bub: { who: 'DON TITO', t: 'Cuidame ese tren, nena. Lo esperé toda la vida.' }, sfx: { t: '¡CHUU CHUU!', x: 40, y: 8, r: -6 } }] },
  esp7: { title: 'NIVEL FICHÍN', panels: [{ img: 'especial-fichin', cap: 'Nunca, pero nunca, toques el botón rojo.', bub: { who: 'BICHI', t: 'Ups… ¿y este botón para qué era?', left: 1 }, sfx: { t: '¡BLIP!', x: 30, y: 62, r: -8 } }] },
  esp8: { title: 'VENDIMIA BONUS', panels: [{ img: 'especial-vendimia', cap: 'Noche de Vendimia: ¡a juntar todas las uvas antes del amanecer!', bub: { who: 'BICHI', t: '¡Las doradas valen un montón!', left: 1 }, sfx: { t: '¡PUM PUM!', x: 6, y: 8, r: -8 } }] },
  final: { title: 'FINAL', panels: [
    { img: 'final-01', cap: 'La colmena se vino abajo.', sfx: { t: '¡KRAAASH!', x: 22, y: 6, r: -7 } },
    { img: 'final-02', cap: 'Y por primera vez en años, volvió a nevar en la cordillera.' },
    { img: 'final-03', cap: 'Semanas después, en Luján de Cuyo…', bub: { who: 'VIÑATERO', t: '¡Brotaron! ¡Las viñas brotaron!' } },
    { img: 'final-04', bub: { who: 'DON TITO', t: 'Bueno… no estuvo tan mal, nena.', left: 1 }, sfx: { t: '¡SALUD!', x: 60, y: 8, r: 7 } },
    { img: 'final-05', cap: 'Lejos, muy lejos, en otro glaciar…', sfx: { t: 'crac', x: 62, y: 70, r: -4 } },
  ] },
};

/* ---------- Screens ---------- */
const screens = ['loading', 'menu', 'coop', 'coopEnd', 'story', 'ios', 'record', 'records', 'daily', 'confirm', 'levels', 'comic', 'over', 'win', 'taller', 'pause', 'fin'];
function show(id) { screens.forEach(s => $(s).classList.toggle('hidden', s !== id)); }
function hideAll() { screens.forEach(s => $(s).classList.add('hidden')); }
function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; app.appendChild(d); setTimeout(() => d.remove(), 1500); }
const fmt = n => Math.round(n).toLocaleString('es-AR');

/* ---------- Game state ---------- */
let G = null;
let PL = [];
function mkPlayer(i, two) {
  return { i, x: two ? (i ? W * 0.68 : W * 0.32) : W / 2, y: H - 120, vx: 0, alive: true, out: false, deadT: 0, inv: 2, loopT: 0, fireT: 0, misT: 0,
    loops: 3 + upLv('loop'), shot: 1 + upLv('canon'), shield: upLv('blindaje') ? 3 : 0, shieldT: upLv('blindaje') ? 12 : 0, missileT: upLv('misil') ? 15 : 0, drag: null };
}
const alivePl = () => PL.filter(p => p.alive);
function newGame(lv, fromT = 0, opt = {}) {
  const L = LEVELS[lv], two = !!opt.two;
  G = {
    lv, L, dl: L.dl !== undefined ? L.dl : lv, sp: L.sp || null, daily: opt.daily || null, shootMul: 1, bossMul: 1,
    wind: 0, windT: 4, windTarget: 0, dust: [], grapes: 0, combo: 0, comboT: 0, train: null, trainLost: false, boss: null, t: fromT, scroll: 0, state: 'intro', stateT: 0, running: true, paused: false, mode: opt.mode || 'story', two,
    score: 0, coinsRun: 0, kills: 0, nextPw: 18, spawnT: 1.5, queue: [], heavy: [0.3, 0.6, 0.85].filter(h => h * L.len > fromT + 3),
    E: [], EB: [], PB: [], PK: [], FX: [], TX: [], pops: [], popT: 0, banner: null, shake: 0, flash: 0, checkpoint: fromT,
    lives: (two ? 5 : 3) + upLv('vida'), bombs: two ? 2 : 1, overT: 0, hurtSaid: 0, bossCheckpoint: false, diedProg: 0,
  };
  PL = two ? [mkPlayer(0, true), mkPlayer(1, true)] : [mkPlayer(0, false)];
  G.banner = { t1: L.sp ? '¡ESPECIAL!' : 'NIVEL ' + (lv + 1), t2: L.name, life: 2.6, age: 0 };
  if (L.sp === 'tren') { G.nextPw = 12; const T = PRE.tren || { w: 30, h: 237 }; G.train = { x: W * 0.532, y: H * 0.3, w: T.w, h: T.h, hp: 160, max: 160, flash: 0 }; say('tito', 'Cuidame el tren, nena. Si lo rompen, se terminó.', 3.2); }
  if (L.sp === 'vendimia') { G.heavy = []; G.nextPw = 1e9; say('bichi', '¡A juntar uvas! Las doradas valen diez veces más.', 3.2); }
  if (L.sp === 'zonda') { for (let i = 0; i < 70; i++) G.dust.push({ x: rnd(0, W), y: rnd(0, H), l: rnd(8, 26) }); say('chispa', 'No veo nada… ¡Bichi, avisame por dónde vienen!', 3.2); }
  if (L.sp === 'fichin') say('bichi', 'Perdón, perdón… ¡no sé cómo se vuelve!', 3);
  if (G.daily) {
    const m = G.daily.mod.id; G.banner = { t1: 'DESAFÍO DEL DÍA', t2: G.daily.mod.t, life: 2.8, age: 0 };
    if (m === 'unavida') G.lives = 0;
    if (m === 'sinmejoras') G.nextPw = 1e9;
    if (m === 'balas') G.shootMul = 0.5;
    if (m === 'jefe') G.bossMul = 2;
    if (m === 'tanque') PL.forEach(p => { p.shot = 4; p.shield = 0; });
  }
  if (fromT >= L.len && !L.noBoss) { G.state = 'bosswarn'; G.stateT = 0; G.t = L.len; G.banner = null; startBossWarn(); }
  if (BOSSES[lv]) preload([BOSSES[lv].img]); preload(['gameover-caida']);
  if (lv < 5) { const next = lv < 4 ? 'entre' + (lv + 1) : 'final'; preload(COMICS[next].panels.map(p => p.img)); }
}

/* ---------- Spawning ---------- */
function later(d, fn) { G.queue.push({ at: G.stateClock + d, fn }); }
function diff() { return 1 + G.dl * 0.16 + Math.min(1, G.t / G.L.len) * 0.25; }
function spawn(k, x, y, o = {}) {
  const t = ET[k];
  const e = Object.assign({ id: ++EID, k, t, x, y, x0: x, y0: y, hp: Math.ceil(t.hp * (1 + G.dl * 0.15)), age: 0, flash: 0, cool: rnd(0.6, 1.6), ph: rnd(0, TAU), dir: 1, r: t.w * 0.34 }, o);
  e.maxhp = e.hp; G.E.push(e); return e;
}
function formation(k, big) {
  const n = big ? 1.6 : 1;
  switch (k) {
    case 'polilla': { const c = Math.round(rnd(4, 6) * n), sx = rnd(70, W - 70), amp = rnd(30, 70); for (let i = 0; i < c; i++) later(i * 0.32, () => spawn(k, sx, -40, { amp })); if (big) for (let i = 0; i < c; i++) later(0.9 + i * 0.32, () => spawn(k, W - sx, -40, { amp })); break; }
    case 'oruga': { const c = big ? 3 : rnd(1, 2.6) | 0; for (let i = 0; i < c; i++) spawn(k, rnd(40, W - 40), -50 - i * 70); break; }
    case 'langosta': { const c = Math.round(rnd(4, 5) * n), dir = Math.random() < 0.5 ? 1 : -1, y0 = rnd(60, H * 0.3); for (let i = 0; i < c; i++) later(i * 0.28, () => spawn(k, dir > 0 ? -40 : W + 40, y0, { dir })); if (big) for (let i = 0; i < c; i++) later(1 + i * 0.28, () => spawn(k, dir > 0 ? W + 40 : -40, y0 + 60, { dir: -dir })); break; }
    case 'mosquito': { const c = Math.round(rnd(3, 5) * n); for (let i = 0; i < c; i++) later(i * 0.35, () => spawn(k, rnd(30, W - 30), -40)); break; }
    case 'libelula': { const c = Math.round(rnd(2, 3) * n); for (let i = 0; i < c; i++) later(i * 0.5, () => spawn(k, rnd(60, W - 60), -50, { vx: (Math.random() < 0.5 ? -1 : 1) * rnd(90, 140) })); break; }
    case 'escarabajo': { spawn(k, rnd(80, W - 80), -50); if (big) later(1.2, () => spawn(k, rnd(80, W - 80), -50)); break; }
    case 'avispa': { const c = Math.round(rnd(2, 3) * n); for (let i = 0; i < c; i++) later(i * 0.45, () => spawn(k, 50 + (W - 100) * ((i + 0.5) / c) + rnd(-20, 20), -40, { ty: rnd(70, H * 0.32) })); break; }
  }
}
function pickMix(mix) { let tot = 0; for (const k in mix) tot += mix[k]; let r = Math.random() * tot; for (const k in mix) { r -= mix[k]; if (r <= 0) return k; } return Object.keys(mix)[0]; }

/* ---------- Bullets ---------- */
const eShot = (x, y, a, sp, kind = 'e', r = 6) => G.EB.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r, kind });
function nearestPl(x, y) { let best = null, bd = 1e9; for (const p of PL) { if (!p.alive) continue; const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = p; } } return best; }
const aimAt = (x, y) => { if (G && G.train && G.train.hp > 0 && Math.random() < 0.3) { const T = G.train; return Math.atan2(T.y + rnd(0.1, 0.9) * T.h - y, T.x - x); } const p = nearestPl(x, y); return p ? Math.atan2(p.y - y, p.x - x) : Math.PI / 2; };
function fan(x, y, a, n, spread, sp, kind) { for (let i = 0; i < n; i++) eShot(x, y, a + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread), sp, kind); }
function ring(x, y, n, sp, off = 0, kind) { for (let i = 0; i < n; i++) eShot(x, y, off + i / n * TAU, sp, kind); }
const bSpeed = () => 160 + G.dl * 16;

/* ---------- Popups & FX ---------- */
function say(who, text, dur = 2.8) { if (G.pops.length > 2) return; G.pops.push({ who, text, dur }); }
function boom(x, y, size = 1, sound = true) {
  G.FX.push({ type: 'burst', x, y, r: 22 * size, age: 0, life: 0.32, rot: rnd(0, TAU) });
  for (let i = 0; i < 10 * size; i++) { const a = rnd(0, TAU), s = rnd(60, 220) * size; G.FX.push({ type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, age: 0, life: rnd(0.3, 0.6), c: pick(['#ffd21f', '#ff8a1f', '#e2357a', '#fff']), s: rnd(2, 4.5) * Math.sqrt(size) }); }
  if (sound) SFX.boom();
  if (NET.role === 'h' && G.coop) NET.ev.push(['b', ri(x), ri(y), r1(size)]);
}
function sfxText(x, y, t, size = 30, c = '#ffd21f') { G.TX.push({ x, y, t, size, c, age: 0, life: 0.9, rot: rnd(-0.25, 0.25) }); if (NET.role === 'h' && G.coop) NET.ev.push(['t', ri(x), ri(y), t, size, c]); }
const KILL_WORDS = ['¡PAF!', '¡ZAS!', '¡KRAK!', '¡PLOP!', '¡PUM!', '¡CRUNCH!', '¡SPLAT!'];

/* ---------- Player actions ---------- */
function doLoop(p) { if (!G || !p || G.state === 'dead' || !p.alive || p.loopT > 0 || p.loops <= 0) return; p.loops--; p.loopT = 1.1; SFX.loop(); sfxText(p.x, p.y - 50, '¡LOOP!', 26, p.i ? '#ff9ad5' : '#7ef3ff'); }
function doBomb(p) {
  p = p && p.alive ? p : alivePl()[0];
  if (!G || !p || G.bombs <= 0 || G.state === 'dead') return;
  G.bombs--; G.flash = 1; G.shake = 14; SFX.bomb(); G.EB.length = 0;
  G.FX.push({ type: 'ring', x: p.x, y: p.y, age: 0, life: 0.7 });
  sfxText(W / 2, H * 0.42, '¡KABOOOM!', 60);
  for (const e of G.E) hurtEnemy(e, 30);
  if (G.boss && G.boss.st === 'fight') hurtBoss(70);
}
function addPw(kind, p) {
  SFX.pw();
  if (kind === 'doble') p.shot = Math.min(4, p.shot + 1);
  else if (kind === 'escudo') { p.shield = 3; p.shieldT = 12; }
  else if (kind === 'misil') p.missileT = 14;
  else if (kind === 'vida') G.lives++;
  else if (kind === 'bomba') G.bombs = Math.min(3, G.bombs + 1);
  if (G.train && G.train.hp > 0) { G.train.hp = Math.min(G.train.max, G.train.hp + 20); say('tito', 'De paso le emparché el tren. +20 de vida.', 2.4); return; }
  const l = pick(PW_LINES[kind]); say(l[0], l[1]);
}
function hurtPlayer(p) {
  if (!p || p.loopT > 0 || p.inv > 0 || !p.alive || G.state === 'won') return;
  if (p.shield > 0) { p.shield--; p.inv = 0.25; SFX.shield(); G.FX.push({ type: 'ring', x: p.x, y: p.y, age: 0, life: 0.35, small: 1 }); if (!p.shield) { sfxText(p.x, p.y - 44, '¡CRASH!', 24, '#7ef3ff'); boom(p.x, p.y, 0.7, false); } return; }
  p.alive = false; p.deadT = 1.3; p.drag = null; SFX.die(); boom(p.x, p.y, 2, false); G.shake = 12;
  try { navigator.vibrate && navigator.vibrate(120); } catch (e) {}
  const hadPw = p.shot > 1 + upLv('canon') || p.missileT > 0; p.shot = 1 + upLv('canon'); p.missileT = 0; p.shield = 0; if (hadPw && G.lives > 0) sfxText(p.x, p.y - 46, '¡SIN PODERES!', 22, '#ff9ad5');
  if (G.lives > 0) { G.lives--; if (G.hurtSaid++ % 2 === 0) { const l = pick(HURT_LINES); say(l[0], l[1]); } }
  else { p.out = true; if (!alivePl().length) { G.diedProg = G.boss ? 1 : G.t / G.L.len; G.overT = 1.6; G.state = 'dead'; } else say('bichi', '¡Te quedaste solo! ¡Aguantá!'); }
}

/* ---------- Enemies ---------- */
function hurtEnemy(e, d) {
  if (e.dead) return; e.hp -= d; e.flash = 0.08;
  if (e.hp <= 0) killEnemy(e);
}
function killEnemy(e) {
  e.dead = true; G.kills++; G.score += e.t.sc;
  if (G.dl >= 1 && e.y < H * 0.7 && Math.random() < 0.12 + G.dl * 0.05) fan(e.x, e.y, aimAt(e.x, e.y), 3, 0.5, bSpeed() * 0.8, 'e');
  boom(e.x, e.y, e.t.heavy ? 1.7 : e.t.hp >= 3 ? 1.2 : 0.9);
  if (e.t.heavy || Math.random() < 0.22) sfxText(e.x, e.y - 20, pick(KILL_WORDS), e.t.heavy ? 34 : 26);
  const nc = e.t.heavy ? 4 : e.t.hp >= 4 ? 2 : Math.random() < 0.35 ? 1 : 0;
  for (let i = 0; i < nc; i++) G.PK.push({ kind: 'coin', x: e.x, y: e.y, vx: rnd(-60, 60), vy: rnd(-140, -60), age: 0 });
  const forced = (e.k === 'escarabajo' || e.k === 'oruga') && Math.random() < 0.12;
  if (G.kills >= G.nextPw || forced) {
    if (!forced) G.nextPw = G.kills + (rnd(22, 30) | 0);
    const wts = G.train ? { doble: 20, escudo: 20, misil: 20, bomba: 10, vida: 3 } : { doble: PL.every(q => q.shot >= 4) ? 4 : 30, escudo: 14, misil: 16, bomba: 10, vida: G.lives < 1 ? 7 : 3 };
    G.PK.push({ kind: 'pw', pw: pickMix(wts), x: e.x, y: e.y, vx: 0, vy: 45, age: 0 });
  }
}
function updEnemy(e, dt) {
  const t = e.t, d = diff(); e.age += dt; e.flash -= dt;
  switch (t.move) {
    case 'sine': e.y += t.spd * dt; e.x = e.x0 + Math.sin(e.age * 2.2 + e.ph) * (e.amp || 50); break;
    case 'ground': e.y += G.speed * dt; break;
    case 'swoop': e.x += e.dir * t.spd * dt; e.y = e.y0 + 55 * e.age + 70 * Math.sin(e.age * 1.7); break;
    case 'dive':
      if (!e.locked) { e.y += t.spd * dt; if (e.age > 1.1 || e.y > H * 0.3) { e.locked = 1; const a = aimAt(e.x, e.y); e.vx = Math.cos(a) * 250 * Math.sqrt(d); e.vy = Math.max(120, Math.sin(a) * 250 * Math.sqrt(d)); } }
      else { e.x += e.vx * dt; e.y += e.vy * dt; } break;
    case 'zigzag': e.y += t.spd * dt; e.x += e.vx * dt; if (e.x < 30 || e.x > W - 30) { e.vx *= -1; e.x = clamp(e.x, 30, W - 30); } break;
    case 'slow': e.y += t.spd * dt; break;
    case 'hover':
      if (e.age < 1.2) e.y += (e.ty - e.y) * Math.min(1, dt * 3);
      else if (e.age < 4.2) { e.x += Math.sin(e.age * 2 + e.ph) * 30 * dt; }
      else { e.y += (e.age - 4.2) * 380 * dt; }
      break;
  }
  if (t.shoot && e.y > 20 && e.y < H * 0.78) {
    e.cool -= dt;
    if (e.cool <= 0) {
      e.cool = t.shoot * rnd(0.8, 1.3) / d * G.shootMul;
      const a = aimAt(e.x, e.y);
      if (t.spread) fan(e.x, e.y + 10, a, t.spread + (G.dl > 2 ? 1 : 0), 0.55, bSpeed() * 0.9, 'o');
      else eShot(e.x, e.y + 10, a, bSpeed(), e.k === 'oruga' ? 'o' : 'e');
    }
  }
  if (e.y > H + 90 || (e.age > 1.5 && (e.x < -120 || e.x > W + 120)) || e.y < -400) e.gone = true;
}

/* ---------- Boss ---------- */
function startBossWarn() {
  G.state = 'bosswarn'; G.stateT = 0; G.bossCheckpoint = true; G.checkpoint = G.L.len;
  playMusic('boss'); SFX.alarm(); G.banner = { t1: '¡ATENCIÓN!', t2: 'Se acerca ' + BOSSES[G.lv].name, life: 2.6, age: 0, warn: 1 };
  say('ozan', BOSSES[G.lv].line, 3.4);
  if (G.lv === 4 || Math.random() < 0.5) setTimeout(() => G && say('reina', pick(['Llegaste lejos, pequeña. Hasta acá.', 'Mi criatura te va a devorar.', '¿Todavía volás? Qué molesta.'])), 3600);
}
function spawnBoss() {
  const B = BOSSES[G.lv]; prep(B.img, B.w);
  const hp = Math.round(B.hp * G.bossMul);
  G.boss = { B, x: W / 2, y: -160, hp, maxhp: hp, age: 0, st: 'enter', flash: 0, t1: 0, t2: 0, t3: 0, ang: 0, mode: 0, modeT: 0, ty: H * 0.2, dy: 0 };
}
function hurtBoss(d) { const b = G.boss; if (!b || b.st !== 'fight') return; b.hp -= d; b.flash = 0.06; G.score += d * 2; if (b.hp <= 0) { b.hp = 0; b.st = 'die'; b.dieT = 0; G.EB.length = 0; G.state = 'bossdead'; } }
function updBoss(dt) {
  const b = G.boss; b.age += dt; b.flash -= dt;
  const bh = PRE[b.B.img] ? PRE[b.B.img].h : b.B.w;
  if (b.st === 'enter') { b.y += (b.ty - b.y) * Math.min(1, dt * 1.4); if (Math.abs(b.y - b.ty) < 3) { b.st = 'fight'; b.ft = 0; } return; }
  if (b.st === 'die') {
    b.dieT += dt; b.y += 15 * dt; b.x += Math.sin(b.dieT * 40) * 2;
    if (Math.random() < dt * 14) boom(b.x + rnd(-b.B.w * 0.4, b.B.w * 0.4), b.y + rnd(-bh * 0.35, bh * 0.35), rnd(1, 1.8), Math.random() < 0.4);
    if (b.dieT > 2 && !b.blown) {
      b.blown = 1; SFX.big(); G.flash = 1; G.shake = 18; for (let i = 0; i < 6; i++) boom(b.x + rnd(-60, 60), b.y + rnd(-60, 60), 2.4, false);
      sfxText(W / 2, H * 0.38, '¡KABOOOOM!', 64); G.score += 5000 + G.dl * 2500;
      for (let i = 0; i < 40 + G.dl * 10; i++) G.PK.push({ kind: 'coin', x: b.x + rnd(-40, 40), y: b.y + rnd(-30, 30), vx: rnd(-160, 160), vy: rnd(-260, -40), age: 0 });
    }
    if (b.dieT > 2) b.gone = true;
    return;
  }
  b.ft += dt;
  const hp = b.hp / b.maxhp, rage = hp < 0.5 ? 1.35 : 1, sp = bSpeed();
  const ex = b.x, ey = b.y + bh * 0.25;
  b.t1 -= dt; b.t2 -= dt; b.t3 -= dt;
  switch (b.B.id) {
    case 'madre':
      b.x = W / 2 + Math.sin(b.ft * 0.6) * W * 0.27;
      if (b.t1 <= 0) { b.t1 = 1.25 / rage; fan(ex, ey, aimAt(ex, ey), hp < 0.5 ? 9 : 7, 1.1, sp, 'e'); }
      if (b.t3 <= 0) { b.t3 = 3.2; ring(ex, ey, 14, sp * 0.7, b.ft, 'o'); }
      if (b.t2 <= 0) { b.t2 = 4; for (let i = 0; i < 2; i++) spawn('polilla', b.x + (i ? 70 : -70), b.y, { amp: 40 }); }
      break;
    case 'langosta':
      if (b.mode === 0) { b.x = W / 2 + Math.sin(b.ft * 0.8) * W * 0.25; b.y += (b.ty - b.y) * dt * 2; if (b.t1 <= 0) { b.t1 = 0.9 / rage; for (let i = 0; i < 4; i++) setTimeout(() => G && G.boss === b && b.st === 'fight' && eShot(b.x, b.y + bh * 0.3, aimAt(b.x, b.y), sp * 1.1, 'o'), i * 120); }
        b.modeT += dt; if (b.modeT > 3.6 / rage) { b.mode = 1; b.modeT = 0; b.tx = (nearestPl(b.x, b.y) || { x: W / 2 }).x; } }
      else if (b.mode === 1) { b.modeT += dt; b.x += (b.tx - b.x) * dt * 3; b.flash = Math.sin(b.modeT * 30) > 0 ? 0.05 : 0; if (b.modeT > 0.7) { b.mode = 2; b.modeT = 0; } }
      else if (b.mode === 2) { b.y += 520 * dt; if (b.y > H - 150) { b.mode = 3; G.shake = 8; ring(b.x, b.y, 10, sp * 0.8, rnd(0, 1), 'o'); } }
      else { b.y -= 230 * dt; if (b.y <= b.ty) { b.y = b.ty; b.mode = 0; b.modeT = 0; } }
      break;
    case 'libelula':
      b.x = W / 2 + Math.sin(b.ft * 1.3) * W * 0.32; b.y = b.ty + Math.sin(b.ft * 2.1) * 22;
      if (b.t1 <= 0) { b.t1 = 1.8 / rage; ring(ex, ey, hp < 0.5 ? 18 : 14, sp * 0.85, b.ft, 'ice'); }
      if (b.t2 <= 0) { b.t2 = 0.42 / rage; eShot(ex, ey, aimAt(ex, ey), sp * 1.3, 'ice'); }
      break;
    case 'escarabajo':
      b.x = W / 2 + Math.sin(b.ft * 0.4) * W * 0.18;
      if (b.t1 <= 0) { b.t1 = 1.7 / rage; fan(ex, ey, Math.PI / 2, hp < 0.5 ? 13 : 11, 1.8, sp * 0.85, 'o'); }
      if (b.t2 <= 0) { b.t2 = 0.55 / rage; G.EB.push({ x: rnd(20, W - 20), y: -20, vx: 0, vy: rnd(110, 170), r: 11, kind: 'r', rot: rnd(0, TAU) }); }
      if (b.t3 <= 0) { b.t3 = 6; spawn('oruga', rnd(40, W - 40), -50); }
      break;
    case 'zonda': {
      b.x = W / 2 + Math.sin(b.ft * 0.7) * W * 0.25; b.y = b.ty + Math.sin(b.ft * 1.1) * 26;
      if (b.t1 <= 0) { b.t1 = 0.13 / rage; b.ang += 0.5; eShot(b.x, b.y, b.ang, sp * 0.72, 'o'); eShot(b.x, b.y, b.ang + Math.PI, sp * 0.72, 'o'); }
      if (b.t2 <= 0) { b.t2 = 2.6 / rage; for (let i = 0; i < 6; i++) G.EB.push({ x: rnd(20, W - 20), y: -20 - i * 30, vx: G.wind * 0.6, vy: rnd(120, 180), r: 11, kind: 'r', rot: rnd(0, TAU) }); }
      if (b.t3 <= 0) { b.t3 = 5; spawn('mosquito', b.x - 60, b.y); spawn('mosquito', b.x + 60, b.y); }
      for (const p of PL) if (p.alive && p.loopT <= 0) { const dx = b.x - p.x, dy = b.y - p.y, dd = Math.hypot(dx, dy) || 1, f = 50 * rage; p.x += dx / dd * f * dt; p.y += dy / dd * f * dt * 0.6; }
      break; }
    case 'reina': {
      b.x = W / 2 + Math.sin(b.ft * 0.5) * W * 0.22;
      const ph = hp > 0.66 ? 0 : hp > 0.33 ? 1 : 2;
      if (ph !== b.mode) { b.mode = ph; if (ph === 1) say('reina', '¡Basta de juegos!'); if (ph === 2) say('reina', '¡Mi cielo! ¡MI CIELO!'); }
      if (ph === 0 || ph === 2) { if (b.t1 <= 0) { b.t1 = ph === 2 ? 0.07 : 0.1; b.ang += 0.37; eShot(ex, ey, b.ang, sp * 0.8, 'e'); if (ph === 2) eShot(ex, ey, -b.ang + Math.PI, sp * 0.8, 'ice'); } }
      if (ph >= 1 && b.t2 <= 0) { b.t2 = ph === 2 ? 1.6 : 1.1; fan(ex, ey, aimAt(ex, ey), 5, 0.7, sp * 1.1, 'o'); }
      if (ph === 1 && b.t3 <= 0) { b.t3 = 5; for (let i = 0; i < 2; i++) spawn('avispa', i ? W - 60 : 60, -40, { ty: rnd(80, 200) }); }
      break; }
  }
}

/* ---------- Especiales ---------- */
function updZonda(dt) {
  G.windT -= dt;
  if (G.windT <= 0) {
    G.windT = rnd(4, 7); G.windTarget = (Math.random() < 0.5 ? -1 : 1) * rnd(60, 125);
    if (Math.abs(G.windTarget) > 85 && G.state !== 'won') { sfxText(W / 2, H * 0.3, G.windTarget > 0 ? '¡RÁFAGA! »' : '« ¡RÁFAGA!', 30, '#ffb347'); noise(1.4, 0.1, 500); }
  }
  G.wind += (G.windTarget - G.wind) * Math.min(1, dt * 1.5); G.windTarget *= Math.pow(0.6, dt);
  for (const d of G.dust) { d.x += (G.wind * 2.6 + 30) * dt; d.y += G.speed * 1.6 * dt; if (d.x > W + 30) d.x -= W + 60; if (d.x < -30) d.x += W + 60; if (d.y > H + 20) { d.y = -20; d.x = rnd(0, W); } }
}
function hurtTrain(d, x, y) {
  const T = G.train; if (!T || T.hp <= 0 || G.state === 'won') return;
  T.hp = Math.max(0, T.hp - d); T.flash = 0.08; SFX.hit();
  G.FX.push({ type: 'spark', x, y, vx: rnd(-80, 80), vy: rnd(-80, 0), age: 0, life: 0.3, c: '#ffb347', s: 4 });
  if (T.hp <= 40 && !T.warned) { T.warned = 1; say('tito', '¡El tren no aguanta más! ¡Cubrilo, nena!', 2.6); }
  if (T.hp <= 0) {
    for (let i = 0; i < 6; i++) boom(T.x + rnd(-14, 14), T.y + T.h * (i / 5), 1.6, i === 0);
    SFX.big(); G.shake = 16; G.trainLost = true; G.EB.length = 0;
    G.diedProg = G.t / G.L.len; G.overT = 1.9; G.state = 'dead';
  }
}
function winSpecial() {
  G.state = 'won'; G.stateT = 0; stopMusic(); SFX.win(); G.EB.length = 0;
  if (G.sp === 'tren') { G.E.forEach(e => { if (!e.dead) killEnemy(e); }); G.EB.length = 0; G.score += Math.round(G.train.hp) * 60; G.banner = { t1: '¡LLEGAMOS!', t2: 'El Trasandino está a salvo', life: 3, age: 0 }; }
  else G.banner = { t1: '¡VENDIMIA COMPLETA!', t2: G.grapes + ' racimos juntados', life: 3, age: 0 };
}
function grapeWave() {
  const r = Math.random(), gold = () => Math.random() < 0.1;
  const add = (x, y) => G.PK.push({ kind: 'uva', gold: gold(), x: clamp(x, 24, W - 24), y, vx: 0, vy: 165, age: rnd(0, 6) });
  if (r < 0.25) { const x = rnd(40, W - 40); for (let i = 0; i < 6; i++) add(x, -20 - i * 38); }
  else if (r < 0.45) { const n = 5; for (let i = 0; i < n; i++) add(40 + (W - 80) * i / (n - 1), -20); }
  else if (r < 0.75) { const cx = rnd(90, W - 90); for (let i = 0; i < 10; i++) add(cx + Math.sin(i * 0.7) * 70, -20 - i * 30); }
  else { const cx = rnd(100, W - 100); for (let i = 0; i < 4; i++) { add(cx - i * 24, -20 - i * 30); if (i) add(cx + i * 24, -20 - i * 30); } }
}
function pickGrape(k) {
  G.combo = G.comboT > 0 ? Math.min(8, G.combo + 1) : 1; G.comboT = 1.1;
  const v = (k.gold ? 500 : 50) * G.combo; G.score += v; G.grapes++;
  tone(660 + G.combo * 80, 0.06, 'square', 0.05); if (k.gold) tone(1320, 0.12, 'square', 0.05, 0, 0.06);
  if (k.gold) { S.coins += 10; G.coinsRun += 10; sfxText(k.x, k.y - 26, '¡DORADA! +' + v, 22, '#ffd21f'); if (Math.random() < 0.4) say('bichi', pick(['¡Una dorada!', '¡Esa vale oro!', '¡Bien ahí, Chispa!']), 1.8); }
  else { if (G.grapes % 5 === 0) { S.coins++; G.coinsRun++; } if (G.combo >= 3) sfxText(k.x, k.y - 22, 'x' + G.combo, 20, '#fff'); }
}
let PXC = null, PXX = null;
function pixelate() {
  const sw = Math.round(W / 3), sh = Math.round(H / 3);
  if (!PXC || PXC.width !== sw || PXC.height !== sh) { PXC = document.createElement('canvas'); PXC.width = sw; PXC.height = sh; PXX = PXC.getContext('2d', { willReadFrequently: true }); }
  PXX.imageSmoothingEnabled = true; PXX.drawImage(cv, 0, 0, sw, sh);
  const id = PXX.getImageData(0, 0, sw, sh), d = id.data;
  for (let i = 0; i < d.length; i += 4) { d[i] = (d[i] >> 5) * 36 + 18; d[i + 1] = (d[i + 1] >> 5) * 36 + 18; d[i + 2] = (d[i + 2] >> 6) * 85; }
  PXX.putImageData(id, 0, 0);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false; ctx.drawImage(PXC, 0, 0, cv.width, cv.height); ctx.restore();
  ctx.fillStyle = 'rgba(0,0,0,.16)'; for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
}
function drawZonda() {
  const p = (PL[G.me || 0] && PL[G.me || 0].alive ? PL[G.me || 0] : PL.find(q => q.alive)) || PL[0], lx = p.x, ly = p.y - 80;
  const g = ctx.createRadialGradient(lx, ly, 50, lx, ly, 300);
  g.addColorStop(0, 'rgba(28,14,4,0)'); g.addColorStop(0.5, 'rgba(28,14,4,.28)'); g.addColorStop(1, 'rgba(18,8,2,.8)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(214,160,96,.4)'; ctx.lineWidth = 1.6; ctx.beginPath();
  const dir = G.wind >= 0 ? 1 : -1;
  for (const d of G.dust) { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.l * dir, d.y - d.l * 0.25); } ctx.stroke();
  if (G.boss) { const b = G.boss; drawSpr(b.B.img, b.x, b.y, b.B.w, { rot: b.B.spin ? b.age * 2.5 : 0, alpha: 0.7 }); }
  for (const b of G.EB) { const img = BUL[b.kind] || BUL.e, sz = b.r * 2.4; ctx.drawImage(img, b.x - sz / 2, b.y - sz / 2, sz, sz); }
  for (const e of G.E) { ctx.fillStyle = 'rgba(255,214,64,.9)'; const ey = e.y + e.t.w * 0.18; ctx.beginPath(); ctx.arc(e.x - 5, ey, 2.2, 0, TAU); ctx.arc(e.x + 5, ey, 2.2, 0, TAU); ctx.fill(); }
}

/* ---------- Update ---------- */
function update(dt) {
  const L = G.L;
  G.stateClock = (G.stateClock || 0) + dt;
  G.speed = G.state === 'boss' || G.state === 'bossdead' ? 38 : 62;
  G.scroll += G.speed * dt;
  for (let i = G.queue.length - 1; i >= 0; i--) if (G.queue[i].at <= G.stateClock) { const q = G.queue[i]; G.queue.splice(i, 1); if (G.state !== 'won') q.fn(); }

  // state machine
  G.stateT += dt;
  if (G.state === 'intro' && G.stateT > 2.2) { G.state = 'waves'; G.stateT = 0; }
  if (G.state === 'waves') {
    G.t += dt;
    if (G.t >= L.len * 0.5 && G.checkpoint < L.len * 0.5) G.checkpoint = L.len * 0.5;
    G.spawnT -= dt;
    if (G.heavy.length && G.t >= G.heavy[0] * L.len) { G.heavy.shift(); say('bichi', pick(WARN_LINES), 2.4); const k1 = pickMix(L.mix); later(1.6, () => formation(k1, true)); later(3.2, () => formation(pickMix(L.mix), false)); G.spawnT = 5; }
    if (G.spawnT <= 0 && G.sp === 'vendimia') { grapeWave(); G.spawnT = rnd(0.8, 1.25); }
    if (G.spawnT <= 0) { formation(pickMix(L.mix), false); G.spawnT = Math.max(0.75, 2.0 - G.dl * 0.12 - (G.t / L.len) * 0.6) * rnd(0.85, 1.2); }
    if (G.t >= L.len) { if (L.noBoss) winSpecial(); else startBossWarn(); }
  }
  if (G.sp === 'zonda') updZonda(dt);
  if (G.sp === 'vendimia') { G.comboT -= dt; if (G.comboT <= 0) G.combo = 0; }
  if (G.train) { G.train.flash -= dt; G.train.x = W * 0.532 + Math.sin(G.stateClock * 1.3) * 1.5; }
  if (G.state === 'bosswarn' && G.stateT > 3) { G.state = 'boss'; G.stateT = 0; spawnBoss(); }
  if (G.boss) { updBoss(dt); if (G.boss.gone) { G.boss = null; G.state = 'won'; G.stateT = 0; stopMusic(); SFX.win(); G.banner = { t1: '¡NIVEL SUPERADO!', t2: '', life: 3, age: 0 }; } }
  if (G.state === 'won' && G.stateT > 2.8 && !G.winShown) { G.winShown = 1; finishLevel(); }
  if (G.state === 'dead') { G.overT -= dt; if (G.overT <= 0 && !G.overShown) { G.overShown = 1; gameOver(); } }

  // players
  for (const p of PL) {
    p.inv -= dt; p.loopT -= dt; p.missileT -= dt;
    if (p.shield > 0) { p.shieldT -= dt; if (p.shieldT <= 0) { p.shield = 0; SFX.shield(); } }
    if (!p.alive && G.state !== 'dead') {
      if (p.out && G.lives > 0) { p.out = false; G.lives--; p.deadT = 0.6; }
      if (!p.out) { p.deadT -= dt; if (p.deadT <= 0) { p.alive = true; p.rs = (p.rs || 0) + 1; p.x = PL.length > 1 ? (p.i ? W * 0.68 : W * 0.32) : W / 2; p.y = H - 110; p.inv = 2.4; if (upLv('blindaje')) { p.shield = 3; p.shieldT = 12; } if (upLv('misil')) p.missileT = 8; } }
    }
    if (!p.alive) continue;
    if (G.coop && p.i === 1) { if (NET.gx !== null && NET.gRs === (p.rs || 0)) { p.vx = p.vx * 0.8 + (NET.gx - p.x) * 2; p.x = clamp(NET.gx, 22, W - 22); p.y = clamp(NET.gy, 70, H - 56); } }
    let mx = 0, my = 0;
    if (p.i === 0) { if (keys.ArrowLeft || keys.a) mx--; if (keys.ArrowRight || keys.d) mx++; if (keys.ArrowUp || keys.w) my--; if (keys.ArrowDown || keys.s) my++; }
    const px0 = p.x;
    if (mx || my) { p.x += mx * 260 * dt; p.y += my * 260 * dt; }
    if (p.drag) { p.x += (p.drag.tx - p.x) * Math.min(1, dt * 22); p.y += (p.drag.ty - p.y) * Math.min(1, dt * 22); }
    if (G.sp === 'zonda') { p.x += G.wind * dt; if (p.drag) p.drag.tx = clamp(p.drag.tx + G.wind * dt, 22, W - 22); }
    p.x = clamp(p.x, 22, W - 22); p.y = clamp(p.y, 70, H - 56);
    if (!(G.coop && p.i === 1)) p.vx = p.vx * 0.8 + ((p.x - px0) / Math.max(dt, 0.001)) * 0.2;
    p.fireT -= dt;
    if (p.fireT <= 0 && G.state !== 'won' && G.sp !== 'vendimia') {
      p.fireT = 0.105; SFX.shoot();
      const s = p.shot, pb = (dx, a) => G.PB.push({ x: p.x + dx, y: p.y - 26, vx: Math.sin(a) * 640, vy: -Math.cos(a) * 640, d: 1 });
      pb(-6, 0); pb(6, 0);
      if (s >= 2) { pb(-14, -0.13); pb(14, 0.13); }
      if (s >= 3) { pb(-20, -0.03); pb(20, 0.03); }
      if (s >= 4) { pb(-22, -0.27); pb(22, 0.27); }
    }
    if (p.missileT > 0) { p.misT -= dt; if (p.misT <= 0) { p.misT = 0.42; [-24, 24].forEach(dx => G.PB.push({ x: p.x + dx, y: p.y, vx: dx * 4, vy: -180, d: 3, mis: 1 })); } }
  }
  // player bullets
  for (const b of G.PB) {
    if (b.mis) {
      let best = null, bd = 1e9; for (const e of G.E) { if (e.dead || e.y < 0) continue; const dd = (e.x - b.x) ** 2 + (e.y - b.y) ** 2; if (dd < bd) { bd = dd; best = e; } }
      const tgt = best || (G.boss && G.boss.st === 'fight' ? G.boss : null);
      if (tgt) { const a = Math.atan2(tgt.y - b.y, tgt.x - b.x); b.vx += Math.cos(a) * 1600 * dt; b.vy += Math.sin(a) * 1600 * dt; }
      else b.vy -= 900 * dt;
      const sp = Math.hypot(b.vx, b.vy), mx = 430; if (sp > mx) { b.vx *= mx / sp; b.vy *= mx / sp; }
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.y < -30 || b.x < -30 || b.x > W + 30 || b.y > H + 30) { b.gone = 1; continue; }
    for (const e of G.E) { if (e.dead) continue; const r = e.r + 4; if (Math.abs(e.x - b.x) < r && Math.abs(e.y - b.y) < r && (e.x - b.x) ** 2 + (e.y - b.y) ** 2 < r * r) { hurtEnemy(e, b.d); b.gone = 1; if (Math.random() < 0.3) SFX.hit(); break; } }
    if (!b.gone && G.boss && G.boss.st === 'fight') { const bo = G.boss, r = bo.B.w * 0.3, cy = bo.y + bo.B.w * 0.05; if ((bo.x - b.x) ** 2 + (cy - b.y) ** 2 < r * r) { hurtBoss(b.d); b.gone = 1; if (Math.random() < 0.25) SFX.hit(); G.FX.push({ type: 'spark', x: b.x, y: b.y, vx: rnd(-60, 60), vy: rnd(-80, 0), age: 0, life: 0.2, c: '#fff', s: 3 }); } }
  }
  G.PB = G.PB.filter(b => !b.gone);
  // enemies
  for (const e of G.E) { if (!e.dead) updEnemy(e, dt);
    if (!e.dead && !e.t.ground && G.train && G.train.hp > 0 && Math.abs(e.x - G.train.x) < G.train.w / 2 + e.r * 0.6 && e.y > G.train.y && e.y < G.train.y + G.train.h) { hurtTrain(4, e.x, e.y); killEnemy(e); }
    if (!e.dead && !e.t.ground) for (const p of PL) if (p.alive && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < (e.r * 0.7 + 10) ** 2 && p.loopT <= 0 && p.inv <= 0) { hurtPlayer(p); hurtEnemy(e, 5); } }
  G.E = G.E.filter(e => !e.dead && !e.gone);
  if (G.boss && G.boss.st === 'fight') for (const p of PL) if (p.alive && (G.boss.x - p.x) ** 2 + (G.boss.y - p.y) ** 2 < (G.boss.B.w * 0.28) ** 2) hurtPlayer(p);
  // enemy bullets
  for (const b of G.EB) {
    b.x += b.vx * dt; b.y += b.vy * dt; if (b.rot !== undefined) b.rot += dt * 3;
    if (G.sp === 'zonda') b.x += G.wind * 0.35 * dt;
    if (G.train && G.train.hp > 0 && Math.abs(b.x - G.train.x) < G.train.w / 2 + b.r && b.y > G.train.y && b.y < G.train.y + G.train.h) { hurtTrain(b.kind === 'r' ? 3 : 1, b.x, b.y); b.gone = 1; continue; }
    if (b.y > H + 30 || b.y < -40 || b.x < -30 || b.x > W + 30) { b.gone = 1; continue; }
    for (const p of PL) if (p.alive && (b.x - p.x) ** 2 + (b.y - p.y) ** 2 < (b.r + 6) ** 2 && p.loopT <= 0 && p.inv <= 0) { hurtPlayer(p); b.gone = 1; break; }
  }
  G.EB = G.EB.filter(b => !b.gone);
  // pickups
  const mag = [0, 110, 180][upLv('iman')];
  for (const k of G.PK) {
    k.age += dt;
    if (k.kind === 'coin') {
      k.vy += 300 * dt; k.vx *= 0.97; if (k.vy > 90) k.vy = 90;
      const np = nearestPl(k.x, k.y);
      const dx = np ? np.x - k.x : 0, dy = np ? np.y - k.y : 0, dd = Math.hypot(dx, dy) || 1;
      if (np && (dd < 60 + mag || G.state === 'won') && k.age > 0.35) { k.vx = dx / dd * 520; k.vy = dy / dd * 520; }
      k.x += k.vx * dt; k.y += k.vy * dt;
      if (np && dd < 22) { k.gone = 1; S.coins++; G.coinsRun++; G.score += 10; SFX.coin(); }
    } else if (k.kind === 'uva') {
      const np = nearestPl(k.x, k.y); k.y += k.vy * dt;
      if (np) { const dx = np.x - k.x, dy = np.y - k.y, dd = Math.hypot(dx, dy) || 1; if (mag && dd < 50 + mag) { k.x += dx / dd * 380 * dt; k.y += dy / dd * 380 * dt; } if (dd < 30) { k.gone = 1; pickGrape(k); } }
    } else { k.y += k.vy * dt; k.x += Math.sin(k.age * 3) * 30 * dt; const np = nearestPl(k.x, k.y); if (np && Math.hypot(np.x - k.x, np.y - k.y) < 34) { k.gone = 1; addPw(k.pw, np); sfxText(k.x, k.y - 30, { doble: '¡DOBLE!', escudo: '¡ESCUDO!', misil: '¡MISILES!', vida: '¡1UP!', bomba: '¡BOMBA!' }[k.pw], 26, '#7ef3ff'); } }
    if (k.y > H + 40) k.gone = 1;
  }
  G.PK = G.PK.filter(k => !k.gone);
  // fx
  for (const f of G.FX) { f.age += dt; if (f.type === 'spark') { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.94; f.vy *= 0.94; } }
  G.FX = G.FX.filter(f => f.age < f.life);
  for (const t of G.TX) t.age += dt; G.TX = G.TX.filter(t => t.age < t.life);
  if (G.banner) { G.banner.age += dt; if (G.banner.age > G.banner.life) G.banner = null; }
  if (G.pops.length) { G.popT += dt; if (G.popT > G.pops[0].dur) { G.pops.shift(); G.popT = 0; } }
  G.shake = Math.max(0, G.shake - dt * 30); G.flash = Math.max(0, G.flash - dt * 1.6);
}

/* ---------- Render ---------- */
function drawSpr(name, x, y, w, opt = {}) {
  const p = PRE[name]; if (!p) return;
  const h = w * p.h / p.w, sx = opt.sx || 1;
  ctx.save(); ctx.translate(x, y); if (opt.rot) ctx.rotate(opt.rot); ctx.scale(sx, opt.sy || 1);
  if (opt.alpha !== undefined) ctx.globalAlpha = opt.alpha;
  ctx.drawImage(opt.white ? p.white : opt.shadow ? p.shadow : p.c, -w / 2, -h / 2, w, h);
  ctx.restore();
}
const TILE = {};
function makeTile(name) {
  const img = IMG[name]; if (!img) return null; if (TILE[name]) return TILE[name];
  const w = img.width, h = img.height, b = Math.round(h * 0.18);
  const c = document.createElement('canvas'); c.width = w; c.height = h - b; const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  x.drawImage(img, 0, h - b, w, b, 0, 0, w, b);
  const t = document.createElement('canvas'); t.width = w; t.height = b; const tx = t.getContext('2d');
  tx.drawImage(img, 0, 0, w, b, 0, 0, w, b); tx.globalCompositeOperation = 'destination-in';
  const g = tx.createLinearGradient(0, 0, 0, b); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)'); tx.fillStyle = g; tx.fillRect(0, 0, w, b);
  x.drawImage(t, 0, 0);
  return TILE[name] = c;
}
function drawBg() {
  const img = makeTile(G.L.bg); if (!img) { ctx.fillStyle = '#2a1248'; ctx.fillRect(0, 0, W, H); return; }
  const th = W * img.height / img.width;
  const k0 = Math.floor(G.scroll / th) - 1, k1 = Math.floor((G.scroll + H) / th) + 1;
  for (let k = k0; k <= k1; k++) {
    const bottom = H + G.scroll - k * th, top = bottom - th;
    if (bottom < 0 || top > H) continue;
    ctx.drawImage(img, 0, top, W, th + 1);
  }
  ctx.fillStyle = G.L.tint; ctx.fillRect(0, 0, W, H);
}
function burstPath(r, n = 12) { ctx.beginPath(); for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * TAU, rr = i & 1 ? r * 0.55 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); }
function wrap(text, maxW) { const words = text.split(' '), lines = []; let l = ''; for (const w of words) { const t = l ? l + ' ' + w : w; if (ctx.measureText(t).width > maxW && l) { lines.push(l); l = w; } else l = t; } if (l) lines.push(l); return lines; }
function outlined(t, x, y, size, fill = '#ffd21f', stroke = '#120a1f', lw, maxW) {
  ctx.font = size + 'px "Luckiest Guy", Impact, sans-serif';
  if (maxW) { const mw = ctx.measureText(t).width; if (mw > maxW) { size = size * maxW / mw; ctx.font = size + 'px "Luckiest Guy", Impact, sans-serif'; } } ctx.lineJoin = 'round'; ctx.lineWidth = lw || Math.max(3, size / 7);
  ctx.strokeStyle = stroke; ctx.strokeText(t, x, y); ctx.fillStyle = fill; ctx.fillText(t, x, y);
}
function faceDraw(name, x, y, s) {
  const img = IMG[name]; ctx.fillStyle = '#18a9df'; ctx.fillRect(x, y, s, s);
  if (img) { const m = Math.min(img.width, img.height); ctx.drawImage(img, (img.width - m) / 2, 0, m, m, x, y, s, s); }
  ctx.lineWidth = 3; ctx.strokeStyle = '#120a1f'; ctx.strokeRect(x, y, s, s);
}
function render() {
  ctx.setTransform(SCALE * DPR, 0, 0, SCALE * DPR, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.save();
  if (G.shake > 0) ctx.translate(rnd(-G.shake, G.shake) * 0.5, rnd(-G.shake, G.shake) * 0.5);
  drawBg();
  // ground enemies
  for (const e of G.E) if (e.t.ground) drawSpr(e.t.img, e.x, e.y, e.t.w, { sx: 1 + Math.sin(e.age * 5) * 0.06, white: e.flash > 0 });
  // shadows
  for (const e of G.E) if (!e.t.ground) drawSpr(e.t.img, e.x + 14, e.y + 24, e.t.w * 0.82, { shadow: 1, alpha: 0.28 });
  if (G.boss) drawSpr(G.boss.B.img, G.boss.x + 26, G.boss.y + 44, G.boss.B.w * 0.85, { shadow: 1, alpha: 0.3, rot: G.boss.B.spin ? G.boss.age * 2.5 : 0 });
  if (G.train && G.train.hp > 0) drawSpr('tren', G.train.x, G.train.y + G.train.h / 2, G.train.w, { white: G.train.flash > 0 });
  for (const p of PL) if (p.alive) { const lp = p.loopT > 0 ? 1 - p.loopT / 1.1 : 0; drawSpr('nave', p.x + 16 + lp * 20, p.y + 30 + Math.sin(lp * Math.PI) * 30, 58, { shadow: 1, alpha: 0.3 }); }
  // pickups
  for (const k of G.PK) {
    if (k.kind === 'uva') { const bob = 1 + Math.sin(k.age * 5) * 0.06; if (k.gold) { ctx.save(); ctx.globalAlpha = 0.35 + Math.sin(k.age * 8) * 0.2; ctx.fillStyle = '#fff3a0'; ctx.beginPath(); ctx.arc(k.x, k.y, 26, 0, TAU); ctx.fill(); ctx.restore(); } drawSpr(k.gold ? 'uva-dorada' : 'uva', k.x, k.y, (k.gold ? 42 : 34) * bob); continue; }
    if (k.kind === 'coin') { const s = Math.abs(Math.cos(k.age * 6)); ctx.save(); ctx.translate(k.x, k.y); ctx.scale(Math.max(0.15, s), 1); ctx.fillStyle = '#ffd21f'; ctx.strokeStyle = '#120a1f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#ff8a1f'; ctx.fillRect(-1.5, -4, 3, 8); ctx.restore(); }
    else { const p = PRE['pw-' + k.pw]; const pul = 1 + Math.sin(k.age * 8) * 0.07; ctx.save(); ctx.globalAlpha = 0.35 + Math.sin(k.age * 8) * 0.15; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(k.x, k.y, 24 * pul, 0, TAU); ctx.fill(); ctx.restore(); if (p) drawSpr('pw-' + k.pw, k.x, k.y, 36 * pul); }
  }
  // enemies
  for (const e of G.E) if (!e.t.ground) { const fl = e.t.flap ? 1 - e.t.flap * Math.abs(Math.sin(e.age * 15)) : 1; drawSpr(e.t.img, e.x, e.y, e.t.w, { sx: fl, white: e.flash > 0 }); }
  // boss
  if (G.boss) { const b = G.boss; const rot = b.B.spin ? b.age * 2.5 : 0, fl = b.B.spin ? 1 : 1 - 0.05 * Math.abs(Math.sin(b.age * 7)); drawSpr(b.B.img, b.x, b.y, b.B.w, { sx: fl, rot }); if (b.flash > 0) drawSpr(b.B.img, b.x, b.y, b.B.w, { sx: fl, rot, white: 1, alpha: 0.35 }); }
  // player bullets
  for (const b of G.PB) { if (b.mis) { ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx) + Math.PI / 2); ctx.drawImage(BUL.m, -6, -11, 12, 22); ctx.restore(); } else ctx.drawImage(BUL.p, b.x - 4, b.y - 12, 8, 24); }
  // players
  for (const p of PL) {
    if (!p.alive) continue;
    const loopP = p.loopT > 0 ? 1 - p.loopT / 1.1 : 0;
    const blink = p.inv > 0 && p.loopT <= 0 && Math.floor(p.inv * 14) % 2 === 0;
    if (!blink) {
      const tilt = clamp(1 - Math.abs(p.vx) / 1400, 0.78, 1);
      const sc = 1 + 0.38 * Math.sin(loopP * Math.PI), rollX = loopP ? Math.cos(loopP * TAU) : 1;
      ctx.save(); ctx.globalAlpha = 0.5 + Math.random() * 0.3; ctx.fillStyle = p.i ? '#ff9ad5' : '#7ef3ff'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 34 * sc, 6, 12 + Math.random() * 6, 0, 0, TAU); ctx.fill(); ctx.restore();
      drawSpr(p.i ? 'nave2' : 'nave', p.x, p.y, 64 * sc, { sx: tilt * rollX });
      if (G.coop && p.i === (G.me || 0) && G.stateClock < 5) { ctx.textAlign = 'center'; outlined('VOS', p.x, p.y + 50, 15, '#7ef3ff'); }
    }
    if (p.shield > 0 && !(p.shieldT < 3 && Math.floor(p.shieldT * 8) % 2)) { ctx.save(); const k = p.shield / 3; ctx.globalAlpha = 0.25 + 0.25 * k + Math.sin(performance.now() / 120) * 0.08; ctx.strokeStyle = '#7ef3ff'; ctx.lineWidth = 1.5 + 2 * p.shield; ctx.fillStyle = 'rgba(126,243,255,' + (0.06 + 0.08 * k) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, 38, 0, TAU); ctx.fill(); ctx.stroke(); if (p.shield < 3) { ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.beginPath(); for (let c = 0; c < 3 - p.shield; c++) { const a0 = c * 2.1 + 0.6; ctx.moveTo(p.x + Math.cos(a0) * 38, p.y + Math.sin(a0) * 38); ctx.lineTo(p.x + Math.cos(a0 + 0.25) * 24, p.y + Math.sin(a0 + 0.25) * 24); ctx.lineTo(p.x + Math.cos(a0 - 0.15) * 14, p.y + Math.sin(a0 - 0.15) * 14); } ctx.stroke(); } ctx.restore(); }
  }
  // enemy bullets
  for (const b of G.EB) { const img = BUL[b.kind] || BUL.e, s = b.r * 2.4; if (b.rot !== undefined) { ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot); ctx.drawImage(img, -s / 2, -s / 2, s, s); ctx.restore(); } else ctx.drawImage(img, b.x - s / 2, b.y - s / 2, s, s); }
  // fx
  for (const f of G.FX) {
    const p = f.age / f.life;
    if (f.type === 'spark') { ctx.globalAlpha = 1 - p; ctx.fillStyle = f.c; ctx.fillRect(f.x - f.s / 2, f.y - f.s / 2, f.s, f.s); ctx.globalAlpha = 1; }
    else if (f.type === 'burst') { ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot); const r = f.r * (0.5 + p * 0.9); ctx.globalAlpha = 1 - p * p; burstPath(r); ctx.fillStyle = '#ffd21f'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#120a1f'; ctx.stroke(); burstPath(r * 0.55, 8); ctx.fillStyle = '#ff8a1f'; ctx.fill(); ctx.restore(); }
    else if (f.type === 'ring') { ctx.save(); ctx.globalAlpha = 1 - p; ctx.strokeStyle = f.small ? '#7ef3ff' : '#fff'; ctx.lineWidth = f.small ? 4 : 10 * (1 - p) + 2; ctx.beginPath(); ctx.arc(f.x, f.y, (f.small ? 40 : 40 + p * H) , 0, TAU); ctx.stroke(); ctx.restore(); }
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const t of G.TX) { const p = t.age / t.life, s = p < 0.15 ? 0.4 + p / 0.15 * 0.7 : 1.1 - (p - 0.15) * 0.15; ctx.save(); ctx.translate(t.x, t.y - p * 20); ctx.rotate(t.rot); ctx.scale(s, s); ctx.globalAlpha = p > 0.75 ? (1 - p) / 0.25 : 1; outlined(t.t, 0, 0, t.size, t.c, undefined, undefined, W * 0.92); ctx.restore(); }
  ctx.restore();
  if (G.sp === 'zonda') drawZonda();
  if (G.sp === 'fichin') pixelate();
  if (G.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.85, G.flash) + ')'; ctx.fillRect(0, 0, W, H); }
  if (G.state === 'dead') { ctx.fillStyle = 'rgba(18,10,31,' + Math.min(0.6, (1.6 - G.overT) * 0.5) + ')'; ctx.fillRect(0, 0, W, H); }
  drawHUD();
}
function drawHUD() {
  const L = G.L;
  ctx.textBaseline = 'middle';
  // progress bar
  const bx = 14, bw = W - 92, by = 14;
  ctx.fillStyle = 'rgba(18,10,31,.65)'; ctx.fillRect(bx - 2, by - 5, bw + 4, 10);
  const pr = G.boss || G.state === 'bosswarn' || G.state === 'won' ? 1 : G.t / L.len;
  const gr = ctx.createLinearGradient(bx, 0, bx + bw, 0); gr.addColorStop(0, '#ff8a1f'); gr.addColorStop(1, '#e2357a');
  ctx.fillStyle = gr; ctx.fillRect(bx, by - 3, bw * pr, 6);
  ctx.fillStyle = '#ffd21f'; ctx.fillRect(bx + bw * 0.5 - 1, by - 5, 2, 10);
  const bi = BOSSES[G.lv] ? IMG[BOSSES[G.lv].img] : IMG[levelIcon(G.lv)]; if (bi) { const k = Math.min(22 / bi.width, 22 / bi.height); ctx.drawImage(bi, bx + bw + 13 - bi.width * k / 2, by - bi.height * k / 2, bi.width * k, bi.height * k); }
  // score
  ctx.textAlign = 'left'; outlined(fmt(G.score), 14, 36, 24, '#fff');
  // coins
  ctx.fillStyle = '#ffd21f'; ctx.strokeStyle = '#120a1f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(W - 112, 36, 7, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.textAlign = 'left'; outlined(String(S.coins), W - 101, 38, 18, '#ffd21f', undefined, undefined, 50);
  // lives
  if (G.sp === 'vendimia') { drawSpr('uva', 24, 64, 20); ctx.textAlign = 'left'; outlined(String(G.grapes), 38, 65, 18, '#fff'); if (G.combo > 1) outlined('x' + G.combo, 80, 65, 18, '#ffd21f'); }
  else for (let i = 0; i < Math.min(6, G.lives); i++) drawSpr('nave', 20 + i * 18, 62, 16);
  if (G.train) { const tw = 130, tx = W / 2 - tw / 2, ty = 58; ctx.fillStyle = 'rgba(18,10,31,.75)'; ctx.fillRect(tx - 2, ty - 2, tw + 4, 12); const k = G.train.hp / G.train.max; ctx.fillStyle = k > 0.5 ? '#3fd16b' : k > 0.25 ? '#ffd21f' : '#ff4f4f'; ctx.fillRect(tx, ty, tw * k, 8); ctx.textAlign = 'center'; outlined('TRASANDINO', W / 2, ty - 8, 12, '#fff'); }
  const ME = PL[G.me || 0];
  if (ME && ME.missileT > 0) { ctx.textAlign = 'left'; outlined('MISILES ' + Math.ceil(ME.missileT), 14, 82, 15, '#ffd21f'); }
  // boss bar
  if (G.boss && G.boss.st !== 'enter') {
    const w2 = W - 60, y2 = 52; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(18,10,31,.75)'; ctx.fillRect(30, y2 + 8, w2, 12);
    ctx.fillStyle = '#e2357a'; ctx.fillRect(32, y2 + 10, (w2 - 4) * G.boss.hp / G.boss.maxhp, 8);
    outlined(BOSSES[G.lv].name.toUpperCase(), W / 2, y2, 16, '#fff');
  }
  // pause button
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#120a1f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(W - 30, 34, 18, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#120a1f'; ctx.fillRect(W - 37, 26, 5, 16); ctx.fillRect(W - 28, 26, 5, 16);
  // action buttons
  if (G.sp !== 'vendimia') btnDraw(BTN.loop, 'LOOP', ME ? ME.loops : 0, ME && ME.loopT > 0);
  if (G.sp !== 'vendimia') btnDraw(BTN.bomb, 'BOMBA', G.bombs, false);
  // popup
  if (G.pops.length) {
    const p = G.pops[0], c = CHARS[p.who], tIn = Math.min(1, G.popT * 6), tOut = Math.min(1, (p.dur - G.popT) * 6), k = Math.min(tIn, tOut);
    const x = 8 - (1 - k) * (W + 20), y = G.boss ? 84 : 72, w = W - 16, h = 70;
    ctx.save(); ctx.translate(x, 0);
    ctx.fillStyle = '#120a1f'; ctx.fillRect(4, y + 4, w, h);
    ctx.fillStyle = c.dark ? '#3a1a63' : '#fff7e6'; ctx.fillRect(0, y, w, h); ctx.lineWidth = 3; ctx.strokeStyle = '#120a1f'; ctx.strokeRect(0, y, w, h);
    faceDraw(c.face, 6, y + 6, 58);
    ctx.textAlign = 'left'; ctx.font = '14px "Luckiest Guy", Impact, sans-serif'; ctx.fillStyle = c.dark ? '#ffd21f' : '#e2357a'; ctx.fillText(c.name, 74, y + 14);
    ctx.font = '700 13px Archivo, sans-serif'; ctx.fillStyle = c.dark ? '#fff' : '#120a1f';
    wrap(p.text, w - 84).slice(0, 3).forEach((l, i) => ctx.fillText(l, 74, y + 32 + i * 16));
    ctx.restore();
  }
  // banner
  if (G.banner) {
    const b = G.banner, p = b.age / b.life, k = p < 0.12 ? p / 0.12 : p > 0.85 ? (1 - p) / 0.15 : 1;
    ctx.save(); ctx.globalAlpha = clamp(k, 0, 1); ctx.translate(W / 2, H * 0.4); ctx.rotate(-0.06); ctx.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k); ctx.textAlign = 'center';
    if (b.warn && Math.floor(b.age * 6) % 2) { ctx.fillStyle = 'rgba(226,53,122,.35)'; ctx.fillRect(-W, -40, W * 2, 80); }
    outlined(b.t1, 0, 0, b.t1.length > 10 ? 44 : 56, b.warn ? '#ff5f5f' : '#ffd21f', undefined, undefined, W * 0.88);
    if (b.t2) { ctx.font = '400 17px "Luckiest Guy", sans-serif'; const tw = ctx.measureText(b.t2).width + 24; ctx.fillStyle = '#120a1f'; ctx.fillRect(-tw / 2, 30, tw, 30); ctx.fillStyle = '#fff'; ctx.fillText(b.t2, 0, 46); }
    ctx.restore();
  }
}
const BTN = { loop: { x: 50, y: 0, r: 30 }, bomb: { x: 0, y: 0, r: 30 } };
function placeButtons() { BTN.loop.x = 46; BTN.loop.y = H - 46; BTN.bomb.x = W - 46; BTN.bomb.y = H - 46; }
function btnDraw(b, label, n, active) {
  ctx.save(); ctx.globalAlpha = n > 0 ? 0.78 : 0.35;
  ctx.fillStyle = '#120a1f'; ctx.beginPath(); ctx.arc(b.x + 3, b.y + 3, b.r, 0, TAU); ctx.fill();
  ctx.fillStyle = active ? '#7ef3ff' : label === 'LOOP' ? '#18a9df' : '#e2357a'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#120a1f'; ctx.stroke();
  ctx.textAlign = 'center'; outlined(label, b.x, b.y - 1, 15, '#fff', '#120a1f', 3, b.r * 1.8);
  ctx.fillStyle = '#ffd21f'; ctx.beginPath(); ctx.arc(b.x + b.r * 0.72, b.y - b.r * 0.72, 11, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.font = '400 13px "Luckiest Guy", sans-serif'; ctx.fillStyle = '#120a1f'; ctx.fillText(String(n), b.x + b.r * 0.72, b.y - b.r * 0.72 + 1);
  ctx.restore();
}

/* ---------- Input ---------- */
const keys = {};
function actLoop() { if (G && G.remote) { NET.loopN++; } else doLoop(PL[0]); }
function actBomb() { if (G && G.remote) { NET.bombN++; } else doBomb(PL[0]); }
function actPause() { if (G && G.remote) nsend({ t: 'preq' }); else togglePause(); }
addEventListener('keydown', e => {
  keys[e.key] = true;
  if (!G || !G.running || (document.activeElement && document.activeElement.tagName === 'INPUT')) return;
  if (e.key === ' ' || e.key === 'Shift') { e.preventDefault(); actLoop(); }
  if (e.key === 'b' || e.key === 'B' || e.key === 'Enter') actBomb();
  if (e.key === 'p' || e.key === 'Escape') actPause();
});
addEventListener('keyup', e => { keys[e.key] = false; });
function toLogical(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; }
cv.addEventListener('pointerdown', e => {
  audioOn(); if (!G || !G.running || G.paused) return;
  const p = toLogical(e);
  if ((p.x - (W - 30)) ** 2 + (p.y - 34) ** 2 < 26 ** 2) { actPause(); return; }
  if (G.sp !== 'vendimia' && (p.x - BTN.loop.x) ** 2 + (p.y - BTN.loop.y) ** 2 < (BTN.loop.r + 8) ** 2) { actLoop(); return; }
  if (G.sp !== 'vendimia' && (p.x - BTN.bomb.x) ** 2 + (p.y - BTN.bomb.y) ** 2 < (BTN.bomb.r + 8) ** 2) { actBomb(); return; }
  const pl = PL[G.me || 0]; if (!pl || !pl.alive || pl.drag) return;
  pl.drag = { id: e.pointerId, sx: p.x, sy: p.y, px: pl.x, py: pl.y, tx: pl.x, ty: pl.y };
  try { cv.setPointerCapture(e.pointerId); } catch (err) {}
});
cv.addEventListener('pointermove', e => { const pl = PL.find(q => q.drag && q.drag.id === e.pointerId); if (!pl) return; const d = pl.drag, p = toLogical(e); d.tx = clamp(d.px + (p.x - d.sx) * 1.3, 22, W - 22); d.ty = clamp(d.py + (p.y - d.sy) * 1.3, 70, H - 56); });
const endDrag = e => { PL.forEach(q => { if (q.drag && q.drag.id === e.pointerId) q.drag = null; }); };
cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
document.addEventListener('visibilitychange', () => { if (document.hidden && G && G.running && !G.paused && !G.remote) togglePause(); save(); });

/* ---------- Loop ---------- */
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000); last = now;
  if (G && G.running) { if (!G.paused) { if (G.remote) guestUpdate(dt); else update(dt); } render(); }
  if (NET.role === 'h') hostTick(now);
  requestAnimationFrame(frame);
}

/* ---------- Flow ---------- */
function startLevel(lv, fromT = 0, opt = {}) {
  hideAll(); placeButtons(); if (BOSSES[lv]) prep(BOSSES[lv].img, BOSSES[lv].w);
  newGame(lv, fromT, opt); G.stateClock = 0; last = performance.now(); M.hold = false;
  if (G.state !== 'bosswarn') playMusic('l' + lv);
}
const COMIC_BEFORE = ['prologo', 'entre1', 'entre2', 'entre3', 'entre4'];
function startStory(lv) { audioOn(); playComic(COMIC_BEFORE[lv], () => startLevel(lv, 0, { mode: 'story' })); }
function togglePause() {
  if (!G || !G.running || G.state === 'dead' || G.state === 'won') return;
  G.paused = !G.paused; PL.forEach(q => q.drag = null);
  M.hold = G.paused; if (G.coop) nsend({ t: 'pause', on: G.paused ? 1 : 0 });
  $('pRestart').classList.toggle('hidden', !!G.coop);
  if (G.paused) { $('pMute').textContent = 'SONIDO: ' + (S.mute ? 'NO' : 'SÍ'); show('pause'); save(); } else hideAll();
}
function finishLevel() {
  G.running = false; const lv = G.lv, L = G.L;
  $('wShop').classList.remove('hidden'); $('wMenu').textContent = 'MENÚ';
  if (G.coop) {
    nsend({ t: 'end', won: 1, sc: G.score, co: G.coinsRun }); S.best[lv] = Math.max(S.best[lv] || 0, G.score); save();
    $('wtitle').textContent = '¡NIVEL SUPERADO!'; $('wpts').textContent = fmt(G.score); $('wbest').textContent = fmt(S.best[lv]); $('wcoins').textContent = '+' + G.coinsRun;
    $('wdaily').classList.add('hidden'); $('wNext').textContent = 'ELEGIR OTRO NIVEL'; $('wNext').onclick = coopLobby;
    $('wShop').classList.add('hidden'); $('wMenu').textContent = 'SALIR'; $('wMenu').onclick = leaveCoop;
    show('win'); return;
  }
  const story = G.mode === 'story', daily = G.daily;
  S.best[lv] = Math.max(S.best[lv] || 0, G.score); if (story) { S.unlocked = Math.max(S.unlocked, Math.min(5, lv + 2)); if (lv === 4) S.beaten = true; } save();
  $('wtitle').textContent = daily ? '¡DESAFÍO GANADO!' : L.sp === 'tren' ? '¡TREN A SALVO!' : L.sp === 'vendimia' ? '¡VENDIMIA COMPLETA!' : lv === 4 && story ? '¡MENDOZA SALVADA!' : '¡NIVEL SUPERADO!';
  const dmsg = daily ? dailyResult(true) : '';
  $('wpts').textContent = fmt(G.score); $('wbest').textContent = fmt(S.best[lv]); $('wcoins').textContent = '+' + G.coinsRun;
  $('wdaily').textContent = dmsg; $('wdaily').classList.toggle('hidden', !dmsg);
  const canNext = lv < 4 && S.unlocked > lv + 1;
  $('wNext').textContent = daily ? 'VER RÉCORDS' : story ? (lv === 4 ? 'VER EL FINAL' : 'SEGUIR LA HISTORIA') : (canNext ? 'SIGUIENTE NIVEL' : 'ELEGIR NIVEL');
  $('wNext').onclick = () => { if (daily) openRecords(); else if (story) { if (lv < 4) startStory(lv + 1); else playComic('final', () => show('fin')); } else if (canNext) startLevel(lv + 1, 0, { mode: 'free' }); else openLevels(); };
  $('wShop').onclick = () => openShop(() => show('win'));
  $('wMenu').onclick = toMenu;
  afterRun(() => show('win'));
}
let contTimer = null;
function gameOver() {
  G.running = true; G.paused = true; save(); playMusic('over');
  const lv = G.lv, mode = G.mode, daily = G.daily, L = G.L, B = BOSSES[lv], who = pick(Object.keys(OVER_LINES)), O = OVER_LINES[who];
  const img = $('ovimg'); img.classList.remove('color'); img.src = url('gameover-caida');
  $('ovface').style.backgroundImage = `url(${url(O.face)})`;
  $('ovsay').innerHTML = `<em>${O.name}</em>${pick(O.l)}`;
  const p = G.diedProg;
  $('ovfill').style.width = (p * 100) + '%'; $('ovmark').style.left = (p * 100) + '%'; $('ovboss').style.backgroundImage = `url(${url(B ? B.img : levelIcon(lv))})`;
  if (G.trainLost) { const m = Math.round((1 - p) * 3800 / 10) * 10; $('ovtxt').innerHTML = `¡Destruyeron el Trasandino! Faltaban <b>${fmt(m)} m</b> para la estación.`; }
  else if (!B) { const m = Math.round((1 - p) * 3800 / 10) * 10; $('ovtxt').innerHTML = `Te faltaron <b>${fmt(m)} m</b> para terminar.`; }
  else if (G.boss) { const left = Math.max(1, Math.round(G.boss.hp / G.boss.maxhp * 100)); $('ovtxt').innerHTML = `¡A ${B.name} le quedaba solo <b>${left}%</b> de vida!`; }
  else { const total = 4000 + lv * 600, m = Math.round((1 - p) * total / 10) * 10; $('ovtxt').innerHTML = p > 0.85 ? `¡Estabas a <b>${fmt(m)} m</b> de ${B.name}! Re cerca.` : `Te faltaron <b>${fmt(m)} m</b> para llegar a ${B.name}.`; }
  const dmsg = daily ? dailyResult(false) : ''; $('ovdaily').textContent = dmsg; $('ovdaily').classList.toggle('hidden', !dmsg);
  $('ovpts').textContent = fmt(G.score); $('ovcoins').textContent = '+' + G.coinsRun;
  const cp = G.checkpoint, cont = $('ovCont');
  clearInterval(contTimer);
  cont.classList.add('hidden');
  const startCont = () => { if (cp > 0 && !(L.noBoss && cp >= L.len)) {
    let n = 10; cont.classList.remove('hidden'); const lab = () => cont.textContent = (cp >= G.L.len ? 'CONTINUAR DESDE EL JEFE ' : 'CONTINUAR DESDE LA MITAD ') + n;
    lab(); contTimer = setInterval(() => { n--; if (n < 0) { clearInterval(contTimer); cont.classList.add('hidden'); } else lab(); }, 1000);
    cont.onclick = () => { clearInterval(contTimer); recolor(() => startLevel(lv, cp, { mode, daily })); };
  } };
  $('ovAgain').onclick = () => { clearInterval(contTimer); recolor(() => startLevel(lv, 0, { mode, daily })); };
  $('ovShop').onclick = () => { clearInterval(contTimer); cont.classList.add('hidden'); openShop(() => show('over')); };
  $('ovMenu').onclick = () => { clearInterval(contTimer); toMenu(); };
  $('ovShop').classList.remove('hidden'); $('ovMenu').textContent = 'MENÚ';
  if (G.coop) {
    nsend({ t: 'end', won: 0, sc: G.score, co: G.coinsRun });
    startCont();
    $('ovAgain').onclick = () => { clearInterval(contTimer); recolor(() => coopStart(lv)); };
    cont.onclick = () => { clearInterval(contTimer); recolor(() => coopStart(lv, cp)); };
    $('ovShop').classList.add('hidden'); $('ovMenu').textContent = 'ELEGIR NIVEL'; $('ovMenu').onclick = () => { clearInterval(contTimer); coopLobby(); };
    show('over'); return;
  }
  afterRun(() => { startCont(); show('over'); });
}
function recolor(fn) { audioOn(); $('ovimg').classList.add('color'); setTimeout(fn, 650); }

/* ---------- Comic viewer ---------- */
let comic = null;
function playComic(id, done) {
  if (G) G.running = false;
  const C = COMICS[id]; preload(C.panels.map(p => p.img)); S.seen[id] = true; save();
  comic = { C, i: -1, done, step: 0 }; playMusic(id === 'final' ? 'final' : 'historia');
  $('cdots').innerHTML = C.panels.map(() => '<i></i>').join('');
  $('ctitle').textContent = C.title;
  show('comic'); nextPanel();
}
function nextPanel() {
  const c = comic; if (!c) return;
  if (c.i >= 0 && c.step < 3) { revealAll(); return; }
  c.i++;
  if (c.i >= c.C.panels.length) { const d = c.done; comic = null; d && d(); return; }
  const p = c.C.panels[c.i];
  $('ctitle').style.display = c.i === 0 ? '' : 'none';
  [...$('cdots').children].forEach((d, i) => d.classList.toggle('on', i <= c.i));
  const img = $('cimg'); img.classList.remove('on'); void img.offsetWidth; img.src = url(p.img); img.classList.add('on');
  const cap = $('ccap'), bub = $('cbub'), sfx = $('csfx');
  cap.classList.remove('on'); bub.classList.remove('on'); sfx.classList.remove('on');
  cap.style.visibility = p.cap ? 'visible' : 'hidden'; cap.textContent = p.cap || '';
  bub.style.visibility = p.bub ? 'visible' : 'hidden'; bub.className = 'bub cin' + (p.bub && p.bub.left ? ' left' : '');
  bub.innerHTML = p.bub ? `<em>${p.bub.who}</em>${p.bub.t}` : '';
  sfx.textContent = p.sfx ? p.sfx.t : ''; if (p.sfx) { sfx.style.left = p.sfx.x + '%'; sfx.style.top = p.sfx.y + '%'; sfx.style.setProperty('--r', (p.sfx.r || -8) + 'deg'); }
  c.step = 0; clearTimeout(c.tm);
  const seq = () => { c.step++; if (c.step === 1) cap.classList.add('on'); if (c.step === 2 && p.sfx) { sfx.classList.add('on'); tone(220, 0.12, 'square', 0.04, 200); } if (c.step === 3) bub.classList.add('on'); if (c.step < 3) c.tm = setTimeout(seq, c.step === 1 ? 450 : 350); };
  c.tm = setTimeout(seq, 250);
  if (c.i + 1 < c.C.panels.length) preload([c.C.panels[c.i + 1].img]);
}
function revealAll() { const c = comic; clearTimeout(c.tm); c.step = 3; $('ccap').classList.add('on'); $('cbub').classList.add('on'); if ($('csfx').textContent) $('csfx').classList.add('on'); }
$('cpage').addEventListener('click', () => { audioOn(); nextPanel(); });
$('cnext').addEventListener('click', () => { audioOn(); nextPanel(); });
$('cskip').addEventListener('click', () => { if (!comic) return; const d = comic.done; clearTimeout(comic.tm); comic = null; d && d(); });

/* ---------- Menus ---------- */
function toMenu() { if (G) { G.running = false; } M.hold = false; playMusic('menu'); clearInterval(contTimer); $('menucoins').textContent = '● ' + S.coins + ' monedas'; $('bPlay').textContent = 'MODO HISTORIA'; const di = dailyInfo(); $('bDaily').textContent = 'DESAFÍO ' + ((S.daily || {}).done === di.key ? '✓' : '★'); $('mute').textContent = S.mute ? '✕' : '♪'; show('menu'); }
$('bPlay').onclick = () => {
  audioOn(); const top = Math.min(5, S.unlocked) - 1;
  if (top <= 0) return startStory(0);
  $('storytxt').textContent = `Vas por el nivel ${top + 1}: ${LEVELS[top].name}.`;
  $('sCont').textContent = 'SEGUIR · NIVEL ' + (top + 1);
  $('sCont').onclick = () => startStory(top);
  $('sNew').onclick = () => startStory(0);
  $('sReset').onclick = () => show('confirm');
  show('story');
};
function lvlBtn(i, label, sub) {
  const ok = avail(i);
  return `<button class="lvl" data-l="${i}" ${ok ? '' : 'disabled'}><img src="${url(levelIcon(i))}" alt=""><span><b>${label}</b><small>${ok ? sub : (i < 5 ? 'Se desbloquea en el modo historia' : 'Se desbloquea al pasar el nivel ' + (LEVELS[i].unlock - 1) + ' de la historia')}</small></span></button>`;
}
function openLevels() {
  const rec = i => S.best[i] ? ' · Récord ' + fmt(S.best[i]) : '';
  $('lvlist').innerHTML = LEVELS.slice(0, 5).map((L, i) => lvlBtn(i, `${i + 1}. ${L.name}`, 'Jefe: ' + BOSSES[i].name + rec(i))).join('')
    + '<h3 class="sect">ESPECIALES</h3>'
    + [8, 5, 6, 7].map(i => lvlBtn(i, LEVELS[i].name, { 5: 'Tormenta de noche, con viento que te empuja', 6: 'Cuidá el tren: si lo destruyen, perdés', 7: 'Todo en 8 bits, como un fichín', 8: 'Sin balas: juntá uvas a toda velocidad' }[i] + rec(i))).join('');
  if (G) G.running = false; show('levels');
}
$('bLevels').onclick = openLevels;
$('lvlist').addEventListener('click', e => { const b = e.target.closest('.lvl'); if (!b || b.disabled) return; audioOn(); const i = +b.dataset.l; if (i >= 5) playComic('esp' + i, () => startLevel(i, 0, { mode: 'free' })); else startLevel(i, 0, { mode: 'free' }); });
document.querySelectorAll('[data-back]').forEach(b => b.onclick = toMenu);
$('bShop').onclick = () => openShop(toMenu);
$('mute').onclick = () => { S.mute = !S.mute; save(); $('mute').textContent = S.mute ? '✕' : '♪'; audioOn(); };
$('pResume').onclick = () => { if (G && G.remote) nsend({ t: 'unpause' }); else togglePause(); };
$('pRestart').onclick = () => { startLevel(G.lv, 0, { mode: G.mode, daily: G.daily }); };
$('pMute').onclick = () => { S.mute = !S.mute; save(); $('pMute').textContent = 'SONIDO: ' + (S.mute ? 'NO' : 'SÍ'); };
$('pMenu').onclick = () => { if (G && G.coop) leaveCoop(); else toMenu(); };
$('fMenu').onclick = toMenu;
document.addEventListener('pointerdown', () => audioOn(), { passive: true });
/* ---------- Récords y desafío del día ---------- */
const dayKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const todayKey = () => dayKey(new Date());
const yesterdayKey = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d); };
const DMODS = [
  { id: 'unavida', t: 'Una sola vida' },
  { id: 'sinmejoras', t: 'No cae ninguna mejora' },
  { id: 'balas', t: 'Los bichos disparan el doble' },
  { id: 'jefe', t: 'El jefe tiene el doble de vida', boss: 1 },
  { id: 'tanque', t: 'Cañones al máximo, pero sin escudo' },
];
function dailyInfo() {
  const key = todayKey(); let h = 7; for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const r = seeded(h); r(); r();
  const pool = []; for (let i = 0; i < 8; i++) if (avail(i)) pool.push(i);
  const lv = pool[Math.floor(r() * pool.length)];
  const mods = DMODS.filter(m => !m.boss || !LEVELS[lv].noBoss);
  return { key, lv, mod: mods[Math.floor(r() * mods.length)] };
}
function streakNow() { const D = S.daily || {}; return D.last === todayKey() || D.last === yesterdayKey() ? (D.streak || 0) : 0; }
function dailyResult(won) {
  const D = S.daily || (S.daily = {}), k = G.daily.key; let msg = '';
  if (D.bestKey !== k) { D.bestKey = k; D.best = 0; }
  D.best = Math.max(D.best || 0, G.score);
  if (D.done !== k) {
    D.streak = D.last === yesterdayKey() ? (D.streak || 0) + 1 : 1; D.last = k; D.done = k;
    const prize = 40 + 20 * Math.min(D.streak, 7) + (won ? 100 : 0);
    S.coins += prize; G.coinsRun += prize;
    msg = `Desafío del día: +${prize} monedas · racha de ${D.streak} día${D.streak > 1 ? 's' : ''}`;
  }
  save(); return msg;
}
function qualifies(sc) { const h = S.hs || []; return sc > 0 && (h.length < 10 || sc > h[h.length - 1].s); }
function afterRun(cb) {
  if (!qualifies(G.score)) return cb();
  const score = G.score, where = G.daily ? 'Desafío del día' : G.L.sp ? G.L.name : 'Nivel ' + (G.lv + 1);
  const h = S.hs || []; const pos = h.filter(r => r.s >= score).length + 1;
  $('recpts').textContent = fmt(score) + ' puntos'; $('recpos').textContent = pos === 1 ? '¡Primer puesto!' : 'Puesto ' + pos + ' de la tabla';
  const inp = $('recname'); inp.value = S.lastName || '';
  let used = false;
  const done = () => { if (used) return; used = true; const n = (inp.value.toUpperCase().replace(/[^A-ZÑ0-9]/g, '') || 'AAA').slice(0, 3); S.lastName = n;
    S.hs = (S.hs || []).concat([{ n, s: score, w: where, k: todayKey() }]).sort((a, b) => b.s - a.s).slice(0, 10); save(); inp.blur(); cb(); };
  $('recOk').onclick = done; inp.onkeydown = e => { if (e.key === 'Enter') done(); };
  show('record'); SFX.win(); setTimeout(() => { try { inp.focus(); inp.select(); } catch (e) {} }, 350);
}
function openRecords() {
  const h = S.hs || [], D = S.daily || {}, k = todayKey();
  $('hslist').innerHTML = h.length ? h.map((r, i) => `<li><span class="rk">${i + 1}</span><b>${r.n}</b><span class="w">${r.w}</span><span class="sc">${fmt(r.s)}</span></li>`).join('') : '<li class="empty">Todavía no hay récords. ¡Jugá una partida!</li>';
  $('hsdaily').innerHTML = `<b>Desafío del día</b><span>Racha: ${streakNow()} día${streakNow() === 1 ? '' : 's'}</span><span>Tu mejor hoy: ${D.bestKey === k ? fmt(D.best) : '—'}</span>`;
  if (G) G.running = false; show('records');
}
function openDaily() {
  const info = dailyInfo(), L = LEVELS[info.lv], D = S.daily || {}, st = streakNow(), paid = D.done === info.key;
  $('dimg').src = url(levelIcon(info.lv)); $('dlv').textContent = L.name; $('dmod').textContent = info.mod.t;
  const prize = 40 + 20 * Math.min(st + 1, 7);
  $('dstreak').innerHTML = paid ? `Ya cobraste el premio de hoy. Racha: <b>${st}</b> día${st === 1 ? '' : 's'}. Tu mejor hoy: <b>${fmt(D.best || 0)}</b>. Mañana hay otro.`
    : `Premio por jugarlo hoy: <b>${prize}</b> monedas (+100 si lo ganás). Racha: <b>${st}</b> día${st === 1 ? '' : 's'}. Si mañana volvés, la racha sube.`;
  $('dPlay').onclick = () => { audioOn(); startLevel(info.lv, 0, { mode: 'daily', daily: info }); };
  if (G) G.running = false; show('daily');
}
$('bDaily').onclick = () => { audioOn(); openDaily(); };
$('bRecords').onclick = openRecords;
$('cfNo').onclick = () => $('bPlay').onclick();
$('cfYes').onclick = () => { S.unlocked = 1; S.beaten = false; S.seen = {}; save(); toMenu(); toast('Historia reiniciada'); };
let shopBack = null;
function openShop(back) {
  shopBack = back; if (G) G.running = false;
  $('tface').style.backgroundImage = `url(${url('cara-tito')})`; $('tsay').innerHTML = `<em>DON TITO</em>${pick(SHOP_LINES)}`;
  renderShop(); show('taller');
}
function renderShop() {
  $('tcoins').textContent = '● ' + S.coins + ' monedas';
  $('tups').innerHTML = UPS.map(u => { const l = upLv(u.id), max = u.cost.length, c = u.cost[l]; return `<div class="up"><img src="${url(u.icon)}" alt=""><div class="t"><b>${u.name}</b><small>${u.d}</small><div class="pips">${u.cost.map((_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('')}</div></div><button data-u="${u.id}" ${l >= max || S.coins < c ? 'disabled' : ''}>${l >= max ? 'LISTO' : '● ' + c}</button></div>`; }).join('');
}
$('tups').addEventListener('click', e => { const b = e.target.closest('button[data-u]'); if (!b || b.disabled) return; const u = UPS.find(x => x.id === b.dataset.u), l = upLv(u.id), c = u.cost[l]; if (S.coins < c) return; S.coins -= c; S.up[u.id] = l + 1; save(); SFX.pw(); $('tsay').innerHTML = `<em>DON TITO</em>${pick(['¡Listo! Quedó joya.', 'Soldado y pintado. Ni se nota.', 'Con esto no te para nadie, nena.'])}`; renderShop(); });
$('tBack').onclick = () => { const b = shopBack; shopBack = null; b ? b() : toMenu(); };

/* ---------- Instalar en el cel ---------- */
let installEvt = null;
const standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const onPages = /github\.io$/.test(location.hostname) || location.hostname === 'localhost';
function updInstall() { $('bInstall').classList.toggle('hidden', standalone() || !(installEvt || (isIOS && onPages))); }
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; updInstall(); });
addEventListener('appinstalled', () => { installEvt = null; updInstall(); toast('¡Puelche instalado!'); });
$('bInstall').onclick = async () => {
  if (installEvt) { installEvt.prompt(); try { await installEvt.userChoice; } catch (e) {} installEvt = null; updInstall(); }
  else if (isIOS) show('ios');
};
if ('serviceWorker' in navigator && onPages) { try { navigator.serviceWorker.register('sw.js').catch(() => {}); } catch (e) {} }

/* ---------- Jugar con un amigo (online por link, PeerJS como Proa del Plata) ---------- */
const QS = new URLSearchParams(location.search);
const NET = { role: null, red: null, sala: null, ok: false, snaps: [], lastSnap: 0, lastIn: 0, ev: [], loopN: 0, bombN: 0, pauseN: 0, gLoop: 0, gBomb: 0, gPause: 0, gx: null, gy: null, gRs: -1, tok: null, myRs: -1, eAge: {}, LB: [], fireT: [0, 0], misT: [0, 0] };
const ETK = Object.keys(ET);
let EID = 0;
const netOn = () => !!(NET.red && NET.ok);
const nsend = d => NET.red && NET.red.enviar(d);
function loadPeer() {
  return new Promise((res, rej) => {
    if (window.Peer) return res();
    const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
    sc.onload = () => res(); sc.onerror = () => rej(new Error('peerjs')); document.head.appendChild(sc);
  });
}
function peerOpts() { const o = { debug: 0 }; if (QS.get('peerhost')) Object.assign(o, { host: QS.get('peerhost'), port: +QS.get('peerport') || 9000, path: '/', secure: false }); return o; }
function nuevaSala() { const a = 'abcdefghjkmnpqrstuvwxyz23456789'; let s = ''; const r = crypto.getRandomValues(new Uint32Array(6)); for (let i = 0; i < 6; i++) s += a[r[i] % a.length]; return s; }
function crearRed({ sala, rol, alMensaje, alEstado, alConectar, alCortar, tok = null, aceptar = () => true }) {
  const PREF = 'puelche-v1-';
  let peer = null, conn = null, conectado = false, vivo = true, reintento = null, abrir = null;
  const estado = (t, ok = false) => alEstado && alEstado(t, ok);
  function enviar(d) { if (conn && conn.open) { try { conn.send(d); return true; } catch (e) {} } return false; }
  function enganchar(c) {
    if (conn && conn !== c) { try { conn.close(); } catch (e) {} }
    conn = c;
    c.on('open', () => { if (conn !== c) return; conectado = true; estado(rol === 'h' ? 'Tu amigo está conectado' : 'Conectado con tu amigo', true); alConectar && alConectar(); });
    c.on('data', d => { if (d && d.t) alMensaje(d); });
    c.on('close', () => { if (conn !== c) return; conectado = false; alCortar && alCortar(); estado(rol === 'h' ? 'Tu amigo se desconectó… lo espero' : 'Se cortó. Reconectando…'); if (rol === 'g') setTimeout(conectar, 2500); });
    c.on('error', e => console.warn('conn', e));
  }
  function crearPeer(id) {
    const p = id ? new Peer(id, peerOpts()) : new Peer(peerOpts());
    p.on('disconnected', () => { if (!p.destroyed && vivo) { estado('Reconectando al servidor…'); setTimeout(() => { if (!p.destroyed && p.disconnected) p.reconnect(); }, 1500); } });
    return p;
  }
  function anfitrion() {
    peer = crearPeer(PREF + sala); estado('Abriendo la sala…');
    peer.on('open', () => { if (!conectado) estado('Esperando a tu amigo…'); });
    peer.on('connection', c => {
      if (!aceptar(c.metadata && c.metadata.tok)) { c.on('open', () => { try { c.send({ t: 'ocupada' }); } catch (e) {} setTimeout(() => { try { c.close(); } catch (e) {} }, 1500); }); return; }
      enganchar(c);
    });
    peer.on('error', e => {
      if (e.type === 'unavailable-id') { estado('Recuperando la sala…'); peer.destroy(); setTimeout(() => vivo && anfitrion(), 3000); }
      else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) estado('Sin conexión al servidor, reintento…');
      else console.warn(e);
    });
  }
  function invitado() {
    peer = crearPeer(null); estado('Conectando…');
    peer.on('open', conectar);
    peer.on('error', e => {
      if (e.type === 'peer-unavailable') { estado('Esperando que tu amigo abra la partida…'); clearTimeout(reintento); reintento = setTimeout(conectar, 4000); }
      else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) estado('Sin conexión al servidor, reintento…');
      else console.warn(e);
    });
  }
  function conectar() {
    if (!vivo || !peer || peer.destroyed) return;
    if (peer.disconnected) { peer.reconnect(); return; }
    if (conn && conn.open) return;
    const c = peer.connect(PREF + sala, { reliable: true, metadata: { tok } }); enganchar(c);
    clearTimeout(abrir); abrir = setTimeout(() => { if (conn === c && !c.open) { estado('No conecta todavía, reintento…'); try { c.close(); } catch (e) {} conectar(); } }, 12000);
  }
  const alVolver = () => {
    if (document.visibilityState !== 'visible' || !peer || peer.destroyed) return;
    if (peer.disconnected) peer.reconnect();
    if (rol === 'g' && !(conn && conn.open)) conectar();
  };
  document.addEventListener('visibilitychange', alVolver);
  if (rol === 'h') anfitrion(); else invitado();
  return { enviar, get conectado() { return conectado; }, cerrar() { vivo = false; document.removeEventListener('visibilitychange', alVolver); try { peer && peer.destroy(); } catch (e) {} } };
}
const coopLink = () => location.origin + location.pathname + '?sala=' + NET.sala + (QS.get('peerhost') ? `&peerhost=${QS.get('peerhost')}&peerport=${QS.get('peerport') || 9000}` : '');
function coopStatus(t, ok) { const el = $('coopStatus'); el.textContent = t; el.classList.toggle('ok', !!ok); }
function openCoop() {
  if (G) G.running = false;
  const host = NET.role === 'h', guest = NET.role === 'g';
  $('coopCreate').classList.toggle('hidden', !!NET.role);
  $('coopLinkBox').classList.toggle('hidden', !(host && !NET.ok));
  $('coopLevels').classList.toggle('hidden', !(host && NET.ok));
  $('coopTxt').textContent = guest ? 'Te invitaron a jugar Puelche. Los dos en el mismo cielo, cada uno desde su cel.' : 'Los dos en el mismo cielo, cada uno desde su cel. Comparten las vidas y las bombas.';
  if (!NET.role) coopStatus('Creá la partida y mandale el link a tu amigo.');
  if (host && NET.ok) renderCoopLevels();
  playMusic('menu'); show('coop');
}
function renderCoopLevels() {
  const ids = [0, 1, 2, 3, 4, 8, 5, 6, 7].filter(avail);
  $('coopLevels').innerHTML = '<h3 class="sect">ELEGÍ EL NIVEL</h3>' + ids.map(i => `<button class="lvl" data-c="${i}"><img src="${url(levelIcon(i))}" alt=""><span><b>${i < 5 ? (i + 1) + '. ' : ''}${LEVELS[i].name}</b><small>${i < 5 ? 'Jefe: ' + BOSSES[i].name : 'Especial'}</small></span></button>`).join('');
}
async function coopCreate() {
  try { await loadPeer(); } catch (e) { coopStatus('No cargó el módulo online. ¿Tenés internet?'); return; }
  NET.role = 'h'; NET.sala = nuevaSala(); NET.ok = false; let guestTok = null;
  NET.red = crearRed({ sala: NET.sala, rol: 'h', alEstado: coopStatus, alMensaje: hostMsg,
    aceptar: t => { if (!guestTok) { guestTok = t || 'x'; return true; } return t === guestTok; },
    alConectar: () => { NET.ok = true; SFX.pw(); if (G && G.coop && G.running) nsend({ t: 'start', lv: G.lv, f: +G.t.toFixed(1) }); else { nsend({ t: 'lobby' }); if (!$('coop').classList.contains('hidden')) openCoop(); } },
    alCortar: () => { NET.ok = false; if (G && G.coop && G.running) { toast('Tu amigo se desconectó'); NET.gx = null; } } });
  const u = coopLink(); $('coopLink').value = u; $('coopWa').href = 'https://wa.me/?text=' + encodeURIComponent('¡Jugá Puelche conmigo! Entrá acá: ' + u);
  openCoop();
}
async function coopJoin(sala) {
  NET.role = 'g'; NET.sala = sala; NET.ok = false;
  try { NET.tok = sessionStorage.getItem('puelche-tok-' + sala); } catch (e) {}
  if (!NET.tok) { NET.tok = nuevaSala() + nuevaSala(); try { sessionStorage.setItem('puelche-tok-' + sala, NET.tok); } catch (e) {} }
  openCoop(); coopStatus('Conectando…');
  try { await loadPeer(); } catch (e) { coopStatus('No cargó el módulo online. ¿Tenés internet?'); return; }
  NET.red = crearRed({ sala, rol: 'g', tok: NET.tok, alEstado: coopStatus, alMensaje: guestMsg,
    alConectar: () => { NET.ok = true; SFX.pw(); coopStatus('Conectado. Tu amigo está eligiendo el nivel…', true); },
    alCortar: () => { NET.ok = false; } });
}
function leaveCoop() {
  if (NET.red) { nsend({ t: 'bye' }); const r = NET.red; setTimeout(() => r.cerrar(), 300); }
  Object.assign(NET, { role: null, red: null, sala: null, ok: false, snaps: [], gx: null, gy: null });
  if (QS.get('sala')) history.replaceState(null, '', location.pathname + (QS.get('peerhost') ? `?peerhost=${QS.get('peerhost')}&peerport=${QS.get('peerport') || 9000}` : ''));
  QS.delete('sala');
  toMenu();
}
function coopStart(lv, f = 0) {
  NET.gx = null; NET.gRs = -1; nsend({ t: 'start', lv, f });
  startLevel(lv, f, { two: true, mode: 'coop' }); G.coop = true; G.me = 0;
}
function coopLobby() { nsend({ t: 'lobby' }); openCoop(); }
/* anfitrión */
function hostMsg(d) {
  if (d.t === 'i') {
    NET.gx = d.x; NET.gy = d.y; NET.gRs = d.rs;
    if (G && G.coop && G.running && !G.paused && PL[1]) {
      if (d.L > NET.gLoop) doLoop(PL[1]); if (d.B > NET.gBomb) doBomb(PL[1]);
    }
    NET.gLoop = d.L; NET.gBomb = d.B;
  } else if (d.t === 'preq') { if (G && G.coop && G.running && !G.paused) togglePause(); }
  else if (d.t === 'unpause') { if (G && G.coop && G.paused) togglePause(); }
  else if (d.t === 'bye') { NET.ok = false; toast('Tu amigo salió de la partida'); }
}
const r1 = v => Math.round(v * 10) / 10, ri = Math.round;
function hostSnap() {
  return { t: 's', st: G.state, sT: r1(G.stateT), oT: r1(G.overT), sc: G.score, lv: G.lives, bo: G.bombs, gt: r1(G.t), scr: ri(G.scroll), fl: r1(G.flash), sh: r1(G.shake), pa: G.paused ? 1 : 0,
    P: PL.map(p => [ri(p.x), ri(p.y), p.alive ? 1 : 0, r1(p.loopT), r1(p.inv), p.shield, r1(p.shieldT), ri(p.vx), p.loops, r1(Math.max(0, p.missileT)), p.shot, p.rs || 0]),
    E: G.E.map(e => [e.id, ETK.indexOf(e.k), ri(e.x), ri(e.y), e.flash > 0 ? 1 : 0]),
    B: G.boss ? [ri(G.boss.x), ri(G.boss.y), ri(G.boss.hp), ri(G.boss.maxhp), r1(G.boss.age), G.boss.st, G.boss.flash > 0 ? 1 : 0] : 0,
    EB: G.EB.map(b => [ri(b.x), ri(b.y), ri(b.vx), ri(b.vy), b.r, b.kind]),
    K: G.PK.map(k => [k.kind === 'coin' ? 0 : k.kind === 'uva' ? 1 : 2, ri(k.x), ri(k.y), k.kind === 'pw' ? k.pw : k.gold ? 1 : 0, ri(k.vx || 0), ri(k.vy || 0)]),
    po: G.pops[0] ? [G.pops[0].who, G.pops[0].text, G.pops[0].dur, r1(G.popT)] : 0,
    bn: G.banner ? [G.banner.t1, G.banner.t2, G.banner.life, r1(G.banner.age), G.banner.warn ? 1 : 0] : 0,
    tr: G.train ? [ri(G.train.hp), G.train.flash > 0 ? 1 : 0] : 0, wd: ri(G.wind), gr: G.grapes, cb: G.combo,
    ev: NET.ev.splice(0) };
}
function hostTick(now) {
  if (!G || !G.coop || NET.role !== 'h' || !netOn()) { NET.ev.length = 0; return; }
  if (now - NET.lastSnap > 66) { NET.lastSnap = now; nsend(hostSnap()); }
}
/* invitado */
function guestMsg(d) {
  if (d.t === 's') { d.rt = performance.now(); NET.snaps.push(d); if (NET.snaps.length > 12) NET.snaps.shift(); if (G && G.remote) guestEvents(d); }
  else if (d.t === 'start') guestStart(d.lv, d.f || 0);
  else if (d.t === 'lobby') { if (G) G.running = false; openCoop(); coopStatus('Tu amigo está eligiendo el nivel…', true); }
  else if (d.t === 'pause') { if (G && G.remote) { G.paused = !!d.on; M.hold = G.paused; if (G.paused) { $('pRestart').classList.add('hidden'); show('pause'); } else hideAll(); } }
  else if (d.t === 'end') guestEnd(d);
  else if (d.t === 'ocupada') coopStatus('Esa partida ya tiene dos jugadores.');
  else if (d.t === 'bye') { toast('Tu amigo cerró la partida'); leaveCoop(); }
}
function guestStart(lv, f) {
  hideAll(); placeButtons(); if (BOSSES[lv]) prep(BOSSES[lv].img, BOSSES[lv].w);
  newGame(lv, f, { two: true, mode: 'coop' }); G.coop = true; G.remote = true; G.me = 1; G.pops.length = 0;
  NET.snaps = []; NET.eAge = {}; NET.LB = []; NET.myRs = -1; G.stateClock = 0; last = performance.now(); M.hold = false;
  playMusic(f >= LEVELS[lv].len && !LEVELS[lv].noBoss ? 'boss' : 'l' + lv);
}
function guestEvents(d) {
  for (const e of d.ev || []) {
    if (e[0] === 'b') boom(e[1], e[2], e[3], false);
    else if (e[0] === 't') sfxText(e[1], e[2], e[3], e[4], e[5]);
    else if (e[0] === 's' && SFX[e[1]]) SFX[e[1]]();
  }
  if (d.st !== G.state) { if (d.st === 'bosswarn') playMusic('boss'); if (d.st === 'won') stopMusic(); }
}
function guestEnd(d) {
  if (G) G.running = false; S.coins += d.co || 0; save();
  $('ceT').textContent = d.won ? '¡NIVEL SUPERADO!' : 'GAME OVER'; $('ceS').textContent = fmt(d.sc) + ' puntos';
  $('ceC').textContent = d.co ? `+${d.co} monedas para vos también` : '';
  playMusic(d.won ? 'menu' : 'over'); show('coopEnd');
}
const lerp = (a, b, k) => a + (b - a) * k;
function guestUpdate(dt) {
  G.stateClock += dt;
  const me = PL[1], now = performance.now(), sn = NET.snaps;
  if (sn.length) {
    const rt = now - 110; let s0 = sn[0], s1 = sn[sn.length - 1];
    for (let i = sn.length - 1; i > 0; i--) if (sn[i - 1].rt <= rt) { s0 = sn[i - 1]; s1 = sn[i]; break; }
    const k = s1 === s0 ? 1 : clamp((rt - s0.rt) / Math.max(1, s1.rt - s0.rt), 0, 1), age = Math.max(0, (rt - s0.rt) / 1000);
    G.state = s1.st; G.stateT = s1.sT; G.overT = s1.oT; G.score = s1.sc; G.lives = s1.lv; G.bombs = s1.bo; G.t = lerp(s0.gt, s1.gt, k);
    G.scroll = lerp(s0.scr, s1.scr, k); G.flash = Math.max(G.flash - dt * 1.6, s1.fl); G.shake = Math.max(G.shake - dt * 30, s1.sh);
    G.wind = s1.wd; G.grapes = s1.gr; G.combo = s1.cb;
    if (s1.tr && G.train) { G.train.hp = s1.tr[0]; G.train.flash = s1.tr[1] ? 0.05 : 0; G.train.x = W * 0.532 + Math.sin(G.stateClock * 1.3) * 1.5; }
    // jugadores
    const a0 = s0.P, a1 = s1.P;
    if (a1[0]) { const p = PL[0], q0 = a0[0] || a1[0], q1 = a1[0]; p.x = lerp(q0[0], q1[0], k); p.y = lerp(q0[1], q1[1], k); p.alive = !!q1[2]; p.loopT = q1[3]; p.inv = q1[4]; p.shield = q1[5]; p.shieldT = q1[6]; p.vx = q1[7]; p.loops = q1[8]; p.missileT = q1[9]; p.shot = q1[10]; }
    const q = sn[sn.length - 1].P[1];
    if (q) { const wasDead = !me.alive; me.alive = !!q[2]; me.loopT = q[3]; me.inv = q[4]; me.shield = q[5]; me.shieldT = q[6]; me.loops = q[8]; me.missileT = q[9]; me.shot = q[10];
      if (q[11] !== NET.myRs || (wasDead && me.alive)) { NET.myRs = q[11]; me.x = q[0]; me.y = q[1]; me.drag = null; } }
    // enemigos
    const m0 = {}; for (const e of s0.E) m0[e[0]] = e;
    const ages = {}; G.E = s1.E.map(e => { const p0 = m0[e[0]] || e, kk = ETK[e[1]], t = ET[kk]; const ag = (NET.eAge[e[0]] || 0) + dt; ages[e[0]] = ag; return { id: e[0], k: kk, t, x: lerp(p0[2], e[2], k), y: lerp(p0[3], e[3], k), flash: e[4] ? 0.05 : 0, age: ag, r: t.w * 0.34 }; });
    NET.eAge = ages;
    if (s1.B && BOSSES[G.lv]) { const b0 = s0.B || s1.B, b = s1.B; G.boss = G.boss || { B: BOSSES[G.lv] }; Object.assign(G.boss, { x: lerp(b0[0], b[0], k), y: lerp(b0[1], b[1], k), hp: b[2], maxhp: b[3], age: b[4], st: b[5], flash: b[6] ? 0.05 : 0 }); if (!PRE[G.boss.B.img]) prep(G.boss.B.img, G.boss.B.w); }
    else G.boss = null;
    G.EB = s0.EB.map(b => ({ x: b[0] + b[2] * age + (G.sp === 'zonda' ? G.wind * 0.35 * age : 0), y: b[1] + b[3] * age, r: b[4], kind: b[5], rot: b[5] === 'r' ? G.stateClock * 3 + b[0] : undefined }));
    G.PK = s0.K.map(c => ({ kind: c[0] === 0 ? 'coin' : c[0] === 1 ? 'uva' : 'pw', x: c[1] + (c[0] === 0 ? c[4] * age : 0), y: c[2] + c[5] * age, pw: c[0] === 2 ? c[3] : undefined, gold: c[0] === 1 && c[3] === 1, age: G.stateClock + c[1] * 0.01 }));
    if (s1.po) { const [who, text, dur, pt] = s1.po; if (!G.pops[0] || G.pops[0].text !== text) { G.pops = [{ who, text, dur }]; G.popT = pt; } else G.popT = Math.max(G.popT, pt); } else G.pops = [];
    if (s1.bn) { const [t1, t2, life, ag, warn] = s1.bn; if (!G.banner || G.banner.t1 !== t1) G.banner = { t1, t2, life, age: ag, warn }; } else G.banner = null;
  }
  if (G.pops.length) G.popT += dt;
  if (G.banner) G.banner.age += dt;
  // mi nave (se mueve acá, sin esperar al anfitrión)
  if (me.alive) {
    let mx = 0, my = 0; if (keys.ArrowLeft || keys.a) mx--; if (keys.ArrowRight || keys.d) mx++; if (keys.ArrowUp || keys.w) my--; if (keys.ArrowDown || keys.s) my++;
    const px0 = me.x; if (mx || my) { me.x += mx * 260 * dt; me.y += my * 260 * dt; }
    if (me.drag) { me.x += (me.drag.tx - me.x) * Math.min(1, dt * 22); me.y += (me.drag.ty - me.y) * Math.min(1, dt * 22); }
    if (G.sp === 'zonda') { me.x += G.wind * dt; if (me.drag) me.drag.tx = clamp(me.drag.tx + G.wind * dt, 22, W - 22); }
    if (G.boss && G.boss.B.id === 'zonda' && me.loopT <= 0) { const dx = G.boss.x - me.x, dy = G.boss.y - me.y, dd = Math.hypot(dx, dy) || 1; me.x += dx / dd * 50 * dt; me.y += dy / dd * 30 * dt; }
    me.x = clamp(me.x, 22, W - 22); me.y = clamp(me.y, 70, H - 56); me.vx = me.vx * 0.8 + ((me.x - px0) / Math.max(dt, 0.001)) * 0.2;
  }
  if (now - NET.lastIn > 45) { NET.lastIn = now; nsend({ t: 'i', x: ri(me.x), y: ri(me.y), L: NET.loopN, B: NET.bombN, rs: NET.myRs }); }
  // disparos que se ven acá (el daño lo calcula el anfitrión)
  if (G.state !== 'won' && G.sp !== 'vendimia') PL.forEach((p, i) => {
    if (!p.alive) return; NET.fireT[i] -= dt;
    if (NET.fireT[i] <= 0) { NET.fireT[i] = 0.105; if (i === 1) SFX.shoot(); const s = p.shot, pb = (dx, a) => NET.LB.push({ x: p.x + dx, y: p.y - 26, vx: Math.sin(a) * 640, vy: -Math.cos(a) * 640 }); pb(-6, 0); pb(6, 0); if (s >= 2) { pb(-14, -0.13); pb(14, 0.13); } if (s >= 3) { pb(-20, -0.03); pb(20, 0.03); } if (s >= 4) { pb(-22, -0.27); pb(22, 0.27); } }
    if (p.missileT > 0) { NET.misT[i] -= dt; if (NET.misT[i] <= 0) { NET.misT[i] = 0.42; [-24, 24].forEach(dx => NET.LB.push({ x: p.x + dx, y: p.y, vx: dx * 4, vy: -380, mis: 1 })); } }
  });
  for (const b of NET.LB) {
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.y < -30 || b.x < -30 || b.x > W + 30) { b.gone = 1; continue; }
    for (const e of G.E) { const r = e.r + 4; if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 < r * r) { b.gone = 1; break; } }
    if (!b.gone && G.boss && G.boss.st === 'fight' && (G.boss.x - b.x) ** 2 + (G.boss.y + G.boss.B.w * 0.05 - b.y) ** 2 < (G.boss.B.w * 0.3) ** 2) b.gone = 1;
  }
  NET.LB = NET.LB.filter(b => !b.gone); G.PB = NET.LB;
  for (const f of G.FX) { f.age += dt; if (f.type === 'spark') { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.94; f.vy *= 0.94; } }
  G.FX = G.FX.filter(f => f.age < f.life);
  for (const t of G.TX) t.age += dt; G.TX = G.TX.filter(t => t.age < t.life);
  if (G.sp === 'zonda') for (const d of G.dust) { d.x += (G.wind * 2.6 + 30) * dt; d.y += 62 * 1.6 * dt; if (d.x > W + 30) d.x -= W + 60; if (d.x < -30) d.x += W + 60; if (d.y > H + 20) { d.y = -20; d.x = rnd(0, W); } }
}
$('bCoop').onclick = () => { audioOn(); if (NET.role) openCoop(); else openCoop(); };
$('coopCreate').onclick = () => { audioOn(); coopCreate(); };
$('coopLeave').onclick = leaveCoop;
$('ceLeave').onclick = leaveCoop;
$('coopLevels').addEventListener('click', e => { const b = e.target.closest('.lvl'); if (!b) return; audioOn(); coopStart(+b.dataset.c); });
$('coopShare').onclick = async () => { const u = $('coopLink').value; try { await navigator.share({ title: 'Puelche', text: '¡Jugá Puelche conmigo!', url: u }); } catch (e) { $('coopCopy').onclick(); } };
$('coopCopy').onclick = async () => { const u = $('coopLink').value; let ok = false; try { await navigator.clipboard.writeText(u); ok = true; } catch (e) { const i = $('coopLink'); i.select(); try { ok = document.execCommand('copy'); } catch (er) {} } toast(ok ? '¡Link copiado!' : 'Mantené apretado el link para copiarlo'); };

/* ---------- Boot ---------- */
(async () => {
  let n = 0; const all = SPRITES;
  await Promise.all(all.map(s => loadImg(s).then(() => { n++; $('loadbar').style.width = (n / all.length * 100) + '%'; })));
  try { await Promise.race([Promise.all([document.fonts.load('40px "Luckiest Guy"'), document.fonts.load('700 13px Archivo'), document.fonts.load('800 16px Archivo')]), new Promise(r => setTimeout(r, 2500))]); } catch (e) {}
  Object.keys(ET).forEach(k => prep(ET[k].img, ET[k].w));
  prep('nave', 64); if (IMG.nave) { const c = document.createElement('canvas'); c.width = IMG.nave.width; c.height = IMG.nave.height; const x = c.getContext('2d'); x.drawImage(IMG.nave, 0, 0); const id = x.getImageData(0, 0, c.width, c.height), d = id.data; for (let i = 0; i < d.length; i += 4) { const r = d[i], b = d[i + 2]; d[i] = Math.min(255, b * 1.05); d[i + 1] = d[i + 1] * 0.85; d[i + 2] = r * 0.8; } x.putImageData(id, 0, 0); IMG.nave2 = c; prep('nave2', 64); } prep('tren', 30); prep('uva', 34); prep('uva-dorada', 42); ['pw-doble', 'pw-escudo', 'pw-misil', 'pw-vida', 'pw-bomba'].forEach(p => prep(p, 40));
  makeBullets();
  $('menu').style.backgroundImage = `url(${url('portada')})`; $('taller').style.backgroundImage = `url(${url('taller')})`;
  preload(['portada', 'taller', 'prologo-01', 'prologo-02', 'gameover-caida', 'cara-chispa-derrota', 'cara-tito-derrota', 'cara-bichi-derrota', 'cara-reina-burla']);
  toMenu(); updInstall();
  if (QS.get('sala')) coopJoin(QS.get('sala'));
  requestAnimationFrame(frame);
})();
window.__puelche = { get G() { return G; }, get PL() { return PL; }, startLevel, S, playComic, hurtPlayer: () => G && hurtPlayer(PL[0]), gameOver };
})();
