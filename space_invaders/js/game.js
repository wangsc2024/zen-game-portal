// ============================================================
// Space Invaders (小蜜蜂) v2.0
// 純 HTML5 Canvas + Web Audio API
// 創意改良：粒子系統爆炸 + 8-bit 音效合成
// v2.0: 觸控暫停、關卡過渡、碰撞優化、星空深度、射擊回饋
// ============================================================

(function () {
  'use strict';

  // --- Canvas & Context ---
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;   // 480
  const H = canvas.height;  // 640

  // --- Audio Context (lazy init on user gesture) ---
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  // --- 8-bit Sound Synth ---
  function playTone(freq, duration, type, volume) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(volume || 0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  }

  function sfxShoot() { playTone(880, 0.08, 'square', 0.06); }
  function sfxExplosion() {
    playTone(150, 0.15, 'sawtooth', 0.1);
    playTone(80, 0.2, 'square', 0.08);
  }
  function sfxPlayerHit() {
    playTone(200, 0.3, 'sawtooth', 0.12);
    playTone(100, 0.4, 'triangle', 0.1);
  }
  function sfxInvaderMove() { playTone(60, 0.05, 'square', 0.03); }
  function sfxLevelClear() {
    playTone(523, 0.15, 'square', 0.08);
    setTimeout(() => playTone(659, 0.15, 'square', 0.08), 150);
    setTimeout(() => playTone(784, 0.2, 'square', 0.1), 300);
    setTimeout(() => playTone(1047, 0.3, 'square', 0.12), 450);
  }

  // --- Particle Pool ---
  const MAX_PARTICLES = 200;
  const particlePool = [];
  for (let i = 0; i < MAX_PARTICLES; i++) {
    particlePool.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, r: 0, g: 0, b: 0, size: 2 });
  }

  function spawnParticles(x, y, count, r, g, b) {
    let spawned = 0;
    for (let i = 0; i < MAX_PARTICLES && spawned < count; i++) {
      const p = particlePool[i];
      if (!p.active) {
        p.active = true;
        p.x = x;
        p.y = y;
        const angle = Math.random() * Math.PI * 2;
        const speed = 40 + Math.random() * 120;
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed;
        p.life = 0.3 + Math.random() * 0.4;
        p.maxLife = p.life;
        p.r = r;
        p.g = g;
        p.b = b;
        p.size = 1 + Math.random() * 3;
        spawned++;
      }
    }
  }

  function updateParticles(dt) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = particlePool[i];
      if (!p.active) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) p.active = false;
    }
  }

  function drawParticles() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = particlePool[i];
      if (!p.active) continue;
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${alpha})`;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
  }

  // --- Bullet Pool ---
  const MAX_BULLETS = 20;
  const bullets = [];
  for (let i = 0; i < MAX_BULLETS; i++) {
    bullets.push({ active: false, x: 0, y: 0, vy: 0, owner: 'player' });
  }

  function fireBullet(x, y, vy, owner) {
    for (let i = 0; i < MAX_BULLETS; i++) {
      const b = bullets[i];
      if (!b.active) {
        b.active = true;
        b.x = x;
        b.y = y;
        b.vy = vy;
        b.owner = owner;
        return true;
      }
    }
    return false;
  }

  // --- Game State ---
  const STATE = { LOADING: 0, MENU: 1, PLAYING: 2, PAUSED: 3, GAME_OVER: 4, LEVEL_CLEAR: 5, READY: 6 };
  let state = STATE.LOADING;
  let score = 0;
  let highScore = parseInt(localStorage.getItem('si_highscore') || '0', 10);
  let lives = 3;
  let level = 1;
  let screenShake = 0;
  let readyTimer = 0; // countdown for READY state (in seconds)

  // --- Player ---
  const player = { x: W / 2, y: H - 60, w: 36, h: 24, speed: 220, cooldown: 0, cooldownMax: 0.35, invincible: 0 };

  // --- Invaders ---
  const COLS = 11;
  const ROWS = 5;
  const INV_W = 28;
  const INV_H = 20;
  const INV_PAD_X = 10;
  const INV_PAD_Y = 10;
  let invaders = [];
  let invDir = 1; // 1=right, -1=left
  let invSpeed = 30; // px/sec base
  let invMoveTimer = 0;
  let invMoveInterval = 0.8; // seconds between steps
  let invDropAmount = 16;
  let invShootTimer = 0;
  let invShootInterval = 1.5;

  // Invader types (rows): top=30pts, mid=20pts, bottom=10pts
  const INV_TYPES = [
    { points: 30, color: '#ff4444' },
    { points: 20, color: '#44ff44' },
    { points: 20, color: '#44ff44' },
    { points: 10, color: '#ffffff' },
    { points: 10, color: '#ffffff' },
  ];

  function initInvaders() {
    invaders = [];
    const startX = (W - (COLS * (INV_W + INV_PAD_X) - INV_PAD_X)) / 2;
    const startY = 80;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        invaders.push({
          alive: true,
          row: r,
          col: c,
          x: startX + c * (INV_W + INV_PAD_X),
          y: startY + r * (INV_H + INV_PAD_Y),
          w: INV_W,
          h: INV_H,
          type: INV_TYPES[r],
          frame: 0,
        });
      }
    }
    invDir = 1;
    invMoveTimer = 0;
    invMoveInterval = Math.max(0.15, 0.8 - (level - 1) * 0.08);
    invShootInterval = Math.max(0.5, 1.5 - (level - 1) * 0.1);
    invShootTimer = 0;
  }

  // --- Shields ---
  const SHIELD_W = 44;
  const SHIELD_H = 32;
  const SHIELD_PIXEL = 4;
  let shields = [];
  const SHIELD_BITMAP = [
    [0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0],
    [0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0],
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1],
    [1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1],
  ];

  function initShields() {
    shields = [];
    const positions = [60, 160, 260, 360];
    for (const sx of positions) {
      const pixels = [];
      for (let r = 0; r < SHIELD_BITMAP.length; r++) {
        for (let c = 0; c < SHIELD_BITMAP[0].length; c++) {
          if (SHIELD_BITMAP[r][c]) {
            pixels.push({ x: sx + c * SHIELD_PIXEL, y: H - 150 + r * SHIELD_PIXEL, w: SHIELD_PIXEL, h: SHIELD_PIXEL, alive: true });
          }
        }
      }
      shields.push(pixels);
    }
  }

  // --- Mystery Ship (UFO) ---
  const ufo = { active: false, x: 0, y: 40, w: 36, h: 16, speed: 80, dir: 1, timer: 0, interval: 15 + Math.random() * 10 };

  // --- Starfield (multi-layer for depth) ---
  const STAR_LAYERS = [
    { count: 40, speedFactor: 0.3, sizeMin: 0.5, sizeMax: 1, brightnessMin: 40, brightnessMax: 80 },
    { count: 25, speedFactor: 0.7, sizeMin: 1, sizeMax: 1.5, brightnessMin: 80, brightnessMax: 140 },
    { count: 15, speedFactor: 1.2, sizeMin: 1.5, sizeMax: 2.5, brightnessMin: 140, brightnessMax: 220 },
  ];
  const stars = [];
  function initStars() {
    for (const layer of STAR_LAYERS) {
      for (let i = 0; i < layer.count; i++) {
        stars.push({
          x: Math.random() * W,
          y: Math.random() * H,
          speedFactor: layer.speedFactor,
          size: layer.sizeMin + Math.random() * (layer.sizeMax - layer.sizeMin),
          brightness: layer.brightnessMin + Math.random() * (layer.brightnessMax - layer.brightnessMin),
          twinkleSpeed: 0.5 + Math.random() * 2,
          twinkleOffset: Math.random() * Math.PI * 2,
        });
      }
    }
  }
  initStars();

  // --- Input ---
  const keys = {};
  let touchLeft = false;
  let touchRight = false;
  let touchFire = false;

  window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    if (e.key === 'Escape') togglePause();
    if ((e.key === ' ' || e.key === 'Enter') && (state === STATE.MENU || state === STATE.GAME_OVER)) {
      ensureAudio();
      startNewGame();
    }
    if ((e.key === ' ' || e.key === 'Enter') && state === STATE.LEVEL_CLEAR) {
      ensureAudio();
      startNextLevel();
    }
  });
  window.addEventListener('keyup', (e) => { keys[e.key] = false; });

  // Touch controls
  function setupTouch(id, onDown, onUp) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', (e) => { e.preventDefault(); ensureAudio(); onDown(); });
    el.addEventListener('touchend', (e) => { e.preventDefault(); onUp(); });
    el.addEventListener('touchcancel', (e) => { e.preventDefault(); onUp(); });
  }
  setupTouch('btnLeft', () => { touchLeft = true; }, () => { touchLeft = false; });
  setupTouch('btnRight', () => { touchRight = true; }, () => { touchRight = false; });
  setupTouch('btnFire', () => { touchFire = true; }, () => { touchFire = false; });

  // Touch pause button
  const btnPause = document.getElementById('btnPause');
  if (btnPause) {
    btnPause.addEventListener('touchstart', (e) => {
      e.preventDefault();
      togglePause();
    });
    btnPause.addEventListener('click', (e) => {
      e.preventDefault();
      togglePause();
    });
  }

  // Tap canvas to start / fire
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    ensureAudio();
    if (state === STATE.MENU || state === STATE.GAME_OVER) {
      startNewGame();
    } else if (state === STATE.LEVEL_CLEAR) {
      startNextLevel();
    } else if (state === STATE.PAUSED) {
      state = STATE.PLAYING;
    }
  });

  canvas.addEventListener('click', () => {
    ensureAudio();
    if (state === STATE.MENU || state === STATE.GAME_OVER) {
      startNewGame();
    } else if (state === STATE.LEVEL_CLEAR) {
      startNextLevel();
    }
  });

  // --- Init / Start ---
  function startNewGame() {
    score = 0;
    lives = 3;
    level = 1;
    prepareLevel();
  }

  function startNextLevel() {
    level++;
    prepareLevel();
  }

  function prepareLevel() {
    player.x = W / 2;
    player.cooldown = 0;
    player.invincible = 0;
    initInvaders();
    initShields();
    ufo.active = false;
    ufo.timer = 0;
    for (const b of bullets) b.active = false;
    for (const p of particlePool) p.active = false;
    readyTimer = 1.8; // 1.8 second countdown
    state = STATE.READY;
  }

  function togglePause() {
    if (state === STATE.PLAYING) state = STATE.PAUSED;
    else if (state === STATE.PAUSED) state = STATE.PLAYING;
  }

  // --- AABB Collision ---
  function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  // --- Update ---
  function update(dt) {
    // Handle READY countdown
    if (state === STATE.READY) {
      readyTimer -= dt;
      if (readyTimer <= 0) {
        state = STATE.PLAYING;
      }
      updateParticles(dt);
      return;
    }

    if (state !== STATE.PLAYING) return;

    // Screen shake decay
    if (screenShake > 0) screenShake -= dt * 30;
    if (screenShake < 0) screenShake = 0;

    // Player movement
    let dx = 0;
    if (keys['ArrowLeft'] || keys['a'] || keys['A'] || touchLeft) dx = -1;
    if (keys['ArrowRight'] || keys['d'] || keys['D'] || touchRight) dx = 1;
    player.x += dx * player.speed * dt;
    player.x = Math.max(player.w / 2, Math.min(W - player.w / 2, player.x));

    // Player shoot
    player.cooldown -= dt;
    if ((keys[' '] || keys['ArrowUp'] || touchFire) && player.cooldown <= 0) {
      if (fireBullet(player.x, player.y - player.h / 2, -400, 'player')) {
        sfxShoot();
        player.cooldown = player.cooldownMax;
      }
    }

    // Player invincibility
    if (player.invincible > 0) player.invincible -= dt;

    // Invader movement (step-based like original)
    invMoveTimer += dt;
    if (invMoveTimer >= invMoveInterval) {
      invMoveTimer = 0;
      let hitEdge = false;
      const step = 10 * invDir;

      for (const inv of invaders) {
        if (!inv.alive) continue;
        const nx = inv.x + step;
        if (nx < 5 || nx + inv.w > W - 5) {
          hitEdge = true;
          break;
        }
      }

      if (hitEdge) {
        invDir *= -1;
        for (const inv of invaders) {
          if (inv.alive) inv.y += invDropAmount;
        }
      } else {
        for (const inv of invaders) {
          if (inv.alive) inv.x += step;
        }
      }

      for (const inv of invaders) {
        if (inv.alive) inv.frame = 1 - inv.frame;
      }

      sfxInvaderMove();

      const aliveCount = invaders.filter(i => i.alive).length;
      if (aliveCount > 0) {
        const ratio = aliveCount / (ROWS * COLS);
        invMoveInterval = Math.max(0.05, (0.8 - (level - 1) * 0.08) * ratio);
      }
    }

    // Invader shooting
    invShootTimer += dt;
    if (invShootTimer >= invShootInterval) {
      invShootTimer = 0;
      const bottomInvaders = [];
      for (let c = 0; c < COLS; c++) {
        for (let r = ROWS - 1; r >= 0; r--) {
          const inv = invaders[r * COLS + c];
          if (inv.alive) {
            bottomInvaders.push(inv);
            break;
          }
        }
      }
      if (bottomInvaders.length > 0) {
        const shooter = bottomInvaders[Math.floor(Math.random() * bottomInvaders.length)];
        fireBullet(shooter.x + shooter.w / 2, shooter.y + shooter.h, 200 + level * 15, 'enemy');
      }
    }

    // UFO
    if (!ufo.active) {
      ufo.timer += dt;
      if (ufo.timer >= ufo.interval) {
        ufo.active = true;
        ufo.dir = Math.random() < 0.5 ? 1 : -1;
        ufo.x = ufo.dir === 1 ? -ufo.w : W;
        ufo.timer = 0;
        ufo.interval = 15 + Math.random() * 10;
      }
    } else {
      ufo.x += ufo.speed * ufo.dir * dt;
      if (ufo.x > W + 10 || ufo.x < -ufo.w - 10) {
        ufo.active = false;
      }
    }

    // Bullets
    for (const b of bullets) {
      if (!b.active) continue;
      b.y += b.vy * dt;
      if (b.y < -10 || b.y > H + 10) { b.active = false; continue; }

      // Player bullets vs invaders
      if (b.owner === 'player') {
        for (const inv of invaders) {
          if (!inv.alive) continue;
          if (aabb(b.x - 2, b.y - 4, 4, 8, inv.x, inv.y, inv.w, inv.h)) {
            inv.alive = false;
            b.active = false;
            score += inv.type.points;
            sfxExplosion();
            const clr = inv.type.color;
            const pr = parseInt(clr.slice(1, 3), 16);
            const pg = parseInt(clr.slice(3, 5), 16);
            const pb = parseInt(clr.slice(5, 7), 16);
            spawnParticles(inv.x + inv.w / 2, inv.y + inv.h / 2, 12, pr, pg, pb);
            screenShake = 3;
            break;
          }
        }

        // Player bullets vs UFO
        if (b.active && ufo.active) {
          if (aabb(b.x - 2, b.y - 4, 4, 8, ufo.x, ufo.y, ufo.w, ufo.h)) {
            ufo.active = false;
            b.active = false;
            const ufoPoints = [50, 100, 150, 300][Math.floor(Math.random() * 4)];
            score += ufoPoints;
            sfxExplosion();
            spawnParticles(ufo.x + ufo.w / 2, ufo.y + ufo.h / 2, 20, 255, 50, 50);
            screenShake = 5;
          }
        }
      }

      // Enemy bullets vs player (enlarged collision area for fairness: 6x8)
      if (b.owner === 'enemy' && player.invincible <= 0) {
        if (aabb(b.x - 3, b.y - 4, 6, 8, player.x - player.w / 2, player.y - player.h / 2, player.w, player.h)) {
          b.active = false;
          playerHit();
        }
      }

      // Bullets vs shields
      for (const shield of shields) {
        for (const px of shield) {
          if (!px.alive) continue;
          if (aabb(b.x - 2, b.y - 2, 4, 4, px.x, px.y, px.w, px.h)) {
            px.alive = false;
            b.active = false;
            spawnParticles(px.x + px.w / 2, px.y + px.h / 2, 3, 0, 200, 0);
            break;
          }
        }
      }
    }

    // Invaders reaching shields / player line
    for (const inv of invaders) {
      if (!inv.alive) continue;
      if (inv.y + inv.h >= player.y - player.h / 2) {
        state = STATE.GAME_OVER;
        saveHighScore();
        return;
      }
      for (const shield of shields) {
        for (const px of shield) {
          if (!px.alive) continue;
          if (aabb(inv.x, inv.y, inv.w, inv.h, px.x, px.y, px.w, px.h)) {
            px.alive = false;
          }
        }
      }
    }

    // Check level clear
    if (invaders.every(i => !i.alive)) {
      state = STATE.LEVEL_CLEAR;
      sfxLevelClear();
      saveHighScore();
    }

    // Particles
    updateParticles(dt);
  }

  function playerHit() {
    lives--;
    sfxPlayerHit();
    spawnParticles(player.x, player.y, 15, 100, 200, 255);
    screenShake = 8;
    player.invincible = 2;
    if (lives <= 0) {
      state = STATE.GAME_OVER;
      saveHighScore();
    }
  }

  function saveHighScore() {
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('si_highscore', String(highScore));
    }
  }

  // --- Draw ---
  function drawInvader(inv) {
    const cx = inv.x + inv.w / 2;
    const cy = inv.y + inv.h / 2;
    ctx.fillStyle = inv.type.color;
    if (inv.row === 0) {
      ctx.fillRect(cx - 4, cy - 6, 8, 4);
      ctx.fillRect(cx - 8, cy - 2, 16, 4);
      ctx.fillRect(cx - 10, cy + 2, 4, 4);
      ctx.fillRect(cx + 6, cy + 2, 4, 4);
      if (inv.frame === 0) {
        ctx.fillRect(cx - 6, cy + 2, 4, 4);
        ctx.fillRect(cx + 2, cy + 2, 4, 4);
      } else {
        ctx.fillRect(cx - 12, cy - 2, 4, 4);
        ctx.fillRect(cx + 8, cy - 2, 4, 4);
      }
    } else if (inv.row <= 2) {
      ctx.fillRect(cx - 6, cy - 6, 12, 4);
      ctx.fillRect(cx - 10, cy - 2, 20, 4);
      ctx.fillRect(cx - 12, cy + 2, 24, 4);
      ctx.fillRect(cx - 10, cy + 6, 4, 2);
      ctx.fillRect(cx + 6, cy + 6, 4, 2);
      if (inv.frame === 0) {
        ctx.fillRect(cx - 14, cy - 4, 4, 4);
        ctx.fillRect(cx + 10, cy - 4, 4, 4);
      } else {
        ctx.fillRect(cx - 14, cy + 2, 4, 4);
        ctx.fillRect(cx + 10, cy + 2, 4, 4);
      }
    } else {
      ctx.fillRect(cx - 8, cy - 6, 16, 4);
      ctx.fillRect(cx - 12, cy - 2, 24, 4);
      ctx.fillRect(cx - 14, cy + 2, 28, 4);
      if (inv.frame === 0) {
        ctx.fillRect(cx - 12, cy + 6, 4, 2);
        ctx.fillRect(cx - 4, cy + 6, 4, 2);
        ctx.fillRect(cx + 4, cy + 6, 4, 2);
        ctx.fillRect(cx + 8, cy + 6, 4, 2);
      } else {
        ctx.fillRect(cx - 14, cy + 6, 6, 2);
        ctx.fillRect(cx - 2, cy + 6, 4, 2);
        ctx.fillRect(cx + 8, cy + 6, 6, 2);
      }
    }
  }

  function drawPlayer() {
    if (player.invincible > 0 && Math.floor(player.invincible * 10) % 2 === 0) return;
    const px = player.x;
    const py = player.y;
    ctx.fillStyle = '#00ffcc';
    ctx.fillRect(px - 2, py - 12, 4, 4);
    ctx.fillRect(px - 6, py - 8, 12, 4);
    ctx.fillRect(px - 14, py - 4, 28, 4);
    ctx.fillRect(px - 18, py, 36, 6);
    ctx.fillStyle = '#00aa88';
    ctx.fillRect(px - 8, py + 6, 4, 3);
    ctx.fillRect(px + 4, py + 6, 4, 3);

    // Cooldown indicator (small bar under player)
    if (player.cooldown > 0) {
      const pct = player.cooldown / player.cooldownMax;
      ctx.fillStyle = `rgba(0,255,204,${0.3 + pct * 0.4})`;
      ctx.fillRect(px - 12, py + 12, 24 * (1 - pct), 2);
    }
  }

  function drawUFO() {
    if (!ufo.active) return;
    const cx = ufo.x + ufo.w / 2;
    const cy = ufo.y + ufo.h / 2;
    ctx.fillStyle = '#ff3333';
    ctx.fillRect(cx - 8, cy - 4, 16, 4);
    ctx.fillRect(cx - 14, cy, 28, 4);
    ctx.fillRect(cx - 18, cy + 4, 36, 3);
    ctx.fillStyle = '#ff6666';
    ctx.fillRect(cx - 4, cy - 8, 8, 4);
  }

  function drawShields() {
    ctx.fillStyle = '#00cc44';
    for (const shield of shields) {
      for (const px of shield) {
        if (px.alive) {
          ctx.fillRect(px.x, px.y, px.w, px.h);
        }
      }
    }
  }

  function drawBullets() {
    for (const b of bullets) {
      if (!b.active) continue;
      ctx.fillStyle = b.owner === 'player' ? '#00ffcc' : '#ff4444';
      if (b.owner === 'player') {
        ctx.fillRect(b.x - 1, b.y - 6, 2, 12);
      } else {
        // Zigzag enemy bullet (wider for visibility)
        ctx.fillRect(b.x - 2, b.y - 4, 4, 8);
      }
    }
  }

  function drawHUD() {
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SCORE: ' + score, 10, 24);
    ctx.textAlign = 'center';
    ctx.fillText('LEVEL ' + level, W / 2, 24);
    ctx.textAlign = 'right';
    ctx.fillText('HI: ' + highScore, W - 10, 24);

    // Lives
    ctx.textAlign = 'left';
    for (let i = 0; i < lives; i++) {
      const lx = 10 + i * 28;
      const ly = H - 20;
      ctx.fillStyle = '#00ffcc';
      ctx.fillRect(lx, ly - 4, 20, 6);
      ctx.fillRect(lx + 8, ly - 8, 4, 4);
    }

    // Ground line
    ctx.strokeStyle = '#00cc44';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H - 8);
    ctx.lineTo(W, H - 8);
    ctx.stroke();
  }

  function drawScreen(title, subtitle, small) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#00ffcc';
    ctx.font = 'bold 32px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(title, W / 2, H / 2 - 40);
    ctx.fillStyle = '#ffffff';
    ctx.font = '18px "Courier New", monospace';
    ctx.fillText(subtitle, W / 2, H / 2 + 10);
    if (small) {
      ctx.fillStyle = '#888888';
      ctx.font = '14px "Courier New", monospace';
      ctx.fillText(small, W / 2, H / 2 + 50);
    }
  }

  function drawStarfield(time) {
    for (const star of stars) {
      // Scroll stars downward slowly for parallax
      star.y += star.speedFactor * 0.15;
      if (star.y > H) {
        star.y = -2;
        star.x = Math.random() * W;
      }

      // Twinkle effect
      const twinkle = 0.6 + 0.4 * Math.sin(time * star.twinkleSpeed + star.twinkleOffset);
      const b = Math.floor(star.brightness * twinkle);
      ctx.fillStyle = `rgb(${b},${b},${Math.min(255, b + 20)})`;
      ctx.fillRect(star.x, star.y, star.size, star.size);
    }
  }

  function drawReadyScreen(time) {
    // Draw the game scene underneath (invaders, shields, player)
    for (const inv of invaders) { if (inv.alive) drawInvader(inv); }
    drawShields();
    drawPlayer();
    drawHUD();

    // Dim overlay
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, W, H);

    // Level text
    ctx.fillStyle = '#00ffcc';
    ctx.font = 'bold 36px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('LEVEL ' + level, W / 2, H / 2 - 30);

    // Countdown or READY text
    if (readyTimer > 1.0) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px "Courier New", monospace';
      ctx.fillText('READY', W / 2, H / 2 + 20);
    } else {
      // Pulsing "GO!" in the last second
      const pulse = 0.5 + 0.5 * Math.sin(time * 12);
      ctx.fillStyle = `rgba(0,255,204,${pulse})`;
      ctx.font = 'bold 40px "Courier New", monospace';
      ctx.fillText('GO!', W / 2, H / 2 + 25);
    }
  }

  function draw(time) {
    ctx.save();

    // Screen shake
    if (screenShake > 0) {
      const sx = (Math.random() - 0.5) * screenShake;
      const sy = (Math.random() - 0.5) * screenShake;
      ctx.translate(sx, sy);
    }

    // Clear
    ctx.fillStyle = '#000000';
    ctx.fillRect(-10, -10, W + 20, H + 20);

    drawStarfield(time);

    if (state === STATE.LOADING) {
      drawLoadingScreen();
      ctx.restore();
      return;
    }

    if (state === STATE.MENU) {
      drawScreen('SPACE INVADERS', '按 Enter / 點擊開始', '← → 移動 · 空格 射擊 · Esc 暫停');
    } else if (state === STATE.READY) {
      drawReadyScreen(time);
    } else if (state === STATE.PLAYING || state === STATE.PAUSED) {
      for (const inv of invaders) { if (inv.alive) drawInvader(inv); }
      drawUFO();
      drawShields();
      drawBullets();
      drawPlayer();
      drawParticles();
      drawHUD();
      if (state === STATE.PAUSED) {
        drawScreen('暫停', '按 Esc 繼續');
      }
    } else if (state === STATE.GAME_OVER) {
      for (const inv of invaders) { if (inv.alive) drawInvader(inv); }
      drawShields();
      drawParticles();
      drawHUD();
      drawScreen('GAME OVER', '得分: ' + score, '按 Enter / 點擊重新開始');
    } else if (state === STATE.LEVEL_CLEAR) {
      drawHUD();
      drawParticles();
      drawScreen('LEVEL ' + level + ' CLEAR!', '得分: ' + score, '按 Enter / 點擊繼續');
    }

    ctx.restore();
  }

  // --- Game Loop ---
  let lastTime = 0;
  function gameLoop(timestamp) {
    const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
    lastTime = timestamp;

    update(dt);
    draw(timestamp / 1000);

    requestAnimationFrame(gameLoop);
  }

  // --- Loading screen (brief flash before menu) ---
  function drawLoadingScreen() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    drawStarfield(performance.now() / 1000);
    ctx.fillStyle = '#00ffcc';
    ctx.font = '18px "Courier New", monospace';
    ctx.textAlign = 'center';
    const dots = '.'.repeat(Math.floor((performance.now() / 400) % 4));
    ctx.fillText('LOADING' + dots, W / 2, H / 2);
  }

  // --- Start ---
  state = STATE.MENU;
  requestAnimationFrame(gameLoop);
})();
