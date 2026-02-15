/**
 * 貪吃蛇 - 品質優化版
 *
 * 品質改善項目：
 * 1. [P0] 遊戲循環從 setInterval 改為 requestAnimationFrame + 固定時間步長
 * 2. [P0] 新增觸控支援（滑動手勢 + 虛擬方向按鈕）
 * 3. [P1] 移除不存在的外部 CSS 依賴，樣式自包含
 * 4. [P1] Canvas 響應式設計（自動縮放）
 * 5. [P1] 新增 Esc 暫停支援
 * 6. [P2] 完整狀態機（menu → playing → paused → gameover）
 * 7. 保留原有功能：金色食物、速度漸進、音效、高分紀錄、輸入緩衝
 *
 * 效能優化（參考知識庫 HTML5 遊戲開發指南）：
 * - requestAnimationFrame 自動暫停不可見頁面
 * - 整數座標避免子像素渲染
 * - 批次繪製減少 context 切換
 * - 固定時間步長確保跨裝置一致的遊戲速度
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

  // === 粒子效果系統 ===
  var particles = [];
  var MAX_PARTICLES = 30;

  function spawnEatParticles(cellX, cellY, color) {
    var centerX = cellX * CELL + CELL / 2;
    var centerY = cellY * CELL + CELL / 2;
    var count = Math.min(8, MAX_PARTICLES - particles.length);
    for (var i = 0; i < count; i++) {
      var angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      var speed = 1.5 + Math.random() * 2;
      particles.push({
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: 0.03 + Math.random() * 0.02,
        size: 2 + Math.random() * 3,
        color: color
      });
    }
  }

  function updateParticles() {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      if (p.life <= 0) {
        particles.splice(i, 1);
      }
    }
  }

  function drawParticles() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x | 0, p.y | 0, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // === 食物生成 ===
  function spawnFood() {
    var pos;
    do {
      pos = {
        x: (Math.random() * COLS) | 0,
        y: (Math.random() * ROWS) | 0
      };
    } while (
      snake.some(function (s) { return s.x === pos.x && s.y === pos.y; }) ||
      (goldenFood && goldenFood.x === pos.x && goldenFood.y === pos.y)
    );
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
      } while (
        snake.some(function (s) { return s.x === pos.x && s.y === pos.y; }) ||
        (food && food.x === pos.x && food.y === pos.y)
      );
      goldenFood = { x: pos.x, y: pos.y, ttl: 50 };
    }
  }

  // === 速度漸進（放緩曲線：每 8 分加速 5ms，最低 60ms）===
  function calculateSpeed() {
    var speedBonus = ((score / 8) | 0) * 5;
    return Math.max(60, baseSpeed - speedBonus);
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

    // 碰撞檢測（自撞）
    if (snake.some(function (s) { return s.x === head.x && s.y === head.y; })) {
      onGameOver();
      return;
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
    }
    // 普通食物
    else if (food && head.x === food.x && head.y === food.y) {
      score++;
      playEatSound();
      spawnEatParticles(head.x, head.y, '#ef4444');
      food = spawnFood();
      ate = true;
      maybeSpawnGoldenFood();
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

    currentSpeed = calculateSpeed();
    updateScoreDisplay();
  }

  // === 狀態轉換 ===
  function startGame(initialDir) {
    resetGame();
    dir = initialDir;
    gameState = State.PLAYING;
    lastTickTime = 0;
    accumulator = 0;
    playStartSound();
    updateScoreDisplay();
    if (pauseBtn) pauseBtn.textContent = '暫停';
  }

  function resetGame() {
    snake = [{ x: 10, y: 10 }];
    dir = { x: 0, y: 0 };
    food = spawnFood();
    goldenFood = null;
    score = 0;
    currentSpeed = baseSpeed;
    inputBuffer = [];
    shakeFrames = 0;
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
    var recordText = isNewRecord ? ' 🎉 新紀錄！' : '';
    scoreEl.innerHTML =
      '<span style="color:#ef4444; font-weight:bold;">遊戲結束！</span> ' +
      '分數: ' + score + recordText + '<br>' +
      '<small>最高分: ' + highScore + ' | 點擊或按方向鍵重新開始</small>';
  }

  function updateScoreDisplay() {
    if (gameState === State.MENU) {
      scoreEl.textContent = '按方向鍵或點擊畫面開始';
      return;
    }
    var speedPercent = Math.round((1 - currentSpeed / baseSpeed) * 100);
    var speedText = speedPercent > 0 ? ' (+' + speedPercent + '% 速度)' : '';
    var pauseText = gameState === State.PAUSED ? ' | <span style="color:#f59e0b;">已暫停</span>' : '';
    scoreEl.innerHTML =
      '分數: <strong>' + score + '</strong>' + speedText +
      ' | 最高分: ' + highScore + pauseText;
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
      ctx.fillText('貪吃蛇', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 - 30);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px "Noto Sans TC", sans-serif';
      ctx.fillText('按方向鍵 / 滑動 / 點擊按鈕開始', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 + 10);

      if (highScore > 0) {
        ctx.fillStyle = '#7c3aed';
        ctx.font = '13px "Noto Sans TC", sans-serif';
        ctx.fillText('最高分: ' + highScore, LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 + 40);
      }

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

    // 蛇身
    for (var i = 0; i < snake.length; i++) {
      var segment = snake[i];
      var ratio = i / Math.max(snake.length - 1, 1);

      if (i === 0) {
        // 蛇頭
        ctx.fillStyle = '#7c3aed';
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
      } else {
        // 蛇身漸層
        var r = (124 + ratio * 43 + 0.5) | 0;
        var g = (58 + ratio * 81 + 0.5) | 0;
        var b = (237 + ratio * 13 + 0.5) | 0;
        ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
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

    // 暫停覆蓋層
    if (gameState === State.PAUSED) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 24px "Noto Sans TC", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('已暫停', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 - 10);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '13px "Noto Sans TC", sans-serif';
      ctx.fillText('按 Esc / 空白鍵 繼續', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 + 20);
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
      el.innerHTML = '滑動或點擊按鈕控制方向';
    } else {
      el.innerHTML =
        '<kbd>&uarr;</kbd><kbd>&darr;</kbd><kbd>&larr;</kbd><kbd>&rarr;</kbd> 或 ' +
        '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移動 | ' +
        '<kbd>Esc</kbd> / <kbd>空白鍵</kbd> 暫停';
    }
  }

  // === 初始化 ===
  food = spawnFood();
  updateScoreDisplay();
  updateInstructions();
  requestAnimationFrame(gameLoop);

})();
