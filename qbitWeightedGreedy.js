// ═══════════════════════════════════════════════════════════════════════════════
// QBIT v0.2 — Weighted Greedy Strategy Bot
// ═══════════════════════════════════════════════════════════════════════════════
//
// Reuses the QbitMarkov word bank and transition matrix, but applies a
// Weighted Greedy scoring formula to select the best word.
//
// Scoring formula per candidate word:
//   probability   = count / total
//   rarityScore   = 1 / (probability + 0.01)
//   difficultyScore = 1 / (opponentOptions + 1)
//   randomScore   = Math.random() * 0.1
//
//   score = (w1 * rarityScore) + (w2 * difficultyScore) + (w3 * randomScore)
//
//   Weights: w1 = 0.6 (rarity), w2 = 0.35 (difficulty), w3 = 0.05 (randomness)
//
// The word with the highest score is selected.
// ═══════════════════════════════════════════════════════════════════════════════

class QbitWeightedGreedy {
    constructor() {
        // Weights
        this.w1 = 0.6;   // rarity
        this.w2 = 0.35;  // difficulty
        this.w3 = 0.05;  // randomness
    }

    /**
     * Select a word using the Weighted Greedy strategy.
     *
     * @param {string} startLetter — Required starting letter (a–z)
     * @param {Set<string>} usedWords — Words already used this game
     * @param {number} minLength — Minimum word length
     * @param {QbitMarkov} markov — Shared QbitMarkov instance (matrix + wordBank)
     * @returns {string|null} The highest-scoring word, or null if none found
     */
    selectWord(startLetter, usedWords, minLength, markov) {
        const letter = startLetter.toLowerCase();
        const rowIndex = letter.charCodeAt(0) - 97;
        if (rowIndex < 0 || rowIndex >= 26) return null;

        // Get available words from the shared word bank
        const available = (markov.wordBank[letter] || [])
            .filter(w => !usedWords.has(w) && w.length >= minLength && /^[a-z]+$/.test(w));

        if (available.length === 0) return null;

        // Get transition row for this starting letter
        const row = markov.matrix[rowIndex];
        const rowTotal = row.reduce((s, v) => s + v, 0);

        // If no transition data, fall back to random
        if (rowTotal === 0) {
            return available[Math.floor(Math.random() * available.length)];
        }

        // Score every candidate word
        let bestWord = null;
        let bestScore = -Infinity;

        for (const word of available) {
            const lastChar = word[word.length - 1];
            const lastIndex = lastChar.charCodeAt(0) - 97;

            // --- Probability & Rarity ---
            const count = row[lastIndex] || 0;
            const probability = count / rowTotal;
            const rarityScore = 1 / (probability + 0.01);

            // --- Difficulty (how few options opponent gets) ---
            const opponentOptions = (markov.wordBank[lastChar] || []).length;
            const difficultyScore = 1 / (opponentOptions + 1);

            // --- Randomness ---
            const randomScore = Math.random() * 0.1;

            // --- Final weighted score ---
            const score =
                (this.w1 * rarityScore) +
                (this.w2 * difficultyScore) +
                (this.w3 * randomScore);

            if (score > bestScore) {
                bestScore = score;
                bestWord = word;
            }
        }

        return bestWord;
    }
}
