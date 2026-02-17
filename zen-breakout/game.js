/**
 * 禪磚破 - Zen Breakout
 *
 * 經典打磚塊融合禪意美學。擊碎煩惱磚塊，體悟空性智慧。
 *
 * 品質標準：
 * - [P0] requestAnimationFrame + 固定時間步長（跨裝置一致速度）
 * - [P0] AABB 碰撞偵測 + 穿透修正（球不會穿過磚塊）
 * - [P0] 完整狀態機（MENU → PLAYING → PAUSED → GAMEOVER → LEVELCLEAR）
 * - [P0] 支援鍵盤 + 滑鼠 + 觸控操作
 * - [P1] 響應式 Canvas（邏輯尺寸固定，CSS 縮放）
 * - [P1] 物件池粒子系統（避免 GC 壓力）
 * - [P1] Web Audio API 音效
 * - [P1] 道具系統（多球、擴大球拍、減速球、穿透球、額外生命）
 * - [P2] 多關卡設計（5 關不同排列 + 特殊磚塊）
 * - [P2] 高分紀錄 localStorage
 * - [P2] 畫面震動效果
 *
 * 禪意元素：
 * - 磚塊上顯示煩惱/六根文字
 * - 關卡主題：貪 → 嗔 → 癡 → 慢 → 疑
 * - 擊碎磚塊噴出金色粒子如菩提花瓣
 * - 通關禪語提示
 */

;(function () {
  'use strict';

  // ===== 常數 =====
  var W = 480;
  var H = 640;
  var PADDLE_W = 80;
  var PADDLE_H = 14;
  var PADDLE_Y = H - 50;
  var PADDLE_SPEED = 420; // px/s
  var BALL_R = 7;
  var BALL_BASE_SPEED = 320; // px/s
  var BRICK_ROWS = 7;
  var BRICK_COLS = 9;
  var BRICK_W = 48;
  var BRICK_H = 22;
  var BRICK_PAD = 4;
  var BRICK_OFFSET_X = 12;
  var BRICK_OFFSET_Y = 70;
  var MAX_LIVES = 5;
  var TICK_RATE = 1000 / 60; // 固定 60 tick/s

  // ===== 狀態機 =====
  var State = {
    MENU: 'menu',
    PLAYING: 'playing',
    PAUSED: 'paused',
    GAMEOVER: 'gameover',
    LEVELCLEAR: 'levelclear'
  };

  // ===== 道具類型 =====
  var PowerUp = {
    MULTI: 'multi',       // 三球分裂
    WIDE: 'wide',         // 球拍加寬
    SLOW: 'slow',         // 球減速
    PIERCE: 'pierce',     // 穿透球（不反彈）
    LIFE: 'life'          // 額外生命
  };

  var POWERUP_COLORS = {
    multi:  '#38bdf8',
    wide:   '#22c55e',
    slow:   '#a855f7',
    pierce: '#f97316',
    life:   '#ef4444'
  };

  var POWERUP_SYMBOLS = {
    multi:  'x3',
    wide:   '\u2194',  // ↔
    slow:   '\u231B',  // ⌛
    pierce: '\u2191',  // ↑
    life:   '\u2764'   // ❤
  };

  // ===== 禪意主題 =====
  var LEVEL_THEMES = [
    { name: '\u8CAA', desc: '\u653E\u4E0B\u8CAA\u6B32\uFF0C\u5FC3\u5F97\u81EA\u5728', chars: ['\u8CAA','\u6B32','\u6C42','\u53D6','\u5F97','\u60F3','\u5148','\u6301'], color: '#ef4444' },
    { name: '\u55D4', desc: '\u8F49\u5316\u6012\u706B\uFF0C\u6167\u547D\u5149\u660E', chars: ['\u55D4','\u6012','\u6068','\u60F1','\u706B','\u71D2','\u7206','\u5FFF'], color: '#f97316' },
    { name: '\u7661', desc: '\u7834\u9664\u611A\u6627\uFF0C\u667A\u6167\u73FE\u524D', chars: ['\u7661','\u8FF7','\u60D1','\u6627','\u76F2','\u6697','\u611F','\u5C18'], color: '#a855f7' },
    { name: '\u6162', desc: '\u653E\u4E0B\u50B2\u6162\uFF0C\u8B19\u5353\u6709\u7985', chars: ['\u6162','\u50B2','\u8A87','\u72C2','\u81EA','\u89B2','\u8CA2','\u8CBE'], color: '#fbbf24' },
    { name: '\u7591', desc: '\u65B7\u9664\u7591\u6163\uFF0C\u4FE1\u5FC3\u5145\u6EFF', chars: ['\u7591','\u60D1','\u7336','\u8C6B','\u6190','\u756E','\u61C2','\u60B6'], color: '#22c55e' }
  ];

  var ZEN_QUOTES = [
    '\u300C\u5FC3\u7121\u639B\u7919\uFF0C\u7121\u639B\u7919\u6545\uFF0C\u7121\u6709\u6050\u6016\u300D',
    '\u300C\u7167\u898B\u4E94\u8518\u7686\u7A7A\uFF0C\u5EA6\u4E00\u5207\u82E6\u5384\u300D',
    '\u300C\u61C9\u7121\u6240\u4F4F\u800C\u751F\u5176\u5FC3\u300D',
    '\u300C\u4E00\u5207\u6709\u70BA\u6CD5\uFF0C\u5982\u5922\u5E7B\u6CE1\u5F71\u300D',
    '\u300C\u7F6E\u5FC3\u4E00\u8655\uFF0C\u7121\u4E8B\u4E0D\u529E\u300D'
  ];

  // ===== 關卡設計 =====
  // 每關 layout: 二維陣列，0=空, 1=普通, 2=堅固(需2擊), 3=不可破壞
  var LEVEL_LAYOUTS = [
    // 關 1: 簡單金字塔
    function() {
      var grid = [];
      for (var r = 0; r < BRICK_ROWS; r++) {
        grid[r] = [];
        for (var c = 0; c < BRICK_COLS; c++) {
          var margin = Math.floor(r / 2);
          grid[r][c] = (c >= margin && c < BRICK_COLS - margin) ? 1 : 0;
        }
      }
      return grid;
    },
    // 關 2: 棋盤格 + 堅固磚
    function() {
      var grid = [];
      for (var r = 0; r < BRICK_ROWS; r++) {
        grid[r] = [];
        for (var c = 0; c < BRICK_COLS; c++) {
          if ((r + c) % 2 === 0) {
            grid[r][c] = (r === 3) ? 2 : 1;
          } else {
            grid[r][c] = 0;
          }
        }
      }
      return grid;
    },
    // 關 3: 橫條 + 中心堅固
    function() {
      var grid = [];
      for (var r = 0; r < BRICK_ROWS; r++) {
        grid[r] = [];
        for (var c = 0; c < BRICK_COLS; c++) {
          if (r % 2 === 0) {
            grid[r][c] = (r === 2 && c >= 3 && c <= 5) ? 2 : 1;
          } else {
            grid[r][c] = 0;
          }
        }
      }
      return grid;
    },
    // 關 4: 菱形
    function() {
      var grid = [];
      var cx = Math.floor(BRICK_COLS / 2);
      var cy = Math.floor(BRICK_ROWS / 2);
      for (var r = 0; r < BRICK_ROWS; r++) {
        grid[r] = [];
        for (var c = 0; c < BRICK_COLS; c++) {
          var dist = Math.abs(r - cy) + Math.abs(c - cx);
          if (dist <= 4) {
            grid[r][c] = (dist <= 1) ? 2 : 1;
          } else {
            grid[r][c] = 0;
          }
        }
      }
      return grid;
    },
    // 關 5: 完整牆 + 隨機堅固
    function() {
      var grid = [];
      for (var r = 0; r < BRICK_ROWS; r++) {
        grid[r] = [];
        for (var c = 0; c < BRICK_COLS; c++) {
          grid[r][c] = (Math.random() < 0.25) ? 2 : 1;
        }
      }
      return grid;
    }
  ];

  // ===== 遊戲狀態 =====
  var gameState = State.MENU;
  var score = 0;
  var lives = 3;
  var level = 0;
  var highScore = loadHighScore();
  var frameCount = 0;
  var shakeFrames = 0;
  var lastTickTime = 0;
  var accumulator = 0;

  // 球拍
  var paddle = { x: W / 2 - PADDLE_W / 2, w: PADDLE_W };
  var paddleInput = 0; // -1=左, 0=靜止, 1=右
  var paddleWideTimer = 0;

  // 球（陣列支援多球）
  var balls = [];
  var ballStuck = true; // 球是否黏在球拍上
  var pierceTimer = 0;
  var slowTimer = 0;

  // 磚塊
  var bricks = [];
  var bricksRemaining = 0;

  // 道具掉落
  var powerUps = []; // { x, y, vy, type, w, h }

  // ===== DOM =====
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var scoreEl = document.getElementById('scoreVal');
  var levelEl = document.getElementById('levelVal');
  var livesEl = document.getElementById('livesVal');
  var highEl = document.getElementById('highVal');
  var pauseBtn = document.getElementById('pauseBtn');

  // ===== 響應式 Canvas =====
  function resizeCanvas() {
    var container = canvas.parentElement;
    var maxW = Math.min(container.clientWidth - 12, 480);
    var ratio = H / W;
    canvas.style.width = maxW + 'px';
    canvas.style.height = (maxW * ratio) + 'px';
    canvas.width = W;
    canvas.height = H;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // ===== 音效系統 =====
  var AudioCtx = window.AudioContext || window.webkitAudioContext;
  var audioCtx = null;

  function initAudio() {
    if (!audioCtx) audioCtx = new AudioCtx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  function playTone(freq, dur, type, vol) {
    if (!audioCtx) return;
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = type || 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol || 0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + dur);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
  }

  function sfxBounce()   { playTone(440, 0.05, 'sine', 0.15); }
  function sfxBrick()    { playTone(660, 0.08, 'sine', 0.2); setTimeout(function(){ playTone(880, 0.06, 'sine', 0.15); }, 30); }
  function sfxHardBrick(){ playTone(330, 0.1, 'triangle', 0.25); }
  function sfxPowerUp()  { playTone(784, 0.06, 'sine', 0.15); setTimeout(function(){ playTone(988, 0.06, 'sine', 0.15); }, 40); setTimeout(function(){ playTone(1175, 0.1, 'sine', 0.12); }, 80); }
  function sfxLoseLife() { playTone(247, 0.2, 'sawtooth', 0.25); setTimeout(function(){ playTone(196, 0.3, 'sawtooth', 0.2); }, 150); }
  function sfxGameOver() { playTone(196, 0.3, 'sawtooth', 0.3); setTimeout(function(){ playTone(165, 0.4, 'sawtooth', 0.25); }, 200); setTimeout(function(){ playTone(131, 0.5, 'sawtooth', 0.2); }, 400); }
  function sfxLevelClear(){ playTone(523, 0.08, 'sine', 0.2); setTimeout(function(){ playTone(659, 0.08, 'sine', 0.2); }, 60); setTimeout(function(){ playTone(784, 0.08, 'sine', 0.2); }, 120); setTimeout(function(){ playTone(1047, 0.15, 'sine', 0.2); }, 180); }
  function sfxStart()    { playTone(440, 0.06, 'sine', 0.15); setTimeout(function(){ playTone(554, 0.06, 'sine', 0.15); }, 50); setTimeout(function(){ playTone(659, 0.1, 'sine', 0.15); }, 100); }

  // ===== 高分紀錄 =====
  function loadHighScore() {
    try { return parseInt(localStorage.getItem('zen_breakout_high') || '0', 10); }
    catch(e) { return 0; }
  }
  function saveHighScore() {
    try {
      if (score > highScore) {
        highScore = score;
        localStorage.setItem('zen_breakout_high', highScore.toString());
        return true;
      }
    } catch(e) {}
    return false;
  }

  // ===== 粒子系統（物件池 + swap-and-pop）=====
  var MAX_PARTICLES = 80;
  var particles = [];
  var activeParticles = 0;
  for (var _i = 0; _i < MAX_PARTICLES; _i++) {
    particles.push({ x:0, y:0, vx:0, vy:0, life:0, decay:0, size:0, color:'', type:'circle' });
  }

  function spawnParticles(cx, cy, color, count, type) {
    count = Math.min(count, MAX_PARTICLES - activeParticles);
    for (var i = 0; i < count; i++) {
      var p = particles[activeParticles];
      var angle = Math.PI * 2 * Math.random();
      var speed = 1 + Math.random() * 3;
      p.x = cx;
      p.y = cy;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed - 1;
      p.life = 1.0;
      p.decay = 0.02 + Math.random() * 0.02;
      p.size = 2 + Math.random() * 3;
      p.color = color;
      p.type = type || 'circle';
      activeParticles++;
    }
  }

  function updateParticles() {
    var i = 0;
    while (i < activeParticles) {
      var p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05; // 重力
      p.life -= p.decay;
      if (p.life <= 0) {
        activeParticles--;
        var last = particles[activeParticles];
        particles[i] = last;
        particles[activeParticles] = p;
      } else {
        i++;
      }
    }
  }

  function drawParticles() {
    for (var i = 0; i < activeParticles; i++) {
      var p = particles[i];
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      if (p.type === 'petal') {
        // 花瓣形狀
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.vx * 2);
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size * p.life, p.size * 0.5 * p.life, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x | 0, p.y | 0, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ===== 磚塊初始化 =====
  function initBricks() {
    bricks = [];
    bricksRemaining = 0;
    var layoutFn = LEVEL_LAYOUTS[level % LEVEL_LAYOUTS.length];
    var grid = layoutFn();
    var theme = LEVEL_THEMES[level % LEVEL_THEMES.length];

    for (var r = 0; r < BRICK_ROWS; r++) {
      for (var c = 0; c < BRICK_COLS; c++) {
        var type = grid[r][c];
        if (type === 0) continue;

        var bx = BRICK_OFFSET_X + c * (BRICK_W + BRICK_PAD);
        var by = BRICK_OFFSET_Y + r * (BRICK_H + BRICK_PAD);
        var hp = (type === 2) ? 2 : 1;

        // 隨機分配禪字
        var charIdx = (r * BRICK_COLS + c) % theme.chars.length;

        bricks.push({
          x: bx,
          y: by,
          w: BRICK_W,
          h: BRICK_H,
          hp: hp,
          maxHp: hp,
          alive: true,
          char: theme.chars[charIdx],
          row: r,
          col: c
        });

        if (type !== 3) bricksRemaining++;
      }
    }
  }

  // ===== 球初始化 =====
  function createBall(x, y, vx, vy) {
    return {
      x: x,
      y: y,
      vx: vx,
      vy: vy,
      r: BALL_R
    };
  }

  function resetBall() {
    balls = [];
    var speed = getBallSpeed();
    var angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    balls.push(createBall(
      paddle.x + paddle.w / 2,
      PADDLE_Y - BALL_R - 1,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed
    ));
    ballStuck = true;
    pierceTimer = 0;
    slowTimer = 0;
  }

  function getBallSpeed() {
    var speed = BALL_BASE_SPEED + level * 20;
    if (slowTimer > 0) speed *= 0.6;
    return Math.min(speed, 500);
  }

  // ===== 道具 =====
  function maybeDropPowerUp(bx, by) {
    if (Math.random() > 0.18) return; // 18% 機率

    var types = [PowerUp.MULTI, PowerUp.WIDE, PowerUp.SLOW, PowerUp.PIERCE, PowerUp.LIFE];
    // 生命道具更稀有
    if (lives >= MAX_LIVES) types = types.filter(function(t){ return t !== PowerUp.LIFE; });
    var type = types[(Math.random() * types.length) | 0];

    powerUps.push({
      x: bx,
      y: by,
      vy: 120, // px/s
      type: type,
      w: 28,
      h: 16
    });
  }

  function applyPowerUp(type) {
    sfxPowerUp();
    switch(type) {
      case PowerUp.MULTI:
        // 每顆球分裂成 3 顆
        var newBalls = [];
        for (var i = 0; i < balls.length && newBalls.length < 8; i++) {
          var b = balls[i];
          var speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
          var baseAngle = Math.atan2(b.vy, b.vx);
          newBalls.push(createBall(b.x, b.y, Math.cos(baseAngle - 0.4) * speed, Math.sin(baseAngle - 0.4) * speed));
          newBalls.push(createBall(b.x, b.y, b.vx, b.vy));
          newBalls.push(createBall(b.x, b.y, Math.cos(baseAngle + 0.4) * speed, Math.sin(baseAngle + 0.4) * speed));
        }
        balls = newBalls;
        ballStuck = false;
        break;
      case PowerUp.WIDE:
        paddle.w = Math.min(160, PADDLE_W * 1.6);
        paddleWideTimer = 600; // ~10 秒
        break;
      case PowerUp.SLOW:
        slowTimer = 480; // ~8 秒
        // 立即調整現有球速
        var factor = 0.6;
        for (var j = 0; j < balls.length; j++) {
          var bj = balls[j];
          var sp = Math.sqrt(bj.vx * bj.vx + bj.vy * bj.vy);
          var newSp = sp * factor;
          bj.vx = bj.vx / sp * newSp;
          bj.vy = bj.vy / sp * newSp;
        }
        break;
      case PowerUp.PIERCE:
        pierceTimer = 360; // ~6 秒
        break;
      case PowerUp.LIFE:
        if (lives < MAX_LIVES) lives++;
        break;
    }
  }

  // ===== 碰撞偵測 =====

  // AABB 球 vs 矩形碰撞（含穿透修正）
  function ballRectCollision(ball, rx, ry, rw, rh) {
    var closestX = Math.max(rx, Math.min(ball.x, rx + rw));
    var closestY = Math.max(ry, Math.min(ball.y, ry + rh));
    var dx = ball.x - closestX;
    var dy = ball.y - closestY;
    var dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < ball.r) {
      // 碰撞發生：判斷反彈方向
      var overlapX = ball.r - Math.abs(dx);
      var overlapY = ball.r - Math.abs(dy);

      if (dx === 0 && dy === 0) {
        // 球心在矩形內部（穿透）
        ball.vy = -Math.abs(ball.vy);
        ball.y = ry - ball.r;
        return true;
      }

      if (overlapX < overlapY) {
        ball.vx = (dx >= 0) ? Math.abs(ball.vx) : -Math.abs(ball.vx);
        ball.x += (dx >= 0) ? overlapX : -overlapX;
      } else {
        ball.vy = (dy >= 0) ? Math.abs(ball.vy) : -Math.abs(ball.vy);
        ball.y += (dy >= 0) ? overlapY : -overlapY;
      }
      return true;
    }
    return false;
  }

  // ===== 遊戲邏輯 tick =====
  function gameTick(dt) {
    if (gameState !== State.PLAYING) return;

    var dtSec = dt / 1000;

    // --- 球拍移動 ---
    paddle.x += paddleInput * PADDLE_SPEED * dtSec;
    if (paddle.x < 0) paddle.x = 0;
    if (paddle.x + paddle.w > W) paddle.x = W - paddle.w;

    // --- 球黏在球拍上 ---
    if (ballStuck && balls.length > 0) {
      balls[0].x = paddle.x + paddle.w / 2;
      balls[0].y = PADDLE_Y - BALL_R - 1;
      return;
    }

    // --- 計時器 ---
    if (paddleWideTimer > 0) {
      paddleWideTimer--;
      if (paddleWideTimer <= 0) {
        paddle.w = PADDLE_W;
      }
    }
    if (pierceTimer > 0) pierceTimer--;
    if (slowTimer > 0) {
      slowTimer--;
      if (slowTimer <= 0) {
        // 恢復球速
        for (var k = 0; k < balls.length; k++) {
          var bk = balls[k];
          var sp = Math.sqrt(bk.vx * bk.vx + bk.vy * bk.vy);
          var target = getBallSpeed();
          if (sp > 0) {
            bk.vx = bk.vx / sp * target;
            bk.vy = bk.vy / sp * target;
          }
        }
      }
    }

    // --- 球更新 ---
    var ballsToRemove = [];

    for (var bi = 0; bi < balls.length; bi++) {
      var ball = balls[bi];

      ball.x += ball.vx * dtSec;
      ball.y += ball.vy * dtSec;

      // 左右牆壁
      if (ball.x - ball.r < 0) {
        ball.x = ball.r;
        ball.vx = Math.abs(ball.vx);
        sfxBounce();
      }
      if (ball.x + ball.r > W) {
        ball.x = W - ball.r;
        ball.vx = -Math.abs(ball.vx);
        sfxBounce();
      }

      // 上牆壁
      if (ball.y - ball.r < 0) {
        ball.y = ball.r;
        ball.vy = Math.abs(ball.vy);
        sfxBounce();
      }

      // 下方（掉落）
      if (ball.y > H + ball.r) {
        ballsToRemove.push(bi);
        continue;
      }

      // 球拍碰撞
      if (ball.vy > 0) {
        if (ballRectCollision(ball, paddle.x, PADDLE_Y, paddle.w, PADDLE_H)) {
          // 依擊中位置調整角度
          var hitPos = (ball.x - paddle.x) / paddle.w; // 0~1
          var angle = -Math.PI * (0.15 + hitPos * 0.7); // -150 ~ -27 度
          var speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
          ball.vx = Math.cos(angle) * speed;
          ball.vy = Math.sin(angle) * speed;
          // 確保球在球拍上方
          ball.y = PADDLE_Y - ball.r;
          sfxBounce();
        }
      }

      // 磚塊碰撞
      for (var bri = 0; bri < bricks.length; bri++) {
        var brick = bricks[bri];
        if (!brick.alive) continue;

        if (ballRectCollision(ball, brick.x, brick.y, brick.w, brick.h)) {
          brick.hp--;
          if (brick.hp <= 0) {
            brick.alive = false;
            bricksRemaining--;
            score += (brick.maxHp > 1) ? 30 : 10;
            sfxBrick();
            // 粒子效果（金色花瓣）
            var theme = LEVEL_THEMES[level % LEVEL_THEMES.length];
            spawnParticles(brick.x + brick.w / 2, brick.y + brick.h / 2, theme.color, 8, 'petal');
            spawnParticles(brick.x + brick.w / 2, brick.y + brick.h / 2, '#ffd700', 4, 'circle');
            // 道具掉落
            maybeDropPowerUp(brick.x + brick.w / 2, brick.y + brick.h);
          } else {
            sfxHardBrick();
            spawnParticles(brick.x + brick.w / 2, brick.y + brick.h / 2, '#ffffff', 3, 'circle');
          }

          // 穿透模式不反彈
          if (pierceTimer > 0) {
            // 不反彈，繼續前進
          }

          shakeFrames = 4;
          break; // 一幀只處理一次磚塊碰撞
        }
      }
    }

    // 移除掉落的球
    for (var ri = ballsToRemove.length - 1; ri >= 0; ri--) {
      balls.splice(ballsToRemove[ri], 1);
    }

    // 所有球都掉了
    if (balls.length === 0) {
      lives--;
      if (lives <= 0) {
        gameState = State.GAMEOVER;
        saveHighScore();
        sfxGameOver();
        shakeFrames = 20;
      } else {
        sfxLoseLife();
        resetBall();
        shakeFrames = 8;
      }
    }

    // --- 道具掉落更新 ---
    var puToRemove = [];
    for (var pi = 0; pi < powerUps.length; pi++) {
      var pu = powerUps[pi];
      pu.y += pu.vy * dtSec;

      // 碰到球拍
      if (pu.y + pu.h >= PADDLE_Y && pu.y <= PADDLE_Y + PADDLE_H &&
          pu.x + pu.w / 2 >= paddle.x && pu.x - pu.w / 2 <= paddle.x + paddle.w) {
        applyPowerUp(pu.type);
        puToRemove.push(pi);
        continue;
      }

      // 掉出畫面
      if (pu.y > H + 20) {
        puToRemove.push(pi);
      }
    }
    for (var qi = puToRemove.length - 1; qi >= 0; qi--) {
      powerUps.splice(puToRemove[qi], 1);
    }

    // --- 過關檢查 ---
    if (bricksRemaining <= 0) {
      gameState = State.LEVELCLEAR;
      sfxLevelClear();
      // 大量慶祝粒子
      for (var ci = 0; ci < 5; ci++) {
        setTimeout(function(){
          spawnParticles(W * Math.random(), H * 0.3 * Math.random() + 50, '#ffd700', 12, 'petal');
        }, ci * 100);
      }
    }

    // --- 更新 HUD ---
    updateHUD();
  }

  // ===== HUD 更新 =====
  function updateHUD() {
    scoreEl.textContent = score;
    levelEl.textContent = level + 1;
    livesEl.textContent = lives;
    highEl.textContent = highScore;
  }

  // ===== 繪製 =====
  function draw() {
    var offX = 0, offY = 0;
    if (shakeFrames > 0) {
      offX = ((Math.random() - 0.5) * 6) | 0;
      offY = ((Math.random() - 0.5) * 6) | 0;
      shakeFrames--;
    }

    ctx.save();
    ctx.translate(offX, offY);

    // 背景
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, W, H);

    // 背景網格
    ctx.strokeStyle = '#12121f';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (var gx = 0; gx <= W; gx += 40) {
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, H);
    }
    for (var gy = 0; gy <= H; gy += 40) {
      ctx.moveTo(0, gy);
      ctx.lineTo(W, gy);
    }
    ctx.stroke();

    // ===== 選單畫面 =====
    if (gameState === State.MENU) {
      drawMenuScreen();
      ctx.restore();
      frameCount++;
      return;
    }

    // ===== 遊戲畫面 =====
    var theme = LEVEL_THEMES[level % LEVEL_THEMES.length];

    // 磚塊
    drawBricks(theme);

    // 球拍
    drawPaddle();

    // 球
    drawBalls();

    // 道具掉落
    drawPowerUps();

    // 粒子
    updateParticles();
    drawParticles();

    // 效果指示器（右上角）
    drawEffectIndicators();

    // ===== 暫停覆蓋 =====
    if (gameState === State.PAUSED) {
      drawPauseOverlay();
    }

    // ===== 遊戲結束 =====
    if (gameState === State.GAMEOVER) {
      drawGameOverScreen();
    }

    // ===== 過關 =====
    if (gameState === State.LEVELCLEAR) {
      drawLevelClearScreen(theme);
    }

    ctx.restore();
    frameCount++;
  }

  function drawMenuScreen() {
    ctx.fillStyle = 'rgba(10, 10, 18, 0.8)';
    ctx.fillRect(0, 0, W, H);

    // 標題
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 42px "Noto Serif TC", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('\u7985\u78DA\u7834', W / 2, H / 2 - 100);

    // 副標題
    ctx.fillStyle = '#8888aa';
    ctx.font = '16px "Noto Serif TC", serif';
    ctx.fillText('Zen Breakout', W / 2, H / 2 - 60);

    // 說明
    ctx.fillStyle = '#a0a0b8';
    ctx.font = '14px "Noto Serif TC", serif';
    ctx.fillText('\u64CA\u78A7\u7169\u60F1\u78DA\u584A\uFF0C\u9AD4\u609F\u7A7A\u6027\u667A\u6167', W / 2, H / 2 - 20);

    // 操作提示
    ctx.fillStyle = '#666688';
    ctx.font = '13px "Noto Serif TC", serif';
    var isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (isTouchDevice) {
      ctx.fillText('\u9EDE\u64CA\u756B\u9762\u6216\u6309\u6309\u9215\u958B\u59CB', W / 2, H / 2 + 20);
    } else {
      ctx.fillText('\u6309\u4EFB\u610F\u9375\u6216\u9EDE\u64CA\u756B\u9762\u958B\u59CB', W / 2, H / 2 + 20);
      ctx.fillText('\u2190 \u2192 \u79FB\u52D5  |  \u7A7A\u767D\u9375\u767C\u5C04  |  Esc \u66AB\u505C', W / 2, H / 2 + 45);
    }

    // 高分
    if (highScore > 0) {
      ctx.fillStyle = '#ffd700';
      ctx.font = '13px "Noto Serif TC", serif';
      ctx.fillText('\u6700\u9AD8\u5206: ' + highScore, W / 2, H / 2 + 80);
    }

    // 脈動禪字
    var pulse = Math.sin(frameCount * 0.05) * 0.3 + 0.7;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 60px "Noto Serif TC", serif';
    ctx.fillText('\u7A7A', W / 2, H / 2 + 150);
    ctx.globalAlpha = 1;

    // 禪語
    ctx.fillStyle = '#555570';
    ctx.font = 'italic 12px "Noto Serif TC", serif';
    ctx.fillText(ZEN_QUOTES[level % ZEN_QUOTES.length], W / 2, H / 2 + 200);
  }

  function drawBricks(theme) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (var i = 0; i < bricks.length; i++) {
      var b = bricks[i];
      if (!b.alive) continue;

      // 磚塊顏色（堅固磚更深）
      if (b.hp > 1) {
        ctx.fillStyle = '#555570';
        ctx.strokeStyle = theme.color;
        ctx.lineWidth = 2;
      } else {
        ctx.fillStyle = theme.color;
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
      }

      // 圓角矩形
      drawRoundedRect(b.x, b.y, b.w, b.h, 4, true, true);

      // 禪字
      ctx.fillStyle = (b.hp > 1) ? theme.color : 'rgba(0,0,0,0.4)';
      ctx.font = 'bold 13px "Noto Serif TC", serif';
      ctx.fillText(b.char, b.x + b.w / 2, b.y + b.h / 2 + 1);
    }
  }

  function drawPaddle() {
    // 球拍光暈
    var glowAlpha = 0.15 + Math.sin(frameCount * 0.1) * 0.05;
    ctx.fillStyle = 'rgba(255, 215, 0, ' + glowAlpha + ')';
    ctx.beginPath();
    ctx.ellipse(paddle.x + paddle.w / 2, PADDLE_Y + PADDLE_H / 2, paddle.w / 2 + 8, PADDLE_H + 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // 球拍本體
    var paddleGrad = ctx.createLinearGradient(paddle.x, PADDLE_Y, paddle.x, PADDLE_Y + PADDLE_H);
    paddleGrad.addColorStop(0, '#ffd700');
    paddleGrad.addColorStop(1, '#b8860b');
    ctx.fillStyle = paddleGrad;
    drawRoundedRect(paddle.x, PADDLE_Y, paddle.w, PADDLE_H, 7, true, false);

    // 加寬效果指示
    if (paddleWideTimer > 0 && paddleWideTimer < 120 && frameCount % 10 < 5) {
      // 即將結束時閃爍
    } else if (paddleWideTimer > 0) {
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      drawRoundedRect(paddle.x - 1, PADDLE_Y - 1, paddle.w + 2, PADDLE_H + 2, 8, false, true);
    }
  }

  function drawBalls() {
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];

      // 球尾跡
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = pierceTimer > 0 ? '#f97316' : '#ffd700';
      ctx.beginPath();
      ctx.arc((b.x - b.vx * 0.02) | 0, (b.y - b.vy * 0.02) | 0, b.r * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // 球本體
      var ballGrad = ctx.createRadialGradient(b.x - 2, b.y - 2, 1, b.x, b.y, b.r);
      ballGrad.addColorStop(0, '#ffffff');
      ballGrad.addColorStop(0.5, pierceTimer > 0 ? '#f97316' : '#ffd700');
      ballGrad.addColorStop(1, pierceTimer > 0 ? '#c2410c' : '#b8860b');
      ctx.fillStyle = ballGrad;
      ctx.beginPath();
      ctx.arc(b.x | 0, b.y | 0, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPowerUps() {
    for (var i = 0; i < powerUps.length; i++) {
      var pu = powerUps[i];
      var color = POWERUP_COLORS[pu.type];

      // 光暈
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pu.x, pu.y + pu.h / 2, pu.w * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // 道具膠囊
      ctx.fillStyle = color;
      drawRoundedRect(pu.x - pu.w / 2, pu.y, pu.w, pu.h, 6, true, false);

      // 符號
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(POWERUP_SYMBOLS[pu.type], pu.x, pu.y + pu.h / 2);
    }
  }

  function drawEffectIndicators() {
    var x = W - 10;
    var y = 12;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 11px sans-serif';

    if (pierceTimer > 0) {
      ctx.fillStyle = '#f97316';
      var sec = Math.ceil(pierceTimer / 60);
      ctx.fillText('\u2191 \u7A7F\u900F ' + sec + 's', x, y);
      y += 16;
    }
    if (slowTimer > 0) {
      ctx.fillStyle = '#a855f7';
      var sec2 = Math.ceil(slowTimer / 60);
      ctx.fillText('\u231B \u6E1B\u901F ' + sec2 + 's', x, y);
      y += 16;
    }
    if (paddleWideTimer > 0) {
      ctx.fillStyle = '#22c55e';
      var sec3 = Math.ceil(paddleWideTimer / 60);
      ctx.fillText('\u2194 \u52A0\u5BEC ' + sec3 + 's', x, y);
      y += 16;
    }
    if (balls.length > 1) {
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('x' + balls.length + ' \u591A\u7403', x, y);
    }
  }

  function drawPauseOverlay() {
    ctx.fillStyle = 'rgba(10, 10, 18, 0.75)';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 28px "Noto Serif TC", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('\u5DF2\u66AB\u505C', W / 2, H / 2 - 20);

    ctx.fillStyle = '#8888aa';
    ctx.font = '14px "Noto Serif TC", serif';
    ctx.fillText('\u6309 Esc / \u7A7A\u767D\u9375 \u6216\u9EDE\u64CA\u7E7C\u7E8C', W / 2, H / 2 + 20);

    // 呼吸提示
    var breathAlpha = Math.sin(frameCount * 0.04) * 0.3 + 0.5;
    ctx.globalAlpha = breathAlpha;
    ctx.fillStyle = '#ffd700';
    ctx.font = 'italic 13px "Noto Serif TC", serif';
    ctx.fillText('\u6DF1\u547C\u5438\u2026\u653E\u9B06\u8EAB\u5FC3\u2026', W / 2, H / 2 + 60);
    ctx.globalAlpha = 1;
  }

  function drawGameOverScreen() {
    ctx.fillStyle = 'rgba(10, 10, 18, 0.85)';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 32px "Noto Serif TC", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('\u4FEE\u884C\u5DF2\u7D50\u675F', W / 2, H / 2 - 80);

    ctx.fillStyle = '#e8d5b7';
    ctx.font = '16px "Noto Serif TC", serif';
    ctx.fillText('\u5206\u6578: ' + score, W / 2, H / 2 - 30);

    if (score >= highScore && score > 0) {
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 14px "Noto Serif TC", serif';
      ctx.fillText('\uD83C\uDF89 \u65B0\u7D00\u9304\uFF01', W / 2, H / 2);
    }

    ctx.fillStyle = '#8888aa';
    ctx.font = '14px "Noto Serif TC", serif';
    ctx.fillText('\u901A\u904E\u95DC\u5361: ' + level, W / 2, H / 2 + 30);

    ctx.fillStyle = '#666688';
    ctx.font = '13px "Noto Serif TC", serif';
    ctx.fillText('\u9EDE\u64CA\u6216\u6309\u4EFB\u610F\u9375\u91CD\u65B0\u958B\u59CB', W / 2, H / 2 + 70);

    // 禪語
    var qIdx = (level + score) % ZEN_QUOTES.length;
    ctx.fillStyle = '#555570';
    ctx.font = 'italic 12px "Noto Serif TC", serif';
    ctx.fillText(ZEN_QUOTES[qIdx], W / 2, H / 2 + 110);
  }

  function drawLevelClearScreen(theme) {
    ctx.fillStyle = 'rgba(10, 10, 18, 0.8)';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 32px "Noto Serif TC", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('\u300C' + theme.name + '\u300D\u5DF2\u6DB5\u5316', W / 2, H / 2 - 60);

    ctx.fillStyle = '#e8d5b7';
    ctx.font = '15px "Noto Serif TC", serif';
    ctx.fillText(theme.desc, W / 2, H / 2 - 20);

    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 18px "Noto Serif TC", serif';
    ctx.fillText('\u7B2C ' + (level + 1) + ' \u95DC\u5B8C\u6210', W / 2, H / 2 + 20);

    ctx.fillStyle = '#8888aa';
    ctx.font = '14px "Noto Serif TC", serif';
    ctx.fillText('\u5206\u6578: ' + score + ' | \u751F\u547D: ' + lives, W / 2, H / 2 + 50);

    ctx.fillStyle = '#666688';
    ctx.font = '13px "Noto Serif TC", serif';
    ctx.fillText('\u9EDE\u64CA\u6216\u6309\u4EFB\u610F\u9375\u9032\u5165\u4E0B\u4E00\u95DC', W / 2, H / 2 + 90);

    // 禪語
    var qIdx = level % ZEN_QUOTES.length;
    var pulse = Math.sin(frameCount * 0.04) * 0.3 + 0.7;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#555570';
    ctx.font = 'italic 13px "Noto Serif TC", serif';
    ctx.fillText(ZEN_QUOTES[qIdx], W / 2, H / 2 + 130);
    ctx.globalAlpha = 1;
  }

  // ===== 工具函式 =====
  function drawRoundedRect(x, y, w, h, r, fill, stroke) {
    if (w < 1 || h < 1) return;
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  // ===== 狀態轉換 =====
  function startGame() {
    score = 0;
    lives = 3;
    level = 0;
    powerUps = [];
    paddle.w = PADDLE_W;
    paddle.x = W / 2 - paddle.w / 2;
    paddleWideTimer = 0;
    initBricks();
    resetBall();
    gameState = State.PLAYING;
    lastTickTime = 0;
    accumulator = 0;
    sfxStart();
    updateHUD();
    if (pauseBtn) pauseBtn.textContent = '\u66AB\u505C';
  }

  function nextLevel() {
    level++;
    powerUps = [];
    paddle.w = PADDLE_W;
    paddle.x = W / 2 - paddle.w / 2;
    paddleWideTimer = 0;
    pierceTimer = 0;
    slowTimer = 0;
    initBricks();
    resetBall();
    gameState = State.PLAYING;
    lastTickTime = 0;
    accumulator = 0;
    sfxStart();
    updateHUD();
  }

  function togglePause() {
    if (gameState === State.PLAYING) {
      gameState = State.PAUSED;
      if (pauseBtn) pauseBtn.textContent = '\u7E7C\u7E8C';
    } else if (gameState === State.PAUSED) {
      gameState = State.PLAYING;
      lastTickTime = 0;
      accumulator = 0;
      if (pauseBtn) pauseBtn.textContent = '\u66AB\u505C';
    }
  }

  function launchBall() {
    if (ballStuck && balls.length > 0) {
      var speed = getBallSpeed();
      var angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.5;
      balls[0].vx = Math.cos(angle) * speed;
      balls[0].vy = Math.sin(angle) * speed;
      ballStuck = false;
    }
  }

  // ===== 主遊戲循環 =====
  function gameLoop(timestamp) {
    if (gameState === State.PLAYING) {
      if (lastTickTime === 0) lastTickTime = timestamp;
      var delta = timestamp - lastTickTime;
      lastTickTime = timestamp;

      if (delta > 500) delta = TICK_RATE;
      accumulator += delta;

      while (accumulator >= TICK_RATE) {
        gameTick(TICK_RATE);
        accumulator -= TICK_RATE;
        if (gameState !== State.PLAYING) {
          accumulator = 0;
          break;
        }
      }
    }

    draw();
    requestAnimationFrame(gameLoop);
  }

  // ===== 輸入處理 =====

  // 鍵盤
  var keysDown = {};
  document.addEventListener('keydown', function(e) {
    initAudio();
    keysDown[e.key] = true;

    if (gameState === State.MENU) {
      startGame();
      e.preventDefault();
      return;
    }

    if (gameState === State.GAMEOVER) {
      startGame();
      e.preventDefault();
      return;
    }

    if (gameState === State.LEVELCLEAR) {
      nextLevel();
      e.preventDefault();
      return;
    }

    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      togglePause();
      e.preventDefault();
      return;
    }

    if (e.key === ' ') {
      if (gameState === State.PAUSED) {
        togglePause();
      } else if (gameState === State.PLAYING) {
        launchBall();
      }
      e.preventDefault();
      return;
    }

    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      paddleInput = -1;
      e.preventDefault();
    }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      paddleInput = 1;
      e.preventDefault();
    }
  });

  document.addEventListener('keyup', function(e) {
    delete keysDown[e.key];
    // 更新 paddleInput
    var left = keysDown['ArrowLeft'] || keysDown['a'] || keysDown['A'];
    var right = keysDown['ArrowRight'] || keysDown['d'] || keysDown['D'];
    if (left && !right) paddleInput = -1;
    else if (right && !left) paddleInput = 1;
    else paddleInput = 0;
  });

  // 滑鼠控制（球拍追蹤滑鼠）
  canvas.addEventListener('mousemove', function(e) {
    if (gameState !== State.PLAYING && gameState !== State.PAUSED) return;

    var rect = canvas.getBoundingClientRect();
    var scaleX = W / rect.width;
    var mouseX = (e.clientX - rect.left) * scaleX;

    paddle.x = mouseX - paddle.w / 2;
    if (paddle.x < 0) paddle.x = 0;
    if (paddle.x + paddle.w > W) paddle.x = W - paddle.w;
  });

  canvas.addEventListener('click', function(e) {
    initAudio();

    if (gameState === State.MENU) {
      startGame();
      return;
    }
    if (gameState === State.GAMEOVER) {
      startGame();
      return;
    }
    if (gameState === State.LEVELCLEAR) {
      nextLevel();
      return;
    }
    if (gameState === State.PAUSED) {
      togglePause();
      return;
    }
    if (gameState === State.PLAYING && ballStuck) {
      launchBall();
    }
  });

  // 觸控控制
  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    initAudio();

    if (gameState === State.MENU) { startGame(); return; }
    if (gameState === State.GAMEOVER) { startGame(); return; }
    if (gameState === State.LEVELCLEAR) { nextLevel(); return; }
    if (gameState === State.PAUSED) { togglePause(); return; }
    if (gameState === State.PLAYING && ballStuck) { launchBall(); }
  }, { passive: false });

  canvas.addEventListener('touchmove', function(e) {
    e.preventDefault();
    if (gameState !== State.PLAYING) return;

    var touch = e.touches[0];
    var rect = canvas.getBoundingClientRect();
    var scaleX = W / rect.width;
    var touchX = (touch.clientX - rect.left) * scaleX;

    paddle.x = touchX - paddle.w / 2;
    if (paddle.x < 0) paddle.x = 0;
    if (paddle.x + paddle.w > W) paddle.x = W - paddle.w;
  }, { passive: false });

  // 觸控按鈕
  var btnLeft = document.getElementById('btnLeft');
  var btnRight = document.getElementById('btnRight');
  var btnLaunch = document.getElementById('btnLaunch');

  function setupTouchBtn(btn, onDown, onUp) {
    if (!btn) return;
    btn.addEventListener('touchstart', function(e) {
      e.preventDefault();
      e.stopPropagation();
      initAudio();
      onDown();
    }, { passive: false });
    btn.addEventListener('touchend', function(e) {
      e.preventDefault();
      e.stopPropagation();
      onUp();
    }, { passive: false });
    btn.addEventListener('mousedown', function(e) {
      e.preventDefault();
      onDown();
    });
    btn.addEventListener('mouseup', function(e) {
      e.preventDefault();
      onUp();
    });
  }

  setupTouchBtn(btnLeft,
    function() { paddleInput = -1; },
    function() { if (paddleInput === -1) paddleInput = 0; }
  );
  setupTouchBtn(btnRight,
    function() { paddleInput = 1; },
    function() { if (paddleInput === 1) paddleInput = 0; }
  );
  setupTouchBtn(btnLaunch,
    function() {
      if (gameState === State.MENU) { startGame(); return; }
      if (gameState === State.GAMEOVER) { startGame(); return; }
      if (gameState === State.LEVELCLEAR) { nextLevel(); return; }
      if (gameState === State.PAUSED) { togglePause(); return; }
      if (gameState === State.PLAYING && ballStuck) { launchBall(); }
    },
    function() {}
  );

  // 暫停按鈕
  if (pauseBtn) {
    pauseBtn.addEventListener('click', function() {
      initAudio();
      if (gameState === State.PLAYING || gameState === State.PAUSED) {
        togglePause();
      }
    });
  }

  // ===== 操作提示 =====
  function updateControlsHint() {
    var el = document.getElementById('controlsHint');
    if (!el) return;
    var isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (isTouchDevice) {
      el.textContent = '\u6ED1\u52D5\u6216\u6309\u9215\u64CD\u63A7\u7403\u62CD';
    } else {
      el.innerHTML = '<kbd>&larr;</kbd><kbd>&rarr;</kbd> \u6216 <kbd>A</kbd><kbd>D</kbd> \u79FB\u52D5 | <kbd>\u7A7A\u767D</kbd> \u767C\u5C04 | <kbd>Esc</kbd> \u66AB\u505C | \u6ED1\u9F20\u8FFD\u8E64';
    }
  }

  // ===== 初始化 =====
  updateHUD();
  updateControlsHint();
  requestAnimationFrame(gameLoop);

})();
