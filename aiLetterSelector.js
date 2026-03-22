// ═══════════════════════════════════════════════════════════════════════════════
// AI LETTER SELECTOR — Variance-Minimized Softmax
// ═══════════════════════════════════════════════════════════════════════════════
//
// Uses letter frequency tracking + variance minimization + softmax probability
// to select the most balanced next letter with smooth randomness.
//
// Math overview:
//   1. Track how many times each letter (a–z) has been the starting letter.
//   2. For each candidate letter, simulate incrementing its count and compute
//      the resulting population variance across all 26 bins.
//   3. Lower variance = more uniform distribution = better balance.
//   4. Convert negative variances into probabilities via softmax, so letters
//      that reduce imbalance are exponentially more likely to be chosen.
//   5. Temperature controls exploration vs exploitation:
//        - Low temp (→0) = nearly deterministic (pick the best balancer)
//        - High temp (→∞) = nearly uniform random
//        - Default 0.5 = smooth game-like unpredictability
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate population variance of a frequency array.
 *
 * Variance measures how spread out the letter counts are.
 * A variance of 0 means perfectly uniform distribution (ideal balance).
 *
 *   mean = Σ freq[i] / N
 *   variance = Σ (freq[i] - mean)² / N
 *
 * @param {number[]} freq — Array of 26 letter frequencies
 * @returns {number} Population variance
 */
const calculateVariance = (freq) => {
    const n = freq.length;
    // Sum all frequencies to compute the mean
    const total = freq.reduce((sum, val) => sum + val, 0);
    const mean = total / n;

    // Sum of squared deviations from the mean
    const sumSquaredDiff = freq.reduce((sum, val) => {
        const diff = val - mean;
        return sum + diff * diff;
    }, 0);

    // Population variance (divide by N, not N-1, since we have the full population)
    return sumSquaredDiff / n;
};

/**
 * Numerically stable softmax function.
 *
 * Converts an array of real-valued scores into a probability distribution.
 *
 * Stability trick: subtract max(scores) before exponentiation to prevent
 * overflow (e^large → Inf). This doesn't change the result because:
 *   softmax(x - c) = softmax(x) for any constant c.
 *
 * Temperature controls the "sharpness" of the distribution:
 *   - temp → 0: all probability mass on the highest score (greedy)
 *   - temp → ∞: uniform distribution (pure random)
 *   - temp = 0.5: moderate smoothing — strong preference but not deterministic
 *
 * @param {number[]} scores — Raw scores (higher = more preferred)
 * @param {number} temperature — Smoothing parameter (default: 0.5)
 * @returns {number[]} Probability distribution (sums to 1)
 */
const softmax = (scores, temperature = 0.5) => {
    if (scores.length === 0) return [];

    // Guard against division by zero or negative temperature
    const temp = Math.max(temperature, 1e-8);

    // Scale scores by temperature
    const scaled = scores.map(s => s / temp);

    // Numerical stability: subtract the maximum value before exp()
    // This prevents exp(large_number) = Infinity
    const maxScaled = Math.max(...scaled);
    const exps = scaled.map(s => Math.exp(s - maxScaled));

    // Normalize so probabilities sum to 1
    const sumExps = exps.reduce((sum, val) => sum + val, 0);
    return exps.map(e => e / sumExps);
};

/**
 * Select the next letter using variance-minimized softmax sampling.
 *
 * Algorithm:
 *   1. For each letter i (0–25):
 *      a. Create a temporary copy of freq with freq[i] incremented by 1
 *      b. Compute the variance of this hypothetical distribution
 *      c. Store this as the "balance cost" for letter i
 *   2. Negate the variances to get scores (lower variance → higher score)
 *   3. Apply softmax to convert scores into a probability distribution
 *   4. Sample a letter from the distribution using a uniform random number
 *
 * Why negate? Softmax assigns higher probability to higher scores.
 * We want letters that REDUCE variance to have HIGHER probability,
 * so we use score = -variance.
 *
 * @param {number[]} freq — Current letter frequency array (length 26)
 * @returns {string} Selected letter (a–z)
 */
const selectNextLetter = (freq) => {
    const scores = [];

    for (let i = 0; i < 26; i++) {
        // Simulate choosing letter i: temporarily increment its frequency
        const tempFreq = [...freq];
        tempFreq[i] += 1;

        // Compute variance of the hypothetical distribution
        const variance = calculateVariance(tempFreq);

        // Negate variance: lower variance → higher score → higher probability
        scores.push(-variance);
    }

    // Convert balance scores into probabilities via softmax (temperature = 0.5)
    const probabilities = softmax(scores, 0.5);

    // Weighted random sampling using cumulative distribution function (CDF)
    // Generate a uniform random number in [0, 1) and find which letter it maps to
    const rand = Math.random();
    let cumulative = 0;

    for (let i = 0; i < 26; i++) {
        cumulative += probabilities[i];
        if (rand < cumulative) {
            return String.fromCharCode(97 + i); // 97 = 'a'
        }
    }

    // Fallback — should never reach here due to floating-point, but just in case
    return 'a';
};

/**
 * Select a random word from a dictionary that starts with the given letter.
 *
 * @param {string[]} dictionary — Array of words
 * @param {string} letter — Starting letter to filter by (a–z)
 * @returns {string|null} A random matching word, or null if none found
 */
const selectWord = (dictionary, letter) => {
    const matching = dictionary.filter(
        word => word.length > 0 && word[0].toLowerCase() === letter.toLowerCase()
    );

    if (matching.length === 0) return null;

    // Uniform random selection among matching words
    return matching[Math.floor(Math.random() * matching.length)];
};

// ═══════════════════════════════════════════════════════════════════════════════
// LETTER FREQUENCY TRACKER — Game-level state manager
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Tracks the frequency of starting letters throughout a game session
 * and provides AI-recommended letter selection.
 *
 * Usage:
 *   const tracker = new LetterFrequencyTracker();
 *   tracker.recordLetter('h');           // After "hello" is played
 *   tracker.recordLetter('o');           // After "orange" is played
 *   const next = tracker.getRecommendedLetter();  // AI picks the best next letter
 *   tracker.reset();                     // New game
 */
class LetterFrequencyTracker {
    constructor() {
        // 26 bins for a–z, all initialized to zero
        this.freq = new Array(26).fill(0);
    }

    /**
     * Record that a word starting with the given letter was played.
     * @param {string} letter — Single character a–z (case-insensitive)
     */
    recordLetter(letter) {
        const index = letter.toLowerCase().charCodeAt(0) - 97;
        if (index >= 0 && index < 26) {
            this.freq[index]++;
        }
    }

    /**
     * Get the AI-recommended next letter based on current frequency distribution.
     * Uses variance minimization + softmax sampling.
     * @returns {string} Recommended letter (a–z)
     */
    getRecommendedLetter() {
        return selectNextLetter(this.freq);
    }

    /**
     * Select the best word from a list based on which ending letter
     * would best balance the frequency distribution.
     *
     * For each candidate word, we check what its last letter is (which becomes
     * the next required starting letter), simulate that letter being added to
     * the frequency distribution, and pick the word whose ending letter creates
     * the lowest variance (most balanced outcome).
     *
     * When multiple words share the same best ending letter, one is chosen
     * at random using softmax-weighted probabilities for smooth selection.
     *
     * @param {string[]} words — Array of candidate words
     * @returns {string|null} The strategically best word, or null if empty
     */
    selectStrategicWord(words) {
        if (!words || words.length === 0) return null;
        if (words.length === 1) return words[0];

        // For each word, compute the variance that would result from its ending letter
        const scores = words.map(word => {
            const endLetter = word[word.length - 1].toLowerCase();
            const endIndex = endLetter.charCodeAt(0) - 97;

            // Simulate: if this word is played, its ending letter becomes the
            // next starting letter, so increment that frequency
            const tempFreq = [...this.freq];
            if (endIndex >= 0 && endIndex < 26) {
                tempFreq[endIndex] += 1;
            }

            // Lower variance = better balance → negate for softmax
            return -calculateVariance(tempFreq);
        });

        // Apply softmax to get probability distribution over words
        const probabilities = softmax(scores, 0.5);

        // Weighted random sampling
        const rand = Math.random();
        let cumulative = 0;

        for (let i = 0; i < words.length; i++) {
            cumulative += probabilities[i];
            if (rand < cumulative) {
                return words[i];
            }
        }

        // Fallback
        return words[words.length - 1];
    }

    /**
     * Get a snapshot of the current frequency distribution for debugging/display.
     * @returns {{ letter: string, count: number }[]}
     */
    getDistribution() {
        return this.freq.map((count, i) => ({
            letter: String.fromCharCode(97 + i),
            count
        }));
    }

    /**
     * Reset all frequencies to zero for a new game.
     */
    reset() {
        this.freq.fill(0);
    }
}
