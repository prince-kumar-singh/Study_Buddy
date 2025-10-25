import { calculateSpacedRepetition } from '../services/ai/chains/flashcard.chain';

describe('SM-2 Spaced Repetition Algorithm', () => {
  describe('Basic SM-2 Rules', () => {
    it('should set interval to 1 day for first successful review (quality >= 3)', () => {
      const result = calculateSpacedRepetition(3, 0, 1, 2.5);
      expect(result.repetitions).toBe(1);
      expect(result.interval).toBe(1);
      expect(result.easeFactor).toBeLessThanOrEqual(2.5);
    });

    it('should set interval to 6 days for second successful review', () => {
      const result = calculateSpacedRepetition(4, 1, 1, 2.5);
      expect(result.repetitions).toBe(2);
      expect(result.interval).toBe(6);
    });

    it('should multiply interval by ease factor after 2nd review', () => {
      const easeFactor = 2.5;
      const previousInterval = 6;
      const result = calculateSpacedRepetition(5, 2, previousInterval, easeFactor);
      
      expect(result.repetitions).toBe(3);
      expect(result.interval).toBe(Math.round(previousInterval * easeFactor)); // Should be 15
    });

    it('should reset repetitions to 0 for quality < 3', () => {
      const result = calculateSpacedRepetition(2, 5, 30, 2.5);
      expect(result.repetitions).toBe(0);
      expect(result.interval).toBe(1);
    });

    it('should enforce minimum ease factor of 1.3', () => {
      // Quality 0 severely reduces ease factor
      const result = calculateSpacedRepetition(0, 3, 10, 1.5);
      expect(result.easeFactor).toBeGreaterThanOrEqual(1.3);
    });
  });

  describe('Quality Rating Effects', () => {
    const initialRepetitions = 3;
    const initialInterval = 15;
    const initialEaseFactor = 2.5;

    it('quality 5 (perfect recall) should increase ease factor', () => {
      const result = calculateSpacedRepetition(5, initialRepetitions, initialInterval, initialEaseFactor);
      expect(result.easeFactor).toBeGreaterThan(initialEaseFactor);
      expect(result.repetitions).toBe(initialRepetitions + 1);
    });

    it('quality 4 (correct after hesitation) should slightly increase ease factor', () => {
      const result = calculateSpacedRepetition(4, initialRepetitions, initialInterval, initialEaseFactor);
      expect(result.easeFactor).toBeCloseTo(initialEaseFactor, 1);
      expect(result.repetitions).toBe(initialRepetitions + 1);
    });

    it('quality 3 (correct with difficulty) should slightly decrease ease factor', () => {
      const result = calculateSpacedRepetition(3, initialRepetitions, initialInterval, initialEaseFactor);
      expect(result.easeFactor).toBeLessThan(initialEaseFactor);
      expect(result.repetitions).toBe(initialRepetitions + 1);
    });

    it('quality 2 (incorrect but familiar) should reset progress', () => {
      const result = calculateSpacedRepetition(2, initialRepetitions, initialInterval, initialEaseFactor);
      expect(result.repetitions).toBe(0);
      expect(result.interval).toBe(1);
      expect(result.easeFactor).toBeLessThan(initialEaseFactor);
    });

    it('quality 1 (incorrect guess) should reset progress and lower ease factor', () => {
      const result = calculateSpacedRepetition(1, initialRepetitions, initialInterval, initialEaseFactor);
      expect(result.repetitions).toBe(0);
      expect(result.interval).toBe(1);
      expect(result.easeFactor).toBeLessThan(initialEaseFactor);
    });

    it('quality 0 (complete blackout) should reset and significantly lower ease factor', () => {
      const result = calculateSpacedRepetition(0, initialRepetitions, initialInterval, initialEaseFactor);
      expect(result.repetitions).toBe(0);
      expect(result.interval).toBe(1);
      expect(result.easeFactor).toBeLessThan(2.0);
      expect(result.easeFactor).toBeGreaterThanOrEqual(1.3);
    });
  });

  describe('Ease Factor Calculations', () => {
    it('should calculate ease factor using SM-2 formula', () => {
      // Formula: EF' = EF + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
      const quality = 4;
      const currentEF = 2.5;
      
      const result = calculateSpacedRepetition(quality, 2, 6, currentEF);
      
      // For quality 4: EF' = 2.5 + (0.1 - (5-4) * (0.08 + (5-4) * 0.02))
      //                    = 2.5 + (0.1 - 1 * (0.08 + 1 * 0.02))
      //                    = 2.5 + (0.1 - 0.1)
      //                    = 2.5
      expect(result.easeFactor).toBeCloseTo(2.5, 2);
    });

    it('should never allow ease factor below 1.3', () => {
      let easeFactor = 1.4;
      
      // Multiple poor reviews
      for (let i = 0; i < 10; i++) {
        const result = calculateSpacedRepetition(0, 0, 1, easeFactor);
        easeFactor = result.easeFactor;
      }
      
      expect(easeFactor).toBe(1.3);
    });
  });

  describe('Interval Progression', () => {
    it('should follow proper interval sequence: 1, 6, 15, 38, 95...', () => {
      let repetitions = 0;
      let interval = 1;
      let easeFactor = 2.5;

      // First review
      const review1 = calculateSpacedRepetition(5, repetitions, interval, easeFactor);
      expect(review1.interval).toBe(1);
      expect(review1.repetitions).toBe(1);

      // Second review
      const review2 = calculateSpacedRepetition(5, review1.repetitions, review1.interval, review1.easeFactor);
      expect(review2.interval).toBe(6);
      expect(review2.repetitions).toBe(2);

      // Third review
      const review3 = calculateSpacedRepetition(5, review2.repetitions, review2.interval, review2.easeFactor);
      expect(review3.interval).toBeGreaterThan(10); // Should be ~15
      expect(review3.repetitions).toBe(3);

      // Fourth review
      const review4 = calculateSpacedRepetition(5, review3.repetitions, review3.interval, review3.easeFactor);
      expect(review4.interval).toBeGreaterThan(30); // Should be ~38-40
      expect(review4.repetitions).toBe(4);
    });

    it('should round intervals to whole numbers', () => {
      const result = calculateSpacedRepetition(4, 3, 7, 2.3);
      expect(result.interval).toBe(Math.round(7 * 2.3));
      expect(Number.isInteger(result.interval)).toBe(true);
    });
  });

  describe('Next Review Date Calculation', () => {
    it('should calculate next review date based on interval', () => {
      const result = calculateSpacedRepetition(5, 2, 6, 2.5);
      const today = new Date();
      const expectedDate = new Date(today);
      expectedDate.setDate(expectedDate.getDate() + result.interval);

      // Compare dates (within same day)
      expect(result.nextReviewDate.toDateString()).toBe(expectedDate.toDateString());
    });

    it('should set next review to tomorrow for failed cards', () => {
      const result = calculateSpacedRepetition(2, 5, 30, 2.2);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      expect(result.nextReviewDate.toDateString()).toBe(tomorrow.toDateString());
    });
  });

  describe('Real-World Learning Scenarios', () => {
    it('should handle a student mastering a card over time', () => {
      let state = { repetitions: 0, interval: 1, easeFactor: 2.5 };

      // Perfect recall every time
      const qualities = [5, 5, 5, 5, 5];
      const intervals: number[] = [];

      qualities.forEach(quality => {
        const result = calculateSpacedRepetition(quality, state.repetitions, state.interval, state.easeFactor);
        intervals.push(result.interval);
        state = result;
      });

      // Intervals should increase: 1, 6, ~16, ~42, ~110
      expect(intervals[0]).toBe(1);
      expect(intervals[1]).toBe(6);
      expect(intervals[2]).toBeGreaterThan(10);
      expect(intervals[3]).toBeGreaterThan(30);
      expect(intervals[4]).toBeGreaterThan(90);
      
      // Ease factor should have increased
      expect(state.easeFactor).toBeGreaterThan(2.5);
    });

    it('should handle a struggling student (mixed quality)', () => {
      let state = { repetitions: 0, interval: 1, easeFactor: 2.5 };

      // Mixed performance: 3, 2 (fail), 4, 3, 5
      const qualities = [3, 2, 4, 3, 5];

      qualities.forEach(quality => {
        const result = calculateSpacedRepetition(quality, state.repetitions, state.interval, state.easeFactor);
        state = result;
      });

      // After failing, progress resets
      expect(state.repetitions).toBeLessThan(5);
      expect(state.easeFactor).toBeLessThan(2.5);
    });

    it('should handle consistent poor performance', () => {
      let state = { repetitions: 0, interval: 1, easeFactor: 2.5 };

      // Consistently scoring quality 2
      for (let i = 0; i < 5; i++) {
        const result = calculateSpacedRepetition(2, state.repetitions, state.interval, state.easeFactor);
        state = result;
      }

      // Should stay at beginning
      expect(state.repetitions).toBe(0);
      expect(state.interval).toBe(1);
      expect(state.easeFactor).toBeLessThan(2.0);
      expect(state.easeFactor).toBeGreaterThanOrEqual(1.3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large intervals', () => {
      const result = calculateSpacedRepetition(5, 10, 365, 2.8);
      expect(result.interval).toBeGreaterThan(365);
      expect(result.repetitions).toBe(11);
    });

    it('should handle ease factor at minimum', () => {
      const result = calculateSpacedRepetition(3, 5, 10, 1.3);
      expect(result.easeFactor).toBeGreaterThanOrEqual(1.3);
    });

    it('should handle ease factor at theoretical maximum', () => {
      // Multiple perfect recalls
      let easeFactor = 2.5;
      for (let i = 0; i < 20; i++) {
        const result = calculateSpacedRepetition(5, i, 1, easeFactor);
        easeFactor = result.easeFactor;
      }
      
      // Ease factor should increase but remain reasonable
      expect(easeFactor).toBeGreaterThan(2.5);
      expect(easeFactor).toBeLessThan(4.0); // Shouldn't go too high
    });
  });

  describe('Compliance with SM-2 Specifications', () => {
    it('should match original SM-2 algorithm for standard case', () => {
      // Standard case from SM-2 documentation
      const result = calculateSpacedRepetition(4, 3, 10, 2.36);
      
      // Expected: interval = 10 * 2.36 = 23.6 → 24 (rounded)
      expect(result.interval).toBe(Math.round(10 * 2.36));
      expect(result.repetitions).toBe(4);
    });

    it('should implement 15-30 day mastery threshold (per specs)', () => {
      // From PRD: mastered = repetitions >= 5 and interval >= 30 days
      let state = { repetitions: 0, interval: 1, easeFactor: 2.5 };

      // Keep reviewing with good quality until mastered
      while (state.repetitions < 5 || state.interval < 30) {
        const result = calculateSpacedRepetition(5, state.repetitions, state.interval, state.easeFactor);
        state = result;
        
        // Safety check to prevent infinite loop
        if (state.repetitions > 10) break;
      }

      expect(state.repetitions).toBeGreaterThanOrEqual(5);
      expect(state.interval).toBeGreaterThanOrEqual(30);
    });
  });
});
