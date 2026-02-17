// ============================================================
// 禪音節奏 - Zen Rhythm v2.0
// A rhythm game where zen characters fall to the beat.
// Tap/click/press keys in time to score points.
// v2.0: 節拍視覺化、暫停修復、HP 自適應、效能優化
// ============================================================

'use strict';

(() => {

// --- Constants ---
const ZEN_CHARS = [
  { ch: '空', meaning: '一切皆空，萬法無常' },
  { ch: '定', meaning: '心如止水，不動如山' },
  { ch: '慧', meaning: '智慧明照，破除無明' },
  { ch: '淨', meaning: '清淨本心，無染無著' },
  { ch: '悟', meaning: '頓悟自性，本自清淨' },
  { ch: '禪', meaning: '禪定功夫，觀照內心' },
  { ch: '念', meaning: '正念分明，活在當下' },
  { ch: '覺', meaning: '覺察萬物，如實知見' },
  { ch: '捨', meaning: '放下執著，自在無礙' },
  { ch: '忍', meaning: '忍辱波羅蜜，逆境修心' },
  { ch: '施', meaning: '佈施無畏，廣結善緣' },
  { ch: '戒', meaning: '持戒清淨，身心安寧' },
  { ch: '觀', meaning: '觀自在，照五蘊皆空' },
  { ch: '行', meaning: '精進不懈，行菩薩道' },
  { ch: '願', meaning: '發大願心，度一切苦' },
  { ch: '心', meaning: '三界唯心，萬法唯識' },
];

// Hit zones (relative to canvas height)
const PERFECT_ZONE = 0.03;
const GOOD_ZONE = 0.06;
const OK_ZONE = 0.10;

const TARGET_LINE_Y = 0.82;

// Scenes (unlock by combo)
const SCENES = [
  { name: '枯山水', bgFrom: '#0a0a12', bgTo: '#1a1a2e', particleColor: '#8888aa', particleRGB: '136,136,170', threshold: 0 },
  { name: '春芽', bgFrom: '#0f1a0f', bgTo: '#1a2e1a', particleColor: '#66cc88', particleRGB: '102,204,136', threshold: 10 },
  { name: '盛花', bgFrom: '#1a0f1a', bgTo: '#2e1a2e', particleColor: '#ff88cc', particleRGB: '255,136,204', threshold: 25 },
  { name: '極樂淨土', bgFrom: '#1a1a0f', bgTo: '#2e2e1a', particleColor: '#ffdd66', particleRGB: '255,221,102', threshold: 50 },
];

// Audio frequencies for pentatonic scale
const PENTA_FREQS = [293.66, 349.23, 392.00, 440.00, 523.25, 587.33, 698.46, 783.99];

const MAX_PARTICLES = 200;
const PARTICLE_POOL_SIZE = 300;

// --- State ---
const STATE = {
  LOADING: 'loading',
  MENU: 'menu',
  PLAYING: 'playing',
  PAUSED: 'paused',
  GAMEOVER: 'gameover',
};

let state = STATE.LOADING;
let canvas, ctx;
let W, H, dpr;
let audioCtx = null;

// Game variables
let score = 0;
let combo = 0;
let maxCombo = 0;
let bestScore = 0;
let hp = 100;
let bpm = 80;
let beatInterval;
let lastBeatTime = 0;
let gameTime = 0;
let startTime = 0;
let hitFeedback = null;
let meaningDisplay = null;
let pausedAtTimestamp = 0; // track when we paused for proper resume

// Falling notes
let notes = [];
let lanes = 4;
let laneWidth;

// Particles (object pool) - time-based lifecycle
let particlePool = [];
let activeParticleCount = 0;

// Scene
let currentScene = 0;
let sceneLerp = 0;

// Stats
let perfectCount = 0;
let goodCount = 0;
let okCount = 0;
let missCount = 0;

// Visual
let ripples = [];
let rippleCount = 0;
const MAX_RIPPLES = 30;
let targetLineGlow = 0;
let bgGradientOffset = 0;

// Beat pulse
let beatPulse = 0;
let beatPulseRings = [];

// Screen shake
let shakeX = 0;
let shakeY = 0;
let shakeIntensity = 0;
const shakeDecay = 0.9;

// Beat indicator - visual metronome for rhythm feedback
let beatIndicatorPhase = 0; // 0 to 1, cycles with each beat
let lastBeatIndicatorTime = 0;

// Combo milestones
const COMBO_MILESTONES = [
  { threshold: 10,  text: '初入禪境', quote: '靜心觀照' },
  { threshold: 25,  text: '漸入佳境', quote: '定慧雙修' },
  { threshold: 50,  text: '三昧現前', quote: '一心不亂' },
  { threshold: 75,  text: '禪悅法喜', quote: '法喜充滿' },
  { threshold: 100, text: '圓滿證悟', quote: '頓超直入' },
];
let milestoneDisplay = null;
let lastMilestoneCombo = 0;
let screenFlash = 0;

// Achievement system
const ACHIEVEMENTS = [
  { id: 'first_perfect',   name: '初心',     desc: '首次 PERFECT', check: (s) => s.perfectCount >= 1 },
  { id: 'combo_10',        name: '精進',     desc: '達成 10 連擊', check: (s) => s.maxCombo >= 10 },
  { id: 'combo_25',        name: '禪定',     desc: '達成 25 連擊', check: (s) => s.maxCombo >= 25 },
  { id: 'combo_50',        name: '三昧',     desc: '達成 50 連擊', check: (s) => s.maxCombo >= 50 },
  { id: 'perfect_10',      name: '明鏡',     desc: '累計 10 次 PERFECT', check: (s) => s.perfectCount >= 10 },
  { id: 'perfect_30',      name: '般若',     desc: '累計 30 次 PERFECT', check: (s) => s.perfectCount >= 30 },
  { id: 'score_1000',      name: '功德',     desc: '單局破 1000 分', check: (s) => s.score >= 1000 },
  { id: 'score_5000',      name: '圓滿',     desc: '單局破 5000 分', check: (s) => s.score >= 5000 },
  { id: 'all_chars',       name: '法藏',     desc: '蒐集全部禪字', check: (s) => s.collectedTotal >= ZEN_CHARS.length },
  { id: 'no_miss',         name: '不動心',   desc: '單局零 MISS', check: (s) => s.gameOver && s.missCount === 0 && s.totalHits > 10 },
];
let unlockedAchievements = {};
let sessionAchievements = [];
let achievementPopup = null;

// Player progress
let playerProgress = null;

// Touch
let touchLanes = {};

// Collections
let collectedChars = new Set();
let allCollected = {};

// --- Canvas Setup ---
function initCanvas() {
  canvas = document.getElementById('game');
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', debouncedResize);
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  laneWidth = W / lanes;
}

// Debounced resize to avoid excessive reflows
let resizeTimer = null;
function debouncedResize() {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(resize, 150);
}

// --- Audio ---
function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playNote(freq, duration, volume) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();

  osc.type = 'sine';
  osc.frequency.value = freq;

  filter.type = 'lowpass';
  filter.frequency.value = 2000;
  filter.Q.value = 1;

  gain.gain.setValueAtTime(volume * 0.3, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

function playBowlSound() {
  if (!audioCtx) return;
  const baseFreq = 220;
  const harmonics = [1, 2.02, 3.01, 4.99];
  const volumes = [0.15, 0.08, 0.04, 0.02];

  harmonics.forEach((h, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = baseFreq * h;
    gain.gain.setValueAtTime(volumes[i], audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 2.5);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 2.5);
  });
}

function playHitSound(quality) {
  const freqIdx = Math.floor(Math.random() * PENTA_FREQS.length);
  const freq = PENTA_FREQS[freqIdx];
  const vol = quality === 'perfect' ? 0.5 : quality === 'good' ? 0.35 : 0.2;
  const dur = quality === 'perfect' ? 0.8 : quality === 'good' ? 0.5 : 0.3;
  playNote(freq, dur, vol);

  if (quality === 'perfect') {
    const harmIdx = (freqIdx + 2) % PENTA_FREQS.length;
    playNote(PENTA_FREQS[harmIdx], 0.6, 0.2);
  }
}

function playMissSound() {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = 120;
  gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.2);
}

function playBeatTick() {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.03, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.05);
}

function playAchievementSound() {
  if (!audioCtx) return;
  const freqs = [523.25, 659.25, 783.99, 1046.50];
  freqs.forEach((f, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0, audioCtx.currentTime + i * 0.1);
    gain.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + i * 0.1 + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.1 + 0.4);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(audioCtx.currentTime + i * 0.1);
    osc.stop(audioCtx.currentTime + i * 0.1 + 0.4);
  });
}

function playMilestoneSound() {
  if (!audioCtx) return;
  const chordFreqs = [261.63, 329.63, 392.00, 523.25];
  chordFreqs.forEach((f) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.5);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 1.5);
  });
}

// --- Particle Pool (time-based) ---
function initParticlePool() {
  for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
    particlePool.push({
      x: 0, y: 0, vx: 0, vy: 0,
      life: 0, maxLife: 0,
      size: 0, color: '', active: false,
      type: 'circle',
      char: '',
    });
  }
}

function spawnParticle(x, y, vx, vy, lifeSec, size, color, type, char) {
  if (activeParticleCount >= MAX_PARTICLES) return;

  for (let i = 0; i < particlePool.length; i++) {
    const p = particlePool[i];
    if (!p.active) {
      p.x = x; p.y = y; p.vx = vx; p.vy = vy;
      p.life = lifeSec; p.maxLife = lifeSec;
      p.size = size; p.color = color;
      p.active = true; p.type = type || 'circle';
      p.char = char || '';
      activeParticleCount++;
      return;
    }
  }
}

function spawnHitParticles(x, y, quality) {
  const scene = SCENES[currentScene];
  const count = quality === 'perfect' ? 20 : quality === 'good' ? 12 : 6;
  const baseColor = quality === 'perfect' ? '#ffd700' :
                    quality === 'good' ? '#88ccff' : scene.particleColor;

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
    const speed = 90 + Math.random() * 180;
    const lifeSec = 0.5 + Math.random() * 0.4;
    spawnParticle(
      x, y,
      Math.cos(angle) * speed, Math.sin(angle) * speed - 60,
      lifeSec, 2 + Math.random() * 3,
      baseColor, 'circle'
    );
  }

  if (quality === 'perfect') {
    spawnParticle(x, y, 0, 0, 0.5, 5, '#ffd700', 'ring');
  }
}

function updateParticles(dtSec) {
  activeParticleCount = 0;
  for (let i = 0; i < particlePool.length; i++) {
    const p = particlePool[i];
    if (!p.active) continue;

    p.life -= dtSec;
    if (p.life <= 0) {
      p.active = false;
      continue;
    }

    activeParticleCount++;
    p.x += p.vx * dtSec;
    p.y += p.vy * dtSec;
    p.vy += 120 * dtSec; // gravity (pixels/sec^2)
    p.vx *= (1 - 1.2 * dtSec); // drag
  }
}

function drawParticles() {
  for (let i = 0; i < particlePool.length; i++) {
    const p = particlePool[i];
    if (!p.active) continue;

    const alpha = p.life / p.maxLife;
    ctx.globalAlpha = alpha;

    if (p.type === 'ring') {
      const radius = (1 - alpha) * 60 + 10;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2 * alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.type === 'char') {
      ctx.fillStyle = p.color;
      ctx.font = `${p.size * alpha}px "Noto Serif TC", serif`;
      ctx.textAlign = 'center';
      ctx.fillText(p.char, p.x, p.y);
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// --- Ripples (swap-and-pop for performance) ---
function initRipples() {
  ripples = [];
  rippleCount = 0;
  for (let i = 0; i < MAX_RIPPLES; i++) {
    ripples.push({ x: 0, y: 0, radius: 0, maxRadius: 0, alpha: 0, active: false });
  }
}

function spawnRipple(x, y, maxRadius) {
  for (let i = 0; i < MAX_RIPPLES; i++) {
    if (!ripples[i].active) {
      ripples[i].x = x;
      ripples[i].y = y;
      ripples[i].radius = 5;
      ripples[i].maxRadius = maxRadius;
      ripples[i].alpha = 0.8;
      ripples[i].active = true;
      rippleCount++;
      return;
    }
  }
}

function updateRipples(dtSec) {
  for (let i = 0; i < MAX_RIPPLES; i++) {
    const r = ripples[i];
    if (!r.active) continue;

    r.radius += 120 * dtSec;
    r.alpha -= 1.5 * dtSec;

    if (r.alpha <= 0 || r.radius >= r.maxRadius) {
      r.active = false;
      rippleCount--;
    }
  }
}

function drawRipples() {
  for (let i = 0; i < MAX_RIPPLES; i++) {
    const r = ripples[i];
    if (!r.active) continue;

    ctx.strokeStyle = `rgba(255,215,0,${r.alpha})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// --- Notes (falling characters) ---
function spawnNote() {
  let lane = Math.floor(Math.random() * lanes);
  const minGap = H * 0.15;
  let attempts = 0;
  while (attempts < lanes) {
    const hasClose = notes.some(n => n.active && n.lane === lane && n.y < minGap);
    if (!hasClose) break;
    lane = (lane + 1) % lanes;
    attempts++;
  }
  if (attempts >= lanes) return;

  const zenIdx = Math.floor(Math.random() * ZEN_CHARS.length);
  const zen = ZEN_CHARS[zenIdx];

  // Speed: pixels per second, consistent regardless of frame rate
  // Base speed: travel from top (-40) to target line in ~1.2 beats
  const targetY = H * TARGET_LINE_Y;
  const travelDist = targetY + 40; // from -40 to target
  const elapsed = (performance.now() - startTime) / 1000;
  const speedMult = 1 + elapsed / 180;
  const travelTimeMs = beatInterval * 1.2;
  const baseSpeed = travelDist / (travelTimeMs / 1000);
  const speed = baseSpeed * speedMult * (0.95 + Math.random() * 0.1);

  notes.push({
    x: lane * laneWidth + laneWidth / 2,
    y: -40,
    speed: Math.max(speed, H * 0.15), // minimum speed prevents too slow notes
    char: zen.ch,
    meaning: zen.meaning,
    lane: lane,
    active: true,
    hit: false,
    spawned: performance.now(),
  });
}

function updateNotes(dtSec) {
  const targetY = H * TARGET_LINE_Y;

  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    if (!n.active) continue;

    // Time-based movement (consistent across frame rates)
    n.y += n.speed * dtSec;

    // Missed
    if (n.y > H * (TARGET_LINE_Y + OK_ZONE + 0.05) && !n.hit) {
      n.active = false;
      missCount++;
      combo = 0;
      lastMilestoneCombo = 0;

      // Adaptive HP loss: less punishing at higher BPM
      const hpLoss = bpm > 160 ? 5 : bpm > 120 ? 6 : 8;
      hp = Math.max(0, hp - hpLoss);

      playMissSound();
      triggerShake(5);
      hitFeedback = { text: 'MISS', color: '#ff4444', timer: 0.6, x: n.x, y: targetY };
      if (hp <= 0) {
        endGame();
      }
    }

    if (n.y > H + 50) {
      n.active = false;
    }
  }

  // Compact: swap-and-pop dead notes
  let writeIdx = 0;
  for (let i = 0; i < notes.length; i++) {
    if (notes[i].active) {
      if (i !== writeIdx) notes[writeIdx] = notes[i];
      writeIdx++;
    }
  }
  notes.length = writeIdx;
}

function drawNotes() {
  const targetY = H * TARGET_LINE_Y;

  for (const n of notes) {
    if (!n.active || n.hit) continue;

    const distToTarget = Math.abs(n.y - targetY) / H;
    const glowIntensity = Math.max(0, 1 - distToTarget * 5);

    if (glowIntensity > 0) {
      const gradient = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 40);
      gradient.addColorStop(0, `rgba(255,215,0,${glowIntensity * 0.3})`);
      gradient.addColorStop(1, 'rgba(255,215,0,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(n.x, n.y, 40, 0, Math.PI * 2);
      ctx.fill();
    }

    const size = 32 + glowIntensity * 8;
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${size}px "Noto Serif TC", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.shadowColor = SCENES[currentScene].particleColor;
    ctx.shadowBlur = 10 + glowIntensity * 15;
    ctx.fillText(n.char, n.x, n.y);
    ctx.shadowBlur = 0;
  }
}

// --- Input Handling ---
function getLaneFromX(x) {
  return Math.floor(x / laneWidth);
}

function tryHitLane(lane, inputX) {
  const targetY = H * TARGET_LINE_Y;
  let closestNote = null;
  let closestDist = Infinity;

  for (const n of notes) {
    if (!n.active || n.hit || n.lane !== lane) continue;
    const dist = Math.abs(n.y - targetY);
    if (dist < closestDist) {
      closestDist = dist;
      closestNote = n;
    }
  }

  if (!closestNote) return;

  const relDist = closestDist / H;
  let quality = null;

  if (relDist <= PERFECT_ZONE) {
    quality = 'perfect';
    score += 100 * (1 + combo * 0.1);
    perfectCount++;
  } else if (relDist <= GOOD_ZONE) {
    quality = 'good';
    score += 60 * (1 + combo * 0.05);
    goodCount++;
  } else if (relDist <= OK_ZONE) {
    quality = 'ok';
    score += 30;
    okCount++;
  } else {
    return;
  }

  closestNote.hit = true;
  closestNote.active = false;
  combo++;
  maxCombo = Math.max(maxCombo, combo);
  hp = Math.min(100, hp + (quality === 'perfect' ? 3 : 1));

  collectedChars.add(closestNote.char);

  const feedbackText = quality === 'perfect' ? 'PERFECT!' :
                       quality === 'good' ? 'GOOD' : 'OK';
  const feedbackColor = quality === 'perfect' ? '#ffd700' :
                        quality === 'good' ? '#88ccff' : '#aaaaaa';
  hitFeedback = { text: feedbackText, color: feedbackColor, timer: 0.6, x: closestNote.x, y: targetY - 30 };

  if (quality === 'perfect') {
    meaningDisplay = { text: closestNote.meaning, timer: 1.3 };
  }

  playHitSound(quality);
  spawnHitParticles(closestNote.x, targetY, quality);
  spawnRipple(closestNote.x, targetY, 60);
  targetLineGlow = 1;

  if (quality === 'perfect') {
    triggerShake(3);
  }

  spawnParticle(closestNote.x, targetY, 0, -90, 0.8, 28, feedbackColor, 'char', closestNote.char);

  updateScene();
  checkComboMilestone();
  checkAchievements();
}

function handlePointerDown(x, y) {
  if (state === STATE.MENU) {
    startGame();
    return;
  }
  if (state === STATE.GAMEOVER) {
    goToMenu();
    return;
  }
  if (state === STATE.PAUSED) {
    resumeGame();
    return;
  }
  if (state === STATE.PLAYING) {
    if (isPauseButtonHit(x, y)) {
      pauseGame();
      return;
    }
    const lane = getLaneFromX(x);
    tryHitLane(lane, x);
  }
}

function initInput() {
  canvas.addEventListener('mousedown', (e) => {
    handlePointerDown(e.clientX, e.clientY);
  });

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      handlePointerDown(touch.clientX, touch.clientY);
    }
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;

    if (state === STATE.MENU) {
      if (e.key === 'Enter' || e.key === ' ') {
        startGame();
      }
      return;
    }

    if (state === STATE.GAMEOVER) {
      if (e.key === 'Enter' || e.key === ' ') {
        goToMenu();
      }
      return;
    }

    if (e.key === 'Escape') {
      if (state === STATE.PLAYING) pauseGame();
      else if (state === STATE.PAUSED) resumeGame();
      return;
    }

    if (state === STATE.PAUSED) {
      resumeGame();
      return;
    }

    if (state !== STATE.PLAYING) return;

    const keyMap = { 'd': 0, 'f': 1, 'j': 2, 'k': 3 };
    const lane = keyMap[e.key.toLowerCase()];
    if (lane !== undefined) {
      tryHitLane(lane, lane * laneWidth + laneWidth / 2);
    }
  });
}

// --- Scene Management ---
function updateScene() {
  let targetScene = 0;
  for (let i = SCENES.length - 1; i >= 0; i--) {
    if (combo >= SCENES[i].threshold) {
      targetScene = i;
      break;
    }
  }
  if (targetScene !== currentScene) {
    currentScene = targetScene;
    sceneLerp = 0;
  }
}

// --- Game State ---
function startGame() {
  initAudio();
  state = STATE.PLAYING;
  score = 0;
  combo = 0;
  maxCombo = 0;
  hp = 100;
  bpm = 80;
  beatInterval = 60000 / bpm;
  notes = [];
  perfectCount = 0;
  goodCount = 0;
  okCount = 0;
  missCount = 0;
  currentScene = 0;
  sceneLerp = 0;
  collectedChars = new Set();
  hitFeedback = null;
  meaningDisplay = null;
  initRipples();
  startTime = performance.now();
  lastBeatTime = startTime;
  gameTime = 0;
  pausedAtTimestamp = 0;

  beatPulse = 0;
  shakeX = 0;
  shakeY = 0;
  shakeIntensity = 0;
  milestoneDisplay = null;
  lastMilestoneCombo = 0;
  screenFlash = 0;
  achievementPopup = null;
  sessionAchievements = [];

  beatIndicatorPhase = 0;
  lastBeatIndicatorTime = startTime;

  for (const p of particlePool) p.active = false;
  activeParticleCount = 0;

  updateConsecutiveDays();
  playBowlSound();
}

function endGame() {
  state = STATE.GAMEOVER;
  score = Math.floor(score);
  if (score > bestScore) {
    bestScore = score;
    saveBestScore();
  }
  for (const ch of collectedChars) {
    allCollected[ch] = true;
  }
  saveCollection();
  checkAchievements();
}

function pauseGame() {
  state = STATE.PAUSED;
  pausedAtTimestamp = performance.now();
}

function resumeGame() {
  state = STATE.PLAYING;
  // Fix: adjust timing references by the pause duration to prevent dt spike
  const pauseDuration = performance.now() - pausedAtTimestamp;
  lastBeatTime += pauseDuration;
  startTime += pauseDuration;
  lastBeatIndicatorTime += pauseDuration;
  // Reset lastTime so the game loop computes a clean dt on resume
  lastTime = performance.now();
}

function goToMenu() {
  state = STATE.MENU;
}

// --- Persistence ---
function loadBestScore() {
  try {
    bestScore = parseInt(localStorage.getItem('zenrhythm_best') || '0', 10);
  } catch { bestScore = 0; }
}

function saveBestScore() {
  try { localStorage.setItem('zenrhythm_best', String(bestScore)); } catch {}
}

function loadCollection() {
  try {
    allCollected = JSON.parse(localStorage.getItem('zenrhythm_collection') || '{}');
  } catch { allCollected = {}; }
}

function saveCollection() {
  try { localStorage.setItem('zenrhythm_collection', JSON.stringify(allCollected)); } catch {}
}

function loadAchievements() {
  try {
    unlockedAchievements = JSON.parse(localStorage.getItem('zenrhythm_achievements') || '{}');
  } catch { unlockedAchievements = {}; }
}

function saveAchievements() {
  try { localStorage.setItem('zenrhythm_achievements', JSON.stringify(unlockedAchievements)); } catch {}
}

function loadProgress() {
  try {
    playerProgress = JSON.parse(localStorage.getItem('zenrhythm_progress') || 'null');
    if (!playerProgress) {
      playerProgress = { lastPlayDate: null, consecutiveDays: 0, totalPlays: 0 };
    }
  } catch { playerProgress = { lastPlayDate: null, consecutiveDays: 0, totalPlays: 0 }; }
}

function saveProgress() {
  try { localStorage.setItem('zenrhythm_progress', JSON.stringify(playerProgress)); } catch {}
}

function updateConsecutiveDays() {
  const today = new Date().toISOString().slice(0, 10);
  if (playerProgress.lastPlayDate === today) return;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  if (playerProgress.lastPlayDate === yesterdayStr) {
    playerProgress.consecutiveDays++;
  } else if (playerProgress.lastPlayDate !== today) {
    playerProgress.consecutiveDays = 1;
  }

  playerProgress.lastPlayDate = today;
  playerProgress.totalPlays++;
  saveProgress();
}

function checkAchievements() {
  const stats = {
    perfectCount, goodCount, okCount, missCount, maxCombo,
    score: Math.floor(score),
    collectedTotal: Object.keys(allCollected).length,
    gameOver: state === STATE.GAMEOVER,
    totalHits: perfectCount + goodCount + okCount,
  };

  for (const ach of ACHIEVEMENTS) {
    if (unlockedAchievements[ach.id]) continue;
    if (ach.check(stats)) {
      unlockedAchievements[ach.id] = true;
      sessionAchievements.push(ach);
      achievementPopup = { name: ach.name, desc: ach.desc, timer: 2.0 };
      saveAchievements();
      playAchievementSound();
    }
  }
}

// --- Screen Shake ---
function triggerShake(intensity) {
  shakeIntensity = intensity;
}

function updateShake() {
  if (shakeIntensity > 0.1) {
    shakeX = (Math.random() - 0.5) * shakeIntensity * 2;
    shakeY = (Math.random() - 0.5) * shakeIntensity * 2;
    shakeIntensity *= shakeDecay;
  } else {
    shakeX = 0;
    shakeY = 0;
    shakeIntensity = 0;
  }
}

// --- Combo Milestones ---
function checkComboMilestone() {
  for (const m of COMBO_MILESTONES) {
    if (combo >= m.threshold && lastMilestoneCombo < m.threshold) {
      lastMilestoneCombo = m.threshold;
      milestoneDisplay = { text: m.text, quote: m.quote, timer: 1.6 };
      screenFlash = 1;
      triggerShake(8);
      playMilestoneSound();
      for (let i = 0; i < 30; i++) {
        const angle = (Math.PI * 2 * i) / 30;
        const speed = 180 + Math.random() * 240;
        spawnParticle(
          W / 2, H / 2,
          Math.cos(angle) * speed, Math.sin(angle) * speed,
          0.8 + Math.random() * 0.4, 3 + Math.random() * 3,
          '#ffd700', 'circle'
        );
      }
      break;
    }
  }
}

// --- Drawing ---
function drawBackground() {
  const scene = SCENES[currentScene];

  bgGradientOffset += 0.001;
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, scene.bgFrom);
  grad.addColorStop(0.5 + Math.sin(bgGradientOffset) * 0.1, scene.bgTo);
  grad.addColorStop(1, scene.bgFrom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Floating dots
  ctx.globalAlpha = 0.05;
  const time = performance.now() / 3000;
  for (let i = 0; i < 30; i++) {
    const px = (Math.sin(time + i * 1.7) * 0.5 + 0.5) * W;
    const py = (Math.cos(time + i * 2.3) * 0.5 + 0.5) * H;
    ctx.fillStyle = scene.particleColor;
    ctx.beginPath();
    ctx.arc(px, py, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Beat pulse vignette
  if (beatPulse > 0.01) {
    const pulseAlpha = beatPulse * 0.15;
    const edgeGrad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    edgeGrad.addColorStop(0, 'rgba(0,0,0,0)');
    edgeGrad.addColorStop(1, `rgba(${scene.particleRGB},${pulseAlpha})`);
    ctx.fillStyle = edgeGrad;
    ctx.fillRect(0, 0, W, H);
  }

  // Screen flash (milestone)
  if (screenFlash > 0.01) {
    ctx.globalAlpha = screenFlash * 0.3;
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    screenFlash *= 0.9;
  }
}

function drawLanes() {
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let i = 1; i < lanes; i++) {
    const x = i * laneWidth;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }

  const keys = ['D', 'F', 'J', 'K'];
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.font = '16px monospace';
  ctx.textAlign = 'center';
  for (let i = 0; i < lanes; i++) {
    ctx.fillText(keys[i], i * laneWidth + laneWidth / 2, H - 20);
  }
}

function drawTargetLine() {
  const y = H * TARGET_LINE_Y;

  // Glow effect
  if (targetLineGlow > 0) {
    const glowGrad = ctx.createLinearGradient(0, y - 20, 0, y + 20);
    glowGrad.addColorStop(0, 'rgba(255,215,0,0)');
    glowGrad.addColorStop(0.5, `rgba(255,215,0,${targetLineGlow * 0.3})`);
    glowGrad.addColorStop(1, 'rgba(255,215,0,0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, y - 20, W, 40);
    targetLineGlow *= 0.92;
  }

  // Main line
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 5]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(W, y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Hit zone indicators
  ctx.fillStyle = 'rgba(255,215,0,0.03)';
  ctx.fillRect(0, y - H * PERFECT_ZONE, W, H * PERFECT_ZONE * 2);
  ctx.fillStyle = 'rgba(136,204,255,0.02)';
  ctx.fillRect(0, y - H * GOOD_ZONE, W, H * GOOD_ZONE * 2);

  // Beat pulse rings
  if (beatPulse > 0.01) {
    for (let i = 0; i < lanes; i++) {
      const cx = i * laneWidth + laneWidth / 2;
      const pulseRadius = (1 - beatPulse) * 30 + 5;
      ctx.globalAlpha = beatPulse * 0.4;
      ctx.strokeStyle = SCENES[currentScene].particleColor;
      ctx.lineWidth = 2 * beatPulse;
      ctx.beginPath();
      ctx.arc(cx, y, pulseRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

// --- Beat Indicator (visual metronome) ---
function drawBeatIndicator() {
  const y = H * TARGET_LINE_Y;
  const indicatorY = y + 28;

  // Progress bar showing time until next beat
  const phase = beatIndicatorPhase;
  const barW = W * 0.4;
  const barH = 4;
  const barX = (W - barW) / 2;

  // Background
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(barX, indicatorY, barW, barH);

  // Progress fill (sweeps left to right between beats)
  const scene = SCENES[currentScene];
  const fillAlpha = 0.3 + phase * 0.3;
  ctx.fillStyle = `rgba(${scene.particleRGB},${fillAlpha})`;
  ctx.fillRect(barX, indicatorY, barW * phase, barH);

  // Beat dot (pulses at beat moment)
  const dotSize = 3 + beatPulse * 4;
  ctx.fillStyle = `rgba(255,215,0,${0.3 + beatPulse * 0.7})`;
  ctx.beginPath();
  ctx.arc(barX + barW * phase, indicatorY + barH / 2, dotSize, 0, Math.PI * 2);
  ctx.fill();

  // Four tick marks at quarter intervals
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  for (let q = 0; q <= 4; q++) {
    const tickX = barX + (barW * q) / 4;
    ctx.fillRect(tickX - 0.5, indicatorY - 2, 1, barH + 4);
  }
}

function drawHUD() {
  // Score
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 24px "Noto Serif TC", serif';
  ctx.textAlign = 'left';
  ctx.fillText('' + Math.floor(score), 20, 40);

  // Combo
  if (combo > 1) {
    const comboSize = Math.min(48, 24 + combo * 0.5);
    ctx.font = `bold ${comboSize}px "Noto Serif TC", serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = currentScene >= 3 ? '#ffd700' :
                    currentScene >= 2 ? '#ff88cc' :
                    currentScene >= 1 ? '#66cc88' : '#8888aa';
    ctx.fillText(combo + ' 連', W / 2, 45);
  }

  // Scene name
  ctx.font = '14px "Noto Serif TC", serif';
  ctx.textAlign = 'right';
  ctx.fillStyle = SCENES[currentScene].particleColor;
  ctx.fillText(SCENES[currentScene].name, W - 20, 30);

  // HP bar
  const hpBarW = 120;
  const hpBarH = 8;
  const hpX = W - hpBarW - 20;
  const hpY = 40;

  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(hpX, hpY, hpBarW, hpBarH);

  const hpColor = hp > 60 ? '#66cc88' : hp > 30 ? '#ffaa44' : '#ff4444';
  ctx.fillStyle = hpColor;
  ctx.fillRect(hpX, hpY, hpBarW * (hp / 100), hpBarH);

  // BPM indicator
  ctx.font = '12px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.textAlign = 'right';
  ctx.fillText(Math.floor(bpm) + ' BPM', W - 20, hpY + hpBarH + 16);

  // Hit feedback (time-based)
  if (hitFeedback && hitFeedback.timer > 0) {
    const alpha = hitFeedback.timer / 0.6;
    const yOff = (1 - alpha) * 20;
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 28px "Noto Serif TC", serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = hitFeedback.color;
    ctx.fillText(hitFeedback.text, hitFeedback.x, hitFeedback.y - yOff);
    ctx.globalAlpha = 1;
  }

  // Meaning display (time-based)
  if (meaningDisplay && meaningDisplay.timer > 0) {
    const alpha = Math.min(1, meaningDisplay.timer / 0.5);
    ctx.globalAlpha = alpha;
    ctx.font = '18px "Noto Serif TC", serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd700';
    ctx.fillText(meaningDisplay.text, W / 2, H * TARGET_LINE_Y + 50);
    ctx.globalAlpha = 1;
  }

  // Milestone display (time-based)
  if (milestoneDisplay && milestoneDisplay.timer > 0) {
    const mt = milestoneDisplay.timer;
    const fadeIn = Math.min(1, (1.6 - mt) / 0.25);
    const fadeOut = Math.min(1, mt / 0.3);
    const alpha = Math.min(fadeIn, fadeOut);
    const scale = 1 + (1 - fadeIn) * 0.3;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(W / 2, H * 0.4);
    ctx.scale(scale, scale);

    ctx.font = 'bold 42px "Noto Serif TC", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#ffd700';
    ctx.fillText(milestoneDisplay.text, 0, 0);
    ctx.shadowBlur = 0;

    ctx.font = '20px "Noto Serif TC", serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(milestoneDisplay.quote, 0, 40);

    ctx.restore();
  }

  // Achievement popup (time-based)
  if (achievementPopup && achievementPopup.timer > 0) {
    const at = achievementPopup.timer;
    const slideIn = Math.min(1, (2.0 - at) / 0.3);
    const fadeOut = Math.min(1, at / 0.25);
    const alpha = Math.min(slideIn, fadeOut);
    const yPos = 80 + (1 - slideIn) * -40;

    ctx.globalAlpha = alpha;
    const boxW = 220, boxH = 50;
    const boxX = W / 2 - boxW / 2;

    ctx.fillStyle = 'rgba(255,215,0,0.15)';
    ctx.strokeStyle = 'rgba(255,215,0,0.6)';
    ctx.lineWidth = 1;
    const r = 8, bx = boxX, by = yPos - boxH / 2;
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.lineTo(bx + boxW - r, by);
    ctx.arcTo(bx + boxW, by, bx + boxW, by + r, r);
    ctx.lineTo(bx + boxW, by + boxH - r);
    ctx.arcTo(bx + boxW, by + boxH, bx + boxW - r, by + boxH, r);
    ctx.lineTo(bx + r, by + boxH);
    ctx.arcTo(bx, by + boxH, bx, by + boxH - r, r);
    ctx.lineTo(bx, by + r);
    ctx.arcTo(bx, by, bx + r, by, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.font = 'bold 18px "Noto Serif TC", serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd700';
    ctx.fillText(achievementPopup.name, W / 2, yPos - 5);
    ctx.font = '13px "Noto Serif TC", serif';
    ctx.fillStyle = '#ccc';
    ctx.fillText(achievementPopup.desc, W / 2, yPos + 15);
    ctx.globalAlpha = 1;
  }
}

function drawLoadingScreen() {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0a0a12');
  grad.addColorStop(1, '#1a1a2e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#8888aa';
  ctx.font = '18px "Noto Serif TC", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const dots = '.'.repeat(Math.floor((performance.now() / 400) % 4));
  ctx.fillText('載入中' + dots, W / 2, H / 2);
}

function drawMenu() {
  drawBackground();

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 52px "Noto Serif TC", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#ffd700';
  ctx.shadowBlur = 20;
  ctx.fillText('禪音節奏', W / 2, H * 0.28);
  ctx.shadowBlur = 0;

  ctx.font = '18px "Noto Serif TC", serif';
  ctx.fillStyle = '#8888aa';
  ctx.fillText('Zen Rhythm', W / 2, H * 0.35);

  // Floating zen characters
  const time = performance.now() / 2000;
  ctx.globalAlpha = 0.15;
  ctx.font = '48px "Noto Serif TC", serif';
  for (let i = 0; i < 6; i++) {
    const x = W * (0.1 + 0.16 * i) + Math.sin(time + i) * 20;
    const y = H * 0.55 + Math.cos(time + i * 1.3) * 15;
    ctx.fillStyle = SCENES[i % SCENES.length].particleColor;
    ctx.fillText(ZEN_CHARS[i].ch, x, y);
  }
  ctx.globalAlpha = 1;

  ctx.font = '16px "Noto Serif TC", serif';
  ctx.fillStyle = '#aaa';
  ctx.fillText('禪字從天而降，在正確時機擊中它們', W / 2, H * 0.68);

  ctx.font = '14px "Noto Serif TC", serif';
  ctx.fillStyle = '#888';
  ctx.fillText('鍵盤：D F J K  |  觸控/點擊：對應位置', W / 2, H * 0.73);

  // Start button
  const btnW = 200, btnH = 50;
  const btnX = W / 2 - btnW / 2;
  const btnY = H * 0.82 - btnH / 2;
  const pulse = Math.sin(performance.now() / 500) * 0.1 + 0.9;

  ctx.globalAlpha = pulse;
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 2;
  ctx.strokeRect(btnX, btnY, btnW, btnH);
  ctx.fillStyle = 'rgba(255,215,0,0.1)';
  ctx.fillRect(btnX, btnY, btnW, btnH);
  ctx.globalAlpha = 1;

  ctx.font = 'bold 22px "Noto Serif TC", serif';
  ctx.fillStyle = '#ffd700';
  ctx.fillText('開始修行', W / 2, H * 0.82);

  if (playerProgress && playerProgress.consecutiveDays > 0) {
    ctx.font = '15px "Noto Serif TC", serif';
    ctx.fillStyle = '#8888aa';
    const dayText = playerProgress.consecutiveDays > 1
      ? '連續修行第 ' + playerProgress.consecutiveDays + ' 天'
      : '今日修行';
    ctx.fillText(dayText, W / 2, H * 0.42);
  }

  const infoY = H * 0.88;
  ctx.font = '14px "Noto Serif TC", serif';
  ctx.fillStyle = '#666';
  if (bestScore > 0) {
    ctx.fillText('最高分：' + bestScore, W / 2, infoY);
  }

  const totalChars = ZEN_CHARS.length;
  const collected = Object.keys(allCollected).length;
  if (collected > 0) {
    ctx.fillText('禪字蒐集：' + collected + ' / ' + totalChars, W / 2, infoY + 20);
  }

  const achCount = Object.keys(unlockedAchievements).length;
  if (achCount > 0) {
    ctx.fillText('成就：' + achCount + ' / ' + ACHIEVEMENTS.length, W / 2, infoY + 40);
  }
}

function drawPlayingScene() {
  if (shakeIntensity > 0.1) {
    ctx.save();
    ctx.translate(shakeX, shakeY);
  }

  drawBackground();
  drawLanes();
  drawTargetLine();
  drawBeatIndicator();
  drawNotes();
  drawRipples();
  drawParticles();
  drawHUD();
  drawPauseButton();

  if (shakeIntensity > 0.1) {
    ctx.restore();
  }
}

function drawPauseButton() {
  const btnSize = 36;
  const btnX = 20;
  const btnY = 60;

  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath();
  ctx.arc(btnX + btnSize / 2, btnY + btnSize / 2, btnSize / 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(btnX + 12, btnY + 10, 4, 16);
  ctx.fillRect(btnX + 20, btnY + 10, 4, 16);
}

function isPauseButtonHit(x, y) {
  const cx = 38, cy = 78;
  return Math.hypot(x - cx, y - cy) < 22;
}

function drawPaused() {
  drawBackground();
  drawLanes();
  drawTargetLine();
  drawNotes();
  drawHUD();

  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 40px "Noto Serif TC", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('暫停', W / 2, H / 2 - 30);

  ctx.font = '18px "Noto Serif TC", serif';
  ctx.fillStyle = '#aaa';
  ctx.fillText('按 Esc 或點擊繼續', W / 2, H / 2 + 20);
}

function drawGameOver() {
  drawBackground();

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 40px "Noto Serif TC", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('修行結束', W / 2, H * 0.15);

  ctx.font = 'bold 56px "Noto Serif TC", serif';
  ctx.fillStyle = '#ffd700';
  ctx.fillText(Math.floor(score), W / 2, H * 0.28);

  if (score >= bestScore && score > 0) {
    ctx.font = '18px "Noto Serif TC", serif';
    ctx.fillStyle = '#ff88cc';
    ctx.fillText('新紀錄！', W / 2, H * 0.34);
  }

  const stats = [
    { label: '最高連擊', value: maxCombo },
    { label: 'PERFECT', value: perfectCount, color: '#ffd700' },
    { label: 'GOOD', value: goodCount, color: '#88ccff' },
    { label: 'OK', value: okCount, color: '#aaa' },
    { label: 'MISS', value: missCount, color: '#ff4444' },
  ];

  ctx.font = '18px "Noto Serif TC", serif';
  const startY = H * 0.42;
  stats.forEach((s, i) => {
    const y = startY + i * 32;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#888';
    ctx.fillText(s.label, W / 2 - 10, y);
    ctx.textAlign = 'left';
    ctx.fillStyle = s.color || '#fff';
    ctx.fillText(String(s.value), W / 2 + 10, y);
  });

  const total = perfectCount + goodCount + okCount + missCount;
  if (total > 0) {
    const accuracy = ((perfectCount + goodCount + okCount) / total * 100).toFixed(1);
    ctx.font = '16px "Noto Serif TC", serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#aaa';
    ctx.fillText('準確率 ' + accuracy + '%', W / 2, startY + stats.length * 32 + 10);
  }

  if (collectedChars.size > 0) {
    const charsY = H * 0.72;
    ctx.font = '14px "Noto Serif TC", serif';
    ctx.fillStyle = '#888';
    ctx.fillText('本次蒐集的禪字', W / 2, charsY - 20);

    ctx.font = '28px "Noto Serif TC", serif';
    ctx.fillStyle = '#ffd700';
    const chars = Array.from(collectedChars);
    const charSpacing = Math.min(40, (W - 40) / chars.length);
    const charsStartX = W / 2 - (chars.length - 1) * charSpacing / 2;
    chars.forEach((ch, i) => {
      ctx.fillText(ch, charsStartX + i * charSpacing, charsY + 15);
    });
  }

  if (sessionAchievements.length > 0) {
    const achY = H * 0.83;
    ctx.font = '14px "Noto Serif TC", serif';
    ctx.fillStyle = '#888';
    ctx.fillText('本次解鎖成就', W / 2, achY - 15);

    ctx.font = 'bold 16px "Noto Serif TC", serif';
    ctx.fillStyle = '#ffd700';
    sessionAchievements.forEach((ach, i) => {
      ctx.fillText(ach.name + ' — ' + ach.desc, W / 2, achY + 8 + i * 22);
    });
  }

  const pulse = Math.sin(performance.now() / 500) * 0.1 + 0.9;
  ctx.globalAlpha = pulse;
  ctx.font = 'bold 20px "Noto Serif TC", serif';
  ctx.fillStyle = '#ffd700';
  ctx.fillText('點擊或按 Enter 返回', W / 2, H * 0.93);
  ctx.globalAlpha = 1;
}

// --- Main Loop ---
let lastTime = 0;

function gameLoop(timestamp) {
  requestAnimationFrame(gameLoop);

  const dtMs = lastTime ? Math.min(timestamp - lastTime, 50) : 16.67;
  const dtSec = dtMs / 1000;
  lastTime = timestamp;

  if (state === STATE.LOADING) {
    drawLoadingScreen();
    return;
  }

  if (state === STATE.MENU) {
    drawMenu();
    return;
  }

  if (state === STATE.GAMEOVER) {
    drawGameOver();
    return;
  }

  if (state === STATE.PAUSED) {
    drawPaused();
    return;
  }

  if (state !== STATE.PLAYING) return;

  // --- Update ---
  gameTime += dtMs;

  // BPM acceleration
  const elapsed = (timestamp - startTime) / 1000;
  bpm = 80 + elapsed * 0.3;
  bpm = Math.min(bpm, 200);
  beatInterval = 60000 / bpm;

  // Beat indicator phase (0 to 1 between beats)
  const timeSinceLastBeat = timestamp - lastBeatTime;
  beatIndicatorPhase = Math.min(1, timeSinceLastBeat / beatInterval);

  // Spawn notes on beat
  if (timestamp - lastBeatTime >= beatInterval) {
    lastBeatTime = timestamp;
    spawnNote();
    playBeatTick();
    beatPulse = 1;
    beatIndicatorPhase = 0;

    if (bpm > 120 && Math.random() < 0.3) {
      spawnNote();
    }
    if (bpm > 160 && Math.random() < 0.4) {
      spawnNote();
    }
  }

  // Decay beat pulse
  beatPulse *= 0.92;

  // Update timers (time-based)
  if (hitFeedback && hitFeedback.timer > 0) hitFeedback.timer -= dtSec;
  if (meaningDisplay && meaningDisplay.timer > 0) meaningDisplay.timer -= dtSec;
  if (milestoneDisplay && milestoneDisplay.timer > 0) milestoneDisplay.timer -= dtSec;
  if (achievementPopup && achievementPopup.timer > 0) achievementPopup.timer -= dtSec;

  updateNotes(dtSec);
  updateParticles(dtSec);
  updateRipples(dtSec);
  updateShake();

  // --- Draw ---
  drawPlayingScene();
}

// --- Init ---
function init() {
  initCanvas();
  initParticlePool();
  initRipples();
  initInput();
  loadBestScore();
  loadCollection();
  loadAchievements();
  loadProgress();
  state = STATE.MENU;
  requestAnimationFrame(gameLoop);
}

// Pre-init: show loading screen while fonts load
function preInit() {
  const tempCanvas = document.getElementById('game');
  const tempCtx = tempCanvas.getContext('2d');
  const tempW = window.innerWidth;
  const tempH = window.innerHeight;
  const tempDpr = Math.min(window.devicePixelRatio || 1, 2);
  tempCanvas.width = tempW * tempDpr;
  tempCanvas.height = tempH * tempDpr;
  tempCanvas.style.width = tempW + 'px';
  tempCanvas.style.height = tempH + 'px';
  tempCtx.setTransform(tempDpr, 0, 0, tempDpr, 0, 0);

  const grad = tempCtx.createLinearGradient(0, 0, 0, tempH);
  grad.addColorStop(0, '#0a0a12');
  grad.addColorStop(1, '#1a1a2e');
  tempCtx.fillStyle = grad;
  tempCtx.fillRect(0, 0, tempW, tempH);
  tempCtx.fillStyle = '#8888aa';
  tempCtx.font = '18px sans-serif';
  tempCtx.textAlign = 'center';
  tempCtx.textBaseline = 'middle';
  tempCtx.fillText('載入中...', tempW / 2, tempH / 2);
}

if (document.fonts && document.fonts.ready) {
  preInit();
  document.fonts.ready.then(init);
} else {
  window.addEventListener('load', init);
}

})();
