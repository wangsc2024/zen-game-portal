/**
 * 禪意水墨 - Zen Ink Flow
 *
 * 水墨風格的動作收集遊戲：引導墨滴穿越禪境，收集散落的禪字。
 *
 * 品質標準：
 * - [P0] requestAnimationFrame 遊戲循環 + deltaTime
 * - [P0] 完整狀態機（MENU → PLAYING → PAUSED → GAMEOVER）
 * - [P0] 鍵盤 + 滑鼠 + 觸控三種輸入
 * - [P0] 紙紋理預渲染（OffscreenCanvas）+ HUD 元素引用快取
 * - [P1] 粒子/軌跡標記回收（避免 splice GC 壓力）
 * - [P1] 特殊禪字道具系統（護盾、磁鐵、墨泉）
 * - [P1] 墨量低警告 + 近失回饋
 * - [P2] Combo 視覺升級 + 里程碑通知
 * - [P2] 收集禪字浮動字義展示
 * - [P2] 背景漸進色調變化（旅程感）
 * - [P2] 連續天數 + 成就系統（原子習慣四法則）
 * - [P2] Esc / 空白鍵暫停 + 暫停覆蓋層
 */

;(function () {
  'use strict';

  // ====== 常數 ======
  var STORAGE_KEY = 'zenInkFlow_progress';
  var INK_MAX = 100;
  var INK_DRAIN_RATE = 2.5;       // 每秒消耗
  var INK_GAIN_PER_CHAR = 15;     // 收集禪字回復
  var PLAYER_RADIUS = 12;
  var CHAR_RADIUS = 18;
  var OBSTACLE_MIN_R = 10;
  var OBSTACLE_MAX_R = 25;
  var PLAYER_SPEED = 4.5;
  var MAX_PARTICLES = 80;
  var MAX_TRAIL = 80;
  var SPAWN_INTERVAL_CHAR = 1800;   // ms
  var SPAWN_INTERVAL_OBS = 1200;    // ms
  var SCROLL_SPEED_BASE = 1.2;
  var SCROLL_SPEED_INCREMENT = 0.08; // 每 10 分加速
  var COMBO_WINDOW = 2.0;           // 秒
  var NEAR_MISS_THRESHOLD = 1.6;    // 近失閾值倍率

  // 特殊禪字道具類型
  var POWERUP_TYPES = {
    shield:  { ch: '盾', meaning: '金剛護盾', duration: 5, color: '#4a90d9' },
    magnet:  { ch: '引', meaning: '禪字磁吸', duration: 6, color: '#d4a35a' },
    inkwell: { ch: '泉', meaning: '墨泉湧現', color: '#3d6b3d' }
  };

  // 里程碑定義
  var MILESTONES = [
    { score: 50,  text: '入門', quote: '千里之行，始於足下' },
    { score: 100, text: '初悟', quote: '心生萬法，法歸一心' },
    { score: 200, text: '漸修', quote: '功夫不負有心人' },
    { score: 350, text: '頓悟', quote: '一念覺即是佛' },
    { score: 500, text: '圓融', quote: '萬法歸一，一歸何處' }
  ];

  // ====== 禪字資料 ======
  var ZEN_CHARS = [
    { ch: '禪', meaning: '靜慮' },
    { ch: '空', meaning: '本空' },
    { ch: '靜', meaning: '寧靜' },
    { ch: '悟', meaning: '覺悟' },
    { ch: '定', meaning: '禪定' },
    { ch: '慧', meaning: '智慧' },
    { ch: '淨', meaning: '清淨' },
    { ch: '明', meaning: '光明' },
    { ch: '心', meaning: '真心' },
    { ch: '道', meaning: '大道' },
    { ch: '德', meaning: '德行' },
    { ch: '忍', meaning: '忍辱' },
    { ch: '善', meaning: '至善' },
    { ch: '覺', meaning: '覺察' },
    { ch: '如', meaning: '如是' },
    { ch: '真', meaning: '真如' },
    { ch: '願', meaning: '大願' },
    { ch: '行', meaning: '修行' },
    { ch: '法', meaning: '佛法' },
    { ch: '念', meaning: '正念' }
  ];

  var ZEN_QUOTES = [
    '「心如止水，鑑照萬物」',
    '「一花一世界，一葉一如來」',
    '「見山是山，見水是水」',
    '「菩提本無樹，明鏡亦非台」',
    '「應無所住而生其心」',
    '「凡所有相，皆是虛妄」',
    '「心無罣礙，無罣礙故」',
    '「色即是空，空即是色」',
    '「萬法歸一，一歸何處」',
    '「直心是道場」'
  ];

  // ====== 成就定義 ======
  var ACHIEVEMENTS = [
    { id: 'first_play', name: '初試墨池', desc: '首次遊玩', check: function(p) { return p.totalGames >= 1; } },
    { id: 'collect_10', name: '拾字', desc: '單局收集 10 個禪字', check: function(_, g) { return g.charsCollected >= 10; } },
    { id: 'collect_25', name: '識字', desc: '單局收集 25 個禪字', check: function(_, g) { return g.charsCollected >= 25; } },
    { id: 'combo_5', name: '行雲', desc: '達成 5 連收', check: function(_, g) { return g.bestCombo >= 5; } },
    { id: 'combo_10', name: '流水', desc: '達成 10 連收', check: function(_, g) { return g.bestCombo >= 10; } },
    { id: 'score_100', name: '墨韻', desc: '單局 100 分', check: function(_, g) { return g.score >= 100; } },
    { id: 'score_300', name: '墨境', desc: '單局 300 分', check: function(_, g) { return g.score >= 300; } },
    { id: 'streak_3', name: '三日不輟', desc: '連續 3 天遊玩', check: function(p) { return p.streak >= 3; } },
    { id: 'streak_7', name: '七日精進', desc: '連續 7 天遊玩', check: function(p) { return p.streak >= 7; } },
    { id: 'total_10', name: '十局經驗', desc: '累計 10 局', check: function(p) { return p.totalGames >= 10; } },
    { id: 'near_miss_5', name: '險中求安', desc: '累計 5 次近失', check: function(_, g) { return g.nearMissCount >= 5; } },
    { id: 'powerup_3', name: '法寶具足', desc: '單局收集 3 個道具', check: function(_, g) { return g.powerupsCollected >= 3; } },
    { id: 'milestone_3', name: '三境通達', desc: '單局達到第 3 個里程碑', check: function(_, g) { return g.milestonesReached >= 3; } }
  ];

  // ====== 狀態機 ======
  var State = { MENU: 'menu', PLAYING: 'playing', PAUSED: 'paused', GAMEOVER: 'gameover' };
  var gameState = State.MENU;

  // ====== Canvas ======
  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var W, H;

  // === P0 修正：紙紋理預渲染 ===
  var paperTextureCanvas = null;

  function createPaperTexture(w, h) {
    paperTextureCanvas = document.createElement('canvas');
    paperTextureCanvas.width = w;
    paperTextureCanvas.height = h;
    var tCtx = paperTextureCanvas.getContext('2d');
    // 底色
    tCtx.fillStyle = '#f5f0e8';
    tCtx.fillRect(0, 0, w, h);
    // 紙紋（一次性繪製）
    tCtx.globalAlpha = 0.025;
    tCtx.fillStyle = '#c4b89a';
    for (var n = 0; n < 200; n++) {
      var nx = Math.random() * w;
      var ny = Math.random() * h;
      tCtx.fillRect(nx | 0, ny | 0, 1 + Math.random() * 3 | 0, 1);
    }
    // 加一些長纖維線條
    tCtx.globalAlpha = 0.015;
    tCtx.strokeStyle = '#c4b89a';
    tCtx.lineWidth = 0.5;
    for (var f = 0; f < 15; f++) {
      tCtx.beginPath();
      var fx = Math.random() * w;
      var fy = Math.random() * h;
      tCtx.moveTo(fx, fy);
      tCtx.lineTo(fx + (Math.random() - 0.5) * 80, fy + (Math.random() - 0.5) * 20);
      tCtx.stroke();
    }
  }

  // === P0 修正：HUD DOM 元素引用快取 ===
  var hudEls = {};

  function cacheHudElements() {
    hudEls.score = document.getElementById('hudScore');
    hudEls.chars = document.getElementById('hudChars');
    hudEls.combo = document.getElementById('hudCombo');
    hudEls.hud = document.getElementById('hud');
    hudEls.menuOverlay = document.getElementById('menuOverlay');
    hudEls.pauseOverlay = document.getElementById('pauseOverlay');
    hudEls.gameoverOverlay = document.getElementById('gameoverOverlay');
    hudEls.startBtn = document.getElementById('startBtn');
    hudEls.pauseBtn = document.getElementById('pauseBtn');
    hudEls.resumeBtn = document.getElementById('resumeBtn');
    hudEls.quitBtn = document.getElementById('quitBtn');
    hudEls.retryBtn = document.getElementById('retryBtn');
    hudEls.menuBtn = document.getElementById('menuBtn');
    hudEls.menuStats = document.getElementById('menuStats');
    hudEls.streakBadge = document.getElementById('streakBadge');
    hudEls.controlHint = document.getElementById('controlHint');
    hudEls.goTitle = document.getElementById('goTitle');
    hudEls.goScore = document.getElementById('goScore');
    hudEls.goStats = document.getElementById('goStats');
    hudEls.goRecord = document.getElementById('goRecord');
    hudEls.goQuote = document.getElementById('goQuote');
  }

  var resizeTimer = null;
  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;
    createPaperTexture(W, H);
  }
  window.addEventListener('resize', function() {
    // 防抖：避免高頻 resize 重建紙紋理
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() { createPaperTexture(W, H); }, 150);
  });
  resize();

  // ====== 音效系統 ======
  var AudioCtx = window.AudioContext || window.webkitAudioContext;
  var audioCtx = null;

  function initAudio() {
    if (!audioCtx && AudioCtx) audioCtx = new AudioCtx();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }

  function playTone(freq, dur, type, vol) {
    if (!audioCtx) return;
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol || 0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
  }

  function playCollect(combo) {
    var baseFreq = 440 + Math.min(combo, 15) * 30;
    playTone(baseFreq, 0.15, 'sine', 0.12);
    setTimeout(function() { playTone(baseFreq * 1.25, 0.12, 'sine', 0.08); }, 60);
  }

  function playHit() {
    playTone(150, 0.2, 'sawtooth', 0.15);
  }

  function playGameOver() {
    playTone(330, 0.2, 'sine', 0.12);
    setTimeout(function() { playTone(262, 0.3, 'sine', 0.1); }, 150);
    setTimeout(function() { playTone(196, 0.5, 'sine', 0.08); }, 350);
  }

  function playNearMiss() {
    playTone(600, 0.08, 'sine', 0.06);
    setTimeout(function() { playTone(800, 0.06, 'sine', 0.04); }, 40);
  }

  function playPowerup() {
    playTone(523, 0.1, 'sine', 0.1);
    setTimeout(function() { playTone(659, 0.1, 'sine', 0.1); }, 80);
    setTimeout(function() { playTone(784, 0.15, 'sine', 0.08); }, 160);
  }

  function playMilestone() {
    playTone(392, 0.15, 'sine', 0.12);
    setTimeout(function() { playTone(523, 0.15, 'sine', 0.1); }, 120);
    setTimeout(function() { playTone(659, 0.15, 'sine', 0.1); }, 240);
    setTimeout(function() { playTone(784, 0.3, 'sine', 0.08); }, 360);
  }

  function playInkWarning() {
    playTone(220, 0.08, 'sawtooth', 0.04);
  }

  // ====== 持久化 ======
  function getDefaultProgress() {
    return {
      totalGames: 0,
      highScore: 0,
      bestChars: 0,
      bestCombo: 0,
      streak: 0,
      lastPlayDate: null,
      achievements: [],
      totalCharsCollected: 0
    };
  }

  var progress = getDefaultProgress();

  function loadProgress() {
    try {
      var d = localStorage.getItem(STORAGE_KEY);
      if (d) {
        var p = JSON.parse(d);
        var def = getDefaultProgress();
        for (var k in def) {
          if (!(k in p)) p[k] = def[k];
        }
        progress = p;
      }
    } catch (e) {
      progress = getDefaultProgress();
    }
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch (e) { /* silent */ }
  }

  function getTodayStr() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function updateStreak() {
    var today = getTodayStr();
    if (progress.lastPlayDate === today) return;

    if (progress.lastPlayDate) {
      var last = new Date(progress.lastPlayDate);
      var now = new Date(today);
      var diff = Math.floor((now - last) / 86400000);
      if (diff === 1) {
        progress.streak++;
      } else if (diff > 1) {
        progress.streak = 1;
      }
    } else {
      progress.streak = 1;
    }
    progress.lastPlayDate = today;
  }

  // ====== 遊戲物件 ======
  var player = { x: 0, y: 0, vx: 0, vy: 0, ink: INK_MAX, trail: [] };
  var zenChars = [];     // { x, y, ch, meaning, alpha, collected, timer, bobPhase, isPowerup?, powerupType?, alive }
  var obstacles = [];    // { x, y, r, type, rotation, alive }
  var particles = [];    // { x, y, vx, vy, life, maxLife, size, color, alpha, alive }
  var floatingTexts = []; // { x, y, text, alpha, vy, size, color, alive }

  // 遊戲狀態
  var game = {
    score: 0,
    charsCollected: 0,
    combo: 0,
    bestCombo: 0,
    comboTimer: 0,
    scrollSpeed: SCROLL_SPEED_BASE,
    lastCharSpawn: 0,
    lastObsSpawn: 0,
    elapsed: 0,
    difficulty: 1,
    nearMissCount: 0,
    nearMissFlash: 0,
    powerupsCollected: 0,
    milestonesReached: 0,
    nextMilestoneIdx: 0,
    milestoneNotification: null,
    // 道具效果
    shieldTimer: 0,
    magnetTimer: 0,
    // 墨量警告
    inkWarningTimer: 0,
    inkWarningPulse: 0,
    // 螢幕震動
    shakeTimer: 0,
    shakeIntensity: 0,
    // 背景色調
    bgHueShift: 0,
    // combo 視覺等級
    comboTier: 0  // 0=無, 1=行雲(3+), 2=流水(6+), 3=山河(10+)
  };

  // 輸入狀態
  var input = { left: false, right: false, up: false, down: false, mouseX: -1, mouseY: -1, mouseActive: false };

  // 背景山水元素（預生成）
  var mountains = [];
  var clouds = [];

  // ====== 粒子系統（標記回收優化） ======
  var particlePool = [];

  function getParticle() {
    // 先從池中找到已死亡的粒子
    for (var i = 0; i < particles.length; i++) {
      if (!particles[i].alive) return particles[i];
    }
    // 超過上限不新增
    if (particles.length >= MAX_PARTICLES) return null;
    // 新建
    var p = { x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 0, color: '', alpha: 0, alive: false };
    particles.push(p);
    return p;
  }

  function spawnParticles(x, y, count, color) {
    for (var i = 0; i < count; i++) {
      var p = getParticle();
      if (!p) break;
      var angle = Math.random() * Math.PI * 2;
      var speed = 1 + Math.random() * 3;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.life = 1;
      p.maxLife = 1;
      p.size = 2 + Math.random() * 4;
      p.color = color || '#3d3425';
      p.alpha = 0.8;
      p.alive = true;
    }
  }

  function spawnDirectionalParticles(x, y, count, color, dirX, dirY) {
    for (var i = 0; i < count; i++) {
      var p = getParticle();
      if (!p) break;
      var spread = 0.6;
      var speed = 2 + Math.random() * 3;
      p.x = x;
      p.y = y;
      p.vx = dirX * speed + (Math.random() - 0.5) * spread * speed;
      p.vy = dirY * speed + (Math.random() - 0.5) * spread * speed;
      p.life = 1;
      p.maxLife = 1;
      p.size = 1.5 + Math.random() * 3;
      p.color = color || '#c4a35a';
      p.alpha = 0.7;
      p.alive = true;
    }
  }

  function updateParticles(dt) {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      if (!p.alive) continue;
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.life -= dt * 2;
      p.alpha = Math.max(0, p.life / p.maxLife * 0.8);
      if (p.life <= 0) {
        p.alive = false;
      }
    }
  }

  // ====== 浮動文字系統（標記回收優化）======
  var MAX_FLOATING_TEXTS = 20;

  function spawnFloatingText(x, y, text, color, size) {
    // 先找已死亡的插槽
    for (var i = 0; i < floatingTexts.length; i++) {
      if (!floatingTexts[i].alive) {
        var ft = floatingTexts[i];
        ft.x = x; ft.y = y; ft.text = text;
        ft.alpha = 1; ft.vy = -1.5;
        ft.size = size || 16; ft.color = color || '#c4a35a';
        ft.life = 1.5; ft.alive = true;
        return;
      }
    }
    if (floatingTexts.length < MAX_FLOATING_TEXTS) {
      floatingTexts.push({
        x: x, y: y, text: text,
        alpha: 1, vy: -1.5,
        size: size || 16,
        color: color || '#c4a35a',
        life: 1.5, alive: true
      });
    }
  }

  function updateFloatingTexts(dt) {
    for (var i = 0; i < floatingTexts.length; i++) {
      var ft = floatingTexts[i];
      if (!ft.alive) continue;
      ft.y += ft.vy * dt * 60;
      ft.life -= dt;
      ft.alpha = Math.max(0, ft.life / 1.5);
      if (ft.life <= 0) {
        ft.alive = false;
      }
    }
  }

  // ====== 背景生成 ======
  function generateBackground() {
    mountains = [];
    for (var i = 0; i < 8; i++) {
      mountains.push({
        x: Math.random() * W * 2,
        baseY: H * 0.5 + Math.random() * H * 0.3,
        width: 100 + Math.random() * 200,
        height: 80 + Math.random() * 150,
        layer: Math.floor(Math.random() * 3),
        alpha: 0.03 + Math.random() * 0.06
      });
    }
    clouds = [];
    for (var j = 0; j < 5; j++) {
      clouds.push({
        x: Math.random() * W * 2,
        y: 30 + Math.random() * H * 0.3,
        width: 60 + Math.random() * 120,
        height: 20 + Math.random() * 40,
        speed: 0.1 + Math.random() * 0.3,
        alpha: 0.03 + Math.random() * 0.05
      });
    }
  }

  // ====== 禪字生成（標記回收優化）======
  var MAX_ZEN_CHARS = 30;

  function getZenCharSlot() {
    for (var i = 0; i < zenChars.length; i++) {
      if (!zenChars[i].alive) return zenChars[i];
    }
    if (zenChars.length >= MAX_ZEN_CHARS) return null;
    var slot = { x: 0, y: 0, ch: '', meaning: '', alpha: 0, collected: false,
      timer: 0, bobPhase: 0, isPowerup: false, powerupType: '', glowColor: '', alive: false };
    zenChars.push(slot);
    return slot;
  }

  function spawnZenChar() {
    var slot = getZenCharSlot();
    if (!slot) return;

    var margin = 40;
    var isPowerup = game.score >= 30 && Math.random() < 0.10;

    slot.x = W + margin;
    slot.y = margin + Math.random() * (H - margin * 2);
    slot.alpha = 0;
    slot.collected = false;
    slot.timer = 0;
    slot.bobPhase = Math.random() * Math.PI * 2;
    slot._nearMissTriggered = false;

    if (isPowerup) {
      var types = Object.keys(POWERUP_TYPES);
      var typeKey = types[(Math.random() * types.length) | 0];
      var ptype = POWERUP_TYPES[typeKey];
      slot.ch = ptype.ch;
      slot.meaning = ptype.meaning;
      slot.isPowerup = true;
      slot.powerupType = typeKey;
      slot.glowColor = ptype.color;
    } else {
      var zen = ZEN_CHARS[(Math.random() * ZEN_CHARS.length) | 0];
      slot.ch = zen.ch;
      slot.meaning = zen.meaning;
      slot.isPowerup = false;
      slot.powerupType = '';
      slot.glowColor = '';
    }
    slot.alive = true;
  }

  // ====== 障礙物生成（標記回收優化）======
  var MAX_OBSTACLES = 30;

  function getObstacleSlot() {
    for (var i = 0; i < obstacles.length; i++) {
      if (!obstacles[i].alive) return obstacles[i];
    }
    if (obstacles.length >= MAX_OBSTACLES) return null;
    var slot = { x: 0, y: 0, r: 0, type: '', rotation: 0, alive: false, _nearMissTriggered: false };
    obstacles.push(slot);
    return slot;
  }

  function spawnObstacle() {
    var slot = getObstacleSlot();
    if (!slot) return;
    var r = OBSTACLE_MIN_R + Math.random() * (OBSTACLE_MAX_R - OBSTACLE_MIN_R);
    var margin = 30;
    slot.x = W + margin + r;
    slot.y = margin + Math.random() * (H - margin * 2);
    slot.r = r;
    slot.type = Math.random() < 0.5 ? 'rock' : 'branch';
    slot.rotation = Math.random() * Math.PI * 2;
    slot.alive = true;
    slot._nearMissTriggered = false;
  }

  // ====== 輔助：hex 轉 RGB 字串 ======
  function hexToRgba(hex) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return r + ',' + g + ',' + b;
  }

  // ====== 碰撞偵測 (圓形) ======
  function circleCollide(x1, y1, r1, x2, y2, r2) {
    var dx = x1 - x2;
    var dy = y1 - y2;
    var dist = dx * dx + dy * dy;
    var rSum = r1 + r2;
    return dist < rSum * rSum;
  }

  function circleDistance(x1, y1, x2, y2) {
    var dx = x1 - x2;
    var dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ====== 遊戲初始化 ======
  function initGame() {
    player.x = W * 0.2;
    player.y = H * 0.5;
    player.vx = 0;
    player.vy = 0;
    player.ink = INK_MAX;
    player.trail = [];

    // 標記回收式重置（避免重新分配陣列）
    for (var zi = 0; zi < zenChars.length; zi++) zenChars[zi].alive = false;
    for (var oi = 0; oi < obstacles.length; oi++) obstacles[oi].alive = false;
    for (var pi = 0; pi < particles.length; pi++) particles[pi].alive = false;
    for (var fi = 0; fi < floatingTexts.length; fi++) floatingTexts[fi].alive = false;

    game.score = 0;
    game.charsCollected = 0;
    game.combo = 0;
    game.bestCombo = 0;
    game.comboTimer = 0;
    game.scrollSpeed = SCROLL_SPEED_BASE;
    game.lastCharSpawn = 0;
    game.lastObsSpawn = 0;
    game.elapsed = 0;
    game.difficulty = 1;
    game.nearMissCount = 0;
    game.nearMissFlash = 0;
    game.powerupsCollected = 0;
    game.milestonesReached = 0;
    game.nextMilestoneIdx = 0;
    game.milestoneNotification = null;
    game.shieldTimer = 0;
    game.magnetTimer = 0;
    game.inkWarningTimer = 0;
    game.inkWarningPulse = 0;
    game.shakeTimer = 0;
    game.shakeIntensity = 0;
    game.bgHueShift = 0;
    game.comboTier = 0;

    generateBackground();

    // 預生成一些禪字（使用標記回收機制）
    for (var i = 0; i < 3; i++) {
      var zen = ZEN_CHARS[(Math.random() * ZEN_CHARS.length) | 0];
      var slot = getZenCharSlot();
      if (slot) {
        slot.x = W * 0.4 + Math.random() * W * 0.5;
        slot.y = 60 + Math.random() * (H - 120);
        slot.ch = zen.ch; slot.meaning = zen.meaning;
        slot.alpha = 1; slot.collected = false; slot.timer = 0;
        slot.bobPhase = Math.random() * Math.PI * 2;
        slot.isPowerup = false; slot.powerupType = ''; slot.glowColor = '';
        slot.alive = true;
      }
    }
  }

  // ====== 更新邏輯 ======
  function update(dt) {
    if (gameState !== State.PLAYING) return;

    game.elapsed += dt;

    // 難度漸進（每 15 秒提升）
    game.difficulty = 1 + Math.floor(game.elapsed / 15) * 0.15;
    game.scrollSpeed = SCROLL_SPEED_BASE + Math.floor(game.score / 10) * SCROLL_SPEED_INCREMENT;

    // 背景色調漸變（旅程感）
    game.bgHueShift = Math.min(0.12, game.score / 500 * 0.12);

    // === 玩家移動 ===
    var targetVX = 0, targetVY = 0;
    var accel = 0.3;

    if (input.mouseActive) {
      var dx = input.mouseX - player.x;
      var dy = input.mouseY - player.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 5) {
        targetVX = (dx / dist) * PLAYER_SPEED;
        targetVY = (dy / dist) * PLAYER_SPEED;
      }
    } else {
      if (input.left) targetVX -= PLAYER_SPEED;
      if (input.right) targetVX += PLAYER_SPEED;
      if (input.up) targetVY -= PLAYER_SPEED;
      if (input.down) targetVY += PLAYER_SPEED;
      // 正規化對角線
      if (targetVX !== 0 && targetVY !== 0) {
        var norm = Math.sqrt(targetVX * targetVX + targetVY * targetVY);
        targetVX = (targetVX / norm) * PLAYER_SPEED;
        targetVY = (targetVY / norm) * PLAYER_SPEED;
      }
    }

    player.vx += (targetVX - player.vx) * accel;
    player.vy += (targetVY - player.vy) * accel;
    player.x += player.vx * dt * 60;
    player.y += player.vy * dt * 60;

    // 邊界限制
    var margin = PLAYER_RADIUS;
    if (player.x < margin) player.x = margin;
    if (player.x > W - margin) player.x = W - margin;
    if (player.y < margin) player.y = margin;
    if (player.y > H - margin) player.y = H - margin;

    // 墨跡軌跡（標記回收）
    var speed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
    if (speed > 0.5) {
      // 找一個已死亡的軌跡點或新建
      var added = false;
      for (var ti = 0; ti < player.trail.length; ti++) {
        if (player.trail[ti].alpha <= 0) {
          player.trail[ti].x = player.x | 0;
          player.trail[ti].y = player.y | 0;
          player.trail[ti].alpha = 0.4;
          player.trail[ti].size = PLAYER_RADIUS * 0.6;
          added = true;
          break;
        }
      }
      if (!added && player.trail.length < MAX_TRAIL) {
        player.trail.push({ x: player.x | 0, y: player.y | 0, alpha: 0.4, size: PLAYER_RADIUS * 0.6 });
      }
    }
    // 軌跡淡出
    for (var t = 0; t < player.trail.length; t++) {
      if (player.trail[t].alpha > 0) {
        player.trail[t].alpha -= dt * 0.8;
        player.trail[t].size *= (1 - dt * 0.5);
      }
    }

    // === 墨量消耗 ===
    player.ink -= INK_DRAIN_RATE * dt;

    // 墨量低警告
    if (player.ink <= 30 && player.ink > 0) {
      game.inkWarningPulse += dt * 4;
      game.inkWarningTimer += dt;
      if (game.inkWarningTimer > 1.5) {
        game.inkWarningTimer = 0;
        playInkWarning();
      }
    } else {
      game.inkWarningPulse = 0;
      game.inkWarningTimer = 0;
    }

    if (player.ink <= 0) {
      player.ink = 0;
      onGameOver();
      return;
    }

    // === 道具效果倒數 ===
    if (game.shieldTimer > 0) game.shieldTimer -= dt;
    if (game.magnetTimer > 0) game.magnetTimer -= dt;

    // === 螢幕震動倒數 ===
    if (game.shakeTimer > 0) game.shakeTimer -= dt;

    // === 近失閃光衰減（使用 dt 確保跨幀率一致性）===
    if (game.nearMissFlash > 0) game.nearMissFlash -= dt;

    // === 滾動 ===
    var scrollDelta = game.scrollSpeed * dt * 60;

    // === 禪字更新 ===
    game.lastCharSpawn += dt * 1000;
    var charInterval = SPAWN_INTERVAL_CHAR / game.difficulty;
    if (game.lastCharSpawn >= charInterval) {
      game.lastCharSpawn = 0;
      spawnZenChar();
    }

    for (var i = 0; i < zenChars.length; i++) {
      var zc = zenChars[i];
      if (!zc.alive) continue;
      zc.x -= scrollDelta;
      zc.timer += dt;
      zc.bobPhase += dt * 2;
      if (zc.alpha < 1 && !zc.collected) zc.alpha = Math.min(1, zc.alpha + dt * 3);

      // 磁吸效果：道具啟動時禪字自動靠近
      if (game.magnetTimer > 0 && !zc.collected && !zc.isPowerup) {
        var magDist = circleDistance(player.x, player.y, zc.x, zc.y);
        if (magDist < 150) {
          var magForce = (150 - magDist) / 150 * 3;
          var magDx = player.x - zc.x;
          var magDy = player.y - zc.y;
          var magNorm = Math.sqrt(magDx * magDx + magDy * magDy) || 1;
          zc.x += (magDx / magNorm) * magForce * dt * 60;
          zc.y += (magDy / magNorm) * magForce * dt * 60;
        }
      }

      if (zc.collected) {
        zc.alpha -= dt * 3;
        if (zc.alpha <= 0) { zc.alive = false; continue; }
      } else {
        // 碰撞檢測
        if (circleCollide(player.x, player.y, PLAYER_RADIUS, zc.x, zc.y + Math.sin(zc.bobPhase) * 4, CHAR_RADIUS)) {
          zc.collected = true;
          if (zc.isPowerup) {
            onCollectPowerup(zc);
          } else {
            onCollectChar(zc);
          }
        }
      }

      if (zc.x < -50) { zc.alive = false; }
    }

    // === 障礙物更新 ===
    game.lastObsSpawn += dt * 1000;
    var obsInterval = SPAWN_INTERVAL_OBS / game.difficulty;
    if (game.lastObsSpawn >= obsInterval) {
      game.lastObsSpawn = 0;
      spawnObstacle();
    }

    for (var j = 0; j < obstacles.length; j++) {
      var obs = obstacles[j];
      if (!obs.alive) continue;
      obs.x -= scrollDelta;
      obs.rotation += dt * 0.5;

      var obsDist = circleDistance(player.x, player.y, obs.x, obs.y);
      var hitR = PLAYER_RADIUS * 0.7 + obs.r;

      // 碰撞檢測
      if (obsDist < hitR) {
        if (game.shieldTimer > 0) {
          spawnParticles(obs.x, obs.y, 8, '#4a90d9');
          spawnFloatingText(obs.x, obs.y - 20, '護盾擋住！', '#4a90d9', 14);
          obs.alive = false;
          continue;
        }
        onHitObstacle(obs);
        obs.alive = false;
        continue;
      }

      // 近失偵測
      var nearMissR = hitR * NEAR_MISS_THRESHOLD;
      if (obsDist < nearMissR && obsDist >= hitR) {
        if (!obs._nearMissTriggered) {
          obs._nearMissTriggered = true;
          onNearMiss(obs);
        }
      }

      if (obs.x < -50) { obs.alive = false; }
    }

    // === Combo 計時器 ===
    if (game.combo > 0) {
      game.comboTimer -= dt;
      if (game.comboTimer <= 0) {
        game.combo = 0;
        game.comboTier = 0;
      }
    }

    // Combo 視覺等級
    if (game.combo >= 10) game.comboTier = 3;
    else if (game.combo >= 6) game.comboTier = 2;
    else if (game.combo >= 3) game.comboTier = 1;
    else game.comboTier = 0;

    // === 里程碑檢測 ===
    if (game.nextMilestoneIdx < MILESTONES.length) {
      var ms = MILESTONES[game.nextMilestoneIdx];
      if (game.score >= ms.score) {
        game.milestonesReached++;
        game.nextMilestoneIdx++;
        onMilestone(ms);
      }
    }

    // 里程碑通知倒數
    if (game.milestoneNotification) {
      game.milestoneNotification.timer -= dt;
      if (game.milestoneNotification.timer <= 0) {
        game.milestoneNotification = null;
      }
    }

    // === 背景滾動 ===
    for (var m = 0; m < mountains.length; m++) {
      mountains[m].x -= scrollDelta * (0.2 + mountains[m].layer * 0.15);
      if (mountains[m].x + mountains[m].width < 0) {
        mountains[m].x = W + Math.random() * 200;
        mountains[m].baseY = H * 0.5 + Math.random() * H * 0.3;
      }
    }
    for (var c = 0; c < clouds.length; c++) {
      clouds[c].x -= scrollDelta * clouds[c].speed;
      if (clouds[c].x + clouds[c].width < 0) {
        clouds[c].x = W + Math.random() * 200;
        clouds[c].y = 30 + Math.random() * H * 0.3;
      }
    }

    // === 粒子 ===
    updateParticles(dt);

    // === 浮動文字 ===
    updateFloatingTexts(dt);

    // === HUD 更新 ===
    updateHUD();
  }

  function onCollectChar(zc) {
    game.charsCollected++;
    game.combo++;
    game.comboTimer = COMBO_WINDOW;
    if (game.combo > game.bestCombo) game.bestCombo = game.combo;

    var comboMultiplier = 1 + Math.floor(game.combo / 3) * 0.5;
    var points = Math.round(5 * comboMultiplier);
    game.score += points;

    player.ink = Math.min(INK_MAX, player.ink + INK_GAIN_PER_CHAR);

    playCollect(game.combo);
    spawnParticles(zc.x, zc.y, 8, '#5a4e3c');

    // 浮動展示字義
    spawnFloatingText(zc.x, zc.y - 25, zc.ch + ' - ' + zc.meaning, '#3d3425', 18);
    // 分數浮動
    spawnFloatingText(zc.x + 20, zc.y - 10, '+' + points, '#c4a35a', 14);

    // Combo 高等級特效
    if (game.combo >= 10) {
      spawnParticles(player.x, player.y, 15, '#c4a35a');
      game.shakeTimer = 0.1;
      game.shakeIntensity = 3;
    } else if (game.combo >= 6) {
      spawnParticles(player.x, player.y, 10, '#d4b96a');
    }
  }

  function onCollectPowerup(zc) {
    game.powerupsCollected++;
    game.combo++;
    game.comboTimer = COMBO_WINDOW;
    if (game.combo > game.bestCombo) game.bestCombo = game.combo;

    game.score += 10;
    playPowerup();

    var ptype = POWERUP_TYPES[zc.powerupType];
    spawnParticles(zc.x, zc.y, 12, ptype.color);
    spawnFloatingText(zc.x, zc.y - 25, ptype.meaning + '！', ptype.color, 20);

    switch (zc.powerupType) {
      case 'shield':
        game.shieldTimer = ptype.duration;
        break;
      case 'magnet':
        game.magnetTimer = ptype.duration;
        break;
      case 'inkwell':
        player.ink = INK_MAX;
        spawnFloatingText(player.x, player.y - 30, '墨量全滿！', '#3d6b3d', 16);
        break;
    }
  }

  function onHitObstacle(obs) {
    player.ink -= 15;
    game.combo = 0;
    game.comboTier = 0;
    game.comboTimer = 0;
    playHit();
    spawnParticles(obs.x, obs.y, 6, '#8a7e6b');

    // 螢幕震動
    game.shakeTimer = 0.2;
    game.shakeIntensity = 5;

    spawnFloatingText(obs.x, obs.y - 20, '-15 墨量', '#c44', 14);

    if (player.ink <= 0) {
      player.ink = 0;
      onGameOver();
    }
  }

  function onNearMiss(obs) {
    game.nearMissCount++;
    game.nearMissFlash = 0.3;
    game.score += 2;
    playNearMiss();
    spawnFloatingText(obs.x, obs.y - 30, '險！+2', '#c4a35a', 12);
    // 方向性粒子（從障礙物方向飛開）
    var ndx = player.x - obs.x;
    var ndy = player.y - obs.y;
    var nDist = Math.sqrt(ndx * ndx + ndy * ndy) || 1;
    spawnDirectionalParticles(player.x, player.y, 4, '#c4a35a', ndx / nDist, ndy / nDist);
  }

  function onMilestone(ms) {
    playMilestone();
    game.milestoneNotification = {
      text: ms.text,
      quote: ms.quote,
      score: ms.score,
      timer: 3.0
    };
    spawnParticles(W / 2, H / 2, 20, '#c4a35a');
  }

  function onGameOver() {
    gameState = State.GAMEOVER;
    playGameOver();

    progress.totalGames++;
    progress.totalCharsCollected += game.charsCollected;
    var isNewHigh = game.score > progress.highScore;
    if (isNewHigh) progress.highScore = game.score;
    if (game.charsCollected > progress.bestChars) progress.bestChars = game.charsCollected;
    if (game.bestCombo > progress.bestCombo) progress.bestCombo = game.bestCombo;

    updateStreak();
    checkAchievements();
    saveProgress();

    showGameOver(isNewHigh);
  }

  // ====== 成就系統 ======
  function checkAchievements() {
    for (var i = 0; i < ACHIEVEMENTS.length; i++) {
      var ach = ACHIEVEMENTS[i];
      if (progress.achievements.indexOf(ach.id) === -1 && ach.check(progress, game)) {
        progress.achievements.push(ach.id);
        showAchievement(ach);
      }
    }
  }

  function showAchievement(ach) {
    var el = document.createElement('div');
    el.className = 'achievement-notification';
    el.innerHTML = '<div class="ach-icon">\u2728</div>' +
      '<div class="ach-content">' +
      '<div class="ach-title">\u6210\u5c31\u89e3\u9396\uff1a' + ach.name + '</div>' +
      '<div class="ach-desc">' + ach.desc + '</div></div>';
    document.body.appendChild(el);
    setTimeout(function() { el.classList.add('show'); }, 100);
    setTimeout(function() {
      el.classList.remove('show');
      setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 500);
    }, 3000);
  }

  // ====== 繪製 ======
  function render() {
    // 螢幕震動偏移
    var shakeX = 0, shakeY = 0;
    if (game.shakeTimer > 0) {
      shakeX = (Math.random() - 0.5) * game.shakeIntensity * 2;
      shakeY = (Math.random() - 0.5) * game.shakeIntensity * 2;
    }

    ctx.save();
    if (shakeX !== 0 || shakeY !== 0) {
      ctx.translate(shakeX, shakeY);
    }

    // P0 優化：使用預渲染的紙紋理
    if (paperTextureCanvas) {
      ctx.drawImage(paperTextureCanvas, 0, 0);
    } else {
      ctx.fillStyle = '#f5f0e8';
      ctx.fillRect(0, 0, W, H);
    }

    // 背景色調漸變覆蓋層（旅程感）
    if (game.bgHueShift > 0 && gameState === State.PLAYING) {
      ctx.globalAlpha = game.bgHueShift;
      ctx.fillStyle = '#e8ddd0';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    // 墨量低時邊緣紅暈
    if (player.ink <= 30 && gameState === State.PLAYING) {
      var warningAlpha = (1 - player.ink / 30) * 0.15 * (1 + Math.sin(game.inkWarningPulse) * 0.5);
      var edgeGrad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.min(W, H) * 0.7);
      edgeGrad.addColorStop(0, 'rgba(204,68,68,0)');
      edgeGrad.addColorStop(1, 'rgba(204,68,68,' + warningAlpha + ')');
      ctx.fillStyle = edgeGrad;
      ctx.fillRect(0, 0, W, H);
    }

    // 背景山水
    drawMountains();
    drawClouds();

    // 墨跡軌跡
    drawTrail();

    // 障礙物
    drawObstacles();

    // 禪字
    drawZenChars();

    // 粒子
    drawParticles();

    // 浮動文字
    drawFloatingTexts();

    // 玩家墨滴
    drawPlayer();

    // 墨量條
    drawInkBar();

    // Combo 顯示
    if (game.combo >= 2 && gameState === State.PLAYING) {
      drawCombo();
    }

    // 近失閃光（在 update 中使用 dt 衰減）
    if (game.nearMissFlash > 0) {
      ctx.globalAlpha = game.nearMissFlash * 0.08;
      ctx.fillStyle = '#c4a35a';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    // 里程碑通知
    if (game.milestoneNotification) {
      drawMilestoneNotification();
    }

    // 道具狀態指示
    drawPowerupIndicators();

    ctx.restore();
  }

  function drawMountains() {
    for (var i = 0; i < mountains.length; i++) {
      var m = mountains[i];
      ctx.globalAlpha = m.alpha;
      ctx.fillStyle = '#8a7e6b';
      ctx.beginPath();
      ctx.moveTo(m.x | 0, m.baseY | 0);
      ctx.quadraticCurveTo(
        (m.x + m.width * 0.5) | 0, (m.baseY - m.height) | 0,
        (m.x + m.width) | 0, m.baseY | 0
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawClouds() {
    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      ctx.globalAlpha = c.alpha;
      ctx.fillStyle = '#c4b89a';
      ctx.beginPath();
      ctx.ellipse(c.x | 0, c.y | 0, c.width / 2, c.height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawTrail() {
    for (var i = 0; i < player.trail.length; i++) {
      var t = player.trail[i];
      if (t.alpha <= 0) continue;
      ctx.globalAlpha = t.alpha;
      ctx.fillStyle = '#3d3425';
      ctx.beginPath();
      ctx.arc(t.x, t.y, Math.max(1, t.size | 0), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawPlayer() {
    var px = player.x | 0;
    var py = player.y | 0;

    // 護盾光環
    if (game.shieldTimer > 0) {
      var shieldAlpha = game.shieldTimer < 1 ? game.shieldTimer : 0.4;
      ctx.globalAlpha = shieldAlpha;
      ctx.strokeStyle = '#4a90d9';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, PLAYER_RADIUS * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = shieldAlpha * 0.1;
      ctx.fillStyle = '#4a90d9';
      ctx.beginPath();
      ctx.arc(px, py, PLAYER_RADIUS * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 磁吸光環
    if (game.magnetTimer > 0) {
      var magAlpha = game.magnetTimer < 1 ? game.magnetTimer * 0.3 : 0.3;
      ctx.globalAlpha = magAlpha;
      ctx.strokeStyle = '#d4a35a';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(px, py, 150, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // 外圈光暈
    var grad = ctx.createRadialGradient(px, py, 0, px, py, PLAYER_RADIUS * 2.5);
    grad.addColorStop(0, 'rgba(61,52,37,0.15)');
    grad.addColorStop(1, 'rgba(61,52,37,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, PLAYER_RADIUS * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // 墨滴本體
    ctx.fillStyle = '#3d3425';
    ctx.beginPath();
    ctx.arc(px, py, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // 高光
    ctx.fillStyle = 'rgba(245,240,232,0.3)';
    ctx.beginPath();
    ctx.arc(px - 3, py - 3, PLAYER_RADIUS * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawZenChars() {
    for (var i = 0; i < zenChars.length; i++) {
      var zc = zenChars[i];
      if (!zc.alive) continue;
      var bobY = Math.sin(zc.bobPhase) * 4;

      ctx.globalAlpha = zc.alpha;

      // 光暈（道具禪字有特殊顏色）
      var glowColor = zc.isPowerup ? zc.glowColor : 'rgba(196,163,90,0.15)';
      if (zc.isPowerup) {
        // 道具脈衝光暈（安全處理透明漸層）
        var pulseR = CHAR_RADIUS * 2 + Math.sin(zc.timer * 4) * 5;
        var grad = ctx.createRadialGradient(zc.x, zc.y + bobY, 0, zc.x, zc.y + bobY, pulseR);
        var gcRgba = hexToRgba(glowColor);
        grad.addColorStop(0, 'rgba(' + gcRgba + ',1)');
        grad.addColorStop(0.5, 'rgba(' + gcRgba + ',0.25)');
        grad.addColorStop(1, 'rgba(' + gcRgba + ',0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(zc.x | 0, (zc.y + bobY) | 0, pulseR, 0, Math.PI * 2);
        ctx.fill();
      } else {
        var grad2 = ctx.createRadialGradient(zc.x, zc.y + bobY, 0, zc.x, zc.y + bobY, CHAR_RADIUS * 2);
        grad2.addColorStop(0, 'rgba(196,163,90,0.15)');
        grad2.addColorStop(1, 'rgba(196,163,90,0)');
        ctx.fillStyle = grad2;
        ctx.beginPath();
        ctx.arc(zc.x | 0, (zc.y + bobY) | 0, CHAR_RADIUS * 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // 禪字
      ctx.fillStyle = zc.isPowerup ? zc.glowColor : '#3d3425';
      ctx.font = zc.isPowerup ? 'bold 28px "Noto Serif TC", serif' : 'bold 24px "Noto Serif TC", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(zc.ch, zc.x | 0, (zc.y + bobY) | 0);

      // 小字含義
      ctx.font = '10px "Noto Serif TC", serif';
      ctx.fillStyle = zc.isPowerup ? zc.glowColor : '#8a7e6b';
      ctx.fillText(zc.meaning, zc.x | 0, (zc.y + bobY + 18) | 0);
    }
    ctx.globalAlpha = 1;
  }

  function drawObstacles() {
    ctx.fillStyle = '#8a7e6b';
    for (var i = 0; i < obstacles.length; i++) {
      var obs = obstacles[i];
      if (!obs.alive) continue;
      ctx.globalAlpha = 0.6;

      if (obs.type === 'rock') {
        ctx.beginPath();
        for (var a = 0; a < 8; a++) {
          var angle = (a / 8) * Math.PI * 2 + obs.rotation;
          var r = obs.r * (0.7 + Math.sin(a * 2.3) * 0.3);
          var px = obs.x + Math.cos(angle) * r;
          var py = obs.y + Math.sin(angle) * r;
          if (a === 0) ctx.moveTo(px | 0, py | 0);
          else ctx.lineTo(px | 0, py | 0);
        }
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.strokeStyle = '#8a7e6b';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.save();
        ctx.translate(obs.x | 0, obs.y | 0);
        ctx.rotate(obs.rotation);
        ctx.moveTo(-obs.r, 0);
        ctx.quadraticCurveTo(0, -obs.r * 0.4, obs.r, obs.r * 0.2);
        ctx.moveTo(-obs.r * 0.3, -obs.r * 0.2);
        ctx.lineTo(obs.r * 0.3, -obs.r * 0.6);
        ctx.restore();
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawParticles() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      if (!p.alive) continue;
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x | 0, p.y | 0, Math.max(0.5, p.size * (p.life / p.maxLife)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFloatingTexts() {
    for (var i = 0; i < floatingTexts.length; i++) {
      var ft = floatingTexts[i];
      if (!ft.alive) continue;
      ctx.globalAlpha = ft.alpha;
      ctx.fillStyle = ft.color;
      ctx.font = ft.size + 'px "Noto Serif TC", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ft.text, ft.x | 0, ft.y | 0);
    }
    ctx.globalAlpha = 1;
  }

  function drawInkBar() {
    if (gameState !== State.PLAYING) return;

    var barW = 120;
    var barH = 6;
    var barX = (W - barW) / 2;
    var barY = H - 30;

    // 背景
    ctx.fillStyle = 'rgba(138,126,107,0.2)';
    ctx.fillRect(barX | 0, barY | 0, barW, barH);

    // 墨量
    var ratio = player.ink / INK_MAX;
    var fillW = Math.max(0, barW * ratio);
    if (ratio > 0.3) {
      ctx.fillStyle = '#3d3425';
    } else {
      // 低墨量脈衝紅色
      var pulse = Math.sin(game.inkWarningPulse) * 0.3 + 0.7;
      ctx.fillStyle = 'rgb(' + Math.round(204 * pulse) + ',' + Math.round(68 * pulse) + ',' + Math.round(68 * pulse) + ')';
    }
    ctx.fillRect(barX | 0, barY | 0, fillW | 0, barH);

    // 標籤
    ctx.fillStyle = ratio <= 0.3 ? '#c44' : '#8a7e6b';
    ctx.font = '10px "Noto Serif TC", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('\u58a8\u91cf ' + Math.round(player.ink) + '%', W / 2, barY + barH + 3);
  }

  function drawCombo() {
    var tierNames = ['', '\u884c\u96f2', '\u6d41\u6c34', '\u5c71\u6cb3'];
    var tierColors = ['#c4a35a', '#c4a35a', '#d4a35a', '#ff9944'];
    var tier = game.comboTier;

    ctx.fillStyle = tierColors[tier] || '#c4a35a';
    ctx.font = 'bold ' + (18 + tier * 3) + 'px "Noto Serif TC", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.globalAlpha = Math.min(1, game.comboTimer);

    var comboText = game.combo + ' \u9023\u6536';
    if (tier > 0) comboText += ' \u00b7 ' + tierNames[tier];
    ctx.fillText(comboText, W / 2, 50);

    var mult = (1 + Math.floor(game.combo / 3) * 0.5).toFixed(1);
    ctx.font = '12px "Noto Serif TC", serif';
    ctx.fillStyle = '#8a7e6b';
    ctx.fillText('\u00d7' + mult, W / 2, 50 + (21 + tier * 3));
    ctx.globalAlpha = 1;
  }

  function drawMilestoneNotification() {
    var mn = game.milestoneNotification;
    if (!mn) return;

    var fadeIn = Math.min(1, (3 - mn.timer) * 4);
    var fadeOut = Math.min(1, mn.timer * 2);
    var alpha = Math.min(fadeIn, fadeOut);

    ctx.globalAlpha = alpha * 0.85;
    ctx.fillStyle = '#f5f0e8';
    var boxW = 280;
    var boxH = 70;
    var boxX = (W - boxW) / 2;
    var boxY = H * 0.3;

    // 背景框
    ctx.beginPath();
    roundRect(ctx, boxX, boxY, boxW, boxH, 12);
    ctx.fill();
    ctx.strokeStyle = '#c4a35a';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.globalAlpha = alpha;
    // 標題
    ctx.fillStyle = '#c4a35a';
    ctx.font = 'bold 20px "Noto Serif TC", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('\u5883\u754c\uff1a' + mn.text + ' (' + mn.score + '\u5206)', W / 2, boxY + 25);

    // 禪語
    ctx.fillStyle = '#8a7e6b';
    ctx.font = '13px "Noto Serif TC", serif';
    ctx.fillText(mn.quote, W / 2, boxY + 50);
    ctx.globalAlpha = 1;
  }

  function drawPowerupIndicators() {
    if (gameState !== State.PLAYING) return;

    var y = H - 60;
    var indicators = [];

    if (game.shieldTimer > 0) {
      indicators.push({ icon: '\u76fe', color: '#4a90d9', time: game.shieldTimer });
    }
    if (game.magnetTimer > 0) {
      indicators.push({ icon: '\u5f15', color: '#d4a35a', time: game.magnetTimer });
    }

    for (var i = 0; i < indicators.length; i++) {
      var ind = indicators[i];
      var ix = 20 + i * 50;
      var fadeAlpha = ind.time < 1 ? ind.time : 1;

      ctx.globalAlpha = fadeAlpha * 0.9;
      ctx.fillStyle = ind.color;
      ctx.font = 'bold 16px "Noto Serif TC", serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(ind.icon, ix, y);

      ctx.font = '11px "Noto Serif TC", serif';
      ctx.fillStyle = '#8a7e6b';
      ctx.fillText(Math.ceil(ind.time) + 's', ix + 20, y);
    }
    ctx.globalAlpha = 1;
  }

  // 輔助：圓角矩形
  function roundRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
  }

  // ====== HUD ======
  function updateHUD() {
    if (hudEls.score) hudEls.score.textContent = game.score;
    if (hudEls.chars) hudEls.chars.textContent = game.charsCollected;
    if (hudEls.combo) hudEls.combo.textContent = game.combo > 0 ? game.combo : '-';
  }

  // ====== UI 覆蓋 ======
  function showMenu() {
    gameState = State.MENU;
    hudEls.menuOverlay.classList.remove('hidden');
    hudEls.pauseOverlay.classList.add('hidden');
    hudEls.gameoverOverlay.classList.add('hidden');
    hudEls.hud.style.display = 'none';

    // 統計顯示
    if (hudEls.menuStats && progress.totalGames > 0) {
      hudEls.menuStats.innerHTML =
        '<div style="color:#8a7e6b; font-size:0.85rem;">' +
        '\u6700\u9ad8\u5206\uff1a<strong style="color:#3d3425;">' + progress.highScore + '</strong>' +
        ' \u00b7 \u7d2f\u8a08 <strong style="color:#3d3425;">' + progress.totalGames + '</strong> \u5c40' +
        '</div>';
    }

    // Streak
    if (hudEls.streakBadge) {
      if (progress.streak >= 2) {
        hudEls.streakBadge.style.display = 'inline-block';
        hudEls.streakBadge.className = 'streak-badge';
        hudEls.streakBadge.textContent = '\ud83d\udd25 \u9023\u7e8c ' + progress.streak + ' \u5929';
      } else {
        hudEls.streakBadge.style.display = 'none';
      }
    }

    // 控制提示
    if (hudEls.controlHint) {
      var isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      hudEls.controlHint.textContent = isTouch ? '\u89f8\u63a7\u6216\u6ed1\u52d5\u63a7\u5236\u58a8\u6ef4\u79fb\u52d5' : '\u65b9\u5411\u9375 / WASD \u79fb\u52d5\u3001\u6ed1\u9f20\u5f15\u5c0e\u3001Esc \u66ab\u505c';
    }
  }

  function startPlaying() {
    initAudio();
    initGame();
    gameState = State.PLAYING;
    hudEls.menuOverlay.classList.add('hidden');
    hudEls.pauseOverlay.classList.add('hidden');
    hudEls.gameoverOverlay.classList.add('hidden');
    hudEls.hud.style.display = 'flex';
  }

  function togglePause() {
    if (gameState === State.PLAYING) {
      gameState = State.PAUSED;
      hudEls.pauseOverlay.classList.remove('hidden');
    } else if (gameState === State.PAUSED) {
      gameState = State.PLAYING;
      hudEls.pauseOverlay.classList.add('hidden');
      lastTime = 0; // 重置計時避免大 delta
    }
  }

  function showGameOver(isNewHigh) {
    hudEls.hud.style.display = 'none';
    hudEls.gameoverOverlay.classList.remove('hidden');

    hudEls.goTitle.textContent = game.score >= 200 ? '\u58a8\u5883\u5713\u6eff' : '\u58a8\u76e1';

    hudEls.goScore.textContent = game.score + ' \u5206';

    hudEls.goStats.innerHTML =
      '<div class="stat-box"><div class="val">' + game.charsCollected + '</div><div class="lbl">\u7985\u5b57</div></div>' +
      '<div class="stat-box"><div class="val">' + game.bestCombo + '</div><div class="lbl">\u6700\u4f73\u9023\u6536</div></div>' +
      '<div class="stat-box"><div class="val">' + Math.round(game.elapsed) + 's</div><div class="lbl">\u6642\u9577</div></div>' +
      '<div class="stat-box"><div class="val">' + game.nearMissCount + '</div><div class="lbl">\u8aca\u907f</div></div>';

    if (isNewHigh) {
      hudEls.goRecord.style.display = 'block';
      hudEls.goRecord.innerHTML = '<span class="streak-badge">\ud83c\udfc6 \u65b0\u7d00\u9304\uff01</span>';
    } else {
      hudEls.goRecord.style.display = 'none';
    }

    hudEls.goQuote.textContent = ZEN_QUOTES[(Math.random() * ZEN_QUOTES.length) | 0];
  }

  // ====== 輸入處理 ======
  var keyMap = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', W: 'up', s: 'down', S: 'down', a: 'left', A: 'left', d: 'right', D: 'right'
  };

  document.addEventListener('keydown', function(e) {
    initAudio();
    if (e.key === 'Escape') {
      e.preventDefault();
      if (gameState === State.PLAYING || gameState === State.PAUSED) {
        togglePause();
      }
      return;
    }

    // 空白鍵暫停
    if (e.key === ' ' && (gameState === State.PLAYING || gameState === State.PAUSED)) {
      e.preventDefault();
      togglePause();
      return;
    }

    var dir = keyMap[e.key];
    if (dir) {
      e.preventDefault();
      input[dir] = true;
      input.mouseActive = false;

      if (gameState === State.MENU || gameState === State.GAMEOVER) {
        startPlaying();
      }
    }
  });

  document.addEventListener('keyup', function(e) {
    var dir = keyMap[e.key];
    if (dir) input[dir] = false;
  });

  // 滑鼠
  canvas.addEventListener('mousemove', function(e) {
    input.mouseX = e.clientX;
    input.mouseY = e.clientY;
    input.mouseActive = true;
  });

  canvas.addEventListener('mousedown', function(e) {
    initAudio();
    input.mouseX = e.clientX;
    input.mouseY = e.clientY;
    input.mouseActive = true;
    if (gameState === State.MENU || gameState === State.GAMEOVER) {
      startPlaying();
    }
  });

  canvas.addEventListener('mouseleave', function() {
    input.mouseActive = false;
  });

  // 觸控
  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    initAudio();
    var touch = e.touches[0];
    input.mouseX = touch.clientX;
    input.mouseY = touch.clientY;
    input.mouseActive = true;
    if (gameState === State.MENU || gameState === State.GAMEOVER) {
      startPlaying();
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', function(e) {
    e.preventDefault();
    var touch = e.touches[0];
    input.mouseX = touch.clientX;
    input.mouseY = touch.clientY;
    input.mouseActive = true;
  }, { passive: false });

  canvas.addEventListener('touchend', function(e) {
    e.preventDefault();
    input.mouseActive = false;
  }, { passive: false });

  // 按鈕事件（延遲綁定，等 DOM 快取完成）
  function bindButtons() {
    hudEls.startBtn.addEventListener('click', function() {
      initAudio();
      startPlaying();
    });

    hudEls.pauseBtn.addEventListener('click', function() {
      if (gameState === State.PLAYING || gameState === State.PAUSED) togglePause();
    });

    hudEls.resumeBtn.addEventListener('click', function() {
      if (gameState === State.PAUSED) togglePause();
    });

    hudEls.quitBtn.addEventListener('click', function() {
      if (gameState === State.PAUSED) {
        gameState = State.PLAYING;
        hudEls.pauseOverlay.classList.add('hidden');
        onGameOver();
      }
    });

    hudEls.retryBtn.addEventListener('click', function() {
      initAudio();
      startPlaying();
    });

    hudEls.menuBtn.addEventListener('click', showMenu);
  }

  // ====== 主遊戲循環 ======
  var lastTime = 0;

  function gameLoop(timestamp) {
    if (lastTime === 0) lastTime = timestamp;
    var dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    // 防止大 delta（切頁回來）
    if (dt > 0.1) dt = 0.016;

    if (gameState === State.PLAYING) {
      update(dt);
    }

    render();
    requestAnimationFrame(gameLoop);
  }

  // ====== 初始化 ======
  cacheHudElements();
  bindButtons();
  loadProgress();
  generateBackground();
  showMenu();
  requestAnimationFrame(gameLoop);

})();
