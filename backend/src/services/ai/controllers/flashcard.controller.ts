import { Flashcard, IFlashcard } from '../../../models/Flashcard.model';
import { Content } from '../../../models/Content.model';
import { FlashcardReview } from '../../../models/FlashcardReview.model';
import { calculateSpacedRepetition } from '../chains/flashcard.chain';
import { logger } from '../../../config/logger';
import { Types } from 'mongoose';

/**
 * Flashcard Controller
 * Handles flashcard CRUD operations and spaced repetition logic
 */
export class FlashcardController {
  /**
   * Get all flashcards for a specific content
   */
  async getFlashcardsByContent(
    contentId: string,
    userId: string
  ): Promise<IFlashcard[]> {
    try {
      // Validate content ownership
      const content = await Content.findOne({
        _id: contentId,
        userId,
        deletedAt: null,
      });

      if (!content) {
        throw new Error('Content not found or access denied');
      }

      // Fetch flashcards
      const flashcards = await Flashcard.find({
        contentId,
        userId,
        isActive: true,
      }).sort({ createdAt: 1 });

      logger.info(`Retrieved ${flashcards.length} flashcards for content ${contentId}`);
      return flashcards;
    } catch (error) {
      logger.error('Error getting flashcards by content:', error);
      throw error;
    }
  }

  /**
   * Get due flashcards for review (spaced repetition)
   */
  async getDueFlashcards(userId: string, limit: number = 20): Promise<IFlashcard[]> {
    try {
      const now = new Date();

      const flashcards = await Flashcard.find({
        userId,
        isActive: true,
        'spacedRepetition.nextReviewDate': { $lte: now },
      })
        .sort({ 'spacedRepetition.nextReviewDate': 1 })
        .limit(limit)
        .populate('contentId', 'title type');

      logger.info(`Retrieved ${flashcards.length} due flashcards for user ${userId}`);
      return flashcards;
    } catch (error) {
      logger.error('Error getting due flashcards:', error);
      throw error;
    }
  }

  /**
   * Review a flashcard and update spaced repetition
   * @param flashcardId - Flashcard ID
   * @param userId - User ID
   * @param quality - Quality rating (0-5): 0=total blackout, 3=correct with difficulty, 5=perfect recall
   * @param responseTime - Time taken to answer in milliseconds (optional)
   */
  async reviewFlashcard(
    flashcardId: string,
    userId: string,
    quality: number,
    responseTime?: number
  ): Promise<IFlashcard> {
    try {
      // Validate quality rating
      if (quality < 0 || quality > 5) {
        throw new Error('Quality rating must be between 0 and 5');
      }

      // Fetch flashcard
      const flashcard = await Flashcard.findOne({
        _id: flashcardId,
        userId,
        isActive: true,
      });

      if (!flashcard) {
        throw new Error('Flashcard not found or access denied');
      }

      // Calculate new spaced repetition values using SM-2 algorithm
      const { repetitions, interval, easeFactor, nextReviewDate } = calculateSpacedRepetition(
        quality,
        flashcard.spacedRepetition.repetitions,
        flashcard.spacedRepetition.interval,
        flashcard.spacedRepetition.easeFactor
      );

      // Update statistics
      const isCorrect = quality >= 3;
      const timesReviewed = flashcard.statistics.timesReviewed + 1;
      const timesCorrect = flashcard.statistics.timesCorrect + (isCorrect ? 1 : 0);
      const timesIncorrect = flashcard.statistics.timesIncorrect + (isCorrect ? 0 : 1);

      // Calculate average response time
      let averageResponseTime = flashcard.statistics.averageResponseTime;
      if (responseTime) {
        if (averageResponseTime) {
          averageResponseTime = (averageResponseTime * (timesReviewed - 1) + responseTime) / timesReviewed;
        } else {
          averageResponseTime = responseTime;
        }
      }

      // Update flashcard
      flashcard.spacedRepetition = {
        repetitions,
        interval,
        easeFactor,
        nextReviewDate,
        lastReviewDate: new Date(),
      };

      flashcard.statistics = {
        timesReviewed,
        timesCorrect,
        timesIncorrect,
        averageResponseTime,
      };

      await flashcard.save();

      logger.info(`Reviewed flashcard ${flashcardId}: quality=${quality}, next review in ${interval} days`);
      
      // Log review for analytics
      try {
        await FlashcardReview.create({
          userId: new Types.ObjectId(userId),
          flashcardId: new Types.ObjectId(flashcardId),
          contentId: flashcard.contentId,
          quality,
          responseTime: responseTime || 0,
          wasCorrect: isCorrect,
          easeFactor,
          interval,
          reviewedAt: new Date(),
        });
      } catch (analyticsError) {
        logger.error('Failed to log flashcard review for analytics:', analyticsError);
        // Don't fail the review if analytics logging fails
      }

      return flashcard;
    } catch (error) {
      logger.error('Error reviewing flashcard:', error);
      throw error;
    }
  }

  /**
   * Get flashcard statistics for a user
   */
  async getFlashcardStatistics(userId: string): Promise<{
    total: number;
    dueToday: number;
    mastered: number;
    learning: number;
    averageAccuracy: number;
  }> {
    try {
      const now = new Date();
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);

      const [total, dueToday, allFlashcards] = await Promise.all([
        Flashcard.countDocuments({ userId, isActive: true }),
        Flashcard.countDocuments({
          userId,
          isActive: true,
          'spacedRepetition.nextReviewDate': { $lte: endOfDay },
        }),
        Flashcard.find({ userId, isActive: true }),
      ]);

      // Mastered: repetitions >= 5 and interval >= 30 days
      const mastered = allFlashcards.filter(
        (f) => f.spacedRepetition.repetitions >= 5 && f.spacedRepetition.interval >= 30
      ).length;

      // Learning: everything else
      const learning = total - mastered;

      // Calculate average accuracy
      const totalReviewed = allFlashcards.reduce((sum, f) => sum + f.statistics.timesReviewed, 0);
      const totalCorrect = allFlashcards.reduce((sum, f) => sum + f.statistics.timesCorrect, 0);
      const averageAccuracy = totalReviewed > 0 ? (totalCorrect / totalReviewed) * 100 : 0;

      return {
        total,
        dueToday,
        mastered,
        learning,
        averageAccuracy: Math.round(averageAccuracy * 10) / 10,
      };
    } catch (error) {
      logger.error('Error getting flashcard statistics:', error);
      throw error;
    }
  }

  /**
   * Get a single flashcard by ID
   */
  async getFlashcardById(flashcardId: string, userId: string): Promise<IFlashcard | null> {
    try {
      const flashcard = await Flashcard.findOne({
        _id: flashcardId,
        userId,
        isActive: true,
      }).populate('contentId', 'title type sourceUrl');

      return flashcard;
    } catch (error) {
      logger.error('Error getting flashcard by ID:', error);
      throw error;
    }
  }

  /**
   * Reset flashcard progress (for testing or user request)
   */
  async resetFlashcard(flashcardId: string, userId: string): Promise<IFlashcard> {
    try {
      const flashcard = await Flashcard.findOne({
        _id: flashcardId,
        userId,
        isActive: true,
      });

      if (!flashcard) {
        throw new Error('Flashcard not found or access denied');
      }

      // Reset to initial state
      flashcard.spacedRepetition = {
        repetitions: 0,
        interval: 1,
        easeFactor: 2.5,
        nextReviewDate: new Date(),
      };

      flashcard.statistics = {
        timesReviewed: 0,
        timesCorrect: 0,
        timesIncorrect: 0,
      };

      await flashcard.save();

      logger.info(`Reset flashcard ${flashcardId}`);
      return flashcard;
    } catch (error) {
      logger.error('Error resetting flashcard:', error);
      throw error;
    }
  }

  /**
   * Get performance analytics for a user
   * @param userId - User ID
   * @param days - Number of days to look back (default: 30)
   */
  async getPerformanceAnalytics(userId: string, days: number = 30): Promise<{
    reviewsOverTime: Array<{ date: string; count: number; averageQuality: number }>;
    qualityDistribution: { [key: number]: number };
    averageResponseTime: number;
    accuracyTrend: Array<{ date: string; accuracy: number }>;
    totalReviews: number;
    streakDays: number;
  }> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const reviews = await FlashcardReview.find({
        userId: new Types.ObjectId(userId),
        reviewedAt: { $gte: startDate },
      }).sort({ reviewedAt: 1 });

      // Reviews over time (grouped by day)
      const reviewsByDay = new Map<string, { count: number; totalQuality: number }>();
      const accuracyByDay = new Map<string, { correct: number; total: number }>();
      const qualityDistribution: { [key: number]: number } = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      let totalResponseTime = 0;
      let responseTimeCount = 0;

      reviews.forEach(review => {
        const dateKey = review.reviewedAt.toISOString().split('T')[0];

        // Reviews count and quality
        const dayData = reviewsByDay.get(dateKey) || { count: 0, totalQuality: 0 };
        dayData.count++;
        dayData.totalQuality += review.quality;
        reviewsByDay.set(dateKey, dayData);

        // Accuracy tracking
        const accuracyData = accuracyByDay.get(dateKey) || { correct: 0, total: 0 };
        accuracyData.total++;
        if (review.wasCorrect) accuracyData.correct++;
        accuracyByDay.set(dateKey, accuracyData);

        // Quality distribution
        qualityDistribution[review.quality]++;

        // Response time
        if (review.responseTime > 0) {
          totalResponseTime += review.responseTime;
          responseTimeCount++;
        }
      });

      // Convert maps to arrays
      const reviewsOverTime = Array.from(reviewsByDay.entries()).map(([date, data]) => ({
        date,
        count: data.count,
        averageQuality: data.totalQuality / data.count,
      }));

      const accuracyTrend = Array.from(accuracyByDay.entries()).map(([date, data]) => ({
        date,
        accuracy: (data.correct / data.total) * 100,
      }));

      // Calculate streak (consecutive days with reviews)
      const reviewDates = Array.from(reviewsByDay.keys()).sort().reverse();
      let streakDays = 0;
      const today = new Date().toISOString().split('T')[0];
      
      if (reviewDates.length > 0 && (reviewDates[0] === today || reviewDates[0] === new Date(Date.now() - 86400000).toISOString().split('T')[0])) {
        streakDays = 1;
        for (let i = 1; i < reviewDates.length; i++) {
          const currentDate = new Date(reviewDates[i]);
          const previousDate = new Date(reviewDates[i - 1]);
          const diffDays = Math.floor((previousDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (diffDays === 1) {
            streakDays++;
          } else {
            break;
          }
        }
      }

      return {
        reviewsOverTime,
        qualityDistribution,
        averageResponseTime: responseTimeCount > 0 ? totalResponseTime / responseTimeCount : 0,
        accuracyTrend,
        totalReviews: reviews.length,
        streakDays,
      };
    } catch (error) {
      logger.error('Error getting performance analytics:', error);
      throw error;
    }
  }

  /**
   * Get content-specific analytics
   */
  async getContentAnalytics(userId: string, contentId: string): Promise<{
    totalFlashcards: number;
    mastered: number;
    learning: number;
    difficult: number;
    averageQuality: number;
    totalReviews: number;
    timeSpent: number; // milliseconds
  }> {
    try {
      const flashcards = await Flashcard.find({
        userId: new Types.ObjectId(userId),
        contentId: new Types.ObjectId(contentId),
        isActive: true,
      });

      const reviews = await FlashcardReview.find({
        userId: new Types.ObjectId(userId),
        contentId: new Types.ObjectId(contentId),
      });

      const mastered = flashcards.filter(
        f => f.spacedRepetition.repetitions >= 5 && f.spacedRepetition.interval >= 30
      ).length;

      const difficult = flashcards.filter(
        f => f.spacedRepetition.easeFactor < 2.0
      ).length;

      const learning = flashcards.length - mastered - difficult;

      const totalQuality = reviews.reduce((sum, r) => sum + r.quality, 0);
      const totalTime = reviews.reduce((sum, r) => sum + r.responseTime, 0);

      return {
        totalFlashcards: flashcards.length,
        mastered,
        learning,
        difficult,
        averageQuality: reviews.length > 0 ? totalQuality / reviews.length : 0,
        totalReviews: reviews.length,
        timeSpent: totalTime,
      };
    } catch (error) {
      logger.error('Error getting content analytics:', error);
      throw error;
    }
  }

  /**
   * Create a custom flashcard manually
   */
  async createCustomFlashcard(
    userId: string,
    contentId: string,
    front: string,
    back: string,
    type: 'mcq' | 'truefalse' | 'fillin' | 'essay',
    difficulty: 'easy' | 'medium' | 'hard',
    tags: string[]
  ): Promise<IFlashcard> {
    try {
      const flashcard = new Flashcard({
        userId: new Types.ObjectId(userId),
        contentId: new Types.ObjectId(contentId),
        front,
        back,
        type,
        difficulty,
        tags,
        sourceSegment: {
          startTime: 0,
          endTime: 0,
        },
        isActive: true,
        spacedRepetition: {
          repetitions: 0,
          interval: 1,
          easeFactor: 2.5,
          nextReviewDate: new Date(),
        },
        statistics: {
          timesReviewed: 0,
          timesCorrect: 0,
          timesIncorrect: 0,
        },
      });

      await flashcard.save();
      logger.info(`Created custom flashcard ${flashcard._id} for user ${userId}`);
      
      return flashcard;
    } catch (error) {
      logger.error('Error creating custom flashcard:', error);
      throw error;
    }
  }

  /**
   * Update a flashcard
   */
  async updateFlashcard(
    flashcardId: string,
    userId: string,
    updates: {
      front?: string;
      back?: string;
      type?: 'mcq' | 'truefalse' | 'fillin' | 'essay';
      difficulty?: 'easy' | 'medium' | 'hard';
      tags?: string[];
    }
  ): Promise<IFlashcard> {
    try {
      const flashcard = await Flashcard.findOne({
        _id: flashcardId,
        userId: new Types.ObjectId(userId),
        isActive: true,
      });

      if (!flashcard) {
        throw new Error('Flashcard not found or access denied');
      }

      // Update fields
      if (updates.front !== undefined) flashcard.front = updates.front;
      if (updates.back !== undefined) flashcard.back = updates.back;
      if (updates.type !== undefined) flashcard.type = updates.type;
      if (updates.difficulty !== undefined) flashcard.difficulty = updates.difficulty;
      if (updates.tags !== undefined) flashcard.tags = updates.tags;

      await flashcard.save();
      logger.info(`Updated flashcard ${flashcardId}`);

      return flashcard;
    } catch (error) {
      logger.error('Error updating flashcard:', error);
      throw error;
    }
  }
}

export const flashcardController = new FlashcardController();
