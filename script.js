// ═══════════════════════════════════════════════════════════════════════════════
// WORD CHAIN GAME — Full-featured version
// ═══════════════════════════════════════════════════════════════════════════════

// ─── State ───────────────────────────────────────────────────────────────────
let gameHistory = [];
let usedWords = new Set();
let lastWord = '';
let isProcessing = false;
let playerName = '';
let timerInterval;
let timeLeft = 30;
let initialTimeLimit = 30;
let gameActive = false;
let streakCount = 0;
let highScore = parseInt(localStorage.getItem('wordChainHighScore')) || 0;
let difficulty = 'normal';
let pointsEarned = 0;
let totalCorrectWords = 0;

// Game mode: 'qbit', 'pvp', or 'botvsbot'
let gameMode = 'qbit';
let botSpeed = 1500;
let botTurnTimeout = null;
let player2Name = '';
let currentPlayer = 1; // 1 or 2 in PvP
let player1Points = 0;
let player2Points = 0;
let player1Words = 0;
let player2Words = 0;

// Power-ups
let powerUps = { freeze: 0, double: 0, skip: 0, letterPick: 0 };
let doublePointsActive = false;
let timerFrozen = false;
let freezeTimeout = null;
let letterPickActive = false;
let letterPickLetter = '';

// AI Letter Frequency Tracker (variance-minimized softmax selection)
const letterFreqTracker = new LetterFrequencyTracker();

// Qbit v0.1 Markov Chain learning bot
const qbitMarkov = new QbitMarkov();
const qbitWeightedGreedy = new QbitWeightedGreedy();
const qbitRL = new QbitRL();
let selectedBot = 'classic'; // 'classic', 'qbit_v01', 'qbit_v02', or 'qbit_v03'
let selectedBot1 = 'classic'; // Bot 1 for botvsbot mode
let selectedBot2 = 'qbit_v02'; // Bot 2 for botvsbot mode

// Training data source for Qbit v0.1: 'user', 'bot', or 'both'
let qbitTrainingSource = localStorage.getItem('qbitTrainingSource') || 'both';

// Custom min word length
let customMinWordLength = 1;

// Word definition cache
const definitionCache = {};

// Sound
let soundMuted = localStorage.getItem('wordChainMuted') === 'true';
let audioCtx = null;

// ─── Qbit v0.1 Training Gate ─────────────────────────────────────────────────

/**
 * Conditionally learn a word based on the training data source setting.
 * @param {string} word — The word to learn
 * @param {'user'|'bot'} source — Who played the word
 */
function qbitLearn(word, source) {
    if (qbitTrainingSource === 'both' ||
        (qbitTrainingSource === 'user' && source === 'user') ||
        (qbitTrainingSource === 'bot' && source === 'bot')) {
        qbitMarkov.learn(word);
    }
}

// ─── Difficulty Config ───────────────────────────────────────────────────────
const DIFFICULTY_CONFIG = {
    easy: {
        label: 'Easy', color: '#4ade80', icon: '🌿',
        timeMultiplier: 1.3, pointsMultiplier: 1,
        hintCost: 0, hintCostLabel: 'Free',
        qbitPoolSize: 30, qbitStrategy: 'random',
        minWordLength: 1, resetStreakOnInvalid: false,
        description: 'Relaxed — free hints, forgiving rules'
    },
    normal: {
        label: 'Normal', color: '#facc15', icon: '⚡',
        timeMultiplier: 1, pointsMultiplier: 1.5,
        hintCost: 5, hintCostLabel: '−5 pts',
        qbitPoolSize: 50, qbitStrategy: 'first',
        minWordLength: 1, resetStreakOnInvalid: true,
        description: 'Balanced challenge — standard rules'
    },
    hard: {
        label: 'Hard', color: '#f87171', icon: '🔥',
        timeMultiplier: 0.7, pointsMultiplier: 2,
        hintCost: 10, hintCostLabel: '−10 pts',
        qbitPoolSize: 100, qbitStrategy: 'balanced',
        minWordLength: 1, resetStreakOnInvalid: true,
        description: 'Competitive — AI-balanced Qbit'
    }
};

function getDiffConfig() {
    return DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.normal;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOUND EFFECTS (Web Audio API)
// ═══════════════════════════════════════════════════════════════════════════════

function getAudioContext() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
}

function playTone(freq, duration = 0.15, type = 'sine', gain = 0.12) {
    if (soundMuted) return;
    try {
        const ctx = getAudioContext();
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        g.gain.value = gain;
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);
    } catch (e) { /* ignore audio errors */ }
}

function playCorrectSound() {
    playTone(523, 0.1); // C5
    setTimeout(() => playTone(659, 0.1), 80); // E5
    setTimeout(() => playTone(784, 0.15), 160); // G5
}

function playWrongSound() {
    playTone(200, 0.25, 'sawtooth', 0.08);
}

function playQbitSound() {
    playTone(440, 0.08, 'triangle', 0.06);
    setTimeout(() => playTone(550, 0.1, 'triangle', 0.06), 100);
}

function playStreakSound() {
    [523, 659, 784, 1047].forEach((f, i) => {
        setTimeout(() => playTone(f, 0.12, 'sine', 0.1), i * 70);
    });
}

function playAchievementSound() {
    [784, 988, 1175, 1319].forEach((f, i) => {
        setTimeout(() => playTone(f, 0.2, 'sine', 0.1), i * 120);
    });
}

function playWinSound() {
    const notes = [523, 659, 784, 1047, 784, 1047, 1319];
    notes.forEach((f, i) => {
        setTimeout(() => playTone(f, 0.2, 'sine', 0.12), i * 100);
    });
}

function playLoseSound() {
    [400, 350, 300, 250].forEach((f, i) => {
        setTimeout(() => playTone(f, 0.3, 'sawtooth', 0.06), i * 150);
    });
}

function playTickSound() {
    playTone(1000, 0.05, 'square', 0.04);
}

function playPowerUpSound() {
    playTone(600, 0.1, 'sine', 0.1);
    setTimeout(() => playTone(900, 0.15, 'sine', 0.1), 80);
    setTimeout(() => playTone(1200, 0.2, 'sine', 0.1), 160);
}

function toggleMute() {
    soundMuted = !soundMuted;
    localStorage.setItem('wordChainMuted', soundMuted);
    const btn = document.getElementById('muteBtn');
    btn.textContent = soundMuted ? '🔇' : '🔊';
    btn.title = soundMuted ? 'Unmute' : 'Mute';
    if (!soundMuted) playTone(880, 0.1);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFETTI
// ═══════════════════════════════════════════════════════════════════════════════

function launchConfetti(duration = 3000, intensity = 1) {
    const canvas = document.createElement('canvas');
    canvas.id = 'confettiCanvas';
    canvas.style.cssText = 'position:fixed;inset:0;z-index:99999;pointer-events:none;';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    const colors = ['#6366f1', '#22d3ee', '#4ade80', '#facc15', '#f87171', '#a78bfa', '#fb923c'];
    const particles = [];
    const count = Math.floor(80 * intensity);

    for (let i = 0; i < count; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height * -1,
            w: Math.random() * 10 + 5,
            h: Math.random() * 6 + 3,
            color: colors[Math.floor(Math.random() * colors.length)],
            vx: (Math.random() - 0.5) * 4,
            vy: Math.random() * 3 + 2,
            rot: Math.random() * 360,
            rotSpeed: (Math.random() - 0.5) * 10,
            opacity: 1
        });
    }

    const start = Date.now();
    function animate() {
        const elapsed = Date.now() - start;
        if (elapsed > duration) {
            canvas.remove();
            return;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const fadeStart = duration * 0.7;
        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.05;
            p.rot += p.rotSpeed;
            p.opacity = elapsed > fadeStart ? 1 - (elapsed - fadeStart) / (duration - fadeStart) : 1;

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate((p.rot * Math.PI) / 180);
            ctx.globalAlpha = Math.max(0, p.opacity);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            ctx.restore();
        });
        requestAnimationFrame(animate);
    }
    animate();
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEADERBOARD (localStorage)
// ═══════════════════════════════════════════════════════════════════════════════

function getLeaderboard() {
    try {
        return JSON.parse(localStorage.getItem('wordChainLeaderboard') || '[]');
    } catch { return []; }
}

function saveToLeaderboard(name, score, diff, words) {
    const board = getLeaderboard();
    board.push({
        name, score, difficulty: diff, words,
        date: new Date().toLocaleDateString()
    });
    board.sort((a, b) => b.score - a.score);
    if (board.length > 10) board.length = 10;
    localStorage.setItem('wordChainLeaderboard', JSON.stringify(board));
}

function renderLeaderboard() {
    const board = getLeaderboard();
    const el = document.getElementById('leaderboardBody');
    if (!el) return;

    if (board.length === 0) {
        el.innerHTML = '<tr><td colspan="5" class="empty-state">No scores yet — play a game!</td></tr>';
        return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    el.innerHTML = board.map((entry, i) => {
        const rank = medals[i] || `${i + 1}`;
        const rowClass = i < 3 ? `rank-${i + 1}` : '';
        return `<tr class="${rowClass}">
            <td>${rank}</td>
            <td>${entry.name}</td>
            <td>${entry.score}</td>
            <td>${entry.difficulty || '—'}</td>
            <td>${entry.date}</td>
        </tr>`;
    }).join('');
}

function clearLeaderboard() {
    if (confirm('Clear all leaderboard data?')) {
        localStorage.removeItem('wordChainLeaderboard');
        renderLeaderboard();
        showToast('Leaderboard cleared', 'info');
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLAYER STATISTICS (localStorage)
// ═══════════════════════════════════════════════════════════════════════════════

function getStats() {
    try {
        return JSON.parse(localStorage.getItem('wordChainStats') || '{}');
    } catch { return {}; }
}

function saveStats(stats) {
    localStorage.setItem('wordChainStats', JSON.stringify(stats));
}

function updateStatsAfterGame(won) {
    const stats = getStats();
    stats.totalGames = (stats.totalGames || 0) + 1;
    stats.wins = (stats.wins || 0) + (won ? 1 : 0);
    stats.losses = (stats.losses || 0) + (won ? 0 : 1);
    stats.totalScore = (stats.totalScore || 0) + pointsEarned;
    stats.totalWords = (stats.totalWords || 0) + totalCorrectWords;
    if (streakCount > (stats.bestStreak || 0)) stats.bestStreak = streakCount;

    // Find longest word from this game
    const playerWords = gameHistory.filter(e => e.player !== 'Qbit').map(e => e.word);
    const longestThisGame = playerWords.reduce((a, b) => a.length >= b.length ? a : b, '');
    if (longestThisGame.length > (stats.longestWord || '').length) {
        stats.longestWord = longestThisGame;
    }

    saveStats(stats);
}

function renderStats() {
    const stats = getStats();
    const total = stats.totalGames || 0;
    const wins = stats.wins || 0;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
    const avgScore = total > 0 ? Math.round((stats.totalScore || 0) / total) : 0;

    const el = document.getElementById('statsContent');
    if (!el) return;

    el.innerHTML = `
        <div class="stats-grid">
            <div class="mini-stat">
                <div class="mini-stat-value">${total}</div>
                <div class="mini-stat-label">Games</div>
            </div>
            <div class="mini-stat">
                <div class="mini-stat-value win-rate-circle" style="--pct:${winRate}">${winRate}%</div>
                <div class="mini-stat-label">Win Rate</div>
            </div>
            <div class="mini-stat">
                <div class="mini-stat-value">${avgScore}</div>
                <div class="mini-stat-label">Avg Score</div>
            </div>
            <div class="mini-stat">
                <div class="mini-stat-value">${stats.totalWords || 0}</div>
                <div class="mini-stat-label">Total Words</div>
            </div>
            <div class="mini-stat">
                <div class="mini-stat-value">${stats.bestStreak || 0}</div>
                <div class="mini-stat-label">Best Streak</div>
            </div>
            <div class="mini-stat">
                <div class="mini-stat-value longest-word">${stats.longestWord || '—'}</div>
                <div class="mini-stat-label">Longest Word</div>
            </div>
        </div>
    `;
}

function clearStats() {
    if (confirm('Clear all statistics?')) {
        localStorage.removeItem('wordChainStats');
        renderStats();
        showToast('Statistics cleared', 'info');
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// WORD DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

async function showDefinition(word, targetEl) {
    // Remove any existing tooltip
    document.querySelectorAll('.def-tooltip').forEach(t => t.remove());

    const tooltip = document.createElement('div');
    tooltip.className = 'def-tooltip';
    tooltip.innerHTML = '<div class="loading"></div> Looking up...';

    // Position near the word tag
    const rect = targetEl.getBoundingClientRect();
    tooltip.style.left = `${rect.left}px`;
    tooltip.style.top = `${rect.bottom + 6}px`;
    document.body.appendChild(tooltip);

    let definition = '';
    if (definitionCache[word]) {
        definition = definitionCache[word];
    } else {
        try {
            const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
            if (res.ok) {
                const data = await res.json();
                const meanings = data[0]?.meanings || [];
                if (meanings.length > 0) {
                    const m = meanings[0];
                    const partOfSpeech = m.partOfSpeech || '';
                    const def = m.definitions?.[0]?.definition || 'No definition found';
                    definition = `<em>${partOfSpeech}</em> — ${def}`;
                } else {
                    definition = 'No definition found';
                }
            } else {
                definition = 'Definition not available';
            }
        } catch {
            definition = 'Could not load definition';
        }
        definitionCache[word] = definition;
    }

    tooltip.innerHTML = `<strong>${word}</strong><br>${definition}`;

    // Reposition if off-screen
    requestAnimationFrame(() => {
        const tRect = tooltip.getBoundingClientRect();
        if (tRect.right > window.innerWidth - 10) {
            tooltip.style.left = `${window.innerWidth - tRect.width - 10}px`;
        }
        if (tRect.bottom > window.innerHeight - 10) {
            tooltip.style.top = `${rect.top - tRect.height - 6}px`;
        }
    });

    // Close on click outside
    const closeHandler = (e) => {
        if (!tooltip.contains(e.target) && e.target !== targetEl) {
            tooltip.remove();
            document.removeEventListener('click', closeHandler);
        }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 10);
}

// ═══════════════════════════════════════════════════════════════════════════════
// POWER-UPS
// ═══════════════════════════════════════════════════════════════════════════════

function updatePowerUpUI() {
    document.getElementById('freezeCount').textContent = powerUps.freeze;
    document.getElementById('doubleCount').textContent = powerUps.double;
    document.getElementById('skipCount').textContent = powerUps.skip;
    document.getElementById('letterPickCount').textContent = powerUps.letterPick;

    document.getElementById('freezeBtn').disabled = powerUps.freeze === 0 || !gameActive || timerFrozen;
    document.getElementById('doubleBtn').disabled = powerUps.double === 0 || !gameActive || doublePointsActive;
    document.getElementById('skipBtn').disabled = powerUps.skip === 0 || !gameActive || gameMode === 'pvp';
    document.getElementById('letterPickBtn').disabled = powerUps.letterPick === 0 || !gameActive || letterPickActive || gameMode === 'pvp';
}

function checkPowerUpEarning() {
    // Freeze: every 5 correct words
    if (totalCorrectWords > 0 && totalCorrectWords % 5 === 0 && powerUps.freeze < 3) {
        powerUps.freeze++;
        showToast('❄️ Time Freeze earned!', 'powerup');
        playPowerUpSound();
    }
    // Double: every streak of 3
    if (streakCount > 0 && streakCount % 3 === 0 && powerUps.double < 3) {
        powerUps.double++;
        showToast('💎 Double Points earned!', 'powerup');
        playPowerUpSound();
    }
    // Skip: score reaches 50, 100, 150...
    const skipThreshold = (Math.floor(pointsEarned / 50)) > 0;
    const prevSkipEarned = Math.floor((pointsEarned - (gameHistory.length > 0 ? gameHistory[gameHistory.length - 1].points || 0 : 0)) / 50);
    const currSkipEarned = Math.floor(pointsEarned / 50);
    if (currSkipEarned > prevSkipEarned && powerUps.skip < 3) {
        powerUps.skip++;
        showToast('🔄 Skip Turn earned!', 'powerup');
        playPowerUpSound();
    }
    // Letter Pick: every 4 correct words
    if (totalCorrectWords > 0 && totalCorrectWords % 4 === 0 && powerUps.letterPick < 3) {
        powerUps.letterPick++;
        showToast('🔤 Letter Pick earned!', 'powerup');
        playPowerUpSound();
    }
    updatePowerUpUI();
}

function useFreeze() {
    if (powerUps.freeze <= 0 || !gameActive || timerFrozen) return;
    powerUps.freeze--;
    timerFrozen = true;
    clearInterval(timerInterval);
    playPowerUpSound();
    showToast('❄️ Timer frozen for 10s!', 'powerup');

    const timerEl = document.getElementById('timer');
    timerEl.classList.add('timer-frozen');

    freezeTimeout = setTimeout(() => {
        timerFrozen = false;
        timerEl.classList.remove('timer-frozen');
        if (gameActive) startTimerFromCurrent();
    }, 10000);

    updatePowerUpUI();
}

function useDouble() {
    if (powerUps.double <= 0 || !gameActive || doublePointsActive) return;
    powerUps.double--;
    doublePointsActive = true;
    playPowerUpSound();
    showToast('💎 Next word earns 2× points!', 'powerup');
    updatePowerUpUI();
}

async function useSkip() {
    if (powerUps.skip <= 0 || !gameActive || gameMode === 'pvp') return;
    powerUps.skip--;
    playPowerUpSound();
    showToast('🔄 Forcing Qbit to play a new word!', 'powerup');

    isProcessing = true;
    document.getElementById('submitButton').disabled = true;
    showMessage('Qbit picks a new starting word... <div class="loading"></div>', 'info', true);

    // Use AI-recommended letter based on frequency balance (variance-minimized softmax)
    const randomLetter = letterFreqTracker.getRecommendedLetter();
    console.log(`🧠 AI Skip: recommended letter '${randomLetter}' based on frequency balance`);
    const qbitWord = await getQbitWord(randomLetter);
    handleQbitTurn(qbitWord);
    updatePowerUpUI();
    renderFreqChart();
}

function useLetterPick() {
    if (powerUps.letterPick <= 0 || !gameActive || letterPickActive || gameMode === 'pvp') return;
    showLetterPickModal();
}

function showLetterPickModal() {
    // Remove existing modal if any
    const existing = document.getElementById('letterPickModal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'letterPickModal';
    overlay.className = 'lp-overlay';

    const modal = document.createElement('div');
    modal.className = 'lp-modal';

    const title = document.createElement('div');
    title.className = 'lp-title';
    title.textContent = '🔤 Pick a Letter';

    const subtitle = document.createElement('div');
    subtitle.className = 'lp-subtitle';
    subtitle.textContent = "Choose Qbit's next starting letter";

    const grid = document.createElement('div');
    grid.className = 'lp-grid';

    for (let i = 0; i < 26; i++) {
        const letter = String.fromCharCode(65 + i);
        const btn = document.createElement('button');
        btn.className = 'lp-letter-btn';
        btn.textContent = letter;
        btn.addEventListener('click', () => {
            selectLetterPick(letter.toLowerCase());
            overlay.remove();
        });
        grid.appendChild(btn);
    }

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'lp-cancel-btn';
    cancelBtn.textContent = '✕ Cancel';
    cancelBtn.addEventListener('click', () => overlay.remove());

    modal.appendChild(title);
    modal.appendChild(subtitle);
    modal.appendChild(grid);
    modal.appendChild(cancelBtn);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });

    // Animate in
    requestAnimationFrame(() => overlay.classList.add('active'));
}

function selectLetterPick(cleaned) {
    powerUps.letterPick--;
    letterPickActive = true;
    letterPickLetter = cleaned;
    playPowerUpSound();
    showToast(`🔤 Qbit will start with '${cleaned.toUpperCase()}'!`, 'powerup');
    updatePowerUpUI();
}

function startTimerFromCurrent() {
    gameActive = true;
    updateTimerDisplay();
    timerInterval = setInterval(() => {
        timeLeft--;
        updateTimerDisplay();
        if (timeLeft <= 0) handleTimeout();
    }, 1000);
}

// ═══════════════════════════════════════════════════════════════════════════════
// POINTS
// ═══════════════════════════════════════════════════════════════════════════════

function calculatePoints(word) {
    let base = word.length;
    base = Math.floor(base * getDiffConfig().pointsMultiplier);
    if (doublePointsActive) {
        base *= 2;
        doublePointsActive = false;
        updatePowerUpUI();
    }
    return base;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GAME MODES
// ═══════════════════════════════════════════════════════════════════════════════

function setGameMode(mode) {
    gameMode = mode;
    const p1Section = document.getElementById('player1Section');
    const p2Section = document.getElementById('player2Section');
    const hintGroup = document.getElementById('hintGroup');
    const botSpeedSection = document.getElementById('botSpeedSection');
    const botSelectorSection = document.getElementById('botSelectorSection');
    const botVsBotSelectorSection = document.getElementById('botVsBotSelectorSection');

    if (mode === 'pvp') {
        p1Section.style.display = 'block';
        p2Section.style.display = 'block';
        botSpeedSection.style.display = 'none';
        if (botSelectorSection) botSelectorSection.style.display = 'none';
        if (botVsBotSelectorSection) botVsBotSelectorSection.style.display = 'none';
        hintGroup.style.display = 'none';
    } else if (mode === 'botvsbot') {
        p1Section.style.display = 'none';
        p2Section.style.display = 'none';
        botSpeedSection.style.display = 'block';
        if (botSelectorSection) botSelectorSection.style.display = 'none';
        if (botVsBotSelectorSection) botVsBotSelectorSection.style.display = 'block';
        hintGroup.style.display = 'none';
    } else {
        p1Section.style.display = 'block';
        p2Section.style.display = 'none';
        botSpeedSection.style.display = 'none';
        if (botSelectorSection) botSelectorSection.style.display = 'block';
        if (botVsBotSelectorSection) botVsBotSelectorSection.style.display = 'none';
        hintGroup.style.display = 'block';
    }

    // Update active tab
    document.querySelectorAll('.mode-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.mode === mode);
    });
}

function setSelectedBot(bot) {
    selectedBot = bot;
    const preview = document.getElementById('botSelectorPreview');
    const trainingSection = document.getElementById('trainingSourceSection');
    if (preview) {
        if (bot === 'qbit_v03') {
            const rlStats = qbitRL.getStats();
            preview.innerHTML = `🎯 RL Agent — ${rlStats.episodes} episodes, ε=${rlStats.epsilon.toFixed(3)}`;
        } else if (bot === 'qbit_v02') {
            const stats = qbitMarkov.getStats();
            preview.innerHTML = `⚡ Weighted Greedy — ${stats.totalWords} words learned, ${stats.totalTransitions} transitions`;
        } else if (bot === 'qbit_v01') {
            const stats = qbitMarkov.getStats();
            preview.innerHTML = `🧠 Learning bot — ${stats.totalWords} words learned, ${stats.totalTransitions} transitions`;
        } else {
            preview.textContent = '🤖 Classic API-based bot';
        }
    }
    // Always show training source — Classic games also train Qbit v0.1/v0.2
    if (trainingSection) trainingSection.style.display = 'block';
}

function setTrainingSource(source) {
    qbitTrainingSource = source;
    localStorage.setItem('qbitTrainingSource', source);
    const preview = document.getElementById('trainingSourcePreview');
    if (preview) {
        const labels = {
            both: 'Learns from all words played',
            user: 'Learns only from your words',
            bot: 'Learns only from bot words'
        };
        preview.textContent = labels[source] || labels.both;
    }
}

function getBotDisplayName(botId) {
    const names = {
        'classic': 'Qbit Classic',
        'qbit_v01': 'Qbit v0.1',
        'qbit_v02': 'Qbit v0.2',
        'qbit_v03': 'Qbit v0.3'
    };
    return names[botId] || 'Qbit';
}

function clearBotMemory() {
    if (confirm('Clear all Qbit v0.1 learned data? This cannot be undone.')) {
        qbitMarkov.reset();
        showToast('🧠 Bot memory cleared', 'info');
        setSelectedBot(selectedBot); // Refresh preview
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GAME START
// ═══════════════════════════════════════════════════════════════════════════════

function startGame() {
    // Read selected bot
    const botSel = document.getElementById('botSelector');
    if (botSel) selectedBot = botSel.value;

    if (gameMode === 'botvsbot') {
        // Read both bot selectors
        const bot1Sel = document.getElementById('bot1Selector');
        const bot2Sel = document.getElementById('bot2Selector');
        if (bot1Sel) selectedBot1 = bot1Sel.value;
        if (bot2Sel) selectedBot2 = bot2Sel.value;
        playerName = getBotDisplayName(selectedBot1);
        player2Name = getBotDisplayName(selectedBot2);
        // If both bots have the same name, disambiguate
        if (playerName === player2Name) {
            playerName += ' (1)';
            player2Name = player2Name.replace(/ \(1\)$/, '') + ' (2)';
        }
        botSpeed = parseInt(document.getElementById('botSpeed').value) || 1500;
    } else {
        const name = document.getElementById('playerName').value.trim();
        if (!name) { showToast('Please enter your name!', 'warning'); return; }

        if (gameMode === 'pvp') {
            const p2 = document.getElementById('player2Name').value.trim();
            if (!p2) { showToast('Please enter Player 2 name!', 'warning'); return; }
            player2Name = p2;
        }

        playerName = name;
    }
    difficulty = document.getElementById('difficulty').value;
    const cfg = getDiffConfig();

    initialTimeLimit = parseInt(document.getElementById('timeLimit').value);
    initialTimeLimit = Math.floor(initialTimeLimit * cfg.timeMultiplier);
    timeLeft = initialTimeLimit;
    streakCount = 0;
    pointsEarned = 0;
    player1Points = 0;
    player2Points = 0;
    player1Words = 0;
    player2Words = 0;
    currentPlayer = 1;
    powerUps = { freeze: 0, double: 0, skip: 0, letterPick: 0 };
    doublePointsActive = false;
    timerFrozen = false;
    letterPickActive = false;
    letterPickLetter = '';

    // Read custom min word length
    const minLenInput = document.getElementById('minWordLength');
    if (minLenInput) {
        const val = parseInt(minLenInput.value) || 1;
        customMinWordLength = Math.max(1, Math.min(45, val));
    }

    // UI transitions
    document.getElementById('playerRegistration').style.display = 'none';
    document.getElementById('gameArea').style.display = 'block';

    if (gameMode === 'pvp' || gameMode === 'botvsbot') {
        document.getElementById('playerDisplay').textContent = `${playerName} vs ${player2Name}`;
        document.getElementById('pvpScoreboard').style.display = 'flex';
        document.getElementById('p1Name').textContent = playerName;
        document.getElementById('p2Name').textContent = player2Name;
        document.getElementById('p1Score').textContent = '0';
        document.getElementById('p2Score').textContent = '0';
        document.getElementById('currentTurnDisplay').style.display = 'block';
        document.getElementById('currentTurnName').textContent = playerName;
        document.getElementById('hintButton').style.display = 'none';
        document.getElementById('powerUpsBar').style.display = 'none';
        if (gameMode === 'botvsbot') {
            document.getElementById('wordInput').disabled = true;
            document.getElementById('submitButton').disabled = true;
            document.getElementById('wordInput').placeholder = '🤖 Bots are playing...';
        }
    } else {
        document.getElementById('playerDisplay').textContent = playerName;
        document.getElementById('pvpScoreboard').style.display = 'none';
        document.getElementById('currentTurnDisplay').style.display = 'none';
        document.getElementById('hintButton').style.display = '';
        document.getElementById('powerUpsBar').style.display = 'flex';
    }

    document.getElementById('streakDisplay').textContent = 0;
    document.getElementById('pointsDisplay').textContent = 0;
    document.getElementById('highScoreDisplay').textContent = highScore;
    document.getElementById('correctWordsCount').textContent = 0;

    // Difficulty badge
    const badge = document.getElementById('difficultyBadge');
    badge.textContent = `${cfg.icon} ${cfg.label}`;
    badge.style.background = cfg.color;
    badge.style.color = cfg.color === '#facc15' ? '#1a1a2e' : '#fff';

    // Hint label
    const hintBtn = document.getElementById('hintButton');
    hintBtn.textContent = cfg.hintCost === 0 ? '💡 Hint (Free)' : `💡 Hint (${cfg.hintCostLabel})`;

    resetGameState();
    startTimer();
    updateUsedWordsDisplay();

    // Start bot auto-play if botvsbot
    if (gameMode === 'botvsbot') {
        startBotGame();
    }
    updatePowerUpUI();
}

// ═══════════════════════════════════════════════════════════════════════════════
// BOT vs BOT AUTO-PLAY
// ═══════════════════════════════════════════════════════════════════════════════

async function startBotGame() {
    // Pick a random starting letter for the first move
    // Set active bot for player 1's first turn
    selectedBot = selectedBot1;
    const startLetter = String.fromCharCode(97 + Math.floor(Math.random() * 26));
    showMessage(`🤖 ${playerName} starts — looking for a word starting with '${startLetter.toUpperCase()}'...`, 'info');

    const firstWord = await getQbitWord(startLetter);
    if (!firstWord) {
        showMessage(`🤖 ${playerName} couldn't find a starting word! Trying again...`, 'warning');
        // Try again with another letter
        botTurnTimeout = setTimeout(() => startBotGame(), 1000);
        return;
    }

    // Process the first word
    processBotWord(firstWord);

    // Schedule next bot's turn
    botTurnTimeout = setTimeout(() => playBotTurn(), botSpeed);
}

async function playBotTurn() {
    if (!gameActive) return;

    // Set active bot for this turn
    selectedBot = currentPlayer === 1 ? selectedBot1 : selectedBot2;
    const currentBotName = currentPlayer === 1 ? playerName : player2Name;
    let startLetter = lastWord[lastWord.length - 1];
    let chainBroken = false;

    // AI Chain-Break Logic (same as Qbit turn in vs-Qbit mode)
    if (getDiffConfig().qbitStrategy === 'balanced') {
        const currentVariance = calculateVariance(letterFreqTracker.freq);
        const totalWords = letterFreqTracker.freq.reduce((s, v) => s + v, 0);
        const varianceThreshold = 0.3;

        if (totalWords >= 4 && currentVariance > varianceThreshold) {
            const breakChance = Math.min(0.6, 0.2 + (currentVariance - varianceThreshold) * 0.15);
            if (Math.random() < breakChance) {
                const aiLetter = letterFreqTracker.getRecommendedLetter();
                if (aiLetter !== startLetter) {
                    console.log(`🧠 Bot chain-break! Variance=${currentVariance.toFixed(3)}, switching '${startLetter}' → '${aiLetter}'`);
                    startLetter = aiLetter;
                    chainBroken = true;
                }
            }
        }
    }

    if (chainBroken) {
        showMessage(`🧠 ${currentBotName} detected imbalance! Switching to '<strong>${startLetter.toUpperCase()}</strong>'... <div class="loading"></div>`, 'info', true);
    } else {
        showMessage(`🤖 ${currentBotName} is thinking... <div class="loading"></div>`, 'info', true);
    }

    const word = await getQbitWord(startLetter);

    if (!gameActive) return; // Game may have ended while fetching

    if (!word) {
        // This bot can't find a word — other bot wins
        const winner = currentPlayer === 1 ? player2Name : playerName;
        showMessage(`🎉 ${currentBotName} couldn't find a word — ${winner} wins!`, 'success');
        gameActive = false;
        clearInterval(timerInterval);
        playWinSound();
        launchConfetti(4000, 1);
        document.getElementById('wordInput').disabled = false;
        showEndGameButtons();
        return;
    }

    processBotWord(word);

    // Schedule next turn
    botTurnTimeout = setTimeout(() => playBotTurn(), botSpeed);
}

function processBotWord(word) {
    const currentBotName = currentPlayer === 1 ? playerName : player2Name;

    playCorrectSound();
    totalCorrectWords++;
    document.getElementById('correctWordsCount').textContent = totalCorrectWords;
    letterFreqTracker.recordLetter(word[0]);
    renderFreqChart();
    // Markov learning from bot-vs-bot words
    qbitLearn(word, 'bot');

    const wordPoints = calculatePoints(word);
    pointsEarned += wordPoints;
    streakCount++;

    // Update per-player scores
    if (currentPlayer === 1) {
        player1Points += wordPoints;
        player1Words++;
        document.getElementById('p1Score').textContent = player1Points;
    } else {
        player2Points += wordPoints;
        player2Words++;
        document.getElementById('p2Score').textContent = player2Points;
    }

    lastWord = word;
    usedWords.add(word);
    gameHistory.push({ player: currentBotName, word, points: wordPoints });
    updateHistory();
    updateUsedWordsDisplay();

    // Streak bonus
    if (streakCount >= 3) {
        const streakBonus = Math.floor(wordPoints * 0.5);
        pointsEarned += streakBonus;
        if (currentPlayer === 1) player1Points += streakBonus;
        else player2Points += streakBonus;
        playStreakSound();
        showMessage(`🤖 ${currentBotName}: <strong>${word}</strong> +${wordPoints} pts (+${streakBonus} streak bonus) 🔥`, 'success', true);
    } else {
        showMessage(`🤖 ${currentBotName}: <strong>${word}</strong> +${wordPoints} pts ✓`, 'success', true);
    }

    document.getElementById('streakDisplay').textContent = streakCount;
    document.getElementById('pointsDisplay').textContent = pointsEarned;

    // Switch players
    currentPlayer = currentPlayer === 1 ? 2 : 1;
    const nextName = currentPlayer === 1 ? playerName : player2Name;
    document.getElementById('currentTurnName').textContent = nextName;

    // Update PvP scores display
    document.getElementById('p1Score').textContent = player1Points;
    document.getElementById('p2Score').textContent = player2Points;

    resetTimer();
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIMER
// ═══════════════════════════════════════════════════════════════════════════════

function startTimer() {
    timeLeft = initialTimeLimit;
    gameActive = true;
    updateTimerDisplay();

    timerInterval = setInterval(() => {
        if (!timerFrozen) {
            timeLeft--;
            updateTimerDisplay();
            // Tick sound when < 5s
            if (timeLeft <= 5 && timeLeft > 0) playTickSound();
            if (timeLeft <= 0) handleTimeout();
        }
    }, 1000);
}

function updateTimerDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const timeString = minutes > 0 ? `${minutes}m ${seconds.toString().padStart(2, '0')}s` : `${seconds}s`;

    const timerEl = document.getElementById('timer');
    timerEl.textContent = timeString;

    const pct = timeLeft / initialTimeLimit;
    let cls = 'timer-value';
    if (timerFrozen) cls += ' timer-frozen';
    else if (pct > 0.5) cls += ' timer-ok';
    else if (pct > 0.2) cls += ' timer-warning';
    else cls += ' timer-danger';
    timerEl.className = cls;
}

function handleTimeout() {
    clearInterval(timerInterval);
    gameActive = false;
    playLoseSound();

    // Clear bot auto-play
    if (botTurnTimeout) { clearTimeout(botTurnTimeout); botTurnTimeout = null; }

    if (gameMode === 'botvsbot') {
        const winner = player1Points >= player2Points ? playerName : player2Name;
        const loser = player1Points >= player2Points ? player2Name : playerName;
        const winScore = Math.max(player1Points, player2Points);
        const loseScore = Math.min(player1Points, player2Points);
        if (player1Points === player2Points) {
            showMessage(`⏰ Time's up! It's a draw! Both scored ${player1Points} pts`, 'info');
        } else {
            showMessage(`⏰ Time's up! ${winner} wins with ${winScore} pts vs ${loseScore} pts!`, 'success');
        }
        launchConfetti(3000, 0.7);
        document.getElementById('wordInput').disabled = false;
    } else if (gameMode === 'pvp') {
        const loser = currentPlayer === 1 ? playerName : player2Name;
        const winner = currentPlayer === 1 ? player2Name : playerName;
        showMessage(`⏰ Time's up! ${loser} ran out of time — ${winner} wins!`, 'error');
        updateStatsAfterGame(false);
        launchConfetti(2000, 0.5);
    } else {
        showMessage("⏰ Time's up! Qbit wins!", 'error');
        // RL: reward the bot for winning (opponent timed out)
        if (selectedBot === 'qbit_v03' && lastWord) {
            qbitRL.onOpponentFailed(lastWord[lastWord.length - 1]);
            qbitRL.onGameEnd(true);
        }
        updateStatsAfterGame(false);
        saveToLeaderboard(playerName, pointsEarned, getDiffConfig().label, totalCorrectWords);
    }

    document.getElementById('submitButton').disabled = true;
    document.getElementById('hintButton').disabled = true;
    showEndGameButtons();
}

function resetTimer() {
    timeLeft = initialTimeLimit;
    updateTimerDisplay();
    if (timerInterval) clearInterval(timerInterval);
    if (freezeTimeout) { clearTimeout(freezeTimeout); timerFrozen = false; }
    startTimer();
}

// ═══════════════════════════════════════════════════════════════════════════════
// USED WORDS DISPLAY (clickable for definitions)
// ═══════════════════════════════════════════════════════════════════════════════

function updateUsedWordsDisplay() {
    const el = document.getElementById('usedWords');
    if (usedWords.size === 0) {
        el.innerHTML = '<span class="empty-state">No words used yet</span>';
        return;
    }
    el.innerHTML = '';
    Array.from(usedWords).forEach(w => {
        const tag = document.createElement('span');
        tag.className = 'word-tag';
        tag.textContent = w;
        tag.title = 'Click for definition';
        tag.addEventListener('click', (e) => {
            e.stopPropagation();
            showDefinition(w, tag);
        });
        el.appendChild(tag);
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// WORD VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

async function checkWordExists(word) {
    try {
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
        return response.ok;
    } catch (error) {
        console.error('Error checking word:', error);
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LETTER FREQUENCY CHART
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Render the a–z letter frequency bar chart from the tracker.
 * Builds pure-CSS bars dynamically — no external chart library needed.
 */
function renderFreqChart() {
    const container = document.getElementById('freqChart');
    if (!container) return;

    const dist = letterFreqTracker.getDistribution();
    const maxCount = Math.max(...dist.map(d => d.count), 1); // avoid /0

    container.innerHTML = '';

    dist.forEach(({ letter, count }) => {
        const col = document.createElement('div');
        col.className = 'freq-bar-col';

        // Count label above bar
        const countEl = document.createElement('div');
        countEl.className = 'freq-bar-count';
        countEl.textContent = count > 0 ? count : '';

        // Bar
        const bar = document.createElement('div');
        bar.className = 'freq-bar';
        const pct = (count / maxCount) * 100;
        bar.style.height = count > 0 ? `${Math.max(pct, 4)}%` : '0%';
        if (count === maxCount && count > 0) bar.classList.add('freq-bar-max');
        if (count === 0) bar.classList.add('freq-bar-zero');
        bar.title = `${letter.toUpperCase()}: ${count}`;

        // Letter label below bar
        const label = document.createElement('div');
        label.className = 'freq-bar-label';
        label.textContent = letter;

        col.appendChild(countEl);
        col.appendChild(bar);
        col.appendChild(label);
        container.appendChild(col);
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// QBIT WORD (difficulty-aware)
// ═══════════════════════════════════════════════════════════════════════════════

async function getQbitWord(lastLetter) {
    const cfg = getDiffConfig();
    const effectiveMinLen = Math.max(cfg.minWordLength, customMinWordLength);

    // ── Qbit v0.2 Weighted Greedy strategy ──────────────────────────────
    if (selectedBot === 'qbit_v02') {
        const greedyWord = qbitWeightedGreedy.selectWord(lastLetter, usedWords, effectiveMinLen, qbitMarkov);
        if (greedyWord) {
            console.log(`⚡ Qbit v0.2: Weighted Greedy selected "${greedyWord}" (${lastLetter} → ${greedyWord[greedyWord.length - 1]})`);
            return greedyWord;
        }
        console.log(`⚡ Qbit v0.2: No match for '${lastLetter}' — giving up`);
        return null;
    }

    // ── Qbit v0.3 Reinforcement Learning strategy ──────────────────────
    if (selectedBot === 'qbit_v03') {
        const rlWord = qbitRL.selectWord(lastLetter, usedWords, effectiveMinLen, qbitMarkov);
        if (rlWord) {
            console.log(`🎯 Qbit v0.3: RL selected "${rlWord}" (${lastLetter} → ${rlWord[rlWord.length - 1]}, ε=${qbitRL.epsilon.toFixed(3)})`);
            return rlWord;
        }
        console.log(`🎯 Qbit v0.3: No RL match for '${lastLetter}' — giving up`);
        return null;
    }

    // ── Qbit v0.1 Markov strategy ──────────────────────────────────────
    if (selectedBot === 'qbit_v01') {
        // Try Markov word bank first
        const markovWord = qbitMarkov.selectWord(lastLetter, usedWords, effectiveMinLen);
        if (markovWord) {
            console.log(`🧠 Qbit v0.1: Markov selected "${markovWord}" (${lastLetter} → ${markovWord[markovWord.length - 1]})`);
            return markovWord;
        }
        // No Markov match — Qbit v0.1 loses (returns null, no API fallback)
        console.log(`🧠 Qbit v0.1: No Markov match for '${lastLetter}' — giving up`);
        return null;
    }

    // ── Classic Datamuse strategy ───────────────────────────────────────
    try {
        let response = await fetch(`https://api.datamuse.com/words?sp=${lastLetter}*&max=${cfg.qbitPoolSize}`);
        let data = await response.json();
        let possibleWords = data
            .map(item => item.word.toLowerCase())
            .filter(word => !usedWords.has(word) && /^[a-z]+$/.test(word));

        // Enforce min word length for Qbit too
        if (effectiveMinLen > 1) {
            possibleWords = possibleWords.filter(word => word.length >= effectiveMinLen);
        }

        // Broader retry if the initial pool was too small
        if (possibleWords.length === 0 && cfg.qbitPoolSize < 200) {
            console.log(`🔄 Datamuse: No results with max=${cfg.qbitPoolSize}, retrying with max=200`);
            response = await fetch(`https://api.datamuse.com/words?sp=${lastLetter}*&max=200`);
            data = await response.json();
            possibleWords = data
                .map(item => item.word.toLowerCase())
                .filter(word => !usedWords.has(word) && /^[a-z]+$/.test(word));
            if (effectiveMinLen > 1) {
                possibleWords = possibleWords.filter(word => word.length >= effectiveMinLen);
            }
        }

        if (possibleWords.length === 0) return null;



        switch (cfg.qbitStrategy) {
            case 'random':
                return possibleWords[Math.floor(Math.random() * possibleWords.length)];
            case 'longest':
                possibleWords.sort((a, b) => b.length - a.length);
                return possibleWords[0];
            case 'balanced':
                const strategicWord = letterFreqTracker.selectStrategicWord(possibleWords);
                if (strategicWord) {
                    console.log(`🧠 AI Balanced: chose "${strategicWord}" (ends with '${strategicWord[strategicWord.length - 1]}')`);
                    console.log('📊 Frequency distribution:', letterFreqTracker.getDistribution().filter(d => d.count > 0));
                }
                return strategicWord;
            case 'first':
            default:
                return possibleWords[0];
        }
    } catch (error) {
        console.error('Error fetching Qbit word:', error);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUBMIT WORD
// ═══════════════════════════════════════════════════════════════════════════════

async function submitWord() {
    if (isProcessing || !gameActive) return;

    const input = document.getElementById('wordInput');
    const submitButton = document.getElementById('submitButton');
    const word = input.value.trim().toLowerCase();
    input.value = '';

    if (!word) { showMessage('Please enter a word!', 'warning'); return; }

    const cfg = getDiffConfig();

    const effectiveMinLen = Math.max(cfg.minWordLength, customMinWordLength);
    if (word.length < effectiveMinLen) {
        showMessage(`Words must be at least ${effectiveMinLen} letters long!`, 'warning');
        playWrongSound();
        return;
    }

    if (usedWords.has(word)) {
        showMessage('That word has already been used!', 'warning');
        playWrongSound();
        return;
    }

    if (lastWord) {
        const lastLetter = lastWord[lastWord.length - 1];
        if (word[0] !== lastLetter) {
            showMessage(`Your word must start with '${lastLetter.toUpperCase()}'!`, 'warning');
            playWrongSound();
            if (cfg.resetStreakOnInvalid) {
                streakCount = 0;
                document.getElementById('streakDisplay').textContent = streakCount;
            }
            return;
        }
    }

    isProcessing = true;
    submitButton.disabled = true;
    showMessage('Checking word... <div class="loading"></div>', 'info', true);

    const wordExists = await checkWordExists(word);
    if (!wordExists) {
        showMessage("Not a valid word! Try again.", 'error');
        playWrongSound();
        if (cfg.resetStreakOnInvalid) {
            streakCount = 0;
            document.getElementById('streakDisplay').textContent = streakCount;
        }
        isProcessing = false;
        submitButton.disabled = false;
        return;
    }

    // Valid word!
    playCorrectSound();
    totalCorrectWords++;
    document.getElementById('correctWordsCount').textContent = totalCorrectWords;
    // Track player's starting letter for AI frequency balancing
    letterFreqTracker.recordLetter(word[0]);
    renderFreqChart();
    // Markov learning — gated by training source setting
    qbitLearn(word, 'user');

    const wordPoints = calculatePoints(word);
    pointsEarned += wordPoints;
    streakCount++;

    // PvP scoring
    if (gameMode === 'pvp') {
        if (currentPlayer === 1) {
            player1Points += wordPoints;
            player1Words++;
            document.getElementById('p1Score').textContent = player1Points;
        } else {
            player2Points += wordPoints;
            player2Words++;
            document.getElementById('p2Score').textContent = player2Points;
        }
    }

    lastWord = word;
    usedWords.add(word);
    const currentName = gameMode === 'pvp' ? (currentPlayer === 1 ? playerName : player2Name) : playerName;
    gameHistory.push({ player: currentName, word, points: wordPoints });
    updateHistory();
    updateUsedWordsDisplay();

    // Streak bonus
    if (streakCount >= 3) {
        const streakBonus = Math.floor(wordPoints * 0.5);
        pointsEarned += streakBonus;
        if (gameMode === 'pvp') {
            if (currentPlayer === 1) player1Points += streakBonus;
            else player2Points += streakBonus;
        }
        playStreakSound();
        showMessage(`+${wordPoints} pts (+${streakBonus} streak bonus) 🔥`, 'success');
    } else {
        showMessage(`+${wordPoints} pts ✓`, 'success');
    }

    // High score (solo mode)
    if (gameMode === 'qbit' && pointsEarned > highScore) {
        highScore = pointsEarned;
        localStorage.setItem('wordChainHighScore', highScore);
        document.getElementById('highScoreDisplay').textContent = highScore;
    }

    document.getElementById('streakDisplay').textContent = streakCount;
    document.getElementById('pointsDisplay').textContent = pointsEarned;

    checkAchievements(word);
    checkPowerUpEarning();
    resetTimer();

    if (gameMode === 'pvp') {
        // Switch players
        currentPlayer = currentPlayer === 1 ? 2 : 1;
        const nextName = currentPlayer === 1 ? playerName : player2Name;
        document.getElementById('currentTurnName').textContent = nextName;
        const lastLetter = word[word.length - 1].toUpperCase();
        input.placeholder = `${nextName}: word starting with '${lastLetter}'...`;
        input.focus();
        isProcessing = false;
        submitButton.disabled = false;
    } else {
        // Check if Letter Pick is active
        let qbitStartLetter = word[word.length - 1];
        let chainBroken = false;

        if (letterPickActive && letterPickLetter) {
            qbitStartLetter = letterPickLetter;
            showMessage(`🔤 Qbit must start with '${qbitStartLetter.toUpperCase()}'! Thinking... <div class="loading"></div>`, 'info', true);
            letterPickActive = false;
            letterPickLetter = '';
            updatePowerUpUI();
        } else if (getDiffConfig().qbitStrategy === 'balanced') {
            // ── AI Chain-Break Logic ──────────────────────────────────────
            // When frequency imbalance is high, Qbit may override the normal
            // chain rule and pick a low-frequency letter to restore balance.
            //
            // How it works:
            //   1. Compute current variance of the letter frequency distribution
            //   2. If variance > threshold, there's a chance Qbit breaks the chain
            //   3. The break probability scales with imbalance severity
            //   4. The new letter is chosen via the AI's softmax-weighted selection
            // ──────────────────────────────────────────────────────────────
            const currentVariance = calculateVariance(letterFreqTracker.freq);
            const totalWords = letterFreqTracker.freq.reduce((s, v) => s + v, 0);

            // Only consider chain-break after at least 4 words have been played
            // and when variance exceeds a meaningful threshold
            const varianceThreshold = 0.3;
            if (totalWords >= 4 && currentVariance > varianceThreshold) {
                // Break probability scales from 20% to 60% as imbalance grows
                const breakChance = Math.min(0.6, 0.2 + (currentVariance - varianceThreshold) * 0.15);

                if (Math.random() < breakChance) {
                    const aiLetter = letterFreqTracker.getRecommendedLetter();
                    // Only break if AI recommends a different letter
                    if (aiLetter !== qbitStartLetter) {
                        console.log(`🧠 Chain-break! Variance=${currentVariance.toFixed(3)}, switching '${qbitStartLetter}' → '${aiLetter}'`);
                        qbitStartLetter = aiLetter;
                        chainBroken = true;
                    }
                }
            }

            if (chainBroken) {
                showMessage(`🧠 Qbit detected imbalance! Switching to '<strong>${qbitStartLetter.toUpperCase()}</strong>'... <div class="loading"></div>`, 'info', true);
            } else {
                showMessage('Qbit is thinking... <div class="loading"></div>', 'info', true);
            }
        } else {
            showMessage('Qbit is thinking... <div class="loading"></div>', 'info', true);
        }
        const qbitWord = await getQbitWord(qbitStartLetter);
        handleQbitTurn(qbitWord);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HINT
// ═══════════════════════════════════════════════════════════════════════════════

async function getHint() {
    if (!lastWord || !gameActive || gameMode === 'pvp') return;

    const cfg = getDiffConfig();
    const lastLetter = lastWord[lastWord.length - 1];

    try {
        const response = await fetch(`https://api.datamuse.com/words?sp=${lastLetter}*&max=10`);
        const data = await response.json();
        const hints = data
            .map(item => item.word)
            .filter(word => !usedWords.has(word) && word.length >= Math.max(cfg.minWordLength, customMinWordLength))
            .slice(0, 3);

        if (hints.length > 0) {
            showMessage(`💡 Try: ${hints.join(', ')}`, 'info');
            pointsEarned = Math.max(0, pointsEarned - cfg.hintCost);
            document.getElementById('pointsDisplay').textContent = pointsEarned;
        } else {
            showMessage('No hints available!', 'warning');
        }
    } catch {
        showMessage('Could not fetch hints.', 'error');
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACHIEVEMENTS
// ═══════════════════════════════════════════════════════════════════════════════

const achievements = {
    'Vocabulary Master': { description: 'Use a word longer than 8 letters', earned: false, icon: '📖' },
    'Streak Master': { description: 'Maintain a 5-word streak', earned: false, icon: '🔥' },
    'Century Club': { description: 'Earn 100+ points', earned: false, icon: '💯' },
    'Power Player': { description: 'Use all 3 power-up types', earned: false, icon: '⚡' },
    'Word Collector': { description: 'Use 20 words in one game', earned: false, icon: '📚' }
};

const powerUpsUsed = { freeze: false, double: false, skip: false };

function checkAchievements(word) {
    if (!achievements['Vocabulary Master'].earned && word.length > 8) unlockAchievement('Vocabulary Master');
    if (!achievements['Streak Master'].earned && streakCount >= 5) unlockAchievement('Streak Master');
    if (!achievements['Century Club'].earned && pointsEarned >= 100) unlockAchievement('Century Club');
    if (!achievements['Word Collector'].earned && totalCorrectWords >= 20) unlockAchievement('Word Collector');
    if (!achievements['Power Player'].earned && powerUpsUsed.freeze && powerUpsUsed.double && powerUpsUsed.skip) {
        unlockAchievement('Power Player');
    }
}

function unlockAchievement(name) {
    achievements[name].earned = true;
    playAchievementSound();
    showToast(`${achievements[name].icon} Achievement: ${name}!`, 'achievement');
    launchConfetti(1500, 0.4);
}

// ═══════════════════════════════════════════════════════════════════════════════
// QBIT TURN
// ═══════════════════════════════════════════════════════════════════════════════

function handleQbitTurn(qbitWord) {
    const wordInput = document.getElementById('wordInput');
    const submitButton = document.getElementById('submitButton');

    if (qbitWord) {
        lastWord = qbitWord;
        usedWords.add(qbitWord);
        const qbitLabel = selectedBot === 'qbit_v03' ? 'Qbit v0.3' : selectedBot === 'qbit_v02' ? 'Qbit v0.2' : selectedBot === 'qbit_v01' ? 'Qbit v0.1' : 'Qbit';
        gameHistory.push({ player: qbitLabel, word: qbitWord, points: 0 });
        // Track Qbit's starting letter for AI frequency balancing
        letterFreqTracker.recordLetter(qbitWord[0]);
        renderFreqChart();
        // Markov learning — gated by training source setting
        qbitLearn(qbitWord, 'bot');
        playQbitSound();

        // RL reward: bot successfully played a word
        if (selectedBot === 'qbit_v03') {
            const endChar = qbitWord[qbitWord.length - 1];
            const opponentOptions = (qbitMarkov.wordBank[endChar] || []).length;
            qbitRL.onWordPlayed(qbitWord[0], endChar, opponentOptions);
        }

        showMessage(`🤖 ${qbitLabel} plays: <strong>${qbitWord}</strong>`, 'qbit');
        updateUsedWordsDisplay();
        resetTimer();

        const lastLetter = qbitWord[qbitWord.length - 1].toUpperCase();
        wordInput.placeholder = `Word starting with '${lastLetter}'...`;
        wordInput.focus();
    } else {
        // Player wins
        const qbitLabel = selectedBot === 'qbit_v03' ? 'Qbit v0.3' : selectedBot === 'qbit_v02' ? 'Qbit v0.2' : selectedBot === 'qbit_v01' ? 'Qbit v0.1' : 'Qbit';
        showMessage(`🎉 ${qbitLabel} couldn't find a word — You win!`, 'success');

        // RL: penalize the bot for failing
        if (selectedBot === 'qbit_v03' && lastWord) {
            qbitRL.onBotFailed(lastWord[lastWord.length - 1]);
            qbitRL.onGameEnd(false);
        }
        gameActive = false;
        clearInterval(timerInterval);
        playWinSound();
        launchConfetti(4000, 1);
        updateStatsAfterGame(true);
        saveToLeaderboard(playerName, pointsEarned, getDiffConfig().label, totalCorrectWords);
        showEndGameButtons();
        wordInput.placeholder = 'Game Over!';
    }

    updateHistory();
    isProcessing = false;
    submitButton.disabled = false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HISTORY
// ═══════════════════════════════════════════════════════════════════════════════

function updateHistory() {
    const historyEl = document.getElementById('history');
    if (gameHistory.length === 0) {
        historyEl.innerHTML = '<span class="empty-state">Game history will appear here</span>';
        return;
    }
    historyEl.innerHTML = gameHistory.map(entry => {
        const isQbit = entry.player === 'Qbit';
        const pts = entry.points > 0 ? ` <span class="pts-tag">+${entry.points}</span>` : '';
        return `<div class="history-entry ${isQbit ? 'qbit-entry' : 'player-entry'}">
            <span class="history-name">${entry.player}</span>
            <span class="history-word">${entry.word}</span>${pts}
        </div>`;
    }).join('');
    historyEl.scrollTop = historyEl.scrollHeight;
}

// ═══════════════════════════════════════════════════════════════════════════════
// END GAME
// ═══════════════════════════════════════════════════════════════════════════════

function showEndGameButtons() {
    document.getElementById('endGameActions').style.display = 'flex';
}

function resetGame() {
    document.getElementById('playerRegistration').style.display = 'block';
    document.getElementById('gameArea').style.display = 'none';
    document.getElementById('endGameActions').style.display = 'none';
    resetGameState();
    renderLeaderboard();
    renderStats();
}

function resetGameState() {
    gameHistory = [];
    usedWords = new Set();
    // Reset RL per-game transient state
    qbitRL.resetGameState();
    lastWord = '';
    isProcessing = false;
    totalCorrectWords = 0;
    // Reset AI letter frequency tracker for fresh game
    letterFreqTracker.reset();
    renderFreqChart();
    powerUps = { freeze: 0, double: 0, skip: 0, letterPick: 0 };
    doublePointsActive = false;
    timerFrozen = false;
    letterPickActive = false;
    letterPickLetter = '';
    if (freezeTimeout) clearTimeout(freezeTimeout);
    if (botTurnTimeout) { clearTimeout(botTurnTimeout); botTurnTimeout = null; }

    // Remove any letter pick modal
    document.querySelectorAll('.letter-pick-overlay').forEach(e => e.remove());

    // Reset achievements for next game
    Object.keys(achievements).forEach(k => achievements[k].earned = false);

    document.getElementById('correctWordsCount').textContent = '0';
    updateHistory();
    updateUsedWordsDisplay();
    document.getElementById('message').textContent = '';
    document.getElementById('message').className = 'message';
    document.getElementById('wordInput').value = '';
    document.getElementById('wordInput').placeholder = 'Enter a word...';
    document.getElementById('endGameActions').style.display = 'none';
    document.getElementById('submitButton').disabled = false;
    document.getElementById('hintButton').disabled = false;
    document.getElementById('pvpScoreboard').style.display = 'none';
    document.getElementById('currentTurnDisplay').style.display = 'none';

    // Remove any tooltips/confetti
    document.querySelectorAll('.def-tooltip, #confettiCanvas').forEach(e => e.remove());

    window.scrollTo(0, 0);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

// ═══════════════════════════════════════════════════════════════════════════════
// UI HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function showMessage(html, type = 'info', isRaw = false) {
    const el = document.getElementById('message');
    el.innerHTML = html;
    el.className = `message msg-${type}`;
}

function showToast(text, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = text;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-visible'));
    setTimeout(() => {
        toast.classList.remove('toast-visible');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PDF
// ═══════════════════════════════════════════════════════════════════════════════

async function generatePDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Show loading toast
    showToast('Generating PDF with definitions...', 'info');

    // Fetch definitions for all words that aren't cached yet
    const allWords = gameHistory.map(e => e.word);
    const uncachedWords = allWords.filter(w => !definitionCache[w]);
    await Promise.all(uncachedWords.map(async (word) => {
        try {
            const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
            if (res.ok) {
                const data = await res.json();
                const meanings = data[0]?.meanings || [];
                if (meanings.length > 0) {
                    const m = meanings[0];
                    const partOfSpeech = m.partOfSpeech || '';
                    const def = m.definitions?.[0]?.definition || 'No definition found';
                    definitionCache[word] = `(${partOfSpeech}) ${def}`;
                } else {
                    definitionCache[word] = 'No definition found';
                }
            } else {
                definitionCache[word] = 'Definition not available';
            }
        } catch {
            definitionCache[word] = 'Could not load definition';
        }
    }));

    // Title
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Word Chain Game - Match Summary', 20, 20);

    // Game info
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Player: ${playerName}`, 20, 32);
    doc.text(`Difficulty: ${getDiffConfig().label}`, 20, 40);
    doc.text(`Points: ${pointsEarned}`, 20, 48);
    doc.text(`Correct Words: ${totalCorrectWords}`, 120, 48);
    if (customMinWordLength > 1) {
        doc.text(`Min Word Length: ${customMinWordLength}`, 20, 56);
    }

    if (gameMode === 'pvp') {
        doc.text(`${playerName}: ${player1Points} pts | ${player2Name}: ${player2Points} pts`, 20, 64);
    }

    // Word entries with definitions
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    let y = gameMode === 'pvp' ? 78 : (customMinWordLength > 1 ? 70 : 62);
    doc.text('Words Played:', 20, y);
    y += 10;

    doc.setFont('helvetica', 'normal');
    gameHistory.forEach((entry, i) => {
        if (y > 270) { doc.addPage(); y = 20; }

        // Word line
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        const pts = entry.points > 0 ? ` (+${entry.points} pts)` : '';
        doc.text(`${i + 1}. ${entry.player}: ${entry.word}${pts}`, 20, y);
        y += 6;

        // Definition line
        const def = definitionCache[entry.word] || 'Definition not available';
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(100, 100, 100);
        // Wrap long definitions
        const defLines = doc.splitTextToSize(`   ${def}`, 165);
        doc.text(defLines, 24, y);
        y += defLines.length * 5 + 4;
        doc.setTextColor(0, 0, 0);
    });

    const fileName = playerName.replace(/\s/g, '-').toLowerCase();
    doc.save(`${fileName}-wordchain.pdf`);
    showToast('PDF downloaded!', 'success');
}

// ═══════════════════════════════════════════════════════════════════════════════
// DIFFICULTY PREVIEW
// ═══════════════════════════════════════════════════════════════════════════════

function updateDifficultyPreview() {
    const sel = document.getElementById('difficulty');
    const cfg = DIFFICULTY_CONFIG[sel.value];
    const preview = document.getElementById('difficultyPreview');
    if (preview) {
        preview.innerHTML = `<span style="color:${cfg.color}">${cfg.icon} ${cfg.description}</span>`;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// QBIT BRAIN — Transition Matrix & Word Bank Visualization
// ═══════════════════════════════════════════════════════════════════════════════

function renderQbitBrain() {
    const stats = qbitMarkov.getStats();
    const matrix = qbitMarkov.matrix;
    const wordBank = qbitMarkov.wordBank;

    // ── Stats summary ──
    const brainStatsEl = document.getElementById('brainStats');
    if (brainStatsEl) {
        brainStatsEl.innerHTML = `
            <div class="brain-stats-grid">
                <div class="brain-stat">
                    <div class="brain-stat-value">${stats.totalWords}</div>
                    <div class="brain-stat-label">Words</div>
                </div>
                <div class="brain-stat">
                    <div class="brain-stat-value">${stats.totalTransitions}</div>
                    <div class="brain-stat-label">Transitions</div>
                </div>
                <div class="brain-stat">
                    <div class="brain-stat-value">${stats.topTransitions.length > 0 ? stats.topTransitions[0].from + '→' + stats.topTransitions[0].to : '—'}</div>
                    <div class="brain-stat-label">Top Pair</div>
                </div>
            </div>
        `;
    }

    // ── 2D Transition Matrix Heatmap ──
    const matrixContainer = document.getElementById('matrixContainer');
    if (matrixContainer) {
        // Find max value for color scaling
        let maxVal = 0;
        for (let i = 0; i < 26; i++) {
            for (let j = 0; j < 26; j++) {
                if (matrix[i][j] > maxVal) maxVal = matrix[i][j];
            }
        }

        if (maxVal === 0) {
            matrixContainer.innerHTML = '<span class="empty-state">No data yet — play some games!</span>';
        } else {
            let html = '<table class="matrix-table">';

            // Header row — ending letters
            html += '<thead><tr><th class="matrix-corner">↘</th>';
            for (let j = 0; j < 26; j++) {
                html += `<th class="matrix-header">${String.fromCharCode(65 + j)}</th>`;
            }
            html += '</tr></thead><tbody>';

            // Data rows
            for (let i = 0; i < 26; i++) {
                const firstLetter = String.fromCharCode(65 + i);
                html += `<tr><th class="matrix-row-header">${firstLetter}</th>`;
                for (let j = 0; j < 26; j++) {
                    const val = matrix[i][j];
                    const intensity = maxVal > 0 ? val / maxVal : 0;
                    const lastLetter = String.fromCharCode(97 + j);
                    const title = `${firstLetter.toLowerCase()}→${lastLetter}: ${val}`;

                    let cellClass = 'matrix-cell';
                    let bg = '';
                    if (val > 0) {
                        // Color gradient: low=deep blue/purple → high=bright cyan
                        const hue = 220 + (180 * intensity); // 220 (blue) → 400 (wraps to ~40 warm)
                        const sat = 60 + (30 * intensity);
                        const light = 15 + (45 * intensity);
                        const alpha = 0.3 + (0.7 * intensity);
                        bg = `background: hsla(${hue % 360}, ${sat}%, ${light}%, ${alpha});`;
                        if (intensity > 0.8) cellClass += ' matrix-cell-hot';
                    }

                    html += `<td class="${cellClass}" style="${bg}" title="${title}">${val > 0 ? val : ''}</td>`;
                }
                html += '</tr>';
            }

            html += '</tbody></table>';
            matrixContainer.innerHTML = html;
        }
    }

    // ── Word Bank ──
    const wordBankContainer = document.getElementById('wordBankContainer');
    const wordBankCount = document.getElementById('wordBankCount');
    if (wordBankContainer) {
        let totalWords = 0;
        let html = '';

        for (let i = 0; i < 26; i++) {
            const key = String.fromCharCode(97 + i);
            const words = wordBank[key] || [];
            if (words.length === 0) continue;
            totalWords += words.length;

            html += `<div class="wordbank-group">`;
            html += `<div class="wordbank-letter">${key.toUpperCase()} <span class="wordbank-letter-count">(${words.length})</span></div>`;
            html += `<div class="wordbank-words">`;
            words.forEach(w => {
                html += `<span class="wordbank-word">${w}</span>`;
            });
            html += `</div></div>`;
        }

        if (totalWords === 0) {
            wordBankContainer.innerHTML = '<span class="empty-state">No words learned yet</span>';
        } else {
            wordBankContainer.innerHTML = html;
        }

        if (wordBankCount) {
            wordBankCount.textContent = totalWords > 0 ? `(${totalWords} words)` : '';
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// QBIT v0.2 BRAIN — Weighted Greedy Scoring Visualization
// ═══════════════════════════════════════════════════════════════════════════════

function renderQbitV02Brain() {
    const matrix = qbitMarkov.matrix;
    const wordBank = qbitMarkov.wordBank;
    const stats = qbitMarkov.getStats();
    const wg = qbitWeightedGreedy;

    // ── Stats summary ──
    const statsEl = document.getElementById('v02BrainStats');
    if (statsEl) {
        statsEl.innerHTML = `
            <div class="brain-stats-grid">
                <div class="brain-stat">
                    <div class="brain-stat-value">${stats.totalWords}</div>
                    <div class="brain-stat-label">Words</div>
                </div>
                <div class="brain-stat">
                    <div class="brain-stat-value">${stats.totalTransitions}</div>
                    <div class="brain-stat-label">Transitions</div>
                </div>
                <div class="brain-stat">
                    <div class="brain-stat-value">Greedy</div>
                    <div class="brain-stat-label">Strategy</div>
                </div>
            </div>
        `;
    }

    // ── Weight Configuration ──
    const weightsEl = document.getElementById('v02WeightsDisplay');
    if (weightsEl) {
        weightsEl.innerHTML = `
            <div class="brain-stat">
                <div class="brain-stat-value" style="color:#f472b6">${(wg.w1 * 100).toFixed(0)}%</div>
                <div class="brain-stat-label">Rarity</div>
            </div>
            <div class="brain-stat">
                <div class="brain-stat-value" style="color:#60a5fa">${(wg.w2 * 100).toFixed(0)}%</div>
                <div class="brain-stat-label">Difficulty</div>
            </div>
            <div class="brain-stat">
                <div class="brain-stat-value" style="color:#4ade80">${(wg.w3 * 100).toFixed(0)}%</div>
                <div class="brain-stat-label">Random</div>
            </div>
        `;
    }

    // ── Scoring Simulation (top 3 picks per letter) ──
    const container = document.getElementById('v02ScoringContainer');
    if (!container) return;

    if (stats.totalWords === 0) {
        container.innerHTML = '<span class="empty-state">No data yet — play some games!</span>';
        return;
    }

    let html = '';
    for (let i = 0; i < 26; i++) {
        const letter = String.fromCharCode(97 + i);
        const available = (wordBank[letter] || []).filter(w => /^[a-z]+$/.test(w));
        if (available.length === 0) continue;

        const row = matrix[i];
        const rowTotal = row.reduce((s, v) => s + v, 0);

        // Score each word
        const scored = available.map(word => {
            const lastChar = word[word.length - 1];
            const lastIdx = lastChar.charCodeAt(0) - 97;
            const count = row[lastIdx] || 0;
            const probability = rowTotal > 0 ? count / rowTotal : 0;
            const rarityScore = 1 / (probability + 0.01);
            const opponentOptions = (wordBank[lastChar] || []).length;
            const difficultyScore = 1 / (opponentOptions + 1);
            const finalScore = (wg.w1 * rarityScore) + (wg.w2 * difficultyScore);
            return { word, rarityScore, difficultyScore, finalScore, probability, opponentOptions };
        });

        scored.sort((a, b) => b.finalScore - a.finalScore);
        const top3 = scored.slice(0, 3);

        html += `<div class="wordbank-group">`;
        html += `<div class="wordbank-letter">${letter.toUpperCase()} <span class="wordbank-letter-count">(${available.length} words)</span></div>`;
        html += `<div class="v02-scoring-list">`;
        top3.forEach((item, rank) => {
            const barWidth = scored[0].finalScore > 0 ? (item.finalScore / scored[0].finalScore) * 100 : 0;
            html += `<div class="v02-score-item">`;
            html += `<div class="v02-score-rank">${rank + 1}</div>`;
            html += `<div class="v02-score-details">`;
            html += `<div class="v02-score-word">${item.word}</div>`;
            html += `<div class="v02-score-bar-bg"><div class="v02-score-bar" style="width:${barWidth}%"></div></div>`;
            html += `<div class="v02-score-breakdown">`;
            html += `<span class="v02-tag v02-tag-rarity" title="Rarity score">R:${item.rarityScore.toFixed(1)}</span>`;
            html += `<span class="v02-tag v02-tag-diff" title="Difficulty (opponent options: ${item.opponentOptions})">D:${item.difficultyScore.toFixed(2)}</span>`;
            html += `<span class="v02-tag v02-tag-score" title="Final score (excl. random)">= ${item.finalScore.toFixed(2)}</span>`;
            html += `</div></div></div>`;
        });
        html += `</div></div>`;
    }

    container.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════════════════════
// QBIT v0.3 BRAIN — Reinforcement Learning Q-Table Visualization
// ═══════════════════════════════════════════════════════════════════════════════

function renderQbitV03Brain() {
    const stats = qbitRL.getStats();
    const qTable = qbitRL.getQTable();

    // ── Stats summary ──
    const statsEl = document.getElementById('v03BrainStats');
    if (statsEl) {
        const explorationPct = (stats.epsilon * 100).toFixed(1);
        const exploitPct = (100 - stats.epsilon * 100).toFixed(1);
        statsEl.innerHTML = `
            <div class="brain-stats-grid">
                <div class="brain-stat">
                    <div class="brain-stat-value">${stats.episodes}</div>
                    <div class="brain-stat-label">Episodes</div>
                </div>
                <div class="brain-stat">
                    <div class="brain-stat-value">${stats.avgReward.toFixed(1)}</div>
                    <div class="brain-stat-label">Avg Reward</div>
                </div>
                <div class="brain-stat">
                    <div class="brain-stat-value">${stats.learnedPairs}</div>
                    <div class="brain-stat-label">Learned Pairs</div>
                </div>
                <div class="brain-stat">
                    <div class="brain-stat-value rl-explore-value">
                        <div class="rl-epsilon-bar">
                            <div class="rl-epsilon-fill" style="width:${exploitPct}%"></div>
                        </div>
                        <span>${explorationPct}%</span>
                    </div>
                    <div class="brain-stat-label">Exploration (ε)</div>
                </div>
            </div>
        `;
    }

    // ── Hyperparameters ──
    const hyperEl = document.getElementById('v03HyperParams');
    if (hyperEl) {
        hyperEl.innerHTML = `
            <div class="brain-stat">
                <div class="brain-stat-value" style="color:#fb923c">α = ${stats.alpha}</div>
                <div class="brain-stat-label">Learning Rate</div>
            </div>
            <div class="brain-stat">
                <div class="brain-stat-value" style="color:#a78bfa">γ = ${stats.gamma}</div>
                <div class="brain-stat-label">Discount Factor</div>
            </div>
            <div class="brain-stat">
                <div class="brain-stat-value" style="color:#22d3ee">ε = ${stats.epsilon.toFixed(4)}</div>
                <div class="brain-stat-label">Exploration Rate</div>
            </div>
        `;
    }

    // ── Q-Table Heatmap ──
    const qtContainer = document.getElementById('v03QTableContainer');
    if (qtContainer) {
        // Find max absolute value for color scaling
        let maxAbs = 0;
        for (let i = 0; i < 26; i++) {
            for (let j = 0; j < 26; j++) {
                const abs = Math.abs(qTable[i][j]);
                if (abs > maxAbs) maxAbs = abs;
            }
        }

        if (maxAbs === 0) {
            qtContainer.innerHTML = '<span class="empty-state">No Q-values yet — play some games with v0.3!</span>';
        } else {
            let html = '<table class="matrix-table rl-qtable">';

            // Header row — action (ending letters)
            html += '<thead><tr><th class="matrix-corner">S\\A</th>';
            for (let j = 0; j < 26; j++) {
                html += `<th class="matrix-header">${String.fromCharCode(65 + j)}</th>`;
            }
            html += '</tr></thead><tbody>';

            // Data rows
            for (let i = 0; i < 26; i++) {
                const stateLetter = String.fromCharCode(65 + i);
                html += `<tr><th class="matrix-row-header">${stateLetter}</th>`;
                for (let j = 0; j < 26; j++) {
                    const val = qTable[i][j];
                    const actionLetter = String.fromCharCode(97 + j);
                    const title = `Q(${stateLetter.toLowerCase()}→${actionLetter}) = ${val.toFixed(3)}`;

                    let cellClass = 'matrix-cell';
                    let bg = '';
                    if (val !== 0) {
                        const intensity = Math.abs(val) / maxAbs;
                        if (val > 0) {
                            // Positive: green-teal gradient
                            const hue = 140 + (30 * intensity);
                            const sat = 50 + (40 * intensity);
                            const light = 15 + (35 * intensity);
                            const alpha = 0.3 + (0.7 * intensity);
                            bg = `background: hsla(${hue}, ${sat}%, ${light}%, ${alpha});`;
                            if (intensity > 0.8) cellClass += ' rl-cell-hot';
                        } else {
                            // Negative: red-orange gradient
                            const hue = 0 + (20 * intensity);
                            const sat = 50 + (40 * intensity);
                            const light = 15 + (30 * intensity);
                            const alpha = 0.3 + (0.7 * intensity);
                            bg = `background: hsla(${hue}, ${sat}%, ${light}%, ${alpha});`;
                            if (intensity > 0.8) cellClass += ' rl-cell-cold';
                        }
                    }

                    const display = val !== 0 ? val.toFixed(1) : '';
                    html += `<td class="${cellClass}" style="${bg}" title="${title}">${display}</td>`;
                }
                html += '</tr>';
            }

            html += '</tbody></table>';
            qtContainer.innerHTML = html;
        }
    }

    // ── Top Strategic Pairs ──
    const topPairsEl = document.getElementById('v03TopPairs');
    if (topPairsEl) {
        if (stats.topPairs.length === 0) {
            topPairsEl.innerHTML = '<span class="empty-state">No strategic data yet</span>';
        } else {
            let html = '<div class="rl-pairs-grid">';

            // Best moves
            html += '<div class="rl-pairs-section">';
            html += '<div class="rl-pairs-title rl-good">🏆 Best Moves</div>';
            stats.topPairs.forEach((pair, i) => {
                const barWidth = stats.maxQ > 0 ? (pair.qValue / stats.maxQ) * 100 : 0;
                html += `<div class="rl-pair-item">`;
                html += `<div class="rl-pair-rank">${i + 1}</div>`;
                html += `<div class="rl-pair-info">`;
                html += `<div class="rl-pair-label">${pair.from.toUpperCase()} → ${pair.to.toUpperCase()}</div>`;
                html += `<div class="rl-pair-bar-bg"><div class="rl-pair-bar rl-bar-good" style="width:${Math.max(barWidth, 4)}%"></div></div>`;
                html += `<div class="rl-pair-qval">Q = ${pair.qValue.toFixed(3)}</div>`;
                html += `</div></div>`;
            });
            html += '</div>';

            // Worst moves
            if (stats.worstPairs.length > 0 && stats.worstPairs[0].qValue < 0) {
                html += '<div class="rl-pairs-section">';
                html += '<div class="rl-pairs-title rl-bad">⚠️ Avoid Moves</div>';
                stats.worstPairs.filter(p => p.qValue < 0).forEach((pair, i) => {
                    const barWidth = stats.minQ < 0 ? (Math.abs(pair.qValue) / Math.abs(stats.minQ)) * 100 : 0;
                    html += `<div class="rl-pair-item">`;
                    html += `<div class="rl-pair-rank rl-rank-bad">${i + 1}</div>`;
                    html += `<div class="rl-pair-info">`;
                    html += `<div class="rl-pair-label">${pair.from.toUpperCase()} → ${pair.to.toUpperCase()}</div>`;
                    html += `<div class="rl-pair-bar-bg"><div class="rl-pair-bar rl-bar-bad" style="width:${Math.max(barWidth, 4)}%"></div></div>`;
                    html += `<div class="rl-pair-qval rl-qval-bad">Q = ${pair.qValue.toFixed(3)}</div>`;
                    html += `</div></div>`;
                });
                html += '</div>';
            }

            html += '</div>';
            topPairsEl.innerHTML = html;
        }
    }

    // ── Reward History Chart ──
    const chartEl = document.getElementById('v03RewardChart');
    if (chartEl) {
        const history = qbitRL.rewardHistory;
        if (history.length === 0) {
            chartEl.innerHTML = '<span class="empty-state">No episodes yet</span>';
        } else {
            const maxReward = Math.max(...history.map(Math.abs), 1);
            let html = '<div class="rl-chart-bars">';
            history.forEach((reward, i) => {
                const pct = (Math.abs(reward) / maxReward) * 100;
                const isPositive = reward >= 0;
                const barClass = isPositive ? 'rl-chart-bar-pos' : 'rl-chart-bar-neg';
                html += `<div class="rl-chart-col" title="Episode ${i + 1}: ${reward.toFixed(1)}">`;
                html += `<div class="rl-chart-bar ${barClass}" style="height:${Math.max(pct, 3)}%"></div>`;
                html += `</div>`;
            });
            html += '</div>';
            html += `<div class="rl-chart-labels">`;
            html += `<span>Episode 1</span>`;
            html += `<span>Episode ${history.length}</span>`;
            html += `</div>`;
            chartEl.innerHTML = html;
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TABS (leaderboard / stats / qbit brain)
// ═══════════════════════════════════════════════════════════════════════════════

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.style.display = panel.id === `${tabName}Panel` ? 'block' : 'none';
    });
    // Render brain panel on demand
    if (tabName === 'qbitBrain') {
        renderQbitBrain();
    }
    if (tabName === 'qbitV02Brain') {
        renderQbitV02Brain();
    }
    if (tabName === 'qbitV03Brain') {
        renderQbitV03Brain();
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    // Enter key handlers
    document.getElementById('wordInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); submitWord(); }
    });
    document.getElementById('playerName').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); startGame(); }
    });

    // Difficulty preview
    const diffSelect = document.getElementById('difficulty');
    diffSelect.addEventListener('change', updateDifficultyPreview);
    updateDifficultyPreview();

    // Mute button init
    const muteBtn = document.getElementById('muteBtn');
    if (muteBtn) {
        muteBtn.textContent = soundMuted ? '🔇' : '🔊';
        muteBtn.title = soundMuted ? 'Unmute' : 'Mute';
    }

    // Mode tabs
    document.querySelectorAll('.mode-tab').forEach(tab => {
        tab.addEventListener('click', () => setGameMode(tab.dataset.mode));
    });

    // Bot selector
    const botSelector = document.getElementById('botSelector');
    if (botSelector) {
        botSelector.addEventListener('change', () => setSelectedBot(botSelector.value));
        setSelectedBot(botSelector.value);
    }

    // Training source selector
    const trainingSel = document.getElementById('trainingSource');
    if (trainingSel) {
        // Restore persisted value
        trainingSel.value = qbitTrainingSource;
        setTrainingSource(qbitTrainingSource);
        trainingSel.addEventListener('change', () => setTrainingSource(trainingSel.value));
    }

    // Tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Render leaderboard & stats
    renderLeaderboard();
    renderStats();

    // Mobile viewport height
    function setVH() {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    }
    setVH();
    window.addEventListener('resize', setVH);
    window.addEventListener('orientationchange', () => setTimeout(setVH, 150));
});