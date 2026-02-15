/**
 * 禪意水墨 - Zen Ink Flow
 *
 * 水墨風格的動作收集遊戲：引導墨滴穿越禪境，收集散落的禪字。
 *
 * 品質標準：
 * - [P0] requestAnimationFrame 遊戲循環 + deltaTime
 * - [P0] 完整狀態機（MENU → PLAYING → PAUSED → GAMEOVER）
 * - [P0] 鍵盤 + 滑鼠 + 觸控三種輸入
 * - [P1] 物件池回收（粒子、禪字、障礙物）
 * - [P1] Canvas 整數座標 + 批次繪製
 * - [P2] 連續天數 + 成就系統（原子習慣四法則）
 * - [P2] Esc 暫停 + 暫停覆蓋層
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
  var MAX_PARTICLES = 60;
  var SPAWN_INTERVAL_CHAR = 1800;   // ms
  var SPAWN_INTERVAL_OBS = 1200;    // ms
  var SCROLL_SPEED_BASE = 1.2;
  var SCROLL_SPEED_INCREMENT = 0.08; // 每 10 分加速

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
    { id: 'total_10', name: '十局經驗', desc: '累計 10 局', check: function(p) { return p.totalGames >= 10; } }
  ];

  // ====== 狀態機 ======
  var State = { MENU: 'menu', PLAYING: 'playing', PAUSED: 'paused', GAMEOVER: 'gameover' };
  var gameState = State.MENU;

  // ====== Canvas ======
  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var W, H;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;
  }
  window.addEventListener('resize', resize);
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
  var zenChars = [];     // { x, y, ch, meaning, alpha, collected, timer }
  var obstacles = [];    // { x, y, r, type }
  var particles = [];    // { x, y, vx, vy, life, maxLife, size, color, alpha }

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
    difficulty: 1
  };

  // 輸入狀態
  var input = { left: false, right: false, up: false, down: false, mouseX: -1, mouseY: -1, mouseActive: false };

  // 背景山水元素（預生成）
  var mountains = [];
  var clouds = [];

  // ====== 粒子系統 ======
  function spawnParticles(x, y, count, color) {
    var maxToAdd = Math.min(count, MAX_PARTICLES - particles.length);
    for (var i = 0; i < maxToAdd; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = 1 + Math.random() * 3;
      particles.push({
        x: x, y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1, maxLife: 1,
        size: 2 + Math.random() * 4,
        color: color || '#3d3425',
        alpha: 0.8
      });
    }
  }

  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.life -= dt * 2;
      p.alpha = Math.max(0, p.life / p.maxLife * 0.8);
      if (p.life <= 0) {
        particles.splice(i, 1);
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

  // ====== 禪字生成 ======
  function spawnZenChar() {
    var zen = ZEN_CHARS[(Math.random() * ZEN_CHARS.length) | 0];
    var margin = 40;
    zenChars.push({
      x: W + margin,
      y: margin + Math.random() * (H - margin * 2),
      ch: zen.ch,
      meaning: zen.meaning,
      alpha: 0,
      collected: false,
      timer: 0,
      bobPhase: Math.random() * Math.PI * 2
    });
  }

  // ====== 障礙物生成 ======
  function spawnObstacle() {
    var r = OBSTACLE_MIN_R + Math.random() * (OBSTACLE_MAX_R - OBSTACLE_MIN_R);
    var margin = 30;
    obstacles.push({
      x: W + margin + r,
      y: margin + Math.random() * (H - margin * 2),
      r: r,
      type: Math.random() < 0.5 ? 'rock' : 'branch',
      rotation: Math.random() * Math.PI * 2
    });
  }

  // ====== 碰撞偵測 (圓形) ======
  function circleCollide(x1, y1, r1, x2, y2, r2) {
    var dx = x1 - x2;
    var dy = y1 - y2;
    var dist = dx * dx + dy * dy;
    var rSum = r1 + r2;
    return dist < rSum * rSum;
  }

  // ====== 遊戲初始化 ======
  function initGame() {
    player.x = W * 0.2;
    player.y = H * 0.5;
    player.vx = 0;
    player.vy = 0;
    player.ink = INK_MAX;
    player.trail = [];

    zenChars = [];
    obstacles = [];
    particles = [];

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

    generateBackground();

    // 預生成一些禪字和障礙物
    for (var i = 0; i < 3; i++) {
      var zen = ZEN_CHARS[(Math.random() * ZEN_CHARS.length) | 0];
      zenChars.push({
        x: W * 0.4 + Math.random() * W * 0.5,
        y: 60 + Math.random() * (H - 120),
        ch: zen.ch, meaning: zen.meaning,
        alpha: 1, collected: false, timer: 0,
        bobPhase: Math.random() * Math.PI * 2
      });
    }
  }

  // ====== 更新邏輯 ======
  function update(dt) {
    if (gameState !== State.PLAYING) return;

    game.elapsed += dt;

    // 難度漸進（每 15 秒提升）
    game.difficulty = 1 + Math.floor(game.elapsed / 15) * 0.15;
    game.scrollSpeed = SCROLL_SPEED_BASE + Math.floor(game.score / 10) * SCROLL_SPEED_INCREMENT;

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

    // 墨跡軌跡
    var speed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
    if (speed > 0.5) {
      player.trail.push({ x: player.x | 0, y: player.y | 0, alpha: 0.4, size: PLAYER_RADIUS * 0.6 });
      if (player.trail.length > 80) player.trail.shift();
    }
    // 軌跡淡出
    for (var t = player.trail.length - 1; t >= 0; t--) {
      player.trail[t].alpha -= dt * 0.8;
      player.trail[t].size *= (1 - dt * 0.5);
      if (player.trail[t].alpha <= 0) player.trail.splice(t, 1);
    }

    // === 墨量消耗 ===
    player.ink -= INK_DRAIN_RATE * dt;
    if (player.ink <= 0) {
      player.ink = 0;
      onGameOver();
      return;
    }

    // === 滾動 ===
    var scrollDelta = game.scrollSpeed * dt * 60;

    // === 禪字更新 ===
    game.lastCharSpawn += dt * 1000;
    var charInterval = SPAWN_INTERVAL_CHAR / game.difficulty;
    if (game.lastCharSpawn >= charInterval) {
      game.lastCharSpawn = 0;
      spawnZenChar();
    }

    for (var i = zenChars.length - 1; i >= 0; i--) {
      var zc = zenChars[i];
      zc.x -= scrollDelta;
      zc.timer += dt;
      zc.bobPhase += dt * 2;
      if (zc.alpha < 1 && !zc.collected) zc.alpha = Math.min(1, zc.alpha + dt * 3);

      if (zc.collected) {
        zc.alpha -= dt * 3;
        if (zc.alpha <= 0) { zenChars.splice(i, 1); continue; }
      } else {
        // 碰撞檢測
        if (circleCollide(player.x, player.y, PLAYER_RADIUS, zc.x, zc.y + Math.sin(zc.bobPhase) * 4, CHAR_RADIUS)) {
          zc.collected = true;
          onCollectChar(zc);
        }
      }

      if (zc.x < -50) { zenChars.splice(i, 1); }
    }

    // === 障礙物更新 ===
    game.lastObsSpawn += dt * 1000;
    var obsInterval = SPAWN_INTERVAL_OBS / game.difficulty;
    if (game.lastObsSpawn >= obsInterval) {
      game.lastObsSpawn = 0;
      spawnObstacle();
    }

    for (var j = obstacles.length - 1; j >= 0; j--) {
      var obs = obstacles[j];
      obs.x -= scrollDelta;
      obs.rotation += dt * 0.5;

      // 碰撞檢測
      if (circleCollide(player.x, player.y, PLAYER_RADIUS * 0.7, obs.x, obs.y, obs.r)) {
        onHitObstacle(obs);
        obstacles.splice(j, 1);
        continue;
      }

      if (obs.x < -50) { obstacles.splice(j, 1); }
    }

    // === Combo 計時器 ===
    if (game.combo > 0) {
      game.comboTimer -= dt;
      if (game.comboTimer <= 0) {
        game.combo = 0;
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

    // === HUD 更新 ===
    updateHUD();
  }

  function onCollectChar(zc) {
    game.charsCollected++;
    game.combo++;
    game.comboTimer = 2.0; // 2 秒 combo 窗口
    if (game.combo > game.bestCombo) game.bestCombo = game.combo;

    var comboMultiplier = 1 + Math.floor(game.combo / 3) * 0.5;
    var points = Math.round(5 * comboMultiplier);
    game.score += points;

    player.ink = Math.min(INK_MAX, player.ink + INK_GAIN_PER_CHAR);

    playCollect(game.combo);
    spawnParticles(zc.x, zc.y, 8, '#5a4e3c');
  }

  function onHitObstacle(obs) {
    player.ink -= 15;
    game.combo = 0;
    game.comboTimer = 0;
    playHit();
    spawnParticles(obs.x, obs.y, 6, '#8a7e6b');

    if (player.ink <= 0) {
      player.ink = 0;
      onGameOver();
    }
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
    // 清空 - 宣紙色背景
    ctx.fillStyle = '#f5f0e8';
    ctx.fillRect(0, 0, W, H);

    // 紙紋理（微弱雜訊）
    ctx.globalAlpha = 0.02;
    for (var n = 0; n < 30; n++) {
      var nx = Math.random() * W;
      var ny = Math.random() * H;
      ctx.fillStyle = '#c4b89a';
      ctx.fillRect(nx | 0, ny | 0, 1 + Math.random() * 3 | 0, 1);
    }
    ctx.globalAlpha = 1;

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

    // 玩家墨滴
    drawPlayer();

    // 墨量條
    drawInkBar();

    // Combo 顯示
    if (game.combo >= 2 && gameState === State.PLAYING) {
      drawCombo();
    }
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
      var bobY = Math.sin(zc.bobPhase) * 4;

      ctx.globalAlpha = zc.alpha;

      // 光暈
      var grad = ctx.createRadialGradient(zc.x, zc.y + bobY, 0, zc.x, zc.y + bobY, CHAR_RADIUS * 2);
      grad.addColorStop(0, 'rgba(196,163,90,0.15)');
      grad.addColorStop(1, 'rgba(196,163,90,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(zc.x | 0, (zc.y + bobY) | 0, CHAR_RADIUS * 2, 0, Math.PI * 2);
      ctx.fill();

      // 禪字
      ctx.fillStyle = '#3d3425';
      ctx.font = 'bold 24px "Noto Serif TC", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(zc.ch, zc.x | 0, (zc.y + bobY) | 0);

      // 小字含義
      ctx.font = '10px "Noto Serif TC", serif';
      ctx.fillStyle = '#8a7e6b';
      ctx.fillText(zc.meaning, zc.x | 0, (zc.y + bobY + 18) | 0);
    }
    ctx.globalAlpha = 1;
  }

  function drawObstacles() {
    ctx.fillStyle = '#8a7e6b';
    for (var i = 0; i < obstacles.length; i++) {
      var obs = obstacles[i];
      ctx.globalAlpha = 0.6;

      if (obs.type === 'rock') {
        // 岩石 - 不規則圓形
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
        // 枯枝 - 線條
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
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x | 0, p.y | 0, Math.max(0.5, p.size * (p.life / p.maxLife)), 0, Math.PI * 2);
      ctx.fill();
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
      ctx.fillStyle = '#c44';
    }
    ctx.fillRect(barX | 0, barY | 0, fillW | 0, barH);

    // 標籤
    ctx.fillStyle = '#8a7e6b';
    ctx.font = '10px "Noto Serif TC", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('\u58a8\u91cf ' + Math.round(player.ink) + '%', W / 2, barY + barH + 3);
  }

  function drawCombo() {
    ctx.fillStyle = '#c4a35a';
    ctx.font = 'bold 18px "Noto Serif TC", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.globalAlpha = Math.min(1, game.comboTimer);
    ctx.fillText(game.combo + ' \u9023\u6536', W / 2, 50);
    var mult = (1 + Math.floor(game.combo / 3) * 0.5).toFixed(1);
    ctx.font = '12px "Noto Serif TC", serif';
    ctx.fillStyle = '#8a7e6b';
    ctx.fillText('\u00d7' + mult, W / 2, 72);
    ctx.globalAlpha = 1;
  }

  // ====== HUD ======
  function updateHUD() {
    var scoreEl = document.getElementById('hudScore');
    var charsEl = document.getElementById('hudChars');
    var comboEl = document.getElementById('hudCombo');
    if (scoreEl) scoreEl.textContent = game.score;
    if (charsEl) charsEl.textContent = game.charsCollected;
    if (comboEl) comboEl.textContent = game.combo > 0 ? game.combo : '-';
  }

  // ====== UI 覆蓋 ======
  function showMenu() {
    gameState = State.MENU;
    document.getElementById('menuOverlay').classList.remove('hidden');
    document.getElementById('pauseOverlay').classList.add('hidden');
    document.getElementById('gameoverOverlay').classList.add('hidden');
    document.getElementById('hud').style.display = 'none';

    // 統計顯示
    var stats = document.getElementById('menuStats');
    if (stats && progress.totalGames > 0) {
      stats.innerHTML =
        '<div style="color:#8a7e6b; font-size:0.85rem;">' +
        '\u6700\u9ad8\u5206\uff1a<strong style="color:#3d3425;">' + progress.highScore + '</strong>' +
        ' \u00b7 \u7d2f\u8a08 <strong style="color:#3d3425;">' + progress.totalGames + '</strong> \u5c40' +
        '</div>';
    }

    // Streak
    var badge = document.getElementById('streakBadge');
    if (badge) {
      if (progress.streak >= 2) {
        badge.style.display = 'inline-block';
        badge.className = 'streak-badge';
        badge.textContent = '\ud83d\udd25 \u9023\u7e8c ' + progress.streak + ' \u5929';
      } else {
        badge.style.display = 'none';
      }
    }

    // 控制提示
    var hint = document.getElementById('controlHint');
    if (hint) {
      var isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      hint.textContent = isTouch ? '\u89f8\u63a7\u6216\u6ed1\u52d5\u63a7\u5236\u58a8\u6ef4\u79fb\u52d5' : '\u65b9\u5411\u9375 / WASD \u79fb\u52d5\u3001\u6ed1\u9f20\u5f15\u5c0e\u3001Esc \u66ab\u505c';
    }
  }

  function startPlaying() {
    initAudio();
    initGame();
    gameState = State.PLAYING;
    document.getElementById('menuOverlay').classList.add('hidden');
    document.getElementById('pauseOverlay').classList.add('hidden');
    document.getElementById('gameoverOverlay').classList.add('hidden');
    document.getElementById('hud').style.display = 'flex';
  }

  function togglePause() {
    if (gameState === State.PLAYING) {
      gameState = State.PAUSED;
      document.getElementById('pauseOverlay').classList.remove('hidden');
    } else if (gameState === State.PAUSED) {
      gameState = State.PLAYING;
      document.getElementById('pauseOverlay').classList.add('hidden');
      lastTime = 0; // 重置計時避免大 delta
    }
  }

  function showGameOver(isNewHigh) {
    document.getElementById('hud').style.display = 'none';
    var overlay = document.getElementById('gameoverOverlay');
    overlay.classList.remove('hidden');

    var titleEl = document.getElementById('goTitle');
    titleEl.textContent = game.score >= 200 ? '\u58a8\u5883\u5713\u6eff' : '\u58a8\u76e1';

    document.getElementById('goScore').textContent = game.score + ' \u5206';

    var statsRow = document.getElementById('goStats');
    statsRow.innerHTML =
      '<div class="stat-box"><div class="val">' + game.charsCollected + '</div><div class="lbl">\u7985\u5b57</div></div>' +
      '<div class="stat-box"><div class="val">' + game.bestCombo + '</div><div class="lbl">\u6700\u4f73\u9023\u6536</div></div>' +
      '<div class="stat-box"><div class="val">' + Math.round(game.elapsed) + 's</div><div class="lbl">\u6642\u9577</div></div>';

    var rec = document.getElementById('goRecord');
    if (isNewHigh) {
      rec.style.display = 'block';
      rec.innerHTML = '<span class="streak-badge">\ud83c\udfc6 \u65b0\u7d00\u9304\uff01</span>';
    } else {
      rec.style.display = 'none';
    }

    var quoteEl = document.getElementById('goQuote');
    quoteEl.textContent = ZEN_QUOTES[(Math.random() * ZEN_QUOTES.length) | 0];
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

  // 按鈕事件
  document.getElementById('startBtn').addEventListener('click', function() {
    initAudio();
    startPlaying();
  });

  document.getElementById('pauseBtn').addEventListener('click', function() {
    if (gameState === State.PLAYING || gameState === State.PAUSED) togglePause();
  });

  document.getElementById('resumeBtn').addEventListener('click', function() {
    if (gameState === State.PAUSED) togglePause();
  });

  document.getElementById('quitBtn').addEventListener('click', function() {
    if (gameState === State.PAUSED) {
      gameState = State.PLAYING;
      document.getElementById('pauseOverlay').classList.add('hidden');
      onGameOver();
    }
  });

  document.getElementById('retryBtn').addEventListener('click', function() {
    initAudio();
    startPlaying();
  });

  document.getElementById('menuBtn').addEventListener('click', showMenu);

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
  loadProgress();
  generateBackground();
  showMenu();
  requestAnimationFrame(gameLoop);

})();
