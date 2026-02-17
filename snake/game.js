/**
 * 貪吃蛇 - 道具系統版
 *
 * 品質改善項目：
 * 1. [P0] 遊戲循環從 setInterval 改為 requestAnimationFrame + 固定時間步長
 * 2. [P0] 新增觸控支援（滑動手勢 + 虛擬方向按鈕）
 * 3. [P1] 移除不存在的外部 CSS 依賴，樣式自包含
 * 4. [P1] Canvas 響應式設計（自動縮放）
 * 5. [P1] 新增 Esc 暫停支援
 * 6. [P2] 完整狀態機（menu → playing → paused → gameover）
 * 7. 保留原有功能：金色食物、速度漸進、音效、高分紀錄、輸入緩衝
 * 8. [NEW] 道具系統：冰凍減速、毒食物縮短、傳送門、護盾保護
 *
 * 效能優化（參考知識庫 HTML5 遊戲開發指南）：
 * - requestAnimationFrame 自動暫停不可見頁面
 * - 整數座標避免子像素渲染
 * - 批次繪製減少 context 切換
 * - 固定時間步長確保跨裝置一致的遊戲速度
 *
 * 2026-02-17 優化：
 * - [P0] 粒子系統改用物件池 + swap-and-pop，消除 splice 的 O(n) 搬移及 GC 壓力
 * - [P1] 新增 Canvas 滑鼠 click 事件（桌面用戶可直接點擊開始）
 * - [P1] Combo 連擊系統（連續吃食物加分，視覺 + 音效回饋）
 * - [P1] 速度里程碑提示（每升 2 級 Canvas 內顯示提示文字）
 * - [P2] 遊戲結束畫面增強（存活時間、吃食物數、最長 Combo）
 * - [P2] 蛇身顏色快取（預計算漸層顏色陣列，避免每幀逐段重算）
 */

(function () {
  'use strict';

  // === 常數 ===
  const CELL = 20;
  const COLS = 20;
  const ROWS = 20;
  const LOGICAL_WIDTH = COLS * CELL;
  const LOGICAL_HEIGHT = ROWS * CELL;

  // === 狀態機 ===
  const State = {
    MENU: 'menu',
    PLAYING: 'playing',
    PAUSED: 'paused',
    GAMEOVER: 'gameover'
  };

  // === 遊戲狀態 ===
  let gameState = State.MENU;
  let snake = [{ x: 10, y: 10 }];
  let dir = { x: 0, y: 0 };
  let food = null;
  let goldenFood = null;
  let score = 0;
  let highScore = loadHighScore();
  let baseSpeed = 120; // ms per tick
  let currentSpeed = baseSpeed;
  let inputBuffer = [];
  let frameCount = 0;
  let shakeFrames = 0;
  let lastTickTime = 0;
  let accumulator = 0;

  // === 開場無敵期（新手友好）===
  var gracePeriodTicks = 0;  // 開場免死 tick 數

  // === Combo 連擊系統 ===
  var comboCount = 0;        // 連續吃食物次數
  var comboTimer = 0;        // Combo 有效倒數（tick 數）
  var COMBO_WINDOW = 12;     // 吃完食物後的 Combo 有效 tick 窗口
  var maxCombo = 0;          // 本局最長 Combo
  var comboDisplayTimer = 0; // Combo 提示文字顯示倒計時（幀數）
  var comboDisplayText = ''; // Combo 提示文字內容

  // === 速度里程碑 ===
  var lastSpeedLevel = 0;         // 上次顯示里程碑的速度等級
  var milestoneDisplayTimer = 0;  // 里程碑提示文字顯示倒計時（幀數）
  var milestoneDisplayText = '';   // 里程碑提示文字內容

  // === 遊戲統計（遊戲結束畫面用）===
  var gameStartTime = 0;    // 遊戲開始時間戳
  var totalFoodEaten = 0;   // 吃掉的食物總數（普通 + 金色 + 道具）

  // === 蛇身顏色快取 ===
  var snakeColorCache = [];      // 預計算的蛇身顏色陣列
  var snakeColorCacheLen = 0;    // 快取有效長度

  function updateSnakeColorCache(length) {
    if (length <= 1) return;
    // 只在長度變化時重算
    if (snakeColorCacheLen === length) return;
    snakeColorCacheLen = length;
    var maxIdx = length - 1;
    // 確保陣列長度足夠
    while (snakeColorCache.length < length) {
      snakeColorCache.push('');
    }
    for (var i = 1; i < length; i++) {
      var ratio = i / maxIdx;
      var r = (124 + ratio * 43 + 0.5) | 0;
      var g = (58 + ratio * 81 + 0.5) | 0;
      var b = (237 + ratio * 13 + 0.5) | 0;
      snakeColorCache[i] = 'rgb(' + r + ',' + g + ',' + b + ')';
    }
  }

  // === 道具系統 ===
  // 特殊食物類型定義
  var PowerUpType = {
    FREEZE: 'freeze',     // 冰凍減速
    POISON: 'poison',     // 毒食物（縮短蛇身 +5 分）
    PORTAL: 'portal',     // 傳送門
    SHIELD: 'shield'      // 護盾（免疫一次自撞）
  };

  var POWERUP_COLORS = {
    freeze: '#38bdf8',   // 天藍
    poison: '#22c55e',   // 綠色
    portal: '#a855f7',   // 紫色
    shield: '#f1f5f9'    // 白色
  };

  var POWERUP_SYMBOLS = {
    freeze: '\u2744',    // ❄
    poison: '\u2620',    // ☠
    portal: '\u00d7',    // ×（旋轉顯示成渦旋效果）
    shield: '\u2606'     // ☆
  };

  var powerUpFood = null;    // { x, y, type, ttl }
  var freezeTimer = 0;       // 冰凍剩餘 tick 數
  var hasShield = false;     // 護盾狀態
  var powerUpSpawnCD = 0;    // 特殊食物生成冷卻（避免同時出現太多）

  // === DOM 元素 ===
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const pauseBtn = document.getElementById('pauseBtn');

  // === 響應式 Canvas ===
  function resizeCanvas() {
    const container = canvas.parentElement;
    const maxWidth = Math.min(container.clientWidth - 16, 400);
    canvas.style.width = maxWidth + 'px';
    canvas.style.height = maxWidth + 'px';
    // 邏輯尺寸保持 400x400，CSS 縮放
    canvas.width = LOGICAL_WIDTH;
    canvas.height = LOGICAL_HEIGHT;
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // === 音效系統 (Web Audio API) ===
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let audioCtx = null;
  let soundEnabled = true;

  function initAudio() {
    if (!audioCtx) {
      audioCtx = new AudioCtx();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playTone(freq, duration, type, volume) {
    type = type || 'square';
    volume = volume || 0.3;
    if (!soundEnabled || !audioCtx) return;
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  }

  function playEatSound() {
    playTone(523, 0.1);
    setTimeout(function () { playTone(659, 0.1); }, 50);
  }

  function playGoldenEatSound() {
    playTone(784, 0.08);
    setTimeout(function () { playTone(988, 0.08); }, 40);
    setTimeout(function () { playTone(1175, 0.15); }, 80);
  }

  function playGameOverSound() {
    playTone(294, 0.2, 'sawtooth', 0.4);
    setTimeout(function () { playTone(247, 0.3, 'sawtooth', 0.3); }, 150);
    setTimeout(function () { playTone(196, 0.5, 'sawtooth', 0.2); }, 350);
  }

  function playStartSound() {
    playTone(440, 0.08, 'sine', 0.2);
    setTimeout(function () { playTone(554, 0.08, 'sine', 0.2); }, 60);
    setTimeout(function () { playTone(659, 0.12, 'sine', 0.2); }, 120);
  }

  // Combo 音效（音高隨 Combo 數遞增）
  function playComboSound(combo) {
    var baseFreq = 600 + Math.min(combo, 10) * 80;
    playTone(baseFreq, 0.06, 'sine', 0.15);
    setTimeout(function () { playTone(baseFreq * 1.25, 0.08, 'sine', 0.12); }, 30);
  }

  // 道具音效
  function playFreezeSound() {
    playTone(880, 0.06, 'sine', 0.2);
    setTimeout(function () { playTone(1320, 0.1, 'sine', 0.15); }, 40);
    setTimeout(function () { playTone(1760, 0.15, 'sine', 0.1); }, 80);
  }

  function playPoisonSound() {
    playTone(200, 0.1, 'sawtooth', 0.25);
    setTimeout(function () { playTone(300, 0.08, 'sawtooth', 0.2); }, 60);
    setTimeout(function () { playTone(500, 0.12, 'sine', 0.15); }, 120);
  }

  function playPortalSound() {
    playTone(400, 0.05, 'sine', 0.2);
    setTimeout(function () { playTone(600, 0.05, 'sine', 0.2); }, 30);
    setTimeout(function () { playTone(800, 0.05, 'sine', 0.2); }, 60);
    setTimeout(function () { playTone(1200, 0.1, 'sine', 0.15); }, 90);
  }

  function playShieldSound() {
    playTone(660, 0.08, 'triangle', 0.2);
    setTimeout(function () { playTone(880, 0.1, 'triangle', 0.2); }, 50);
    setTimeout(function () { playTone(1100, 0.15, 'triangle', 0.15); }, 100);
  }

  function playShieldBreakSound() {
    playTone(440, 0.1, 'triangle', 0.3);
    setTimeout(function () { playTone(330, 0.15, 'triangle', 0.2); }, 80);
  }

  // === 高分紀錄 ===
  function loadHighScore() {
    try {
      return parseInt(localStorage.getItem('snake_highScore') || '0', 10);
    } catch (e) {
      return 0;
    }
  }

  function saveHighScore() {
    try {
      if (score > highScore) {
        highScore = score;
        localStorage.setItem('snake_highScore', highScore.toString());
        return true;
      }
    } catch (e) {
      // localStorage 不可用時靜默失敗
    }
    return false;
  }

  // === 粒子效果系統（物件池 + swap-and-pop 優化）===
  var MAX_PARTICLES = 40;
  var particlePool = [];
  var activeParticleCount = 0;

  // 預分配粒子物件池，避免運行時 GC 壓力
  for (var _pi = 0; _pi < MAX_PARTICLES; _pi++) {
    particlePool.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, decay: 0, size: 0, color: '' });
  }

  function spawnEatParticles(cellX, cellY, color) {
    var centerX = cellX * CELL + CELL / 2;
    var centerY = cellY * CELL + CELL / 2;
    var count = Math.min(8, MAX_PARTICLES - activeParticleCount);
    for (var i = 0; i < count; i++) {
      var p = particlePool[activeParticleCount];
      var angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      var speed = 1.5 + Math.random() * 2;
      p.x = centerX;
      p.y = centerY;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.life = 1.0;
      p.decay = 0.03 + Math.random() * 0.02;
      p.size = 2 + Math.random() * 3;
      p.color = color;
      activeParticleCount++;
    }
  }

  function updateParticles() {
    var i = 0;
    while (i < activeParticleCount) {
      var p = particlePool[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      if (p.life <= 0) {
        // swap-and-pop: 用最後一個活躍粒子覆蓋當前位置，避免 splice 的 O(n) 搬移
        activeParticleCount--;
        var last = particlePool[activeParticleCount];
        particlePool[i] = last;
        particlePool[activeParticleCount] = p;
        // 不遞增 i，交換後的粒子還沒檢查
      } else {
        i++;
      }
    }
  }

  function drawParticles() {
    for (var i = 0; i < activeParticleCount; i++) {
      var p = particlePool[i];
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x | 0, p.y | 0, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // === 食物生成 ===
  function isOccupied(x, y) {
    if (snake.some(function (s) { return s.x === x && s.y === y; })) return true;
    if (food && food.x === x && food.y === y) return true;
    if (goldenFood && goldenFood.x === x && goldenFood.y === y) return true;
    if (powerUpFood && powerUpFood.x === x && powerUpFood.y === y) return true;
    return false;
  }

  function spawnFood() {
    var pos;
    do {
      pos = {
        x: (Math.random() * COLS) | 0,
        y: (Math.random() * ROWS) | 0
      };
    } while (isOccupied(pos.x, pos.y));
    return pos;
  }

  function maybeSpawnGoldenFood() {
    if (!goldenFood && Math.random() < 0.15) {
      var pos;
      do {
        pos = {
          x: (Math.random() * COLS) | 0,
          y: (Math.random() * ROWS) | 0
        };
      } while (isOccupied(pos.x, pos.y));
      goldenFood = { x: pos.x, y: pos.y, ttl: 50 };
    }
  }

  function maybeSpawnPowerUp() {
    if (powerUpFood || powerUpSpawnCD > 0) return;
    if (Math.random() >= 0.20) return; // 20% 機率

    var types = [PowerUpType.FREEZE, PowerUpType.POISON, PowerUpType.PORTAL, PowerUpType.SHIELD];
    var type = types[(Math.random() * types.length) | 0];

    // 毒食物需要蛇身至少 4 節才有意義
    if (type === PowerUpType.POISON && snake.length < 4) {
      type = PowerUpType.FREEZE;
    }
    // 護盾已有則換成冰凍
    if (type === PowerUpType.SHIELD && hasShield) {
      type = PowerUpType.FREEZE;
    }

    var pos;
    do {
      pos = {
        x: (Math.random() * COLS) | 0,
        y: (Math.random() * ROWS) | 0
      };
    } while (isOccupied(pos.x, pos.y));

    powerUpFood = { x: pos.x, y: pos.y, type: type, ttl: 40 };
    powerUpSpawnCD = 8; // 至少間隔 8 tick 才再生成
  }

  // === 速度漸進（放緩曲線：每 8 分加速 5ms，最低 60ms）===
  function calculateSpeed() {
    var speedBonus = ((score / 8) | 0) * 5;
    var base = Math.max(60, baseSpeed - speedBonus);
    // 冰凍效果：速度加倍（移動變慢）
    if (freezeTimer > 0) {
      return base * 2;
    }
    return base;
  }

  // === 速度等級計算 ===
  function getSpeedLevel() {
    return (score / 8) | 0;
  }

  // === Combo 處理 ===
  function onFoodEaten() {
    totalFoodEaten++;
    if (comboTimer > 0) {
      comboCount++;
    } else {
      comboCount = 1;
    }
    comboTimer = COMBO_WINDOW;

    if (comboCount > maxCombo) {
      maxCombo = comboCount;
    }

    // Combo >= 3 時給予額外加分和視覺回饋
    if (comboCount >= 3) {
      var bonus = Math.min(comboCount - 2, 5); // 最多額外 +5
      score += bonus;
      comboDisplayText = comboCount + 'x COMBO! +' + bonus;
      comboDisplayTimer = 60; // 顯示約 1 秒
      playComboSound(comboCount);
    }
  }

  // === 遊戲邏輯 tick ===
  function gameTick() {
    // 處理輸入緩衝
    if (inputBuffer.length > 0) {
      var nextDir = inputBuffer.shift();
      if (!(dir.x + nextDir.x === 0 && dir.y + nextDir.y === 0)) {
        dir = nextDir;
      }
    }

    var head = {
      x: (snake[0].x + dir.x + COLS) % COLS,
      y: (snake[0].y + dir.y + ROWS) % ROWS
    };

    // 無敵期倒數
    if (gracePeriodTicks > 0) gracePeriodTicks--;

    // 碰撞檢測（自撞）— 無敵期或護盾可免疫
    if (snake.some(function (s) { return s.x === head.x && s.y === head.y; })) {
      if (gracePeriodTicks > 0) {
        // 無敵期內免死，繼續遊戲
      } else if (hasShield) {
        hasShield = false;
        playShieldBreakSound();
        spawnEatParticles(head.x, head.y, '#f1f5f9');
        shakeFrames = 6;
        currentSpeed = calculateSpeed();
        updateScoreDisplay();
        return;
      } else {
        onGameOver();
        return;
      }
    }

    snake.unshift(head);

    var ate = false;

    // 金色食物
    if (goldenFood && head.x === goldenFood.x && head.y === goldenFood.y) {
      score += 3;
      playGoldenEatSound();
      spawnEatParticles(head.x, head.y, '#fbbf24');
      goldenFood = null;
      ate = true;
      snake.push({ x: snake[snake.length - 1].x, y: snake[snake.length - 1].y });
      snake.push({ x: snake[snake.length - 1].x, y: snake[snake.length - 1].y });
      onFoodEaten();
    }
    // 特殊食物（道具）
    else if (powerUpFood && head.x === powerUpFood.x && head.y === powerUpFood.y) {
      onCollectPowerUp(powerUpFood);
      powerUpFood = null;
      ate = true; // 某些道具不增長，但標記 ate 防止尾巴縮
      onFoodEaten();
    }
    // 普通食物
    else if (food && head.x === food.x && head.y === food.y) {
      score++;
      playEatSound();
      spawnEatParticles(head.x, head.y, '#ef4444');
      food = spawnFood();
      ate = true;
      maybeSpawnGoldenFood();
      maybeSpawnPowerUp();
      onFoodEaten();
    }

    if (!ate) {
      snake.pop();
    }

    // 金色食物計時
    if (goldenFood) {
      goldenFood.ttl--;
      if (goldenFood.ttl <= 0) {
        goldenFood = null;
      }
    }

    // 特殊食物計時
    if (powerUpFood) {
      powerUpFood.ttl--;
      if (powerUpFood.ttl <= 0) {
        powerUpFood = null;
      }
    }

    // 冰凍計時器
    if (freezeTimer > 0) {
      freezeTimer--;
    }

    // 特殊食物生成冷卻
    if (powerUpSpawnCD > 0) {
      powerUpSpawnCD--;
    }

    // Combo 計時器
    if (comboTimer > 0) {
      comboTimer--;
      if (comboTimer <= 0) {
        comboCount = 0;
      }
    }

    // 速度里程碑檢查（每升 2 級顯示）
    var currentLevel = getSpeedLevel();
    if (currentLevel > 0 && currentLevel >= lastSpeedLevel + 2) {
      lastSpeedLevel = currentLevel;
      var speedPct = Math.round((1 - calculateSpeed() / baseSpeed) * 100);
      milestoneDisplayText = 'LV.' + currentLevel + ' +' + speedPct + '%';
      milestoneDisplayTimer = 90; // 顯示約 1.5 秒
    }

    currentSpeed = calculateSpeed();
    updateScoreDisplay();
  }

  // === 道具收集效果 ===
  function onCollectPowerUp(pu) {
    var color = POWERUP_COLORS[pu.type];
    spawnEatParticles(pu.x, pu.y, color);

    switch (pu.type) {
      case PowerUpType.FREEZE:
        freezeTimer = 25; // ~3 秒減速
        score += 2;
        playFreezeSound();
        break;

      case PowerUpType.POISON:
        score += 5;
        playPoisonSound();
        // 縮短蛇身 2 節（最少保留 2 節）
        var removeCount = Math.min(2, snake.length - 2);
        for (var i = 0; i < removeCount; i++) {
          snake.pop();
        }
        break;

      case PowerUpType.PORTAL:
        score += 2;
        playPortalSound();
        // 蛇頭隨機傳送到空位
        var newPos;
        var attempts = 0;
        do {
          newPos = {
            x: (Math.random() * COLS) | 0,
            y: (Math.random() * ROWS) | 0
          };
          attempts++;
        } while (
          attempts < 100 &&
          (snake.some(function (s) { return s.x === newPos.x && s.y === newPos.y; }) ||
           (food && food.x === newPos.x && food.y === newPos.y))
        );
        snake[0].x = newPos.x;
        snake[0].y = newPos.y;
        spawnEatParticles(newPos.x, newPos.y, '#a855f7');
        break;

      case PowerUpType.SHIELD:
        hasShield = true;
        playShieldSound();
        break;
    }
  }

  // === 狀態轉換 ===
  function startGame(initialDir) {
    resetGame();
    dir = initialDir;
    gameState = State.PLAYING;
    lastTickTime = 0;
    accumulator = 0;
    gameStartTime = Date.now();
    gracePeriodTicks = 3; // 開場 3 tick 無敵（約 0.36 秒）
    playStartSound();
    updateScoreDisplay();
    if (pauseBtn) pauseBtn.textContent = '暫停';
  }

  function resetGame() {
    snake = [{ x: 10, y: 10 }];
    dir = { x: 0, y: 0 };
    food = spawnFood();
    goldenFood = null;
    powerUpFood = null;
    freezeTimer = 0;
    hasShield = false;
    powerUpSpawnCD = 0;
    score = 0;
    currentSpeed = baseSpeed;
    inputBuffer = [];
    shakeFrames = 0;
    activeParticleCount = 0;
    // Combo 重置
    comboCount = 0;
    comboTimer = 0;
    maxCombo = 0;
    comboDisplayTimer = 0;
    // 速度里程碑重置
    lastSpeedLevel = 0;
    milestoneDisplayTimer = 0;
    // 統計重置
    totalFoodEaten = 0;
    gameStartTime = 0;
    // 蛇身顏色快取重置
    snakeColorCacheLen = 0;
  }

  function togglePause() {
    if (gameState === State.PLAYING) {
      gameState = State.PAUSED;
      if (pauseBtn) pauseBtn.textContent = '繼續';
      updateScoreDisplay();
    } else if (gameState === State.PAUSED) {
      gameState = State.PLAYING;
      lastTickTime = 0;
      accumulator = 0;
      if (pauseBtn) pauseBtn.textContent = '暫停';
      updateScoreDisplay();
    }
  }

  function onGameOver() {
    gameState = State.GAMEOVER;
    shakeFrames = 20;
    playGameOverSound();
    var isNewRecord = saveHighScore();
    var recordText = isNewRecord ? ' \uD83C\uDF89 \u65B0\u7D00\u9304\uFF01' : '';

    // 計算存活時間
    var survivalSec = gameStartTime > 0 ? Math.round((Date.now() - gameStartTime) / 1000) : 0;
    var survivalText = '';
    if (survivalSec >= 60) {
      survivalText = Math.floor(survivalSec / 60) + '\u5206' + (survivalSec % 60) + '\u79D2';
    } else {
      survivalText = survivalSec + '\u79D2';
    }

    scoreEl.innerHTML =
      '<span style="color:#ef4444; font-weight:bold;">\u904A\u6232\u7D50\u675F\uFF01</span> ' +
      '\u5206\u6578: ' + score + recordText + '<br>' +
      '<small style="color:#94a3b8;">' +
      '\u5B58\u6D3B: ' + survivalText +
      ' | \u98DF\u7269: ' + totalFoodEaten +
      ' | \u6700\u9577\u9023\u64CA: ' + maxCombo + 'x' +
      '</small><br>' +
      '<small>\u6700\u9AD8\u5206: ' + highScore + ' | \u9EDE\u64CA\u6216\u6309\u65B9\u5411\u9375\u91CD\u65B0\u958B\u59CB</small>';
  }

  function updateScoreDisplay() {
    if (gameState === State.MENU) {
      scoreEl.textContent = '\u6309\u65B9\u5411\u9375\u6216\u9EDE\u64CA\u756B\u9762\u958B\u59CB';
      return;
    }
    var speedPercent = Math.round((1 - currentSpeed / baseSpeed) * 100);
    var speedText = speedPercent > 0 ? ' (+' + speedPercent + '% \u901F\u5EA6)' : '';
    if (freezeTimer > 0) speedText = ' <span style="color:#38bdf8;">(\u6E1B\u901F\u4E2D)</span>';
    var effectText = hasShield ? ' <span style="color:#94a3b8;">\u2606</span>' : '';
    var pauseText = gameState === State.PAUSED ? ' | <span style="color:#f59e0b;">\u5DF2\u66AB\u505C</span>' : '';
    var comboText = comboCount >= 3 ? ' <span style="color:#fbbf24;">' + comboCount + 'x</span>' : '';
    scoreEl.innerHTML =
      '\u5206\u6578: <strong>' + score + '</strong>' + comboText + speedText + effectText +
      ' | \u6700\u9AD8\u5206: ' + highScore + pauseText;
  }

  // === 繪製 ===
  function draw() {
    // 震動偏移
    var offsetX = 0, offsetY = 0;
    if (shakeFrames > 0) {
      offsetX = ((Math.random() - 0.5) * 8) | 0;
      offsetY = ((Math.random() - 0.5) * 8) | 0;
      shakeFrames--;
    }

    ctx.save();
    ctx.translate(offsetX, offsetY);

    // 背景
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    // 網格
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (var x = 0; x <= COLS; x++) {
      ctx.moveTo(x * CELL, 0);
      ctx.lineTo(x * CELL, LOGICAL_HEIGHT);
    }
    for (var y = 0; y <= ROWS; y++) {
      ctx.moveTo(0, y * CELL);
      ctx.lineTo(LOGICAL_WIDTH, y * CELL);
    }
    ctx.stroke();

    // 選單畫面
    if (gameState === State.MENU) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 28px "Noto Sans TC", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('\u8CAA\u5403\u86C7', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 - 30);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px "Noto Sans TC", sans-serif';
      ctx.fillText('\u6309\u65B9\u5411\u9375 / \u6ED1\u52D5 / \u9EDE\u64CA\u958B\u59CB', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 + 10);

      if (highScore > 0) {
        ctx.fillStyle = '#7c3aed';
        ctx.font = '13px "Noto Sans TC", sans-serif';
        ctx.fillText('\u6700\u9AD8\u5206: ' + highScore, LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 + 35);
      }

      // 道具提示
      ctx.fillStyle = '#64748b';
      ctx.font = '11px "Noto Sans TC", sans-serif';
      ctx.fillText('\u2744\u2620\u2731\u2606 \u7279\u6B8A\u98DF\u7269\u96A8\u6A5F\u51FA\u73FE', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 + 58);

      // 連擊提示
      ctx.fillStyle = '#fbbf24';
      ctx.font = '11px "Noto Sans TC", sans-serif';
      ctx.fillText('\u9023\u7E8C\u5403\u98DF\u7269\u89F8\u767C Combo \u52A0\u5206\uFF01', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 + 76);

      ctx.restore();
      frameCount++;
      return;
    }

    // 食物脈動
    var pulse = Math.sin(frameCount * 0.15) * 2 + 2;

    // 普通食物
    if (food) {
      ctx.fillStyle = '#ef4444';
      drawRoundedRect(
        food.x * CELL + (pulse / 2) | 0,
        food.y * CELL + (pulse / 2) | 0,
        (CELL - 1 - pulse) | 0,
        (CELL - 1 - pulse) | 0,
        4
      );
    }

    // 金色食物
    if (goldenFood) {
      var goldenPulse = Math.sin(frameCount * 0.25) * 3 + 3;
      // 光暈
      ctx.fillStyle = 'rgba(251, 191, 36, 0.3)';
      ctx.beginPath();
      ctx.arc(
        goldenFood.x * CELL + CELL / 2,
        goldenFood.y * CELL + CELL / 2,
        CELL * 0.8,
        0, Math.PI * 2
      );
      ctx.fill();
      // 金色方塊
      ctx.fillStyle = '#fbbf24';
      drawRoundedRect(
        goldenFood.x * CELL + (goldenPulse / 2) | 0,
        goldenFood.y * CELL + (goldenPulse / 2) | 0,
        (CELL - 1 - goldenPulse) | 0,
        (CELL - 1 - goldenPulse) | 0,
        4
      );
      // 剩餘時間
      if (goldenFood.ttl < 20) {
        ctx.fillStyle = '#fff';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          Math.ceil(goldenFood.ttl / 10).toString(),
          goldenFood.x * CELL + CELL / 2,
          goldenFood.y * CELL + CELL / 2
        );
      }
    }

    // 特殊食物（道具）
    if (powerUpFood) {
      var puType = powerUpFood.type;
      var puColor = POWERUP_COLORS[puType];
      var puPulse = Math.sin(frameCount * 0.2) * 2 + 2;
      var puX = powerUpFood.x * CELL + CELL / 2;
      var puY = powerUpFood.y * CELL + CELL / 2;

      // 光暈
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = puColor;
      ctx.beginPath();
      ctx.arc(puX, puY, CELL * 0.9 + puPulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // 背景圓
      ctx.fillStyle = puColor;
      ctx.beginPath();
      ctx.arc(puX, puY, (CELL / 2 - 2 + puPulse * 0.3) | 0, 0, Math.PI * 2);
      ctx.fill();

      // 符號
      ctx.fillStyle = puType === 'shield' ? '#334155' : '#fff';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (puType === 'portal') {
        // 傳送門旋轉效果
        ctx.save();
        ctx.translate(puX, puY);
        ctx.rotate(frameCount * 0.08);
        ctx.fillText('\u2731', 0, 0); // ✱
        ctx.restore();
      } else {
        ctx.fillText(POWERUP_SYMBOLS[puType], puX, puY);
      }

      // 剩餘時間（快消失時顯示）
      if (powerUpFood.ttl < 15) {
        ctx.globalAlpha = 0.5 + Math.sin(frameCount * 0.3) * 0.3;
        ctx.fillStyle = '#fff';
        ctx.font = '9px sans-serif';
        ctx.fillText(Math.ceil(powerUpFood.ttl / 8).toString(), puX, puY + 14);
        ctx.globalAlpha = 1;
      }
    }

    // 冰凍效果邊框
    if (freezeTimer > 0) {
      var freezeAlpha = Math.min(0.3, freezeTimer / 25 * 0.3);
      ctx.strokeStyle = 'rgba(56, 189, 248, ' + freezeAlpha + ')';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, LOGICAL_WIDTH - 4, LOGICAL_HEIGHT - 4);
    }

    // 蛇身（使用顏色快取）
    updateSnakeColorCache(snake.length);
    for (var i = 0; i < snake.length; i++) {
      var segment = snake[i];

      if (i === 0) {
        // 蛇頭（無敵期閃爍）
        if (gracePeriodTicks > 0 && frameCount % 8 < 4) {
          ctx.fillStyle = '#a78bfa'; // 亮紫色閃爍
        } else {
          ctx.fillStyle = '#7c3aed';
        }
        drawRoundedRect(
          segment.x * CELL + 1,
          segment.y * CELL + 1,
          CELL - 2,
          CELL - 2,
          6
        );

        // 眼睛
        ctx.fillStyle = '#fff';
        var eyeX1, eyeY1, eyeX2, eyeY2;

        if (dir.x === 1) {
          eyeX1 = eyeX2 = segment.x * CELL + CELL - 6;
          eyeY1 = segment.y * CELL + 5;
          eyeY2 = segment.y * CELL + CELL - 7;
        } else if (dir.x === -1) {
          eyeX1 = eyeX2 = segment.x * CELL + 4;
          eyeY1 = segment.y * CELL + 5;
          eyeY2 = segment.y * CELL + CELL - 7;
        } else if (dir.y === -1) {
          eyeY1 = eyeY2 = segment.y * CELL + 4;
          eyeX1 = segment.x * CELL + 5;
          eyeX2 = segment.x * CELL + CELL - 7;
        } else {
          eyeY1 = eyeY2 = segment.y * CELL + CELL - 6;
          eyeX1 = segment.x * CELL + 5;
          eyeX2 = segment.x * CELL + CELL - 7;
        }

        ctx.beginPath();
        ctx.arc(eyeX1, eyeY1, 2, 0, Math.PI * 2);
        ctx.arc(eyeX2, eyeY2, 2, 0, Math.PI * 2);
        ctx.fill();

        // 護盾光環
        if (hasShield) {
          var shieldAlpha = 0.3 + Math.sin(frameCount * 0.12) * 0.15;
          ctx.strokeStyle = 'rgba(241, 245, 249, ' + shieldAlpha + ')';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(segment.x * CELL + CELL / 2, segment.y * CELL + CELL / 2, CELL * 0.7, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else {
        // 蛇身漸層（使用快取的顏色）
        ctx.fillStyle = snakeColorCache[i] || '#7c3aed';
        drawRoundedRect(
          segment.x * CELL + 1,
          segment.y * CELL + 1,
          CELL - 2,
          CELL - 2,
          4
        );
      }
    }

    // 粒子效果
    updateParticles();
    drawParticles();

    // 道具狀態 HUD（右上角）
    if (gameState === State.PLAYING) {
      var hudX = LOGICAL_WIDTH - 8;
      var hudY = 14;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';

      if (freezeTimer > 0) {
        var freezeSec = Math.ceil(freezeTimer * (currentSpeed / 1000));
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText('\u2744 ' + freezeSec + 's', hudX, hudY);
        hudY += 16;
      }

      if (hasShield) {
        ctx.fillStyle = '#f1f5f9';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText('\u2606 \u8B77\u76FE', hudX, hudY);
        hudY += 16;
      }
    }

    // Combo 提示文字（Canvas 中央偏上，浮動漸隱）
    if (comboDisplayTimer > 0) {
      var comboAlpha = Math.min(1, comboDisplayTimer / 30);
      var comboOffsetY = (60 - comboDisplayTimer) * 0.5; // 緩慢上浮
      ctx.globalAlpha = comboAlpha;
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 18px "Noto Sans TC", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(comboDisplayText, LOGICAL_WIDTH / 2, 50 - comboOffsetY);
      ctx.globalAlpha = 1;
      comboDisplayTimer--;
    }

    // 速度里程碑提示文字（Canvas 中央偏下）
    if (milestoneDisplayTimer > 0) {
      var msAlpha = Math.min(1, milestoneDisplayTimer / 40);
      var msOffsetY = (90 - milestoneDisplayTimer) * 0.3;
      ctx.globalAlpha = msAlpha;
      ctx.fillStyle = '#a78bfa';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('\u2191 ' + milestoneDisplayText, LOGICAL_WIDTH / 2, LOGICAL_HEIGHT - 40 - msOffsetY);
      ctx.globalAlpha = 1;
      milestoneDisplayTimer--;
    }

    // 暫停覆蓋層
    if (gameState === State.PAUSED) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 24px "Noto Sans TC", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('\u5DF2\u66AB\u505C', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 - 10);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '13px "Noto Sans TC", sans-serif';
      ctx.fillText('\u6309 Esc / \u7A7A\u767D\u9375 \u7E7C\u7E8C', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 + 20);
    }

    ctx.restore();
    frameCount++;
  }

  function drawRoundedRect(x, y, w, h, r) {
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
    ctx.fill();
  }

  // === 主遊戲循環（requestAnimationFrame + 固定時間步長）===
  function gameLoop(timestamp) {
    if (gameState === State.PLAYING) {
      if (lastTickTime === 0) {
        lastTickTime = timestamp;
      }
      var delta = timestamp - lastTickTime;
      lastTickTime = timestamp;

      // 防止 delta 過大（例如切頁回來）
      if (delta > 1000) {
        delta = currentSpeed;
      }

      accumulator += delta;

      // 固定時間步長
      while (accumulator >= currentSpeed) {
        gameTick();
        accumulator -= currentSpeed;
        // 如果遊戲結束就跳出
        if (gameState !== State.PLAYING) {
          accumulator = 0;
          break;
        }
      }
    }

    draw();
    requestAnimationFrame(gameLoop);
  }

  // === 輸入處理：方向映射 ===
  function queueDirection(newDir) {
    initAudio();

    if (gameState === State.MENU || gameState === State.GAMEOVER) {
      startGame(newDir);
      return;
    }

    if (gameState === State.PLAYING) {
      if (inputBuffer.length < 2) {
        var lastDir = inputBuffer.length > 0 ? inputBuffer[inputBuffer.length - 1] : dir;
        if (!(lastDir.x + newDir.x === 0 && lastDir.y + newDir.y === 0)) {
          inputBuffer.push(newDir);
        }
      }
    }
  }

  // === 鍵盤控制 ===
  var keyMap = {
    ArrowUp:    { x:  0, y: -1 },
    ArrowDown:  { x:  0, y:  1 },
    ArrowLeft:  { x: -1, y:  0 },
    ArrowRight: { x:  1, y:  0 },
    w: { x:  0, y: -1 }, W: { x:  0, y: -1 },
    s: { x:  0, y:  1 }, S: { x:  0, y:  1 },
    a: { x: -1, y:  0 }, A: { x: -1, y:  0 },
    d: { x:  1, y:  0 }, D: { x:  1, y:  0 }
  };

  document.addEventListener('keydown', function (e) {
    initAudio();

    // 暫停鍵：Esc / 空白鍵 / P
    if (e.key === 'Escape' || e.key === ' ' || e.key === 'p' || e.key === 'P') {
      if (gameState === State.PLAYING || gameState === State.PAUSED) {
        togglePause();
        e.preventDefault();
        return;
      }
    }

    var newDir = keyMap[e.key];
    if (!newDir) return;
    e.preventDefault();

    queueDirection(newDir);
  });

  // === Canvas 滑鼠點擊（桌面用戶支援）===
  canvas.addEventListener('click', function (e) {
    initAudio();
    if (gameState === State.MENU || gameState === State.GAMEOVER) {
      queueDirection({ x: 1, y: 0 }); // 預設向右開始
    }
  });

  // === 觸控按鈕控制 ===
  var touchDirMap = {
    up:    { x:  0, y: -1 },
    down:  { x:  0, y:  1 },
    left:  { x: -1, y:  0 },
    right: { x:  1, y:  0 }
  };

  var touchBtns = document.querySelectorAll('.touch-btn');
  for (var i = 0; i < touchBtns.length; i++) {
    (function (btn) {
      btn.addEventListener('touchstart', function (e) {
        e.preventDefault();
        var dirName = btn.getAttribute('data-dir');
        var newDir = touchDirMap[dirName];
        if (newDir) queueDirection(newDir);
      }, { passive: false });

      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var dirName = btn.getAttribute('data-dir');
        var newDir = touchDirMap[dirName];
        if (newDir) queueDirection(newDir);
      });
    })(touchBtns[i]);
  }

  // 暫停按鈕
  if (pauseBtn) {
    pauseBtn.addEventListener('click', function () {
      initAudio();
      if (gameState === State.PLAYING || gameState === State.PAUSED) {
        togglePause();
      }
    });
  }

  // === 滑動手勢偵測 ===
  var touchStartX = 0;
  var touchStartY = 0;
  var touchStartTime = 0;
  var SWIPE_THRESHOLD = 30;
  var SWIPE_MAX_TIME = 300;

  canvas.addEventListener('touchstart', function (e) {
    e.preventDefault();
    initAudio();
    var touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTime = Date.now();
  }, { passive: false });

  canvas.addEventListener('touchend', function (e) {
    e.preventDefault();
    var touch = e.changedTouches[0];
    var dx = touch.clientX - touchStartX;
    var dy = touch.clientY - touchStartY;
    var dt = Date.now() - touchStartTime;

    if (dt > SWIPE_MAX_TIME) return;

    var absDx = Math.abs(dx);
    var absDy = Math.abs(dy);

    if (absDx < SWIPE_THRESHOLD && absDy < SWIPE_THRESHOLD) {
      // 短按：菜單/結束時用任意方向開始
      if (gameState === State.MENU || gameState === State.GAMEOVER) {
        queueDirection({ x: 1, y: 0 }); // 預設向右
      }
      return;
    }

    var newDir;
    if (absDx > absDy) {
      newDir = dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
    } else {
      newDir = dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
    }

    queueDirection(newDir);
  }, { passive: false });

  // === 操作提示 ===
  function updateInstructions() {
    var el = document.getElementById('instructions');
    if (!el) return;
    // 觸控裝置不顯示鍵盤提示
    var isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) {
      el.innerHTML = '\u6ED1\u52D5\u6216\u9EDE\u64CA\u6309\u9215\u63A7\u5236\u65B9\u5411';
    } else {
      el.innerHTML =
        '<kbd>&uarr;</kbd><kbd>&darr;</kbd><kbd>&larr;</kbd><kbd>&rarr;</kbd> \u6216 ' +
        '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> \u79FB\u52D5 | ' +
        '<kbd>Esc</kbd> / <kbd>\u7A7A\u767D\u9375</kbd> \u66AB\u505C';
    }
  }

  // === 初始化 ===
  food = spawnFood();
  updateScoreDisplay();
  updateInstructions();
  requestAnimationFrame(gameLoop);

})();
