/**
 * 念珠冥想 - Mala Meditation
 * 透過 108 顆念珠的點擊計數，體驗專注與寧靜
 *
 * 效能優化技術（參考知識庫 HTML5 遊戲開發指南）：
 * - 使用整數座標避免子像素渲染
 * - 批次繪製減少狀態變更
 * - requestAnimationFrame 自動暫停不可見頁面
 * - 分層繪製：背景層靜態、前景層動態
 *
 * 用戶黏性機制（參考原子習慣）：
 * - 連續練習追蹤（Streak）
 * - 成就系統解鎖
 * - 最佳紀錄挑戰
 * - LocalStorage 進度持久化
 *
 * 視覺效果系統（2026-02-16）：
 * - 粒子系統：點擊產生金色粒子飄散
 * - 漣漪效果：點擊產生擴散漣漪
 * - 光芒軌跡：已點亮念珠之間微光連線
 * - 慶祝動畫：完成一圈時中心噴發粒子
 */

(function() {
    'use strict';

    // === 常數定義 ===
    let TOTAL_BEADS = 108; // 可切換：27 或 108
    const BEADS_PER_RING = 27;
    let RINGS = 4; // 快速模式只有 1 圈
    const CENTER_X = 160;
    const CENTER_Y = 160;
    const RING_RADII = [130, 100, 70, 40];
    const BEAD_SIZES = [8, 7, 6, 5];
    const STORAGE_KEY = 'mala_meditation_progress';

    // 快速模式設定（兩分鐘法則：讓開始變得輕鬆）
    const QUICK_MODE_BEADS = 27;
    const FULL_MODE_BEADS = 108;

    // 顏色定義
    const COLORS = {
        bg: '#1a1a2e',
        beadInactive: '#3d3d5c',
        beadActive: '#e8d5b7',
        beadGlow: 'rgba(232, 213, 183, 0.3)',
        centerGlow: 'rgba(232, 213, 183, 0.1)',
        ring: 'rgba(232, 213, 183, 0.05)'
    };

    // 呼吸引導文字
    const BREATH_MESSAGES = [
        '吸氣…',
        '屏息…',
        '吐氣…',
        '靜止…'
    ];

    // 成就定義
    const ACHIEVEMENTS = [
        { id: 'first_round', name: '初心', desc: '完成第一圈念珠', requirement: 1 },
        { id: 'three_rounds', name: '精進', desc: '單次完成 3 圈', requirement: 3 },
        { id: 'seven_rounds', name: '禪定', desc: '單次完成 7 圈', requirement: 7 },
        { id: 'streak_3', name: '持之以恆', desc: '連續 3 天練習', requirement: 3, type: 'streak' },
        { id: 'streak_7', name: '七日禪修', desc: '連續 7 天練習', requirement: 7, type: 'streak' },
        { id: 'streak_21', name: '習慣養成', desc: '連續 21 天練習', requirement: 21, type: 'streak' },
        { id: 'total_10', name: '十圈圓滿', desc: '累計完成 10 圈', requirement: 10, type: 'total' },
        { id: 'total_108', name: '百八圓滿', desc: '累計完成 108 圈', requirement: 108, type: 'total' }
    ];

    // === 狀態變數 ===
    let canvas, ctx;
    let count = 0;
    let rounds = 0;
    let breathPhase = 0;
    let breathTimer = 0;
    let isAnimating = false;
    let pulsePhase = 0;
    let lastClickTime = 0;
    let currentMode = 'full'; // 'quick' 或 'full'
    let streakBroken = false; // 追蹤是否需要顯示安慰訊息

    // 進度追蹤
    let progress = {
        totalRounds: 0,
        streak: 0,
        lastPlayDate: null,
        achievements: [],
        bestSessionRounds: 0
    };

    // 預計算的珠子位置（避免每幀計算）
    let beadPositions = [];

    // === 粒子系統（物件池，避免頻繁 GC） ===
    const PARTICLE_POOL_SIZE = 60;
    const particlePool = [];
    let activeParticleCount = 0;

    function createParticle() {
        return {
            x: 0, y: 0, vx: 0, vy: 0,
            life: 0, maxLife: 0, size: 0,
            alpha: 0, active: false, type: 'spark'
        };
    }

    // 預建物件池
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
        particlePool.push(createParticle());
    }

    function spawnParticle(x, y, vx, vy, life, size, type) {
        for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
            const p = particlePool[i];
            if (!p.active) {
                p.x = x; p.y = y; p.vx = vx; p.vy = vy;
                p.life = life; p.maxLife = life; p.size = size;
                p.alpha = 1; p.active = true; p.type = type || 'spark';
                activeParticleCount++;
                return;
            }
        }
    }

    function emitClickParticles(x, y) {
        // 5-8 個金色粒子向上飄散
        const particleCount = 5 + (Math.random() * 3 | 0);
        for (let i = 0; i < particleCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 0.3 + Math.random() * 0.8;
            spawnParticle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed - 0.3,
                40 + (Math.random() * 20 | 0),
                2 + Math.random() * 2,
                'spark'
            );
        }
        // 漣漪擴散效果
        spawnParticle(x, y, 0, 0, 30, 3, 'ripple');
    }

    function emitCelebrationParticles() {
        // 完成一圈的慶祝動畫：大量粒子從中心噴發
        for (let i = 0; i < 30; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 0.5 + Math.random() * 1.5;
            spawnParticle(
                CENTER_X, CENTER_Y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed - 0.5,
                60 + (Math.random() * 40 | 0),
                2 + Math.random() * 3,
                'spark'
            );
        }
        // 多層漣漪
        for (let i = 0; i < 3; i++) {
            spawnParticle(CENTER_X, CENTER_Y, 0, 0, 50 + i * 10, 5, 'ripple');
        }
    }

    function updateParticles() {
        for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
            const p = particlePool[i];
            if (!p.active) continue;

            p.life--;
            if (p.life <= 0) {
                p.active = false;
                activeParticleCount--;
                continue;
            }

            p.alpha = p.life / p.maxLife;

            if (p.type === 'spark') {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.01; // 微弱重力，模擬香灰飄散
                p.size *= 0.98; // 逐漸縮小
            }
            // ripple 不需位移，只靠 life/maxLife 控制擴散
        }
    }

    function renderParticles() {
        for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
            const p = particlePool[i];
            if (!p.active) continue;

            if (p.type === 'spark') {
                // 金色粒子本體
                ctx.globalAlpha = p.alpha * 0.9;
                ctx.fillStyle = COLORS.beadActive;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();

                // 粒子光暈
                ctx.globalAlpha = p.alpha * 0.3;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2);
                ctx.fill();

            } else if (p.type === 'ripple') {
                // 漣漪擴散圈
                const rippleProgress = 1 - (p.life / p.maxLife);
                const radius = p.size + rippleProgress * 25;
                ctx.globalAlpha = p.alpha * 0.4;
                ctx.strokeStyle = COLORS.beadActive;
                ctx.lineWidth = 1.5 * p.alpha;
                ctx.beginPath();
                ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;
    }

    // === 光芒軌跡（已點亮珠子之間的微光連線） ===
    function renderLightTrail() {
        if (count < 2) return;

        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.strokeStyle = COLORS.beadActive;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(beadPositions[0].x, beadPositions[0].y);
        for (let i = 1; i < count; i++) {
            ctx.lineTo(beadPositions[i].x, beadPositions[i].y);
        }
        ctx.stroke();
        ctx.restore();
    }

    // === DOM 元素 ===
    let countDisplay, roundDisplay, breathGuide, completionMessage, restartBtn;
    let quickModeBtn, fullModeBtn, streakMessage, closeStreakBtn;

    // === 初始化 ===
    function init() {
        canvas = document.getElementById('gameCanvas');
        ctx = canvas.getContext('2d');

        countDisplay = document.getElementById('countDisplay');
        roundDisplay = document.getElementById('roundDisplay');
        breathGuide = document.getElementById('breathGuide');
        completionMessage = document.getElementById('completionMessage');
        restartBtn = document.getElementById('restartBtn');

        // 模式選擇按鈕
        quickModeBtn = document.getElementById('quickMode');
        fullModeBtn = document.getElementById('fullMode');

        // Streak 安慰訊息元素
        streakMessage = document.getElementById('streakMessage');
        closeStreakBtn = document.getElementById('closeStreakMsg');

        // 載入進度
        loadProgress();
        const wasStreakBroken = updateStreakOnLoad();
        updateStatsDisplay();

        // 預計算所有珠子位置
        calculateBeadPositions();

        // 事件綁定
        canvas.addEventListener('click', handleClick);
        canvas.addEventListener('touchstart', handleTouch, { passive: false });
        restartBtn.addEventListener('click', restart);

        // 模式選擇事件
        if (quickModeBtn) {
            quickModeBtn.addEventListener('click', () => switchMode('quick'));
        }
        if (fullModeBtn) {
            fullModeBtn.addEventListener('click', () => switchMode('full'));
        }

        // Streak 安慰訊息關閉按鈕
        if (closeStreakBtn) {
            closeStreakBtn.addEventListener('click', () => {
                streakMessage.classList.remove('show');
            });
        }

        // 如果 Streak 被中斷，延遲顯示安慰訊息
        if (wasStreakBroken) {
            setTimeout(() => {
                showStreakBrokenMessage();
            }, 500);
        }

        // 開始動畫循環
        requestAnimationFrame(gameLoop);
    }

    // === 模式切換（兩分鐘法則：快速模式降低入門門檻）===
    function switchMode(mode) {
        if (currentMode === mode) return;
        if (count > 0) {
            // 遊戲進行中不允許切換
            return;
        }

        currentMode = mode;

        // 更新按鈕狀態
        if (mode === 'quick') {
            TOTAL_BEADS = QUICK_MODE_BEADS;
            RINGS = 1;
            quickModeBtn.classList.add('active');
            fullModeBtn.classList.remove('active');
        } else {
            TOTAL_BEADS = FULL_MODE_BEADS;
            RINGS = 4;
            quickModeBtn.classList.remove('active');
            fullModeBtn.classList.add('active');
        }

        // 重新計算珠子位置
        calculateBeadPositions();
    }

    // === 顯示 Streak 斷裂安慰訊息（絕不錯過兩次原則）===
    function showStreakBrokenMessage() {
        if (streakMessage) {
            // 隨機選擇一則安慰語
            const encouragements = [
                '「重新開始，也是一種修行。」',
                '「每一刻都是新的起點。」',
                '「放下執著，輕裝前行。」',
                '「失敗是成功的墊腳石。」'
            ];
            const randomMsg = encouragements[Math.floor(Math.random() * encouragements.length)];
            const encouragementEl = streakMessage.querySelector('.encouragement');
            if (encouragementEl) {
                encouragementEl.textContent = randomMsg;
            }
            streakMessage.classList.add('show');
        }
    }

    // === 進度持久化 ===
    function loadProgress() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                progress = JSON.parse(saved);
            }
        } catch (e) {
            console.warn('無法載入進度', e);
        }
    }

    function saveProgress() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
        } catch (e) {
            console.warn('無法儲存進度', e);
        }
    }

    // === 連續天數追蹤 ===
    function updateStreakOnLoad() {
        const today = getDateString();
        const lastPlay = progress.lastPlayDate;

        if (!lastPlay) {
            // 首次遊玩
            return false;
        }

        const daysDiff = getDaysDiff(lastPlay, today);

        if (daysDiff > 1) {
            // 中斷連續，重置 streak，並標記需要顯示安慰訊息
            const previousStreak = progress.streak;
            progress.streak = 0;
            saveProgress();
            // 只有之前有連續紀錄才顯示安慰訊息
            return previousStreak >= 2;
        }
        return false;
    }

    function updateStreakOnComplete() {
        const today = getDateString();
        const lastPlay = progress.lastPlayDate;

        if (lastPlay === today) {
            // 今天已經玩過，不重複計算
            return;
        }

        const daysDiff = lastPlay ? getDaysDiff(lastPlay, today) : 999;

        if (daysDiff === 1) {
            // 連續天數 +1
            progress.streak++;
        } else if (daysDiff > 1) {
            // 中斷後重新開始
            progress.streak = 1;
        } else {
            // 首次
            progress.streak = 1;
        }

        progress.lastPlayDate = today;
        saveProgress();
    }

    function getDateString() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function getDaysDiff(date1, date2) {
        const d1 = new Date(date1);
        const d2 = new Date(date2);
        const diff = Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
        return diff;
    }

    // === 成就系統 ===
    function checkAchievements() {
        const newAchievements = [];

        ACHIEVEMENTS.forEach(ach => {
            if (progress.achievements.includes(ach.id)) return;

            let earned = false;

            if (ach.type === 'streak') {
                earned = progress.streak >= ach.requirement;
            } else if (ach.type === 'total') {
                earned = progress.totalRounds >= ach.requirement;
            } else {
                earned = rounds >= ach.requirement;
            }

            if (earned) {
                progress.achievements.push(ach.id);
                newAchievements.push(ach);
            }
        });

        if (newAchievements.length > 0) {
            saveProgress();
            showAchievementNotification(newAchievements[0]);
        }
    }

    function showAchievementNotification(ach) {
        const notification = document.createElement('div');
        notification.className = 'achievement-notification';
        notification.innerHTML = `
            <div class="ach-icon">🏆</div>
            <div class="ach-content">
                <div class="ach-title">成就解鎖：${ach.name}</div>
                <div class="ach-desc">${ach.desc}</div>
            </div>
        `;
        document.body.appendChild(notification);

        setTimeout(() => notification.classList.add('show'), 100);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 500);
        }, 3000);
    }

    // === 更新統計顯示 ===
    function updateStatsDisplay() {
        const streakEl = document.getElementById('streakDisplay');
        const totalEl = document.getElementById('totalDisplay');

        if (streakEl) streakEl.textContent = progress.streak;
        if (totalEl) totalEl.textContent = progress.totalRounds;
    }

    // === 預計算珠子位置 ===
    function calculateBeadPositions() {
        beadPositions = [];
        let beadIndex = 0;

        for (let ring = 0; ring < RINGS; ring++) {
            const radius = RING_RADII[ring];
            const beadsInRing = BEADS_PER_RING;

            for (let i = 0; i < beadsInRing; i++) {
                const angle = (i / beadsInRing) * Math.PI * 2 - Math.PI / 2;
                // 使用位元運算取整數座標（效能優化）
                const x = (CENTER_X + Math.cos(angle) * radius + 0.5) | 0;
                const y = (CENTER_Y + Math.sin(angle) * radius + 0.5) | 0;

                beadPositions.push({
                    x: x,
                    y: y,
                    ring: ring,
                    size: BEAD_SIZES[ring],
                    index: beadIndex++
                });
            }
        }
    }

    // === 主遊戲循環 ===
    function gameLoop(timestamp) {
        update(timestamp);
        render();
        requestAnimationFrame(gameLoop);
    }

    // === 更新邏輯 ===
    function update(timestamp) {
        // 脈動動畫
        pulsePhase = (timestamp / 2000) % (Math.PI * 2);

        // 呼吸引導計時器（每 4 秒切換）
        if (count > 0) {
            breathTimer++;
            if (breathTimer >= 240) { // 60fps * 4秒
                breathTimer = 0;
                breathPhase = (breathPhase + 1) % 4;
                breathGuide.textContent = BREATH_MESSAGES[breathPhase];
            }
        }

        // 更新粒子系統
        updateParticles();
    }

    // === 渲染 ===
    function render() {
        // 清除畫布
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 繪製中心光暈
        drawCenterGlow();

        // 繪製軌道環
        drawRings();

        // 繪製光芒軌跡（在珠子底層）
        renderLightTrail();

        // 繪製所有珠子（批次繪製優化）
        drawBeads();

        // 繪製粒子效果（在珠子上層）
        renderParticles();
    }

    // === 繪製中心光暈 ===
    function drawCenterGlow() {
        const gradient = ctx.createRadialGradient(
            CENTER_X, CENTER_Y, 0,
            CENTER_X, CENTER_Y, 50 + Math.sin(pulsePhase) * 5
        );
        gradient.addColorStop(0, 'rgba(232, 213, 183, 0.15)');
        gradient.addColorStop(1, 'rgba(232, 213, 183, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(CENTER_X, CENTER_Y, 55, 0, Math.PI * 2);
        ctx.fill();
    }

    // === 繪製軌道環 ===
    function drawRings() {
        ctx.strokeStyle = COLORS.ring;
        ctx.lineWidth = 1;

        for (let i = 0; i < RINGS; i++) {
            ctx.beginPath();
            ctx.arc(CENTER_X, CENTER_Y, RING_RADII[i], 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    // === 繪製珠子（批次繪製優化）===
    function drawBeads() {
        // 先繪製所有未點亮的珠子（相同顏色批次處理）
        ctx.fillStyle = COLORS.beadInactive;
        ctx.beginPath();

        for (let i = count; i < TOTAL_BEADS; i++) {
            const bead = beadPositions[i];
            ctx.moveTo(bead.x + bead.size, bead.y);
            ctx.arc(bead.x, bead.y, bead.size, 0, Math.PI * 2);
        }
        ctx.fill();

        // 再繪製所有點亮的珠子（帶光暈效果）
        for (let i = 0; i < count; i++) {
            const bead = beadPositions[i];

            // 光暈
            const gradient = ctx.createRadialGradient(
                bead.x, bead.y, 0,
                bead.x, bead.y, bead.size * 2
            );
            gradient.addColorStop(0, COLORS.beadGlow);
            gradient.addColorStop(1, 'transparent');

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(bead.x, bead.y, bead.size * 2, 0, Math.PI * 2);
            ctx.fill();

            // 珠子本體
            ctx.fillStyle = COLORS.beadActive;
            ctx.beginPath();
            ctx.arc(bead.x, bead.y, bead.size, 0, Math.PI * 2);
            ctx.fill();
        }

        // 繪製下一顆待點擊的珠子（特殊高亮）
        if (count < TOTAL_BEADS) {
            const nextBead = beadPositions[count];
            const pulseSize = nextBead.size + Math.sin(pulsePhase * 2) * 2;

            // 呼吸脈動光暈
            const gradient = ctx.createRadialGradient(
                nextBead.x, nextBead.y, 0,
                nextBead.x, nextBead.y, pulseSize * 2.5
            );
            gradient.addColorStop(0, 'rgba(232, 213, 183, 0.4)');
            gradient.addColorStop(0.5, 'rgba(232, 213, 183, 0.1)');
            gradient.addColorStop(1, 'transparent');

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(nextBead.x, nextBead.y, pulseSize * 2.5, 0, Math.PI * 2);
            ctx.fill();

            // 高亮邊框
            ctx.strokeStyle = COLORS.beadActive;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(nextBead.x, nextBead.y, pulseSize, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    // === 點擊處理 ===
    function handleClick(e) {
        // 防抖：避免過快連續點擊
        const now = Date.now();
        if (now - lastClickTime < 100) return;
        lastClickTime = now;

        incrementCount();
    }

    // === 觸控處理 ===
    function handleTouch(e) {
        e.preventDefault();
        handleClick(e);
    }

    // === 計數增加 ===
    function incrementCount() {
        if (count >= TOTAL_BEADS) return;

        count++;
        countDisplay.textContent = count;

        // 觸發粒子效果（從剛點亮的念珠位置噴出）
        const bead = beadPositions[count - 1];
        emitClickParticles(bead.x, bead.y);

        // 首次點擊啟動呼吸引導
        if (count === 1) {
            breathGuide.textContent = BREATH_MESSAGES[0];
        }

        // 完成一圈
        if (count >= TOTAL_BEADS) {
            rounds++;
            roundDisplay.textContent = rounds;
            emitCelebrationParticles();
            showCompletion();
        }
    }

    // === 顯示完成畫面 ===
    function showCompletion() {
        // 更新進度統計
        progress.totalRounds++;
        if (rounds > progress.bestSessionRounds) {
            progress.bestSessionRounds = rounds;
        }

        // 更新連續天數
        updateStreakOnComplete();

        // 檢查成就
        checkAchievements();

        // 更新顯示
        updateStatsDisplay();

        // 儲存進度
        saveProgress();

        setTimeout(() => {
            // 更新完成訊息，顯示統計
            const msgEl = completionMessage.querySelector('p');
            const modeText = currentMode === 'quick' ? '27 顆快速' : '108 顆完整';
            if (msgEl) {
                msgEl.innerHTML = `
                    一圈 ${modeText}念珠已完成<br>
                    心念歸一，自在清淨<br>
                    <span style="font-size: 0.9rem; color: #a89f91; margin-top: 10px; display: block;">
                        累計 ${progress.totalRounds} 圈 | 連續 ${progress.streak} 天
                    </span>
                `;
            }
            completionMessage.classList.add('show');
        }, 500);
    }

    // === 重新開始 ===
    function restart() {
        count = 0;
        breathPhase = 0;
        breathTimer = 0;

        countDisplay.textContent = '0';
        breathGuide.textContent = '點擊念珠開始';
        completionMessage.classList.remove('show');
    }

    // === 頁面載入後初始化 ===
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
