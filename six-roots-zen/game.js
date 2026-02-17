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
 *
 * v2.0 品質深度優化（2026-02-18）：
 * 8. [P0] 手機觸控支援：虛擬鍵盤引導、auto-focus、inputmode 屬性
 * 9. [P0] 明確狀態機（START → PLAYING → PAUSED → RESULT）
 * 10. [P1] 響應式佈局：手機版頂部統計列取代桌面固定定位
 * 11. [P1] ES5 var 全面升級為 const/let
 * 12. [P1] 手機端 Combo/WPM/Timer 整合到 mobile-game-header
 * 13. [P2] 輸入框加入 autocorrect/autocapitalize/spellcheck 抑制
 */

;(function () {
  'use strict';

  // ===== 狀態機 =====
  const GAME_STATE = {
    START: 'start',
    PLAYING: 'playing',
    PAUSED: 'paused',
    RESULT: 'result'
  };

  let currentGameState = GAME_STATE.START;

  // ===== 裝置偵測 =====
  const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  // ===== 持久化存儲管理 =====
  const STORAGE_KEY = 'sixRootsZen_progress';

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
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        const defaults = getDefaultProgress();
        for (const key in defaults) {
          if (!(key in parsed)) parsed[key] = defaults[key];
        }
        return parsed;
      }
    } catch (e) {
      console.warn('載入進度失敗:', e);
    }
    return getDefaultProgress();
  }

  function saveProgress(prog) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prog));
    } catch (e) {
      console.warn('儲存進度失敗:', e);
    }
  }

  function getTodayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function updateConsecutiveDays(prog) {
    const today = getTodayStr();
    if (prog.lastPlayDate === today) return prog;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    if (prog.lastPlayDate === yesterdayStr) {
      prog.consecutiveDays++;
    } else if (prog.lastPlayDate !== today) {
      prog.consecutiveDays = 1;
    }

    prog.lastPlayDate = today;
    prog.dailyFirstPlay = true;
    return prog;
  }

  let savedProgress = loadProgress();

  // ===== 禪語資料 =====
  const zenTexts = {
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

  const deepZenTexts = {
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

  const rootNames = {
    eye: '眼', ear: '耳', nose: '鼻',
    tongue: '舌', body: '身', mind: '意'
  };

  const rootOrder = ['eye', 'ear', 'nose', 'tongue', 'body', 'mind'];

  // ===== 成就定義 =====
  const achievements = [
    { id: 'first_purify', name: '初心', icon: '🌱', desc: '完成首次淨化', condition: (s) => s.purifyCount === 1 },
    { id: 'combo_10', name: '專注', icon: '🎯', desc: '達成 10 連擊', condition: (s) => s.currentStreak === 10 },
    { id: 'combo_25', name: '入定', icon: '🧘', desc: '達成 25 連擊', condition: (s) => s.currentStreak === 25 },
    { id: 'combo_50', name: '禪定', icon: '✨', desc: '達成 50 連擊', condition: (s) => s.currentStreak === 50 },
    { id: 'combo_100', name: '三昧', icon: '🪷', desc: '達成 100 連擊', condition: (s) => s.currentStreak === 100 },
    { id: 'full_focus', name: '定力圓滿', icon: '🔥', desc: '定力達到 100%', condition: (s) => s.focus === 100 },
    { id: 'round_1', name: '六根清淨', icon: '☯️', desc: '完成一輪淨化', condition: (s) => s.purifyCount === 6 && s.roundCount === 1 },
    { id: 'round_3', name: '修行精進', icon: '🏆', desc: '完成三輪淨化', condition: (s) => s.roundCount === 4 },
    { id: 'round_5', name: '悟道', icon: '🌟', desc: '完成五輪淨化', condition: (s) => s.roundCount === 6 },
    { id: 'accuracy_100', name: '無瑕', icon: '💎', desc: '準確率保持 100%（至少 20 字）', condition: (s) => s.totalChars >= 20 && s.correctChars === s.totalChars }
  ];

  // ===== 修行等級 =====
  const cultivationLevels = [
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
    let level = cultivationLevels[0];
    for (let i = 0; i < cultivationLevels.length; i++) {
      if (totalPurify >= cultivationLevels[i].threshold) {
        level = cultivationLevels[i];
      } else {
        break;
      }
    }
    return level;
  }

  function getLevelProgress(totalPurify) {
    const currentLevel = getCultivationLevel(totalPurify);
    const currentIndex = cultivationLevels.indexOf(currentLevel);
    if (currentIndex >= cultivationLevels.length - 1) return 100;
    const nextLevel = cultivationLevels[currentIndex + 1];
    const progress = ((totalPurify - currentLevel.threshold) / (nextLevel.threshold - currentLevel.threshold)) * 100;
    return Math.min(100, Math.max(0, Math.round(progress)));
  }

  function getNextLevelInfo(totalPurify) {
    const currentLevel = getCultivationLevel(totalPurify);
    const currentIndex = cultivationLevels.indexOf(currentLevel);
    if (currentIndex >= cultivationLevels.length - 1) return null;
    const nextLevel = cultivationLevels[currentIndex + 1];
    return { name: nextLevel.name, icon: nextLevel.icon, needed: nextLevel.threshold - totalPurify };
  }

  // ===== 遊戲狀態 =====
  let gameState = {
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

  let currentMode = 'standard';
  let lightningTimeLeft = 0;
  let isPaused = false;

  const modeConfig = {
    standard: { name: '標準模式', timePerChar: null, useDeepZen: false },
    lightning: { name: '閃電模式', timePerChar: 2.5, useDeepZen: false },
    deep: { name: '深禪模式', timePerChar: null, useDeepZen: true }
  };

  const milestones = [
    { streak: 10, text: '🎯 專注！10 連擊！' },
    { streak: 25, text: '🧘 入定！25 連擊！' },
    { streak: 50, text: '✨ 禪定！50 連擊！' },
    { streak: 75, text: '🌟 深定！75 連擊！' },
    { streak: 100, text: '🪷 三昧！100 連擊！' }
  ];
  let reachedMilestones = new Set();

  // ===== 音效系統 (Web Audio API) =====
  const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
  let audioCtx = null;

  function initAudio() {
    if (!audioCtx && AudioCtxClass) {
      audioCtx = new AudioCtxClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playTone(freq, duration, type, volume) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
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
    let baseFreq = 523 + gameState.currentStreak * 8;
    baseFreq = Math.min(baseFreq, 1200);
    playTone(baseFreq, 0.08, 'sine', 0.12);
  }

  function playWrongSound() {
    playTone(200, 0.15, 'sawtooth', 0.1);
  }

  function playPurifySound() {
    playTone(523, 0.1, 'sine', 0.15);
    setTimeout(() => { playTone(659, 0.1, 'sine', 0.15); }, 80);
    setTimeout(() => { playTone(784, 0.15, 'sine', 0.15); }, 160);
  }

  function playRoundCompleteSound() {
    playTone(523, 0.1, 'sine', 0.18);
    setTimeout(() => { playTone(659, 0.1, 'sine', 0.18); }, 80);
    setTimeout(() => { playTone(784, 0.1, 'sine', 0.18); }, 160);
    setTimeout(() => { playTone(1047, 0.2, 'sine', 0.18); }, 240);
  }

  const streakRewards = [
    { days: 3, bonus: '初心不退', icon: '🌱' },
    { days: 7, bonus: '一週精進', icon: '🔥' },
    { days: 14, bonus: '兩週不懈', icon: '⭐' },
    { days: 30, bonus: '月滿圓明', icon: '🌕' },
    { days: 60, bonus: '雙月禪定', icon: '🏆' },
    { days: 100, bonus: '百日修行', icon: '👑' }
  ];

  const dailyChallenges = [
    '完成一輪零失誤淨化',
    '達成 15 連擊',
    '定力保持 100% 完成一根',
    '連續淨化三根不中斷連擊',
    '完成兩輪修行',
    '累計淨化 10 次',
    '打字準確率 98% 以上'
  ];

  // ===== 粒子效果物件池（限制 DOM 元素數量）=====
  const MAX_PARTICLES = 30;
  let activeParticles = 0;

  function spawnCorrectParticles(x, y) {
    const colors = ['#f4d03f', '#ff9800', '#4caf50', '#e8d5b7'];
    const count = Math.min(6, MAX_PARTICLES - activeParticles);
    if (count <= 0) return;

    for (let i = 0; i < count; i++) {
      const particle = document.createElement('div');
      particle.className = 'correct-particle';
      particle.style.left = x + 'px';
      particle.style.top = y + 'px';
      particle.style.background = colors[(Math.random() * colors.length) | 0];
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const distance = 40 + Math.random() * 30;
      particle.style.setProperty('--tx', Math.cos(angle) * distance + 'px');
      particle.style.setProperty('--ty', Math.sin(angle) * distance + 'px');
      document.body.appendChild(particle);
      activeParticles++;

      // 動畫結束後移除（使用閉包保留參照）
      ((p) => {
        let removed = false;
        const cleanup = () => {
          if (removed) return;
          removed = true;
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
    const msg = document.createElement('div');
    msg.className = 'message ' + type;
    msg.textContent = text;
    document.body.appendChild(msg);
    setTimeout(() => {
      if (msg.parentNode) msg.parentNode.removeChild(msg);
    }, 2000);
  }

  function showMilestone(text) {
    const toast = document.createElement('div');
    toast.className = 'milestone-toast';
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 1600);
  }

  function showAchievement(ach) {
    const popup = document.createElement('div');
    popup.className = 'achievement-popup';
    popup.innerHTML = '<span class="icon">' + ach.icon + '</span>' + ach.name +
      '<br><small style="font-weight:normal;font-size:0.8rem">' + ach.desc + '</small>';
    document.body.appendChild(popup);
    setTimeout(() => {
      if (popup.parentNode) popup.parentNode.removeChild(popup);
    }, 2200);
  }

  function showPerfectComplete(rootName) {
    if (gameState.rootErrorCount === 0) {
      const perfect = document.createElement('div');
      perfect.className = 'perfect-complete';
      perfect.textContent = '\u{1F33F} ' + rootName + '\u6839 \u5713\u6EFF \u{1F33F}';
      document.body.appendChild(perfect);
      setTimeout(() => {
        if (perfect.parentNode) perfect.parentNode.removeChild(perfect);
      }, 2100);
    }
  }

  // ===== 遊戲邏輯 =====
  function initParticles() {
    const container = document.getElementById('particles');
    if (!container) return;
    for (let i = 0; i < 20; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';
      particle.style.left = Math.random() * 100 + '%';
      particle.style.animationDelay = Math.random() * 15 + 's';
      particle.style.animationDuration = (10 + Math.random() * 10) + 's';
      container.appendChild(particle);
    }
  }

  function selectMode(mode) {
    currentMode = mode;
    const btns = document.querySelectorAll('.mode-btn');
    for (let i = 0; i < btns.length; i++) {
      const isActive = btns[i].getAttribute('data-mode') === mode;
      btns[i].classList.toggle('active', isActive);
    }
  }

  function calculateWPM() {
    if (!gameState.gameStartTime || gameState.correctChars < 2) return 0;
    const elapsedMinutes = (Date.now() - gameState.gameStartTime) / 60000;
    if (elapsedMinutes < 0.05) return 0;
    const wpm = Math.round(gameState.correctChars / elapsedMinutes);
    return Math.min(999, wpm);
  }

  function updateWPMDisplay() {
    // 桌面版
    const wpmDisplay = document.getElementById('wpm-display');
    const wpmValue = document.getElementById('wpm-value');
    if (wpmDisplay && wpmValue) {
      const wpm = calculateWPM();
      if (wpm > 0) {
        wpmDisplay.classList.remove('hidden');
        wpmValue.textContent = wpm;
        if (wpm >= 60) wpmValue.style.color = '#f4d03f';
        else if (wpm >= 40) wpmValue.style.color = '#4caf50';
        else if (wpm >= 20) wpmValue.style.color = '#8892a8';
        else wpmValue.style.color = '#a0a8b8';
      }
    }
    // 手機版
    const mghWpm = document.getElementById('mgh-wpm');
    if (mghWpm) {
      mghWpm.textContent = calculateWPM();
    }
  }

  function checkMilestone() {
    for (let i = 0; i < milestones.length; i++) {
      const m = milestones[i];
      if (gameState.currentStreak === m.streak && !reachedMilestones.has(m.streak)) {
        reachedMilestones.add(m.streak);
        showMilestone(m.text);
        break;
      }
    }
  }

  function updateInputGlow() {
    const input = document.getElementById('zen-input');
    if (!input) return;
    input.classList.remove('streak-glow', 'streak-fire');
    if (gameState.currentStreak >= 50) {
      input.classList.add('streak-fire');
    } else if (gameState.currentStreak >= 15) {
      input.classList.add('streak-glow');
    }
  }

  function updateCombo() {
    // 桌面版
    const comboDisplay = document.getElementById('combo-display');
    const comboCount = document.getElementById('combo-count');
    const comboMultiplier = document.getElementById('combo-multiplier');
    if (comboDisplay && comboCount && comboMultiplier) {
      if (gameState.currentStreak >= 3) {
        comboDisplay.classList.remove('hidden');
        comboCount.textContent = gameState.currentStreak;
        const multiplier = 1 + Math.floor(gameState.currentStreak / 5) * 0.1;
        comboMultiplier.textContent = '\u00d7' + multiplier.toFixed(1);
        comboCount.classList.add('pulse');
        setTimeout(() => { comboCount.classList.remove('pulse'); }, 150);
      } else {
        comboDisplay.classList.add('hidden');
      }
    }
    // 手機版
    const mghCombo = document.getElementById('mgh-combo');
    if (mghCombo) {
      mghCombo.textContent = gameState.currentStreak;
    }
  }

  function checkAchievements() {
    for (let i = 0; i < achievements.length; i++) {
      const ach = achievements[i];
      if (!gameState.unlockedAchievements.has(ach.id) && ach.condition(gameState)) {
        gameState.unlockedAchievements.add(ach.id);
        showAchievement(ach);
      }
    }
  }

  function updateStats() {
    let el;
    el = document.getElementById('round-count');
    if (el) el.textContent = gameState.roundCount;
    el = document.getElementById('purify-count');
    if (el) el.textContent = gameState.purifyCount;
    el = document.getElementById('best-streak');
    if (el) el.textContent = gameState.bestStreak;

    const accuracy = gameState.totalChars > 0
      ? Math.round((gameState.correctChars / gameState.totalChars) * 100)
      : 100;
    el = document.getElementById('accuracy');
    if (el) el.textContent = accuracy + '%';
  }

  function updateFocusBar() {
    const valueEl = document.getElementById('focus-value');
    const fill = document.getElementById('focus-bar-fill');
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

  // ===== 手機觸控提示管理 =====
  function updateMobileInputHint(focused) {
    const hint = document.getElementById('mobile-input-hint');
    if (!hint) return;
    if (focused) {
      hint.textContent = '\u2328\uFE0F \u9375\u76E4\u5DF2\u958B\u555F\uFF0C\u8ACB\u8F38\u5165\u7985\u8A9E';
      hint.classList.add('active');
    } else {
      hint.textContent = '\uD83D\uDC49 \u9EDE\u6B64\u958B\u555F\u9375\u76E4\u8F38\u5165\u7985\u8A9E';
      hint.classList.remove('active');
    }
  }

  // ===== 統一字元處理（消除 handleInput 與 compositionend 的重複）=====
  function processChar(char) {
    const targetText = gameState.currentZen.text;
    const expectedChar = targetText[gameState.inputIndex];
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
      const focusGain = 5 + Math.floor(gameState.currentStreak / 10);
      gameState.focus = Math.min(100, gameState.focus + focusGain);

      updateCombo();
      checkMilestone();
      updateInputGlow();
      updateWPMDisplay();

      // 粒子效果
      const charEls = document.querySelectorAll('.zen-text .char');
      const targetEl = charEls[gameState.inputIndex - 1];
      if (targetEl) {
        const rect = targetEl.getBoundingClientRect();
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
      const chars = document.querySelectorAll('.zen-text .char');
      if (chars[gameState.inputIndex]) {
        chars[gameState.inputIndex].classList.add('wrong');
        const wrongEl = chars[gameState.inputIndex];
        setTimeout(() => { wrongEl.classList.remove('wrong'); }, 300);
      }

      return false;
    }
  }

  // ===== 輸入事件處理 =====
  function handleInput(e) {
    if (currentGameState !== GAME_STATE.PLAYING) return;
    const input = e.target.value;
    if (input.length > 0 && !e.isComposing) {
      const lastChar = input[input.length - 1];
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
    if (currentGameState !== GAME_STATE.PLAYING) return;
    const composed = e.data;
    if (!composed) return;

    for (let i = 0; i < composed.length; i++) {
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
    const container = document.getElementById('zen-text');
    if (!container || !gameState.currentZen) return;
    const text = gameState.currentZen.text;
    let html = '';
    for (let i = 0; i < text.length; i++) {
      let className = 'char';
      if (i < gameState.inputIndex) className += ' correct';
      else if (i === gameState.inputIndex) className += ' current';
      html += '<span class="' + className + '">' + text[i] + '</span>';
    }
    container.innerHTML = html;
  }

  // ===== 閃電模式計時器（rAF + performance.now）=====
  let lightningStartTime = 0;
  let lightningDuration = 0;
  let lightningRafId = null;

  function startLightningTimer() {
    if (currentMode !== 'lightning') return;
    const zenLength = gameState.currentZen.text.length;
    lightningDuration = zenLength * modeConfig.lightning.timePerChar * 1000; // ms
    lightningStartTime = performance.now();

    const timerEl = document.getElementById('lightning-timer');
    if (timerEl) timerEl.classList.remove('hidden');

    // 手機版閃電計時器顯示
    const mghTimer = document.getElementById('mgh-timer');
    const mghTimerLabel = document.getElementById('mgh-timer-label');
    if (mghTimer) mghTimer.style.display = '';
    if (mghTimerLabel) mghTimerLabel.style.display = '';

    if (lightningRafId) cancelAnimationFrame(lightningRafId);

    function updateTimer() {
      if (isPaused) {
        lightningRafId = requestAnimationFrame(updateTimer);
        return;
      }
      const elapsed = performance.now() - lightningStartTime;
      lightningTimeLeft = Math.max(0, (lightningDuration - elapsed) / 1000);

      // 桌面版
      const timerValue = document.getElementById('lightning-timer-value');
      if (timerValue) {
        timerValue.textContent = lightningTimeLeft.toFixed(1);
        if (lightningTimeLeft <= 3) timerValue.classList.add('danger');
        else timerValue.classList.remove('danger');
      }

      // 手機版
      const mghTimerVal = document.getElementById('mgh-timer');
      if (mghTimerVal) {
        mghTimerVal.textContent = lightningTimeLeft.toFixed(1);
        mghTimerVal.style.color = lightningTimeLeft <= 3 ? '#f44336' : '#ff9800';
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
    const timerEl = document.getElementById('lightning-timer');
    const timerValueEl = document.getElementById('lightning-timer-value');
    if (timerEl) timerEl.classList.add('hidden');
    if (timerValueEl) timerValueEl.classList.remove('danger');

    // 手機版隱藏
    const mghTimer = document.getElementById('mgh-timer');
    const mghTimerLabel = document.getElementById('mgh-timer-label');
    if (mghTimer) mghTimer.style.display = 'none';
    if (mghTimerLabel) mghTimerLabel.style.display = 'none';
  }

  function handleLightningTimeout() {
    gameState.currentStreak = 0;
    gameState.focus = Math.max(0, gameState.focus - 20);
    updateCombo();
    updateFocusBar();
    updateInputGlow();
    showMessage('\u23F0 \u6642\u9593\u5230\uFF01', 'info');
    setTimeout(() => {
      const input = document.getElementById('zen-input');
      if (input) input.value = '';
      nextRoot();
    }, 1000);
  }

  // ===== 暫停功能 =====
  function togglePause() {
    if (currentGameState !== GAME_STATE.PLAYING && currentGameState !== GAME_STATE.PAUSED) return;
    if (isPaused) {
      resumeGame();
    } else {
      pauseGame();
    }
  }

  let pauseStartTime = 0;

  function pauseGame() {
    isPaused = true;
    currentGameState = GAME_STATE.PAUSED;
    pauseStartTime = performance.now();
    const input = document.getElementById('zen-input');
    if (input) input.disabled = true;

    const overlay = document.createElement('div');
    overlay.className = 'pause-overlay';
    overlay.id = 'pause-overlay';
    overlay.innerHTML =
      '<h2>\u4FEE\u884C\u66AB\u505C</h2>' +
      '<p>\u6309 Esc \u6216\u9EDE\u64CA\u7E7C\u7E8C</p>' +
      '<button class="btn btn-primary" id="resumeBtn">\u7E7C\u7E8C\u4FEE\u884C</button>' +
      '<button class="btn btn-secondary" id="quitBtn" style="margin-top: 0.5rem; margin-left: 0;">\u7D50\u675F\u4FEE\u884C</button>';
    document.body.appendChild(overlay);

    const resumeBtn = document.getElementById('resumeBtn');
    if (resumeBtn) resumeBtn.addEventListener('click', resumeGame);
    const quitBtn = document.getElementById('quitBtn');
    if (quitBtn) quitBtn.addEventListener('click', () => {
      resumeGame();
      endGame();
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) resumeGame();
    });
  }

  function resumeGame() {
    // 補償暫停期間的時間（閃電模式計時不應在暫停期間流逝）
    if (pauseStartTime > 0) {
      const pausedDuration = performance.now() - pauseStartTime;
      lightningStartTime += pausedDuration;
      pauseStartTime = 0;
    }
    isPaused = false;
    currentGameState = GAME_STATE.PLAYING;
    const overlay = document.getElementById('pause-overlay');
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    const input = document.getElementById('zen-input');
    if (input) {
      input.disabled = false;
      input.focus();
    }
  }

  // ===== 狀態切換輔助 =====
  function transitionTo(newState) {
    currentGameState = newState;
    const startScreen = document.getElementById('start-screen');
    const gameScreen = document.getElementById('game-screen');
    const resultScreen = document.getElementById('result-screen');

    switch (newState) {
      case GAME_STATE.START:
        if (startScreen) startScreen.classList.remove('hidden');
        if (gameScreen) gameScreen.classList.add('hidden');
        if (resultScreen) resultScreen.style.display = 'none';
        break;
      case GAME_STATE.PLAYING:
        if (startScreen) startScreen.classList.add('hidden');
        if (gameScreen) gameScreen.classList.remove('hidden');
        if (resultScreen) resultScreen.style.display = 'none';
        break;
      case GAME_STATE.RESULT:
        if (gameScreen) gameScreen.classList.add('hidden');
        if (resultScreen) resultScreen.style.display = 'block';
        break;
    }
  }

  // ===== 遊戲流程 =====
  function startGame() {
    initAudio();
    savedProgress.totalPlays++;
    savedProgress = updateConsecutiveDays(savedProgress);
    const previousAchievements = new Set(savedProgress.unlockedAchievements || []);

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

    const comboDisplay = document.getElementById('combo-display');
    const wpmDisplay = document.getElementById('wpm-display');
    if (comboDisplay) comboDisplay.classList.add('hidden');
    if (wpmDisplay) wpmDisplay.classList.add('hidden');
    stopLightningTimer();

    const input = document.getElementById('zen-input');
    if (input) input.classList.remove('streak-glow', 'streak-fire');

    const rootIcons = document.querySelectorAll('.root-icon');
    for (let i = 0; i < rootIcons.length; i++) {
      rootIcons[i].classList.remove('active', 'purified');
    }

    // 重設手機版統計
    const mghCombo = document.getElementById('mgh-combo');
    const mghWpm = document.getElementById('mgh-wpm');
    if (mghCombo) mghCombo.textContent = '0';
    if (mghWpm) mghWpm.textContent = '0';

    // 使用狀態機切換
    transitionTo(GAME_STATE.PLAYING);

    const modeName = modeConfig[currentMode].name;
    showMessage(modeName + '\u958B\u59CB\uFF01', 'info');

    updateStats();
    updateFocusBar();
    nextRoot();

    // 聚焦輸入框（延遲以確保 DOM 更新完成）
    if (input) {
      setTimeout(() => {
        input.focus();
        // 手機裝置額外處理
        if (isTouchDevice) {
          input.click();
        }
      }, 100);
    }
  }

  function nextRoot() {
    const availableRoots = rootOrder.filter((r) => !gameState.purifiedRoots.has(r));
    if (availableRoots.length === 0) {
      completeRound();
      return;
    }
    const randomRoot = availableRoots[(Math.random() * availableRoots.length) | 0];
    selectRoot(randomRoot);
  }

  function selectRoot(root) {
    gameState.currentRoot = root;
    gameState.inputIndex = 0;
    gameState.rootStartTime = Date.now();
    gameState.rootErrorCount = 0;

    const rootIcons = document.querySelectorAll('.root-icon');
    for (let i = 0; i < rootIcons.length; i++) {
      rootIcons[i].classList.remove('active');
      if (rootIcons[i].getAttribute('data-root') === root) {
        rootIcons[i].classList.add('active');
      }
    }

    const useDeep = modeConfig[currentMode].useDeepZen;
    const zenSource = useDeep ? deepZenTexts : zenTexts;
    const zens = zenSource[root];

    if (!gameState.usedZens[root]) gameState.usedZens[root] = [];

    let availableZens = zens.filter((z) => gameState.usedZens[root].indexOf(z.text) === -1);
    if (availableZens.length === 0) {
      gameState.usedZens[root] = [];
      availableZens = zens;
    }

    const zen = availableZens[(Math.random() * availableZens.length) | 0];
    gameState.usedZens[root].push(zen.text);
    gameState.currentZen = zen;

    displayZenText();
    const meaningEl = document.getElementById('zen-meaning');
    if (meaningEl) meaningEl.textContent = '\u2014 ' + zen.meaning;

    const input = document.getElementById('zen-input');
    if (input) {
      input.value = '';
      // 確保輸入框保持聚焦
      if (currentGameState === GAME_STATE.PLAYING) {
        input.focus();
      }
    }

    if (currentMode === 'lightning') startLightningTimer();

    showMessage('\u6DE8\u5316\u300C' + rootNames[root] + '\u300D\u6839', 'info');
  }

  function purifyRoot() {
    const root = gameState.currentRoot;
    gameState.purifiedRoots.add(root);
    gameState.purifyCount++;

    stopLightningTimer();

    const icon = document.querySelector('.root-icon[data-root="' + root + '"]');
    if (icon) {
      icon.classList.remove('active');
      icon.classList.add('purified');
    }

    playPurifySound();
    showPerfectComplete(rootNames[root]);
    showMessage('\u300C' + rootNames[root] + '\u300D\u6839\u5DF2\u6DE8\u5316\uFF01', 'success');
    updateStats();
    checkAchievements();

    setTimeout(() => {
      const input = document.getElementById('zen-input');
      if (input) input.value = '';
      nextRoot();
    }, 1000);
  }

  function completeRound() {
    gameState.roundCount++;
    gameState.purifiedRoots.clear();

    const rootIcons = document.querySelectorAll('.root-icon');
    for (let i = 0; i < rootIcons.length; i++) {
      rootIcons[i].classList.remove('purified');
    }

    playRoundCompleteSound();
    showMessage('\u7B2C ' + (gameState.roundCount - 1) + ' \u8F2A\u5713\u6EFF\uFF01\u9032\u5165\u7B2C ' + gameState.roundCount + ' \u8F2A', 'success');
    updateStats();
    checkAchievements();
    setTimeout(nextRoot, 1500);
  }

  function endGame() {
    stopLightningTimer();

    const wpmDisplay = document.getElementById('wpm-display');
    if (wpmDisplay) wpmDisplay.classList.add('hidden');

    const input = document.getElementById('zen-input');
    if (input) input.classList.remove('streak-glow', 'streak-fire');

    // 使用狀態機切換
    transitionTo(GAME_STATE.RESULT);

    const finalRounds = gameState.roundCount - 1 || 0;
    const accuracy = gameState.totalChars > 0
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

    let el;
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
    let historyDiv = document.getElementById('history-stats');
    if (!historyDiv) {
      const resultStats = document.querySelector('.result-stats');
      if (!resultStats) return;
      historyDiv = document.createElement('div');
      historyDiv.id = 'history-stats';
      historyDiv.style.cssText = 'margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.1);';
      resultStats.appendChild(historyDiv);
    }

    const currentLevel = getCultivationLevel(savedProgress.totalPurify);
    const progress = getLevelProgress(savedProgress.totalPurify);
    const nextLevelInfo = getNextLevelInfo(savedProgress.totalPurify);

    const prevTotalPurify = savedProgress.totalPurify - gameState.purifyCount;
    const prevLevel = getCultivationLevel(prevTotalPurify);
    const leveledUp = currentLevel.name !== prevLevel.name;

    let levelUpHtml = '';
    if (leveledUp) {
      levelUpHtml =
        '<div style="background: linear-gradient(135deg, rgba(244,208,63,0.2), rgba(255,152,0,0.2)); border: 1px solid rgba(244,208,63,0.4); border-radius: 0.5rem; padding: 0.75rem; margin-bottom: 1rem;">' +
        '<div style="font-size: 1.2rem; margin-bottom: 0.25rem;">\uD83C\uDF8A \u5883\u754C\u63D0\u5347\uFF01</div>' +
        '<div style="color: #8892a8;">' + prevLevel.icon + ' ' + prevLevel.name + ' \u2192 <span style="color: #f4d03f; font-size: 1.1rem;">' + currentLevel.icon + ' ' + currentLevel.name + '</span></div>' +
        '</div>';
    }

    let progressHtml = '';
    if (nextLevelInfo) {
      progressHtml =
        '<div style="margin: 1rem 0;">' +
        '<div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 0.5rem;">' +
        '<span style="font-size: 1.3rem;">' + currentLevel.icon + '</span>' +
        '<span style="color: #f4d03f; font-weight: bold;">' + currentLevel.name + '</span></div>' +
        '<div style="max-width: 250px; margin: 0 auto;">' +
        '<div style="width: 100%; height: 8px; background: rgba(0,0,0,0.3); border-radius: 4px; overflow: hidden;">' +
        '<div style="width: ' + progress + '%; height: 100%; background: linear-gradient(90deg, #f4d03f, #ff9800); border-radius: 4px;"></div></div>' +
        '<div style="font-size: 0.75rem; color: #8892a8; margin-top: 0.25rem;">\u8DDD\u96E2 ' + nextLevelInfo.icon + ' ' + nextLevelInfo.name + ' \u9084\u9700 ' + nextLevelInfo.needed + ' \u6B21\u6DE8\u5316</div>' +
        '</div></div>';
    } else {
      progressHtml =
        '<div style="margin: 1rem 0; text-align: center;">' +
        '<span style="font-size: 1.5rem;">' + currentLevel.icon + '</span>' +
        '<span style="color: #f4d03f; font-size: 1.2rem; font-weight: bold;">' + currentLevel.name + '</span>' +
        '<div style="color: #4caf50; font-size: 0.9rem; margin-top: 0.25rem;">\u2728 \u5DF2\u9054\u6700\u9AD8\u5883\u754C \u2728</div></div>';
    }

    historyDiv.innerHTML =
      levelUpHtml + progressHtml +
      '<div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 0.75rem; margin-top: 0.75rem;">' +
      '<p style="color: #8892a8; font-size: 0.85rem; margin-bottom: 0.5rem;">\uD83D\uDCDC \u6B77\u53F2\u7D00\u9304</p>' +
      '<p style="font-size: 0.9rem;">\u7D2F\u8A08\u4FEE\u884C\uFF1A<span style="color: #f4d03f;">' + savedProgress.totalPlays + '</span> \u6B21 \u00B7 \u7D2F\u8A08\u6DE8\u5316\uFF1A<span style="color: #4caf50;">' + savedProgress.totalPurify + '</span> \u6B21</p>' +
      '<p style="font-size: 0.9rem;">\u6700\u4F73\u9023\u64CA\uFF1A<span style="color: #ff9800;">' + savedProgress.allTimeBestStreak + '</span> \u00B7 \u6700\u4F73\u8F2A\u6578\uFF1A<span style="color: #e8d5b7;">' + savedProgress.allTimeBestRound + '</span> \u8F2A</p>' +
      (savedProgress.consecutiveDays > 1 ? '<p style="font-size: 0.9rem;">\u9023\u7E8C\u4FEE\u884C\uFF1A<span style="color: #f4d03f;">\uD83D\uDD25 ' + savedProgress.consecutiveDays + ' \u5929</span></p>' : '') +
      '</div>';
  }

  function showStart() {
    transitionTo(GAME_STATE.START);
    updateStartScreen();
  }

  function shareScore() {
    const finalRounds = gameState.roundCount - 1 || 0;
    const accuracy = gameState.totalChars > 0
      ? Math.round((gameState.correctChars / gameState.totalChars) * 100) : 100;

    let comment = '';
    if (gameState.bestStreak >= 50) comment = '\u7985\u5B9A\u6DF1\u539A\uFF01';
    else if (gameState.bestStreak >= 25) comment = '\u5FC3\u795E\u5C08\u6CE8\uFF01';
    else if (accuracy >= 98) comment = '\u7CBE\u6E96\u7121\u8AA4\uFF01';
    else if (finalRounds >= 3) comment = '\u7CBE\u9032\u4E0D\u61C8\uFF01';
    else comment = '\u521D\u5FC3\u4FEE\u884C\uFF01';

    const shareText = '\uD83E\uDDD8 \u516D\u6839\u6DE8\u5316 \u00B7 \u7985\u4FEE\u6253\u5B57\n\n' + comment + '\n\n' +
      '\uD83D\uDCFF \u5B8C\u6210 ' + finalRounds + ' \u8F2A\u4FEE\u884C\n' +
      '\u2728 \u6DE8\u5316 ' + gameState.purifyCount + ' \u6B21\n' +
      '\uD83C\uDFAF \u6E96\u78BA\u7387 ' + accuracy + '%\n' +
      '\uD83D\uDD25 \u6700\u4F73\u9023\u64CA ' + gameState.bestStreak + '\n' +
      (savedProgress.consecutiveDays > 1 ? '\uD83D\uDCC5 \u9023\u7E8C\u4FEE\u884C ' + savedProgress.consecutiveDays + ' \u5929\n' : '') +
      '\n\u5FC3\u82E5\u51B0\u6E05\uFF0C\u5929\u5857\u4E0D\u9A5A \u{1F33F}';

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareText).then(() => {
        showMessage('\u6210\u7E3E\u5DF2\u8907\u88FD\u5230\u526A\u8CBC\u7C3F\uFF01', 'success');
      }).catch(() => {
        fallbackCopy(shareText);
      });
    } else {
      fallbackCopy(shareText);
    }
  }

  function fallbackCopy(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.cssText = 'position:fixed;opacity:0;left:-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      showMessage('\u6210\u7E3E\u5DF2\u8907\u88FD\u5230\u526A\u8CBC\u7C3F\uFF01', 'success');
    } catch (e) {
      showMessage('\u8907\u88FD\u5931\u6557\uFF0C\u8ACB\u624B\u52D5\u9078\u53D6', 'info');
    }
    document.body.removeChild(textArea);
  }

  function getTodayChallenge() {
    const today = new Date();
    const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 86400000);
    return dailyChallenges[dayOfYear % dailyChallenges.length];
  }

  function updateStartScreen() {
    const streakBadge = document.getElementById('streak-badge');
    const streakDays = document.getElementById('streak-days');
    if (streakBadge) {
      if (savedProgress.consecutiveDays > 1) {
        streakBadge.classList.remove('hidden');
        if (streakDays) streakDays.textContent = savedProgress.consecutiveDays;
      } else {
        streakBadge.classList.add('hidden');
      }
    }

    const historyDiv = document.getElementById('start-history');
    if (!historyDiv) return;

    const currentLevel = getCultivationLevel(savedProgress.totalPurify);
    const progress = getLevelProgress(savedProgress.totalPurify);
    const nextLevelInfo = getNextLevelInfo(savedProgress.totalPurify);

    let levelHtml =
      '<div style="margin-bottom: 0.75rem;">' +
      '<span style="font-size: 1.5rem;">' + currentLevel.icon + '</span>' +
      '<span style="color: #f4d03f; font-size: 1.1rem; font-weight: bold;">' + currentLevel.name + '</span>' +
      '<span style="color: #8892a8; font-size: 0.85rem; margin-left: 0.5rem;">\u7D2F\u8A08\u6DE8\u5316 ' + savedProgress.totalPurify + ' \u6B21</span>' +
      '</div>';

    if (nextLevelInfo) {
      levelHtml +=
        '<div style="max-width: 280px; margin: 0 auto;">' +
        '<div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: #8892a8; margin-bottom: 0.25rem;">' +
        '<span>' + currentLevel.name + '</span>' +
        '<span>\u8DDD\u96E2 ' + nextLevelInfo.icon + ' ' + nextLevelInfo.name + ' \u9084\u9700 ' + nextLevelInfo.needed + ' \u6B21</span></div>' +
        '<div style="width: 100%; height: 6px; background: rgba(0,0,0,0.3); border-radius: 3px; overflow: hidden;">' +
        '<div style="width: ' + progress + '%; height: 100%; background: linear-gradient(90deg, #f4d03f, #ff9800); border-radius: 3px;"></div>' +
        '</div></div>';
    } else {
      levelHtml += '<div style="color: #4caf50; font-size: 0.9rem;">\u2728 \u5DF2\u9054\u6700\u9AD8\u5883\u754C \u2728</div>';
    }

    if (savedProgress.totalPlays > 0) {
      levelHtml +=
        '<div style="margin-top: 0.75rem; font-size: 0.85rem; color: #8892a8;">' +
        '\u4FEE\u884C <span style="color: #f4d03f;">' + savedProgress.totalPlays + '</span> \u6B21 \u00B7 ' +
        '\u6700\u4F73\u9023\u64CA <span style="color: #ff9800;">' + savedProgress.allTimeBestStreak + '</span> \u00B7 ' +
        '\u6700\u4F73\u8F2A\u6578 <span style="color: #e8d5b7;">' + savedProgress.allTimeBestRound + '</span></div>';
    }

    historyDiv.innerHTML = levelHtml;

    const challengeDiv = document.getElementById('daily-challenge');
    const challengeText = document.getElementById('daily-challenge-text');
    if (challengeDiv) challengeDiv.classList.remove('hidden');
    if (challengeText) challengeText.textContent = getTodayChallenge();
  }

  function checkDailyReward() {
    const today = getTodayStr();
    if (savedProgress.lastPlayDate !== today && savedProgress.consecutiveDays >= 1) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);

      let projectedStreak = 1;
      if (savedProgress.lastPlayDate === yesterdayStr) {
        projectedStreak = savedProgress.consecutiveDays + 1;
      }
      if (projectedStreak >= 2) {
        showDailyRewardPopup(projectedStreak);
      }
    }
  }

  function showDailyRewardPopup(streakDays) {
    let reward = null;
    for (let i = 0; i < streakRewards.length; i++) {
      if (streakDays >= streakRewards[i].days) reward = streakRewards[i];
    }

    const popup = document.createElement('div');
    popup.className = 'daily-reward-popup';
    popup.innerHTML =
      '<div class="daily-reward-content">' +
      '<div class="daily-reward-icon">\uD83C\uDF05</div>' +
      '<div class="daily-reward-title">\u6B61\u8FCE\u56DE\u4F86\uFF01</div>' +
      '<div style="color: #8892a8;">\u6301\u7E8C\u4FEE\u884C\uFF0C\u529F\u4E0D\u5510\u6350</div>' +
      '<div class="daily-reward-streak">\uD83D\uDD25 \u9023\u7E8C ' + streakDays + ' \u5929</div>' +
      (reward ? '<div class="daily-reward-bonus">' + reward.icon + ' \u9054\u6210\u6210\u5C31\uFF1A' + reward.bonus + '</div>' : '') +
      '<button class="btn btn-primary daily-reward-btn" id="dailyRewardCloseBtn">\u958B\u59CB\u4ECA\u65E5\u4FEE\u884C</button>' +
      '</div>';
    document.body.appendChild(popup);

    const closeBtn = document.getElementById('dailyRewardCloseBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        if (popup.parentNode) popup.parentNode.removeChild(popup);
      });
    }

    popup.addEventListener('click', (e) => {
      if (e.target === popup && popup.parentNode) popup.parentNode.removeChild(popup);
    });
  }

  // ===== 初始化 =====
  function init() {
    initParticles();
    updateStartScreen();
    checkDailyReward();

    const input = document.getElementById('zen-input');
    if (input) {
      input.addEventListener('input', handleInput);
      input.addEventListener('compositionend', handleCompositionEnd);
      input.addEventListener('keydown', (e) => {
        // 防止空格觸發滾動
        if (e.key === ' ') e.preventDefault();
        // Escape 由全域 document keydown 統一處理，避免雙重觸發
      });

      // 手機觸控：追蹤輸入框聚焦狀態以更新提示
      input.addEventListener('focus', () => {
        updateMobileInputHint(true);
      });
      input.addEventListener('blur', () => {
        updateMobileInputHint(false);
        // 手機端：如果遊戲進行中且非暫停，延遲重新聚焦
        // （防止用戶意外失焦導致無法輸入）
        if (currentGameState === GAME_STATE.PLAYING && !isPaused) {
          setTimeout(() => {
            if (currentGameState === GAME_STATE.PLAYING && !isPaused) {
              input.focus();
            }
          }, 300);
        }
      });
    }

    // 手機觸控提示：點擊後聚焦輸入框
    const mobileHint = document.getElementById('mobile-input-hint');
    if (mobileHint) {
      mobileHint.addEventListener('click', () => {
        initAudio();
        const inp = document.getElementById('zen-input');
        if (inp) {
          inp.focus();
          inp.click();
        }
      });
    }

    // 模式選擇按鈕
    const modeBtns = document.querySelectorAll('.mode-btn[data-mode]');
    for (let i = 0; i < modeBtns.length; i++) {
      ((btn) => {
        btn.addEventListener('click', () => {
          selectMode(btn.getAttribute('data-mode'));
        });
      })(modeBtns[i]);
    }

    // 開始按鈕
    const startBtn = document.getElementById('startBtn');
    if (startBtn) {
      startBtn.addEventListener('click', startGame);
    }

    // 結束修行按鈕
    const endBtn = document.getElementById('endBtn');
    if (endBtn) {
      endBtn.addEventListener('click', endGame);
    }

    // 結果畫面的重新開始按鈕
    const restartBtn = document.getElementById('restartBtn');
    if (restartBtn) {
      restartBtn.addEventListener('click', startGame);
    }

    // 返回按鈕
    const backBtn = document.getElementById('backBtn');
    if (backBtn) {
      backBtn.addEventListener('click', showStart);
    }

    // 分享按鈕
    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn) {
      shareBtn.addEventListener('click', shareScore);
    }

    // 全域鍵盤事件（Escape 暫停用）
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && (currentGameState === GAME_STATE.PLAYING || currentGameState === GAME_STATE.PAUSED)) {
        e.preventDefault();
        togglePause();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
