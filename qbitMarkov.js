// ═══════════════════════════════════════════════════════════════════════════════
// QBIT v0.1 — First-Order Markov Chain Learning Bot
// ═══════════════════════════════════════════════════════════════════════════════
//
// Learns from every word played across all game modes.
// Uses a 26×26 transition matrix (first_letter → last_letter) and a
// greedy minimum probability selection strategy.
//
// Strategy overview:
//   Given starting letter `s`, look at matrix row `s` to get transition counts.
//   Convert counts to probabilities and pick the ending letter `e` with the
//   LOWEST probability — i.e., the transition the opponent is least prepared for.
//   Then retrieve a word from the word bank (or API fallback) that starts with
//   `s` and ends with `e`.
//
// Persistence:
//   - Matrix → localStorage key 'qbitMarkovMatrix'
//   - Word bank → localStorage key 'qbitWordBank'
// ═══════════════════════════════════════════════════════════════════════════════

class QbitMarkov {
    constructor() {
        // 26×26 matrix: matrix[i][j] = count of words with first letter i, last letter j
        this.matrix = this._createEmptyMatrix();
        // Word bank: { 'a': ['apple', 'axe', ...], 'b': [...], ... }
        this.wordBank = {};
        for (let i = 0; i < 26; i++) {
            this.wordBank[String.fromCharCode(97 + i)] = [];
        }
        // Load persisted data
        this._load();
    }

    // ─── Core API ────────────────────────────────────────────────────────────

    /**
     * Learn from a word: update the Markov matrix and add to word bank.
     * Called after every valid word in any game mode.
     * @param {string} word — A valid word (lowercase, a–z only)
     */
    learn(word) {
        if (!word || word.length < 2) return;
        const w = word.toLowerCase();
        const first = w.charCodeAt(0) - 97;
        const last = w.charCodeAt(w.length - 1) - 97;

        if (first < 0 || first >= 26 || last < 0 || last >= 26) return;

        // Update transition matrix
        this.matrix[first][last]++;

        // Add to word bank (avoid duplicates)
        const key = w[0];
        if (!this.wordBank[key]) this.wordBank[key] = [];
        if (!this.wordBank[key].includes(w)) {
            this.wordBank[key].push(w);
        }

        this._save();
    }

    /**
     * Select a word using the greedy minimum probability strategy.
     *
     * @param {string} startLetter — Required starting letter (a–z)
     * @param {Set<string>} usedWords — Words already used this game
     * @param {number} minLength — Minimum word length
     * @returns {string|null} A word from the bank, or null if none found
     */
    selectWord(startLetter, usedWords, minLength = 1) {
        const letter = startLetter.toLowerCase();
        const rowIndex = letter.charCodeAt(0) - 97;
        if (rowIndex < 0 || rowIndex >= 26) return null;

        // Get the row for this starting letter
        const row = this.matrix[rowIndex];
        const rowTotal = row.reduce((s, v) => s + v, 0);

        // Get available words from the bank for this starting letter
        const available = (this.wordBank[letter] || [])
            .filter(w => !usedWords.has(w) && w.length >= minLength && /^[a-z]+$/.test(w));

        if (available.length === 0) return null;

        // If we have no transition data yet, pick randomly
        if (rowTotal === 0) {
            return available[Math.floor(Math.random() * available.length)];
        }

        // Compute probabilities for each ending letter
        const probabilities = row.map(count => (count + 1) / (rowTotal + 26));

        // Rank ending letters by ascending probability (greedy min)
        const ranked = [];
        for (let j = 0; j < 26; j++) {
            ranked.push({ index: j, prob: probabilities[j] });
        }
        ranked.sort((a, b) => a.prob - b.prob);

        // Try each ending letter, starting from lowest probability
        for (const { index } of ranked) {
            const endChar = String.fromCharCode(97 + index);
            const candidates = available.filter(w => w[w.length - 1] === endChar);
            if (candidates.length > 0) {
                // Pick a random word among candidates with this ending letter
                return candidates[Math.floor(Math.random() * candidates.length)];
            }
        }

        // Fallback: return any available word
        return available[Math.floor(Math.random() * available.length)];
    }

    /**
     * Get stats about the current Markov model for display/debugging.
     * @returns {{ totalTransitions: number, totalWords: number, topTransitions: Array }}
     */
    getStats() {
        let totalTransitions = 0;
        let totalWords = 0;
        const transitions = [];

        for (let i = 0; i < 26; i++) {
            for (let j = 0; j < 26; j++) {
                const count = this.matrix[i][j];
                if (count > 0) {
                    totalTransitions += count;
                    transitions.push({
                        from: String.fromCharCode(97 + i),
                        to: String.fromCharCode(97 + j),
                        count
                    });
                }
            }
        }

        for (const key in this.wordBank) {
            totalWords += this.wordBank[key].length;
        }

        // Top 10 transitions
        transitions.sort((a, b) => b.count - a.count);
        const topTransitions = transitions.slice(0, 10);

        return { totalTransitions, totalWords, topTransitions };
    }

    /**
     * Reset all learned data (matrix + word bank).
     */
    reset() {
        this.matrix = this._createEmptyMatrix();
        this.wordBank = {};
        for (let i = 0; i < 26; i++) {
            this.wordBank[String.fromCharCode(97 + i)] = [];
        }
        this._save();
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    _createEmptyMatrix() {
        const m = [];
        for (let i = 0; i < 26; i++) {
            m.push(new Array(26).fill(0));
        }
        return m;
    }

    _save() {
        try {
            localStorage.setItem('qbitMarkovMatrix', JSON.stringify(this.matrix));
            localStorage.setItem('qbitWordBank', JSON.stringify(this.wordBank));
        } catch (e) {
            console.warn('QbitMarkov: Could not save to localStorage', e);
        }
    }

    _load() {
        try {
            const matrixData = localStorage.getItem('qbitMarkovMatrix');
            if (matrixData) {
                const parsed = JSON.parse(matrixData);
                // Validate shape
                if (Array.isArray(parsed) && parsed.length === 26 &&
                    parsed.every(row => Array.isArray(row) && row.length === 26)) {
                    this.matrix = parsed;
                }
            }

            const bankData = localStorage.getItem('qbitWordBank');
            if (bankData) {
                const parsed = JSON.parse(bankData);
                if (typeof parsed === 'object' && parsed !== null) {
                    // Merge into default structure
                    for (let i = 0; i < 26; i++) {
                        const key = String.fromCharCode(97 + i);
                        if (Array.isArray(parsed[key])) {
                            this.wordBank[key] = parsed[key];
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('QbitMarkov: Could not load from localStorage', e);
        }
    }
}
