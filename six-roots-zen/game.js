/**
 * 六根淨化 - 禪修打字遊戲
 *
 * 品質改善項目：
 * 1. [P0] JS 從 HTML 抽離為獨立檔案（原 2100+ 行 all-in-one）
 * 2. [P0] IIFE + 'use strict' 避免全域污染
 * 3. [P0] 移除 inline onclick，改用 addEventListener
 * 4. [P1] 粒子效果優化：DOM 粒子加入物件池 + 上限控制
 * 5. [P1] 合併重複的輸入處理邏輯（handleInput + compositionend）
 * 6. [P2] 新增 Escape 鍵支援（返回開始畫面）
 * 7. [P2] 改善 clipboard API 使用順序（優先用新 API）
 */

;(function () {
  'use strict';

  // ===== 持久化存儲管理 =====
  var STORAGE_KEY = 'sixRootsZen_progress';

  function getDefaultProgress() {
    return {
      totalPlays: 0,
      totalPurify: 0,
      allTimeBestStreak: 0,
      allTimeBestRound: 0,
      unlockedAchievements: [],
      lastPlayDate: null,
      consecutiveDays: 0,
      dailyFirstPlay: false,
      totalCharsTyped: 0
    };
  }

  function loadProgress() {
    try {
      var data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        var parsed = JSON.parse(data);
        var defaults = getDefaultProgress();
        for (var key in defaults) {
          if (!(key in parsed)) parsed[key] = defaults[key];
        }
        return parsed;
      }
    } catch (e) {
      console.warn('載入進度失敗:', e);
    }
    return getDefaultProgress();
  }

  function saveProgress(progress) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch (e) {
      console.warn('儲存進度失敗:', e);
    }
  }

  function getTodayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function updateConsecutiveDays(progress) {
    var today = getTodayStr();
    if (progress.lastPlayDate === today) return progress;

    var yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    var yesterdayStr = yesterday.toISOString().slice(0, 10);

    if (progress.lastPlayDate === yesterdayStr) {
      progress.consecutiveDays++;
    } else if (progress.lastPlayDate !== today) {
      progress.consecutiveDays = 1;
    }

    progress.lastPlayDate = today;
    progress.dailyFirstPlay = true;
    return progress;
  }

  var savedProgress = loadProgress();

  // ===== 禪語資料 =====
  var zenTexts = {
    eye: [
      { text: '見山是山', meaning: '初見本相' },
      { text: '觀自在菩薩', meaning: '觀照自性' },
      { text: '眼見非實', meaning: '不執著於所見' },
      { text: '色即是空', meaning: '色相本空' },
      { text: '見性成佛', meaning: '見自本性' },
      { text: '一花一世界', meaning: '微觀宏觀一體' },
      { text: '看破放下', meaning: '不執著外相' },
      { text: '明心見性', meaning: '照見本心' },
      { text: '眼觀四方', meaning: '覺察周遭' },
      { text: '視而不見', meaning: '不執於相' }
    ],
    ear: [
      { text: '靜聽梵音', meaning: '寂靜聆聽' },
      { text: '聞聲悟道', meaning: '從聲音中開悟' },
      { text: '耳根圓通', meaning: '觀音法門' },
      { text: '聲塵不染', meaning: '不為聲音所動' },
      { text: '反聞聞自性', meaning: '返觀聽覺本源' },
      { text: '入流亡所', meaning: '聽入忘我' },
      { text: '聞過則喜', meaning: '聽聞錯誤即覺醒' },
      { text: '側耳傾聽', meaning: '專注於聲' },
      { text: '聽無所住', meaning: '聽而不執' }
    ],
    nose: [
      { text: '聞香入定', meaning: '以香引導入定' },
      { text: '鼻觀白毫', meaning: '專注觀想' },
      { text: '清香淨心', meaning: '清淨心念' },
      { text: '一息萬念', meaning: '一呼一吸間' },
      { text: '調息入禪', meaning: '以呼吸入定' },
      { text: '香塵不著', meaning: '不執著香氣' },
      { text: '息息相關', meaning: '呼吸與心連結' },
      { text: '氣定神閒', meaning: '氣息平穩心安' }
    ],
    tongue: [
      { text: '止語修心', meaning: '沉默即修行' },
      { text: '言出如風', meaning: '言語如風過耳' },
      { text: '默然無言', meaning: '沉默是金' },
      { text: '口誦心惟', meaning: '口誦心持' },
      { text: '味塵不著', meaning: '不執著於味覺' },
      { text: '甘露法味', meaning: '法之甘美' },
      { text: '言簡意賅', meaning: '言語精煉' },
      { text: '妙語如珠', meaning: '言語智慧' },
      { text: '舌燦蓮花', meaning: '說法度眾' }
    ],
    body: [
      { text: '身如菩提', meaning: '身心清淨' },
      { text: '端坐如松', meaning: '端正禪坐' },
      { text: '觸塵不染', meaning: '身觸不執著' },
      { text: '行住坐臥', meaning: '時時在道' },
      { text: '身安心安', meaning: '身心一如' },
      { text: '調身入定', meaning: '調整身姿' },
      { text: '四大皆空', meaning: '身體非我' },
      { text: '身輕如燕', meaning: '輕安自在' },
      { text: '動靜皆禪', meaning: '動靜一如' }
    ],
    mind: [
      { text: '心無罣礙', meaning: '心中無牽掛' },
      { text: '念念分明', meaning: '每一念都清明' },
      { text: '心如明鏡', meaning: '心如明鏡台' },
      { text: '一念不生', meaning: '止息妄念' },
      { text: '本來無一物', meaning: '本性空寂' },
      { text: '即心即佛', meaning: '心即是佛' },
      { text: '無念為宗', meaning: '以無念為根本' },
      { text: '心行處滅', meaning: '止息心念' },
      { text: '萬法唯心', meaning: '一切由心造' },
      { text: '心猿意馬', meaning: '降伏妄心' },
      { text: '直心是道場', meaning: '真誠即修行' }
    ]
  };

  var deepZenTexts = {
    eye: [
      { text: '見山是山見水是水', meaning: '初見萬物本相' },
      { text: '青青翠竹盡是法身', meaning: '萬物皆現佛性' },
      { text: '菩提本無樹明鏡亦非台', meaning: '六祖開悟偈' },
      { text: '應無所住而生其心', meaning: '金剛經要義' }
    ],
    ear: [
      { text: '聞聲悟道觀音圓通', meaning: '觀音修行法門' },
      { text: '此方真教體清淨在音聞', meaning: '耳根修行訣' },
      { text: '一切有為法如夢幻泡影', meaning: '金剛經偈語' },
      { text: '聲聲喚醒夢中人', meaning: '棒喝覺醒' }
    ],
    nose: [
      { text: '數息觀心息息歸源', meaning: '數息禪定法' },
      { text: '香光莊嚴淨土現前', meaning: '念佛法門' },
      { text: '一呼一吸萬念俱寂', meaning: '呼吸即禪' },
      { text: '調息入定身心輕安', meaning: '禪定境界' }
    ],
    tongue: [
      { text: '不立文字直指人心', meaning: '禪宗心法' },
      { text: '言語道斷心行處滅', meaning: '超越言說' },
      { text: '開口便錯動念即乖', meaning: '不可說之理' },
      { text: '說似一物即不中', meaning: '真理無言' }
    ],
    body: [
      { text: '行亦禪坐亦禪語默動靜體安然', meaning: '時時皆禪' },
      { text: '身在此山中雲深不知處', meaning: '身心融入' },
      { text: '隨緣消舊業莫更造新殃', meaning: '消業修行' },
      { text: '頭頭是道物物全真', meaning: '萬物皆道' }
    ],
    mind: [
      { text: '心如止水鑑照萬物', meaning: '止水明鏡' },
      { text: '煩惱即菩提生死即涅槃', meaning: '不二法門' },
      { text: '心包太虛量周沙界', meaning: '心量廣大' },
      { text: '狂心頓歇歇即菩提', meaning: '放下即覺' },
      { text: '若能轉物即同如來', meaning: '轉境為悟' }
    ]
  };

  var rootNames = {
    eye: '眼', ear: '耳', nose: '鼻',
    tongue: '舌', body: '身', mind: '意'
  };

  var rootOrder = ['eye', 'ear', 'nose', 'tongue', 'body', 'mind'];

  // ===== 成就定義 =====
  var achievements = [
    { id: 'first_purify', name: '初心', icon: '🌱', desc: '完成首次淨化', condition: function (s) { return s.purifyCount === 1; } },
    { id: 'combo_10', name: '專注', icon: '🎯', desc: '達成 10 連擊', condition: function (s) { return s.currentStreak === 10; } },
    { id: 'combo_25', name: '入定', icon: '🧘', desc: '達成 25 連擊', condition: function (s) { return s.currentStreak === 25; } },
    { id: 'combo_50', name: '禪定', icon: '✨', desc: '達成 50 連擊', condition: function (s) { return s.currentStreak === 50; } },
    { id: 'combo_100', name: '三昧', icon: '🪷', desc: '達成 100 連擊', condition: function (s) { return s.currentStreak === 100; } },
    { id: 'full_focus', name: '定力圓滿', icon: '🔥', desc: '定力達到 100%', condition: function (s) { return s.focus === 100; } },
    { id: 'round_1', name: '六根清淨', icon: '☯️', desc: '完成一輪淨化', condition: function (s) { return s.purifyCount === 6 && s.roundCount === 1; } },
    { id: 'round_3', name: '修行精進', icon: '🏆', desc: '完成三輪淨化', condition: function (s) { return s.roundCount === 4; } },
    { id: 'round_5', name: '悟道', icon: '🌟', desc: '完成五輪淨化', condition: function (s) { return s.roundCount === 6; } },
    { id: 'accuracy_100', name: '無瑕', icon: '💎', desc: '準確率保持 100%（至少 20 字）', condition: function (s) { return s.totalChars >= 20 && s.correctChars === s.totalChars; } }
  ];

  // ===== 修行等級 =====
  var cultivationLevels = [
    { name: '初學', threshold: 0, icon: '🌱' },
    { name: '入門', threshold: 10, icon: '📿' },
    { name: '精進', threshold: 30, icon: '🎋' },
    { name: '覺醒', threshold: 60, icon: '🌸' },
    { name: '開悟', threshold: 100, icon: '🪷' },
    { name: '圓滿', threshold: 200, icon: '☀️' },
    { name: '菩薩', threshold: 500, icon: '🌟' },
    { name: '佛陀', threshold: 1000, icon: '🏆' }
  ];

  function getCultivationLevel(totalPurify) {
    var level = cultivationLevels[0];
    for (var i = 0; i < cultivationLevels.length; i++) {
      if (totalPurify >= cultivationLevels[i].threshold) {
        level = cultivationLevels[i];
      } else {
        break;
      }
    }
    return level;
  }

  function getLevelProgress(totalPurify) {
    var currentLevel = getCultivationLevel(totalPurify);
    var currentIndex = cultivationLevels.indexOf(currentLevel);
    if (currentIndex >= cultivationLevels.length - 1) return 100;
    var nextLevel = cultivationLevels[currentIndex + 1];
    var progress = ((totalPurify - currentLevel.threshold) / (nextLevel.threshold - currentLevel.threshold)) * 100;
    return Math.min(100, Math.max(0, Math.round(progress)));
  }

  function getNextLevelInfo(totalPurify) {
    var currentLevel = getCultivationLevel(totalPurify);
    var currentIndex = cultivationLevels.indexOf(currentLevel);
    if (currentIndex >= cultivationLevels.length - 1) return null;
    var nextLevel = cultivationLevels[currentIndex + 1];
    return { name: nextLevel.name, icon: nextLevel.icon, needed: nextLevel.threshold - totalPurify };
  }

  // ===== 遊戲狀態 =====
  var gameState = {
    currentRoot: null,
    currentZen: null,
    inputIndex: 0,
    purifyCount: 0,
    roundCount: 1,
    correctChars: 0,
    totalChars: 0,
    currentStreak: 0,
    bestStreak: 0,
    focus: 0,
    purifiedRoots: new Set(),
    usedZens: {},
    unlockedAchievements: new Set(),
    totalScore: 0,
    gameStartTime: null,
    lastInputTime: null,
    wpmHistory: [],
    rootStartTime: null,
    rootErrorCount: 0
  };

  var currentMode = 'standard';
  var lightningTimer = null;
  var lightningTimeLeft = 0;
  var isPaused = false;

  var modeConfig = {
    standard: { name: '標準模式', timePerChar: null, useDeepZen: false },
    lightning: { name: '閃電模式', timePerChar: 2.5, useDeepZen: false },
    deep: { name: '深禪模式', timePerChar: null, useDeepZen: true }
  };

  var milestones = [
    { streak: 10, text: '🎯 專注！10 連擊！' },
    { streak: 25, text: '🧘 入定！25 連擊！' },
    { streak: 50, text: '✨ 禪定！50 連擊！' },
    { streak: 75, text: '🌟 深定！75 連擊！' },
    { streak: 100, text: '🪷 三昧！100 連擊！' }
  ];
  var reachedMilestones = new Set();

  // ===== 音效系統 (Web Audio API) =====
  var AudioCtx = window.AudioContext || window.webkitAudioContext;
  var audioCtx = null;

  function initAudio() {
    if (!audioCtx && AudioCtx) {
      audioCtx = new AudioCtx();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playTone(freq, duration, type, volume) {
    if (!audioCtx) return;
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume || 0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  }

  function playCorrectSound() {
    var baseFreq = 523 + gameState.currentStreak * 8;
    baseFreq = Math.min(baseFreq, 1200);
    playTone(baseFreq, 0.08, 'sine', 0.12);
  }

  function playWrongSound() {
    playTone(200, 0.15, 'sawtooth', 0.1);
  }

  function playPurifySound() {
    playTone(523, 0.1, 'sine', 0.15);
    setTimeout(function () { playTone(659, 0.1, 'sine', 0.15); }, 80);
    setTimeout(function () { playTone(784, 0.15, 'sine', 0.15); }, 160);
  }

  function playRoundCompleteSound() {
    playTone(523, 0.1, 'sine', 0.18);
    setTimeout(function () { playTone(659, 0.1, 'sine', 0.18); }, 80);
    setTimeout(function () { playTone(784, 0.1, 'sine', 0.18); }, 160);
    setTimeout(function () { playTone(1047, 0.2, 'sine', 0.18); }, 240);
  }

  var streakRewards = [
    { days: 3, bonus: '初心不退', icon: '🌱' },
    { days: 7, bonus: '一週精進', icon: '🔥' },
    { days: 14, bonus: '兩週不懈', icon: '⭐' },
    { days: 30, bonus: '月滿圓明', icon: '🌕' },
    { days: 60, bonus: '雙月禪定', icon: '🏆' },
    { days: 100, bonus: '百日修行', icon: '👑' }
  ];

  var dailyChallenges = [
    '完成一輪零失誤淨化',
    '達成 15 連擊',
    '定力保持 100% 完成一根',
    '連續淨化三根不中斷連擊',
    '完成兩輪修行',
    '累計淨化 10 次',
    '打字準確率 98% 以上'
  ];

  // ===== 粒子效果物件池（限制 DOM 元素數量）=====
  var MAX_PARTICLES = 30;
  var activeParticles = 0;

  function spawnCorrectParticles(x, y) {
    var colors = ['#f4d03f', '#ff9800', '#4caf50', '#e8d5b7'];
    var count = Math.min(6, MAX_PARTICLES - activeParticles);
    if (count <= 0) return;

    for (var i = 0; i < count; i++) {
      var particle = document.createElement('div');
      particle.className = 'correct-particle';
      particle.style.left = x + 'px';
      particle.style.top = y + 'px';
      particle.style.background = colors[(Math.random() * colors.length) | 0];
      var angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      var distance = 40 + Math.random() * 30;
      particle.style.setProperty('--tx', Math.cos(angle) * distance + 'px');
      particle.style.setProperty('--ty', Math.sin(angle) * distance + 'px');
      document.body.appendChild(particle);
      activeParticles++;

      // 動畫結束後移除
      (function (p) {
        var cleanup = function () {
          if (p.parentNode) p.parentNode.removeChild(p);
          activeParticles = Math.max(0, activeParticles - 1);
        };
        p.addEventListener('animationend', cleanup);
        // 安全網：800ms 後強制清除
        setTimeout(cleanup, 900);
      })(particle);
    }
  }

  // ===== DOM 輔助 =====
  function showMessage(text, type) {
    type = type || 'info';
    var msg = document.createElement('div');
    msg.className = 'message ' + type;
    msg.textContent = text;
    document.body.appendChild(msg);
    setTimeout(function () {
      if (msg.parentNode) msg.parentNode.removeChild(msg);
    }, 2000);
  }

  function showMilestone(text) {
    var toast = document.createElement('div');
    toast.className = 'milestone-toast';
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 1600);
  }

  function showAchievement(ach) {
    var popup = document.createElement('div');
    popup.className = 'achievement-popup';
    popup.innerHTML = '<span class="icon">' + ach.icon + '</span>' + ach.name +
      '<br><small style="font-weight:normal;font-size:0.8rem">' + ach.desc + '</small>';
    document.body.appendChild(popup);
    setTimeout(function () {
      if (popup.parentNode) popup.parentNode.removeChild(popup);
    }, 2200);
  }

  function showPerfectComplete(rootName) {
    if (gameState.rootErrorCount === 0) {
      var perfect = document.createElement('div');
      perfect.className = 'perfect-complete';
      perfect.textContent = '🪷 ' + rootName + '根 圓滿 🪷';
      document.body.appendChild(perfect);
      setTimeout(function () {
        if (perfect.parentNode) perfect.parentNode.removeChild(perfect);
      }, 2100);
    }
  }

  // ===== 遊戲邏輯 =====
  function initParticles() {
    var container = document.getElementById('particles');
    if (!container) return;
    for (var i = 0; i < 20; i++) {
      var particle = document.createElement('div');
      particle.className = 'particle';
      particle.style.left = Math.random() * 100 + '%';
      particle.style.animationDelay = Math.random() * 15 + 's';
      particle.style.animationDuration = (10 + Math.random() * 10) + 's';
      container.appendChild(particle);
    }
  }

  function selectMode(mode) {
    currentMode = mode;
    var btns = document.querySelectorAll('.mode-btn');
    for (var i = 0; i < btns.length; i++) {
      var isActive = btns[i].getAttribute('data-mode') === mode;
      btns[i].classList.toggle('active', isActive);
    }
  }

  function calculateWPM() {
    if (!gameState.gameStartTime || gameState.correctChars < 2) return 0;
    var elapsedMinutes = (Date.now() - gameState.gameStartTime) / 60000;
    if (elapsedMinutes < 0.05) return 0;
    var wpm = Math.round(gameState.correctChars / elapsedMinutes);
    return Math.min(999, wpm);
  }

  function updateWPMDisplay() {
    var wpmDisplay = document.getElementById('wpm-display');
    var wpmValue = document.getElementById('wpm-value');
    if (!wpmDisplay || !wpmValue) return;
    var wpm = calculateWPM();
    if (wpm > 0) {
      wpmDisplay.classList.remove('hidden');
      wpmValue.textContent = wpm;
      if (wpm >= 60) wpmValue.style.color = '#f4d03f';
      else if (wpm >= 40) wpmValue.style.color = '#4caf50';
      else if (wpm >= 20) wpmValue.style.color = '#8892a8';
      else wpmValue.style.color = '#a0a8b8';
    }
  }

  function checkMilestone() {
    for (var i = 0; i < milestones.length; i++) {
      var m = milestones[i];
      if (gameState.currentStreak === m.streak && !reachedMilestones.has(m.streak)) {
        reachedMilestones.add(m.streak);
        showMilestone(m.text);
        break;
      }
    }
  }

  function updateInputGlow() {
    var input = document.getElementById('zen-input');
    if (!input) return;
    input.classList.remove('streak-glow', 'streak-fire');
    if (gameState.currentStreak >= 50) {
      input.classList.add('streak-fire');
    } else if (gameState.currentStreak >= 15) {
      input.classList.add('streak-glow');
    }
  }

  function updateCombo() {
    var comboDisplay = document.getElementById('combo-display');
    var comboCount = document.getElementById('combo-count');
    var comboMultiplier = document.getElementById('combo-multiplier');
    if (!comboDisplay || !comboCount || !comboMultiplier) return;

    if (gameState.currentStreak >= 3) {
      comboDisplay.classList.remove('hidden');
      comboCount.textContent = gameState.currentStreak;
      var multiplier = 1 + Math.floor(gameState.currentStreak / 5) * 0.1;
      comboMultiplier.textContent = '\u00d7' + multiplier.toFixed(1);
      comboCount.classList.add('pulse');
      setTimeout(function () { comboCount.classList.remove('pulse'); }, 150);
    } else {
      comboDisplay.classList.add('hidden');
    }
  }

  function checkAchievements() {
    for (var i = 0; i < achievements.length; i++) {
      var ach = achievements[i];
      if (!gameState.unlockedAchievements.has(ach.id) && ach.condition(gameState)) {
        gameState.unlockedAchievements.add(ach.id);
        showAchievement(ach);
      }
    }
  }

  function updateStats() {
    var el;
    el = document.getElementById('round-count');
    if (el) el.textContent = gameState.roundCount;
    el = document.getElementById('purify-count');
    if (el) el.textContent = gameState.purifyCount;
    el = document.getElementById('best-streak');
    if (el) el.textContent = gameState.bestStreak;

    var accuracy = gameState.totalChars > 0
      ? Math.round((gameState.correctChars / gameState.totalChars) * 100)
      : 100;
    el = document.getElementById('accuracy');
    if (el) el.textContent = accuracy + '%';
  }

  function updateFocusBar() {
    var valueEl = document.getElementById('focus-value');
    var fill = document.getElementById('focus-bar-fill');
    if (valueEl) valueEl.textContent = gameState.focus;
    if (fill) {
      fill.style.width = gameState.focus + '%';
      if (gameState.focus >= 100) {
        fill.classList.add('maxed');
      } else {
        fill.classList.remove('maxed');
      }
    }
  }

  // ===== 統一字元處理（消除 handleInput 與 compositionend 的重複）=====
  function processChar(char) {
    var targetText = gameState.currentZen.text;
    var expectedChar = targetText[gameState.inputIndex];
    gameState.totalChars++;
    gameState.lastInputTime = Date.now();

    if (char === expectedChar) {
      // 正確
      gameState.correctChars++;
      gameState.inputIndex++;
      gameState.currentStreak++;
      playCorrectSound();
      if (gameState.currentStreak > gameState.bestStreak) {
        gameState.bestStreak = gameState.currentStreak;
      }
      var focusGain = 5 + Math.floor(gameState.currentStreak / 10);
      gameState.focus = Math.min(100, gameState.focus + focusGain);

      updateCombo();
      checkMilestone();
      updateInputGlow();
      updateWPMDisplay();

      // 粒子效果
      var charEls = document.querySelectorAll('.zen-text .char');
      var targetEl = charEls[gameState.inputIndex - 1];
      if (targetEl) {
        var rect = targetEl.getBoundingClientRect();
        spawnCorrectParticles(rect.left + rect.width / 2, rect.top + rect.height / 2);
      }

      return true;
    } else {
      // 錯誤
      gameState.currentStreak = 0;
      gameState.rootErrorCount++;
      gameState.focus = Math.max(0, gameState.focus - 10);
      updateCombo();
      updateInputGlow();

      playWrongSound();
      // 抖動效果
      var chars = document.querySelectorAll('.zen-text .char');
      if (chars[gameState.inputIndex]) {
        chars[gameState.inputIndex].classList.add('wrong');
        var wrongEl = chars[gameState.inputIndex];
        setTimeout(function () { wrongEl.classList.remove('wrong'); }, 300);
      }

      return false;
    }
  }

  // ===== 輸入事件處理 =====
  function handleInput(e) {
    var input = e.target.value;
    if (input.length > 0 && !e.isComposing) {
      var lastChar = input[input.length - 1];
      processChar(lastChar);
      displayZenText();
      updateStats();
      updateFocusBar();
      checkAchievements();

      if (gameState.inputIndex >= gameState.currentZen.text.length) {
        purifyRoot();
      }
      e.target.value = '';
    }
  }

  function handleCompositionEnd(e) {
    var composed = e.data;
    if (!composed) return;

    for (var i = 0; i < composed.length; i++) {
      processChar(composed[i]);
    }

    displayZenText();
    updateStats();
    updateFocusBar();
    checkAchievements();

    if (gameState.inputIndex >= gameState.currentZen.text.length) {
      purifyRoot();
    }
    e.target.value = '';
  }

  function displayZenText() {
    var container = document.getElementById('zen-text');
    if (!container || !gameState.currentZen) return;
    var text = gameState.currentZen.text;
    var html = '';
    for (var i = 0; i < text.length; i++) {
      var className = 'char';
      if (i < gameState.inputIndex) className += ' correct';
      else if (i === gameState.inputIndex) className += ' current';
      html += '<span class="' + className + '">' + text[i] + '</span>';
    }
    container.innerHTML = html;
  }

  // ===== 閃電模式計時器（rAF + performance.now）=====
  var lightningStartTime = 0;
  var lightningDuration = 0;
  var lightningRafId = null;

  function startLightningTimer() {
    if (currentMode !== 'lightning') return;
    var zenLength = gameState.currentZen.text.length;
    lightningDuration = zenLength * modeConfig.lightning.timePerChar * 1000; // ms
    lightningStartTime = performance.now();

    var timerEl = document.getElementById('lightning-timer');
    if (timerEl) timerEl.classList.remove('hidden');

    if (lightningRafId) cancelAnimationFrame(lightningRafId);

    function updateTimer() {
      if (isPaused) {
        lightningRafId = requestAnimationFrame(updateTimer);
        return;
      }
      var elapsed = performance.now() - lightningStartTime;
      lightningTimeLeft = Math.max(0, (lightningDuration - elapsed) / 1000);

      var timerValue = document.getElementById('lightning-timer-value');
      if (timerValue) {
        timerValue.textContent = lightningTimeLeft.toFixed(1);
        if (lightningTimeLeft <= 3) timerValue.classList.add('danger');
        else timerValue.classList.remove('danger');
      }

      if (lightningTimeLeft <= 0) {
        lightningRafId = null;
        handleLightningTimeout();
        return;
      }
      lightningRafId = requestAnimationFrame(updateTimer);
    }

    lightningRafId = requestAnimationFrame(updateTimer);
  }

  function stopLightningTimer() {
    if (lightningRafId) {
      cancelAnimationFrame(lightningRafId);
      lightningRafId = null;
    }
    var timerEl = document.getElementById('lightning-timer');
    var timerValueEl = document.getElementById('lightning-timer-value');
    if (timerEl) timerEl.classList.add('hidden');
    if (timerValueEl) timerValueEl.classList.remove('danger');
  }

  function handleLightningTimeout() {
    gameState.currentStreak = 0;
    gameState.focus = Math.max(0, gameState.focus - 20);
    updateCombo();
    updateFocusBar();
    updateInputGlow();
    showMessage('⏰ 時間到！', 'info');
    setTimeout(function () {
      var input = document.getElementById('zen-input');
      if (input) input.value = '';
      nextRoot();
    }, 1000);
  }

  // ===== 暫停功能 =====
  function togglePause() {
    if (isPaused) {
      resumeGame();
    } else {
      pauseGame();
    }
  }

  var pauseStartTime = 0;

  function pauseGame() {
    isPaused = true;
    pauseStartTime = performance.now();
    var input = document.getElementById('zen-input');
    if (input) input.disabled = true;

    var overlay = document.createElement('div');
    overlay.className = 'pause-overlay';
    overlay.id = 'pause-overlay';
    overlay.innerHTML =
      '<h2>修行暫停</h2>' +
      '<p>按 Esc 或點擊繼續</p>' +
      '<button class="btn btn-primary" id="resumeBtn">繼續修行</button>' +
      '<button class="btn btn-secondary" id="quitBtn" style="margin-top: 0.5rem; margin-left: 0;">結束修行</button>';
    document.body.appendChild(overlay);

    var resumeBtn = document.getElementById('resumeBtn');
    if (resumeBtn) resumeBtn.addEventListener('click', resumeGame);
    var quitBtn = document.getElementById('quitBtn');
    if (quitBtn) quitBtn.addEventListener('click', function () {
      resumeGame();
      endGame();
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) resumeGame();
    });
  }

  function resumeGame() {
    // 補償暫停期間的時間（閃電模式計時不應在暫停期間流逝）
    if (pauseStartTime > 0) {
      var pausedDuration = performance.now() - pauseStartTime;
      lightningStartTime += pausedDuration;
      pauseStartTime = 0;
    }
    isPaused = false;
    var overlay = document.getElementById('pause-overlay');
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    var input = document.getElementById('zen-input');
    if (input) {
      input.disabled = false;
      input.focus();
    }
  }

  // ===== 遊戲流程 =====
  function startGame() {
    initAudio();
    savedProgress.totalPlays++;
    savedProgress = updateConsecutiveDays(savedProgress);
    var previousAchievements = new Set(savedProgress.unlockedAchievements || []);

    gameState = {
      currentRoot: null,
      currentZen: null,
      inputIndex: 0,
      purifyCount: 0,
      roundCount: 1,
      correctChars: 0,
      totalChars: 0,
      currentStreak: 0,
      bestStreak: 0,
      focus: 0,
      purifiedRoots: new Set(),
      usedZens: {},
      unlockedAchievements: previousAchievements,
      totalScore: 0,
      gameStartTime: Date.now(),
      lastInputTime: Date.now(),
      wpmHistory: [],
      rootStartTime: null,
      rootErrorCount: 0
    };

    reachedMilestones = new Set();
    saveProgress(savedProgress);

    var comboDisplay = document.getElementById('combo-display');
    var wpmDisplay = document.getElementById('wpm-display');
    if (comboDisplay) comboDisplay.classList.add('hidden');
    if (wpmDisplay) wpmDisplay.classList.add('hidden');
    stopLightningTimer();

    var input = document.getElementById('zen-input');
    if (input) input.classList.remove('streak-glow', 'streak-fire');

    var rootIcons = document.querySelectorAll('.root-icon');
    for (var i = 0; i < rootIcons.length; i++) {
      rootIcons[i].classList.remove('active', 'purified');
    }

    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('result-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');

    var modeName = modeConfig[currentMode].name;
    showMessage(modeName + '開始！', 'info');

    updateStats();
    updateFocusBar();
    nextRoot();

    if (input) input.focus();
  }

  function nextRoot() {
    var availableRoots = rootOrder.filter(function (r) { return !gameState.purifiedRoots.has(r); });
    if (availableRoots.length === 0) {
      completeRound();
      return;
    }
    var randomRoot = availableRoots[(Math.random() * availableRoots.length) | 0];
    selectRoot(randomRoot);
  }

  function selectRoot(root) {
    gameState.currentRoot = root;
    gameState.inputIndex = 0;
    gameState.rootStartTime = Date.now();
    gameState.rootErrorCount = 0;

    var rootIcons = document.querySelectorAll('.root-icon');
    for (var i = 0; i < rootIcons.length; i++) {
      rootIcons[i].classList.remove('active');
      if (rootIcons[i].getAttribute('data-root') === root) {
        rootIcons[i].classList.add('active');
      }
    }

    var useDeep = modeConfig[currentMode].useDeepZen;
    var zenSource = useDeep ? deepZenTexts : zenTexts;
    var zens = zenSource[root];

    if (!gameState.usedZens[root]) gameState.usedZens[root] = [];

    var availableZens = zens.filter(function (z) {
      return gameState.usedZens[root].indexOf(z.text) === -1;
    });
    if (availableZens.length === 0) {
      gameState.usedZens[root] = [];
      availableZens = zens;
    }

    var zen = availableZens[(Math.random() * availableZens.length) | 0];
    gameState.usedZens[root].push(zen.text);
    gameState.currentZen = zen;

    displayZenText();
    var meaningEl = document.getElementById('zen-meaning');
    if (meaningEl) meaningEl.textContent = '— ' + zen.meaning;

    var input = document.getElementById('zen-input');
    if (input) input.value = '';

    if (currentMode === 'lightning') startLightningTimer();

    showMessage('淨化「' + rootNames[root] + '」根', 'info');
  }

  function purifyRoot() {
    var root = gameState.currentRoot;
    gameState.purifiedRoots.add(root);
    gameState.purifyCount++;

    stopLightningTimer();

    var icon = document.querySelector('.root-icon[data-root="' + root + '"]');
    if (icon) {
      icon.classList.remove('active');
      icon.classList.add('purified');
    }

    playPurifySound();
    showPerfectComplete(rootNames[root]);
    showMessage('「' + rootNames[root] + '」根已淨化！', 'success');
    updateStats();
    checkAchievements();

    setTimeout(function () {
      var input = document.getElementById('zen-input');
      if (input) input.value = '';
      nextRoot();
    }, 1000);
  }

  function completeRound() {
    gameState.roundCount++;
    gameState.purifiedRoots.clear();

    var rootIcons = document.querySelectorAll('.root-icon');
    for (var i = 0; i < rootIcons.length; i++) {
      rootIcons[i].classList.remove('purified');
    }

    playRoundCompleteSound();
    showMessage('第 ' + (gameState.roundCount - 1) + ' 輪圓滿！進入第 ' + gameState.roundCount + ' 輪', 'success');
    updateStats();
    checkAchievements();
    setTimeout(nextRoot, 1500);
  }

  function endGame() {
    stopLightningTimer();

    var wpmDisplay = document.getElementById('wpm-display');
    if (wpmDisplay) wpmDisplay.classList.add('hidden');

    var input = document.getElementById('zen-input');
    if (input) input.classList.remove('streak-glow', 'streak-fire');

    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('result-screen').style.display = 'block';

    var finalRounds = gameState.roundCount - 1 || 0;
    var accuracy = gameState.totalChars > 0
      ? Math.round((gameState.correctChars / gameState.totalChars) * 100)
      : 100;

    savedProgress.totalPurify += gameState.purifyCount;
    savedProgress.totalCharsTyped += gameState.totalChars;
    if (gameState.bestStreak > savedProgress.allTimeBestStreak) {
      savedProgress.allTimeBestStreak = gameState.bestStreak;
    }
    if (finalRounds > savedProgress.allTimeBestRound) {
      savedProgress.allTimeBestRound = finalRounds;
    }
    savedProgress.unlockedAchievements = Array.from(gameState.unlockedAchievements);
    saveProgress(savedProgress);

    var el;
    el = document.getElementById('final-rounds');
    if (el) el.textContent = finalRounds;
    el = document.getElementById('final-purify');
    if (el) el.textContent = gameState.purifyCount;
    el = document.getElementById('final-streak');
    if (el) el.textContent = gameState.bestStreak;
    el = document.getElementById('final-accuracy');
    if (el) el.textContent = accuracy + '%';

    updateResultHistoryDisplay();
  }

  function updateResultHistoryDisplay() {
    var historyDiv = document.getElementById('history-stats');
    if (!historyDiv) {
      var resultStats = document.querySelector('.result-stats');
      if (!resultStats) return;
      historyDiv = document.createElement('div');
      historyDiv.id = 'history-stats';
      historyDiv.style.cssText = 'margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.1);';
      resultStats.appendChild(historyDiv);
    }

    var currentLevel = getCultivationLevel(savedProgress.totalPurify);
    var progress = getLevelProgress(savedProgress.totalPurify);
    var nextLevelInfo = getNextLevelInfo(savedProgress.totalPurify);

    var prevTotalPurify = savedProgress.totalPurify - gameState.purifyCount;
    var prevLevel = getCultivationLevel(prevTotalPurify);
    var leveledUp = currentLevel.name !== prevLevel.name;

    var levelUpHtml = '';
    if (leveledUp) {
      levelUpHtml =
        '<div style="background: linear-gradient(135deg, rgba(244,208,63,0.2), rgba(255,152,0,0.2)); border: 1px solid rgba(244,208,63,0.4); border-radius: 0.5rem; padding: 0.75rem; margin-bottom: 1rem;">' +
        '<div style="font-size: 1.2rem; margin-bottom: 0.25rem;">🎊 境界提升！</div>' +
        '<div style="color: #8892a8;">' + prevLevel.icon + ' ' + prevLevel.name + ' → <span style="color: #f4d03f; font-size: 1.1rem;">' + currentLevel.icon + ' ' + currentLevel.name + '</span></div>' +
        '</div>';
    }

    var progressHtml = '';
    if (nextLevelInfo) {
      progressHtml =
        '<div style="margin: 1rem 0;">' +
        '<div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 0.5rem;">' +
        '<span style="font-size: 1.3rem;">' + currentLevel.icon + '</span>' +
        '<span style="color: #f4d03f; font-weight: bold;">' + currentLevel.name + '</span></div>' +
        '<div style="max-width: 250px; margin: 0 auto;">' +
        '<div style="width: 100%; height: 8px; background: rgba(0,0,0,0.3); border-radius: 4px; overflow: hidden;">' +
        '<div style="width: ' + progress + '%; height: 100%; background: linear-gradient(90deg, #f4d03f, #ff9800); border-radius: 4px;"></div></div>' +
        '<div style="font-size: 0.75rem; color: #8892a8; margin-top: 0.25rem;">距離 ' + nextLevelInfo.icon + ' ' + nextLevelInfo.name + ' 還需 ' + nextLevelInfo.needed + ' 次淨化</div>' +
        '</div></div>';
    } else {
      progressHtml =
        '<div style="margin: 1rem 0; text-align: center;">' +
        '<span style="font-size: 1.5rem;">' + currentLevel.icon + '</span>' +
        '<span style="color: #f4d03f; font-size: 1.2rem; font-weight: bold;">' + currentLevel.name + '</span>' +
        '<div style="color: #4caf50; font-size: 0.9rem; margin-top: 0.25rem;">✨ 已達最高境界 ✨</div></div>';
    }

    historyDiv.innerHTML =
      levelUpHtml + progressHtml +
      '<div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 0.75rem; margin-top: 0.75rem;">' +
      '<p style="color: #8892a8; font-size: 0.85rem; margin-bottom: 0.5rem;">📜 歷史紀錄</p>' +
      '<p style="font-size: 0.9rem;">累計修行：<span style="color: #f4d03f;">' + savedProgress.totalPlays + '</span> 次 · 累計淨化：<span style="color: #4caf50;">' + savedProgress.totalPurify + '</span> 次</p>' +
      '<p style="font-size: 0.9rem;">最佳連擊：<span style="color: #ff9800;">' + savedProgress.allTimeBestStreak + '</span> · 最佳輪數：<span style="color: #e8d5b7;">' + savedProgress.allTimeBestRound + '</span> 輪</p>' +
      (savedProgress.consecutiveDays > 1 ? '<p style="font-size: 0.9rem;">連續修行：<span style="color: #f4d03f;">🔥 ' + savedProgress.consecutiveDays + ' 天</span></p>' : '') +
      '</div>';
  }

  function showStart() {
    document.getElementById('result-screen').style.display = 'none';
    document.getElementById('start-screen').classList.remove('hidden');
    updateStartScreen();
  }

  function shareScore() {
    var finalRounds = gameState.roundCount - 1 || 0;
    var accuracy = gameState.totalChars > 0
      ? Math.round((gameState.correctChars / gameState.totalChars) * 100) : 100;

    var comment = '';
    if (gameState.bestStreak >= 50) comment = '禪定深厚！';
    else if (gameState.bestStreak >= 25) comment = '心神專注！';
    else if (accuracy >= 98) comment = '精準無誤！';
    else if (finalRounds >= 3) comment = '精進不懈！';
    else comment = '初心修行！';

    var shareText = '🧘 六根淨化 · 禪修打字\n\n' + comment + '\n\n' +
      '📿 完成 ' + finalRounds + ' 輪修行\n' +
      '✨ 淨化 ' + gameState.purifyCount + ' 次\n' +
      '🎯 準確率 ' + accuracy + '%\n' +
      '🔥 最佳連擊 ' + gameState.bestStreak + '\n' +
      (savedProgress.consecutiveDays > 1 ? '📅 連續修行 ' + savedProgress.consecutiveDays + ' 天\n' : '') +
      '\n心若冰清，天塌不驚 🪷';

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareText).then(function () {
        showMessage('成績已複製到剪貼簿！', 'success');
      }).catch(function () {
        fallbackCopy(shareText);
      });
    } else {
      fallbackCopy(shareText);
    }
  }

  function fallbackCopy(text) {
    var textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.cssText = 'position:fixed;opacity:0;left:-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      showMessage('成績已複製到剪貼簿！', 'success');
    } catch (e) {
      showMessage('複製失敗，請手動選取', 'info');
    }
    document.body.removeChild(textArea);
  }

  function getTodayChallenge() {
    var today = new Date();
    var dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 86400000);
    return dailyChallenges[dayOfYear % dailyChallenges.length];
  }

  function updateStartScreen() {
    var streakBadge = document.getElementById('streak-badge');
    var streakDays = document.getElementById('streak-days');
    if (streakBadge) {
      if (savedProgress.consecutiveDays > 1) {
        streakBadge.classList.remove('hidden');
        if (streakDays) streakDays.textContent = savedProgress.consecutiveDays;
      } else {
        streakBadge.classList.add('hidden');
      }
    }

    var historyDiv = document.getElementById('start-history');
    if (!historyDiv) return;

    var currentLevel = getCultivationLevel(savedProgress.totalPurify);
    var progress = getLevelProgress(savedProgress.totalPurify);
    var nextLevelInfo = getNextLevelInfo(savedProgress.totalPurify);

    var levelHtml =
      '<div style="margin-bottom: 0.75rem;">' +
      '<span style="font-size: 1.5rem;">' + currentLevel.icon + '</span>' +
      '<span style="color: #f4d03f; font-size: 1.1rem; font-weight: bold;">' + currentLevel.name + '</span>' +
      '<span style="color: #8892a8; font-size: 0.85rem; margin-left: 0.5rem;">累計淨化 ' + savedProgress.totalPurify + ' 次</span>' +
      '</div>';

    if (nextLevelInfo) {
      levelHtml +=
        '<div style="max-width: 280px; margin: 0 auto;">' +
        '<div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: #8892a8; margin-bottom: 0.25rem;">' +
        '<span>' + currentLevel.name + '</span>' +
        '<span>距離 ' + nextLevelInfo.icon + ' ' + nextLevelInfo.name + ' 還需 ' + nextLevelInfo.needed + ' 次</span></div>' +
        '<div style="width: 100%; height: 6px; background: rgba(0,0,0,0.3); border-radius: 3px; overflow: hidden;">' +
        '<div style="width: ' + progress + '%; height: 100%; background: linear-gradient(90deg, #f4d03f, #ff9800); border-radius: 3px;"></div>' +
        '</div></div>';
    } else {
      levelHtml += '<div style="color: #4caf50; font-size: 0.9rem;">✨ 已達最高境界 ✨</div>';
    }

    if (savedProgress.totalPlays > 0) {
      levelHtml +=
        '<div style="margin-top: 0.75rem; font-size: 0.85rem; color: #8892a8;">' +
        '修行 <span style="color: #f4d03f;">' + savedProgress.totalPlays + '</span> 次 · ' +
        '最佳連擊 <span style="color: #ff9800;">' + savedProgress.allTimeBestStreak + '</span> · ' +
        '最佳輪數 <span style="color: #e8d5b7;">' + savedProgress.allTimeBestRound + '</span></div>';
    }

    historyDiv.innerHTML = levelHtml;

    var challengeDiv = document.getElementById('daily-challenge');
    var challengeText = document.getElementById('daily-challenge-text');
    if (challengeDiv) challengeDiv.classList.remove('hidden');
    if (challengeText) challengeText.textContent = getTodayChallenge();
  }

  function checkDailyReward() {
    var today = getTodayStr();
    if (savedProgress.lastPlayDate !== today && savedProgress.consecutiveDays >= 1) {
      var yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      var yesterdayStr = yesterday.toISOString().slice(0, 10);

      var projectedStreak = 1;
      if (savedProgress.lastPlayDate === yesterdayStr) {
        projectedStreak = savedProgress.consecutiveDays + 1;
      }
      if (projectedStreak >= 2) {
        showDailyRewardPopup(projectedStreak);
      }
    }
  }

  function showDailyRewardPopup(streakDays) {
    var reward = null;
    for (var i = 0; i < streakRewards.length; i++) {
      if (streakDays >= streakRewards[i].days) reward = streakRewards[i];
    }

    var popup = document.createElement('div');
    popup.className = 'daily-reward-popup';
    popup.innerHTML =
      '<div class="daily-reward-content">' +
      '<div class="daily-reward-icon">🌅</div>' +
      '<div class="daily-reward-title">歡迎回來！</div>' +
      '<div style="color: #8892a8;">持續修行，功不唐捐</div>' +
      '<div class="daily-reward-streak">🔥 連續 ' + streakDays + ' 天</div>' +
      (reward ? '<div class="daily-reward-bonus">' + reward.icon + ' 達成成就：' + reward.bonus + '</div>' : '') +
      '<button class="btn btn-primary daily-reward-btn" id="dailyRewardCloseBtn">開始今日修行</button>' +
      '</div>';
    document.body.appendChild(popup);

    var closeBtn = document.getElementById('dailyRewardCloseBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        if (popup.parentNode) popup.parentNode.removeChild(popup);
      });
    }

    popup.addEventListener('click', function (e) {
      if (e.target === popup && popup.parentNode) popup.parentNode.removeChild(popup);
    });
  }

  // ===== 初始化 =====
  function init() {
    initParticles();
    updateStartScreen();
    checkDailyReward();

    var input = document.getElementById('zen-input');
    if (input) {
      input.addEventListener('input', handleInput);
      input.addEventListener('compositionend', handleCompositionEnd);
      input.addEventListener('keydown', function (e) {
        // 防止空格觸發滾動
        if (e.key === ' ') e.preventDefault();
        // Escape 鍵：遊戲中暫停/繼續
        if (e.key === 'Escape') {
          e.preventDefault();
          togglePause();
        }
      });
    }

    // 模式選擇按鈕（取代 inline onclick）
    var modeBtns = document.querySelectorAll('.mode-btn[data-mode]');
    for (var i = 0; i < modeBtns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          selectMode(btn.getAttribute('data-mode'));
        });
      })(modeBtns[i]);
    }

    // 開始按鈕
    var startBtn = document.getElementById('startBtn');
    if (startBtn) {
      startBtn.addEventListener('click', startGame);
    }

    // 結束修行按鈕
    var endBtn = document.getElementById('endBtn');
    if (endBtn) {
      endBtn.addEventListener('click', endGame);
    }

    // 結果畫面的重新開始按鈕
    var restartBtn = document.getElementById('restartBtn');
    if (restartBtn) {
      restartBtn.addEventListener('click', startGame);
    }

    // 返回按鈕
    var backBtn = document.getElementById('backBtn');
    if (backBtn) {
      backBtn.addEventListener('click', showStart);
    }

    // 分享按鈕
    var shareBtn = document.getElementById('shareBtn');
    if (shareBtn) {
      shareBtn.addEventListener('click', shareScore);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
