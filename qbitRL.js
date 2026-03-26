// ═══════════════════════════════════════════════════════════════════════════════
// QBIT v0.3 — Reinforcement Learning Bot (Tabular Q-Learning)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Learns optimal word-chain strategy through experience using Q-Learning.
//
// Model:
//   State  = starting letter the bot must play (a–z → 0–25)
//   Action = ending letter of the chosen word (a–z → 0–25)
//            (this becomes the opponent's required starting letter)
//
//   Q-table: 26 × 26 matrix of learned action-value estimates
//
// Q-Update (after each word):
//   Q[s,a] ← Q[s,a] + α * (reward + γ * max(Q[s',·]) - Q[s,a])
//
// Word Selection (ε-greedy):
//   With probability ε: explore (random valid action)
//   With probability 1-ε: exploit (highest Q-value action with available words)
//
// Reward signals:
//   +1.0  Bot plays a valid word successfully
//   +0.5  Difficulty bonus (opponent has few options from ending letter)
//   +2.0  Opponent fails to respond (bot wins)
//   -1.0  Bot fails to find a valid word (bot loses)
//
// Persistence:
//   Q-table → localStorage key 'qbitRLQTable'
//   Metadata → localStorage key 'qbitRLMeta'
// ═══════════════════════════════════════════════════════════════════════════════

class QbitRL {
    constructor() {
        // ─── Hyperparameters ─────────────────────────────────────────────
        this.alpha = 0.1;          // Learning rate
        this.gamma = 0.9;          // Discount factor
        this.epsilonStart = 0.3;   // Initial exploration rate
        this.epsilonMin = 0.05;    // Minimum exploration rate
        this.epsilonDecay = 0.995; // Decay per episode (game)

        // ─── State ──────────────────────────────────────────────────────
        this.qTable = this._createEmptyQTable();
        this.epsilon = this.epsilonStart;
        this.episodes = 0;         // Total games played
        this.totalReward = 0;      // Cumulative reward
        this.rewardHistory = [];   // Last N rewards per episode
        this.lastState = null;     // For delayed reward assignment
        this.lastAction = null;
        this.episodeReward = 0;    // Current episode's total reward

        // Load persisted data
        this._load();
    }

    // ─── Core API ────────────────────────────────────────────────────────────

    /**
     * Select a word using ε-greedy Q-table strategy.
     *
     * @param {string} startLetter — Required starting letter (a–z)
     * @param {Set<string>} usedWords — Words already used this game
     * @param {number} minLength — Minimum word length
     * @param {QbitMarkov} markov — Shared QbitMarkov instance (word bank)
     * @returns {string|null} Selected word, or null if none found
     */
    selectWord(startLetter, usedWords, minLength, markov) {
        const letter = startLetter.toLowerCase();
        const stateIndex = letter.charCodeAt(0) - 97;
        if (stateIndex < 0 || stateIndex >= 26) return null;

        // Get all available words for this starting letter
        const available = (markov.wordBank[letter] || [])
            .filter(w => !usedWords.has(w) && w.length >= minLength && /^[a-z]+$/.test(w));

        if (available.length === 0) return null;

        // Group words by their ending letter
        const wordsByEnd = {};
        for (const word of available) {
            const endChar = word[word.length - 1];
            if (!wordsByEnd[endChar]) wordsByEnd[endChar] = [];
            wordsByEnd[endChar].push(word);
        }

        const availableEndings = Object.keys(wordsByEnd);
        if (availableEndings.length === 0) return null;

        let chosenEnd;
        const isExploring = Math.random() < this.epsilon;

        if (isExploring) {
            // ── Explore: pick a random valid ending letter ────────────
            chosenEnd = availableEndings[Math.floor(Math.random() * availableEndings.length)];
        } else {
            // ── Exploit: pick the ending letter with highest Q-value ──
            const qRow = this.qTable[stateIndex];
            let bestQ = -Infinity;
            let bestEndings = [];

            for (const endChar of availableEndings) {
                const actionIndex = endChar.charCodeAt(0) - 97;
                const qVal = qRow[actionIndex];
                if (qVal > bestQ) {
                    bestQ = qVal;
                    bestEndings = [endChar];
                } else if (qVal === bestQ) {
                    bestEndings.push(endChar);
                }
            }

            // Break ties randomly
            chosenEnd = bestEndings[Math.floor(Math.random() * bestEndings.length)];
        }

        // Remember state-action for delayed reward
        this.lastState = stateIndex;
        this.lastAction = chosenEnd.charCodeAt(0) - 97;

        // Pick a word with the chosen ending letter
        // Prefer longer words (they earn more points)
        const candidates = wordsByEnd[chosenEnd];
        candidates.sort((a, b) => b.length - a.length);

        // Soft preference: 70% chance of picking the longest, else random
        if (candidates.length > 1 && Math.random() > 0.7) {
            return candidates[Math.floor(Math.random() * candidates.length)];
        }
        return candidates[0];
    }

    /**
     * Apply a Q-learning update step.
     *
     * @param {number} state — State index (0–25)
     * @param {number} action — Action index (0–25)
     * @param {number} reward — Immediate reward
     * @param {number|null} nextState — Next state index, or null if terminal
     */
    update(state, action, reward, nextState) {
        if (state < 0 || state >= 26 || action < 0 || action >= 26) return;

        const currentQ = this.qTable[state][action];

        // Max Q-value for the next state (0 if terminal)
        let maxNextQ = 0;
        if (nextState !== null && nextState >= 0 && nextState < 26) {
            maxNextQ = Math.max(...this.qTable[nextState]);
        }

        // Q-Learning update: Q(s,a) ← Q(s,a) + α[r + γ·maxQ(s',·) - Q(s,a)]
        const tdTarget = reward + this.gamma * maxNextQ;
        const tdError = tdTarget - currentQ;
        this.qTable[state][action] = currentQ + this.alpha * tdError;

        this.totalReward += reward;
        this.episodeReward += reward;
    }

    /**
     * Called after the bot successfully plays a word.
     *
     * @param {string} startLetter — The starting letter of the word played
     * @param {string} endLetter — The ending letter of the word played
     * @param {number} opponentOptions — Number of words in opponent's word bank for endLetter
     */
    onWordPlayed(startLetter, endLetter, opponentOptions) {
        const state = startLetter.toLowerCase().charCodeAt(0) - 97;
        const action = endLetter.toLowerCase().charCodeAt(0) - 97;
        const nextState = action; // Opponent's starting letter = bot's ending letter

        // Base reward: successfully played a word
        let reward = 1.0;

        // Difficulty bonus: fewer opponent options = better strategic move
        if (opponentOptions <= 3) {
            reward += 0.5;
        } else if (opponentOptions <= 1) {
            reward += 1.0;
        }

        this.update(state, action, reward, nextState);
        this._save();
    }

    /**
     * Called when the bot fails to find a word (loses).
     *
     * @param {string} startLetter — The letter the bot couldn't respond to
     */
    onBotFailed(startLetter) {
        const state = startLetter.toLowerCase().charCodeAt(0) - 97;

        // If we have a previous action that led to this failure, penalize it
        if (this.lastState !== null && this.lastAction !== null) {
            // The previous action's ending letter became this state
            // Penalize the previous (s,a) pair since it led to a bad outcome
            this.update(this.lastState, this.lastAction, -1.0, null);
        }

        this._save();
    }

    /**
     * Called when the opponent fails (bot wins because opponent has no word).
     *
     * @param {string} endLetter — The ending letter the bot chose that stumped the opponent
     */
    onOpponentFailed(endLetter) {
        // Reward the last action that forced the opponent into an impossible position
        if (this.lastState !== null && this.lastAction !== null) {
            this.update(this.lastState, this.lastAction, 2.0, null);
        }

        this._save();
    }

    /**
     * Called when a game ends. Decays exploration and saves episode stats.
     *
     * @param {boolean} won — Whether the bot won the game
     */
    onGameEnd(won) {
        this.episodes++;

        // Store episode reward
        this.rewardHistory.push(this.episodeReward);
        if (this.rewardHistory.length > 100) {
            this.rewardHistory.shift(); // Keep last 100
        }

        // Decay exploration rate
        this.epsilon = Math.max(this.epsilonMin, this.epsilon * this.epsilonDecay);

        // Reset per-episode state
        this.episodeReward = 0;
        this.lastState = null;
        this.lastAction = null;

        this._save();
    }

    /**
     * Reset per-game transient state (called at game start).
     */
    resetGameState() {
        this.lastState = null;
        this.lastAction = null;
        this.episodeReward = 0;
    }

    /**
     * Get statistics about the RL model for display.
     */
    getStats() {
        // Find top Q-value pairs
        const pairs = [];
        let maxQ = -Infinity;
        let minQ = Infinity;

        for (let i = 0; i < 26; i++) {
            for (let j = 0; j < 26; j++) {
                const val = this.qTable[i][j];
                if (val !== 0) {
                    pairs.push({
                        from: String.fromCharCode(97 + i),
                        to: String.fromCharCode(97 + j),
                        qValue: val
                    });
                }
                if (val > maxQ) maxQ = val;
                if (val < minQ) minQ = val;
            }
        }

        pairs.sort((a, b) => b.qValue - a.qValue);
        const topPairs = pairs.slice(0, 10);
        const worstPairs = pairs.slice(-5).reverse();

        // Average reward over recent episodes
        const avgReward = this.rewardHistory.length > 0
            ? this.rewardHistory.reduce((s, v) => s + v, 0) / this.rewardHistory.length
            : 0;

        return {
            episodes: this.episodes,
            epsilon: this.epsilon,
            alpha: this.alpha,
            gamma: this.gamma,
            totalReward: this.totalReward,
            avgReward: avgReward,
            topPairs,
            worstPairs,
            maxQ: maxQ === -Infinity ? 0 : maxQ,
            minQ: minQ === Infinity ? 0 : minQ,
            learnedPairs: pairs.length
        };
    }

    /**
     * Get the raw Q-table for heatmap rendering.
     * @returns {number[][]} 26×26 Q-table
     */
    getQTable() {
        return this.qTable;
    }

    /**
     * Reset all learned data.
     */
    reset() {
        this.qTable = this._createEmptyQTable();
        this.epsilon = this.epsilonStart;
        this.episodes = 0;
        this.totalReward = 0;
        this.rewardHistory = [];
        this.lastState = null;
        this.lastAction = null;
        this.episodeReward = 0;
        this._save();
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    _createEmptyQTable() {
        const table = [];
        for (let i = 0; i < 26; i++) {
            table.push(new Array(26).fill(0));
        }
        return table;
    }

    _save() {
        try {
            localStorage.setItem('qbitRLQTable', JSON.stringify(this.qTable));
            localStorage.setItem('qbitRLMeta', JSON.stringify({
                epsilon: this.epsilon,
                episodes: this.episodes,
                totalReward: this.totalReward,
                rewardHistory: this.rewardHistory
            }));
        } catch (e) {
            console.warn('QbitRL: Could not save to localStorage', e);
        }
    }

    _load() {
        try {
            const tableData = localStorage.getItem('qbitRLQTable');
            if (tableData) {
                const parsed = JSON.parse(tableData);
                if (Array.isArray(parsed) && parsed.length === 26 &&
                    parsed.every(row => Array.isArray(row) && row.length === 26)) {
                    this.qTable = parsed;
                }
            }

            const metaData = localStorage.getItem('qbitRLMeta');
            if (metaData) {
                const meta = JSON.parse(metaData);
                if (typeof meta.epsilon === 'number') this.epsilon = meta.epsilon;
                if (typeof meta.episodes === 'number') this.episodes = meta.episodes;
                if (typeof meta.totalReward === 'number') this.totalReward = meta.totalReward;
                if (Array.isArray(meta.rewardHistory)) this.rewardHistory = meta.rewardHistory;
            }
        } catch (e) {
            console.warn('QbitRL: Could not load from localStorage', e);
        }
    }
}
