import mongoose from 'mongoose';
import { Quiz, IQuiz } from '../models/Quiz.model';
import { QuizAttempt, IQuizAttempt, IQuizAnswer } from '../models/QuizAttempt.model';
import { Content } from '../models/Content.model';
import { Transcript } from '../models/Transcript.model';
import { generateQuiz, generateQuizWithFallback } from './ai/chains/quiz.chain';
import { logger } from '../config/logger';

export interface QuizSubmission {
  answers: Array<{
    questionIndex: number;
    userAnswer: string | string[];
    timeSpent: number;
  }>;
}

export interface QuizResult {
  attempt: IQuizAttempt;
  quiz: IQuiz;
  passed: boolean;
  feedback: string;
  suggestedDifficulty?: 'beginner' | 'intermediate' | 'advanced';
}

/**
 * Simple in-memory lock to prevent concurrent quiz generation for same content/difficulty
 * Key format: `${contentId}:${userId}:${difficulty}`
 */
class QuizGenerationLock {
  private locks: Map<string, Promise<IQuiz>> = new Map();

  async acquire(
    key: string,
    generator: () => Promise<IQuiz>
  ): Promise<IQuiz> {
    // Check if there's already a generation in progress
    const existingLock = this.locks.get(key);
    if (existingLock) {
      logger.info(`Quiz generation already in progress for ${key}, waiting...`);
      return existingLock;
    }

    // Create new generation promise
    const generationPromise = generator()
      .finally(() => {
        // Release lock when done
        this.locks.delete(key);
      });

    this.locks.set(key, generationPromise);
    return generationPromise;
  }
}

const quizGenerationLock = new QuizGenerationLock();

/**
 * Quiz Service - Handles quiz generation, retrieval, and submission
 */
export class QuizService {
  /**
   * Generate quiz from content
   */
  static async generateQuizFromContent(
    contentId: string,
    userId: string,
    difficulty: 'beginner' | 'intermediate' | 'advanced' = 'intermediate',
    options?: { regenerate?: boolean }
  ): Promise<IQuiz> {
    // Use lock to prevent concurrent generation
    const lockKey = `${contentId}:${userId}:${difficulty}`;
    
    return quizGenerationLock.acquire(lockKey, async () => {
      try {
        // Get content
        const content = await Content.findOne({
          _id: contentId,
          userId,
          isDeleted: false,
        });

        if (!content) {
          throw new Error('Content not found');
        }

        // Check if quiz already exists for this content (final check after lock)
        const existingQuiz = await Quiz.findOne({
          contentId,
          userId,
          difficulty,
          isActive: true,
        });

        // CHANGED BEHAVIOR: Always deactivate existing quiz and generate new one
        // Users can call the generate endpoint multiple times to get fresh questions
        if (existingQuiz) {
          if (options?.regenerate === false) {
            // Only return existing if explicitly told not to regenerate
            logger.info(`Returning existing quiz for content ${contentId} at ${difficulty} level`);
            return existingQuiz;
          }
          
          // Default behavior: deactivate old quiz and generate new one
          logger.info(
            `Existing quiz found for content ${contentId} at ${difficulty} level. ` +
            `Deactivating old quiz ${existingQuiz._id} and generating new one.`
          );
          existingQuiz.isActive = false;
          await existingQuiz.save();
        }

        // Get transcript
        const transcript = await Transcript.findOne({ contentId });

        if (!transcript || !transcript.segments || transcript.segments.length === 0) {
          throw new Error('No transcript available for this content');
        }

        // Combine all transcript segments
        const fullTranscript = transcript.segments.map((seg) => seg.text).join(' ');
        const startTime = transcript.segments[0].startTime;
        const endTime = transcript.segments[transcript.segments.length - 1].endTime;

        // Generate quiz using LangChain
        const quizResult = await generateQuizWithFallback(
          fullTranscript,
          startTime,
          endTime,
          difficulty
        );

        // Create quiz document
        const quiz = new Quiz({
          contentId,
          userId,
          title: quizResult.title || `${content.title} - ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} Quiz`,
          description:
            quizResult.description || `${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} level quiz`,
          questions: quizResult.questions,
          difficulty,
          totalPoints: quizResult.questions.reduce((sum, q) => sum + q.points, 0),
          passingScore: 70, // Default 70%
          timeLimit: quizResult.estimatedDuration,
          metadata: {
            generationTime: quizResult.generationTime,
            model: quizResult.model,
            topicsCovered: quizResult.topicsCovered,
            estimatedDuration: quizResult.estimatedDuration,
          },
          isActive: true,
        });

        try {
          await quiz.save();
        } catch (saveError: any) {
          // Handle duplicate key error (E11000) - another process may have created it
          if (saveError.code === 11000) {
            logger.warn(`Duplicate quiz detected during save, fetching existing quiz`);
            const existingQuizAfterSave = await Quiz.findOne({
              contentId,
              userId,
              difficulty,
              isActive: true,
            });
            
            if (existingQuizAfterSave) {
              return existingQuizAfterSave;
            }
          }
          
          throw saveError;
        }

        logger.info(`Generated ${difficulty} quiz ${quiz._id} for content ${contentId} (${quiz.questions.length} questions)`);

        return quiz;
      } catch (error: any) {
        logger.error('Error generating quiz:', error);
        throw new Error(`Failed to generate quiz: ${error.message}`);
      }
    });
  }

  /**
   * Get quiz by ID
   */
  static async getQuizById(quizId: string, userId: string): Promise<IQuiz> {
    const quiz = await Quiz.findOne({
      _id: quizId,
      userId,
      isActive: true,
    });

    if (!quiz) {
      throw new Error('Quiz not found');
    }

    return quiz;
  }

  /**
   * Get quizzes for content
   */
  static async getQuizzesByContent(
    contentId: string,
    userId: string
  ): Promise<IQuiz[]> {
    const quizzes = await Quiz.find({
      contentId,
      userId,
      isActive: true,
    }).sort({ createdAt: -1 });

    return quizzes;
  }

  /**
   * Regenerate quiz - creates a new version of the quiz
   */
  static async regenerateQuiz(
    quizId: string,
    userId: string
  ): Promise<IQuiz> {
    try {
      // Get existing quiz
      const existingQuiz = await Quiz.findOne({
        _id: quizId,
        userId,
      });

      if (!existingQuiz) {
        throw new Error('Quiz not found');
      }

      const contentId = existingQuiz.contentId.toString();
      const difficulty = existingQuiz.difficulty;

      // Get content
      const content = await Content.findOne({
        _id: contentId,
        userId,
        isDeleted: false,
      });

      if (!content) {
        throw new Error('Content not found');
      }

      // Get transcript
      const transcript = await Transcript.findOne({ contentId });

      if (!transcript || !transcript.segments || transcript.segments.length === 0) {
        throw new Error('No transcript available for this content');
      }

      // Combine all transcript segments
      const fullTranscript = transcript.segments.map((seg) => seg.text).join(' ');
      const startTime = transcript.segments[0].startTime;
      const endTime = transcript.segments[transcript.segments.length - 1].endTime;

      logger.info(`Regenerating quiz ${quizId} for content ${contentId} at ${difficulty} level`);

      // Generate new quiz using LangChain with retry
      const quizResult = await generateQuizWithFallback(
        fullTranscript,
        startTime,
        endTime,
        difficulty
      );

      // Deactivate old quiz (soft delete)
      existingQuiz.isActive = false;
      await existingQuiz.save();

      // Create new quiz with incremented version
      const newQuiz = new Quiz({
        contentId,
        userId,
        title: quizResult.title || `${content.title} - ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} Quiz`,
        description: quizResult.description || `${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} level quiz (regenerated)`,
        questions: quizResult.questions,
        difficulty,
        totalPoints: quizResult.questions.reduce((sum, q) => sum + q.points, 0),
        passingScore: existingQuiz.passingScore,
        timeLimit: quizResult.estimatedDuration,
        metadata: {
          generationTime: quizResult.generationTime,
          model: quizResult.model,
          topicsCovered: quizResult.topicsCovered,
          estimatedDuration: quizResult.estimatedDuration,
        },
        version: existingQuiz.version + 1,
        generationMethod: 'regenerated',
        generationAttempts: 1,
        previousVersionId: existingQuiz._id,
        isActive: true,
      });

      await newQuiz.save();

      logger.info(`Regenerated quiz ${newQuiz._id} (v${newQuiz.version}) for content ${contentId}`);

      return newQuiz;
    } catch (error: any) {
      logger.error('Error regenerating quiz:', error);
      throw new Error(`Failed to regenerate quiz: ${error.message}`);
    }
  }

  /**
   * Auto-generate missing quizzes for content (fallback mechanism)
   */
  static async ensureQuizzesExist(
    contentId: string,
    userId: string
  ): Promise<{ existed: boolean; quizzes: IQuiz[] }> {
    try {
      // Check if quizzes exist
      const existingQuizzes = await Quiz.find({
        contentId,
        userId,
        isActive: true,
      });

      if (existingQuizzes.length > 0) {
        return { existed: true, quizzes: existingQuizzes };
      }

      // No quizzes found, generate them
      logger.info(`No quizzes found for content ${contentId}, auto-generating...`);

      // Get content and transcript
      const content = await Content.findOne({
        _id: contentId,
        userId,
        isDeleted: false,
      });

      if (!content) {
        throw new Error('Content not found');
      }

      const transcript = await Transcript.findOne({ contentId });

      if (!transcript || !transcript.segments || transcript.segments.length === 0) {
        throw new Error('No transcript available for this content');
      }

      // Generate a single intermediate difficulty quiz as fallback
      // Pass regenerate: false to return existing if one was created concurrently
      const quiz = await this.generateQuizFromContent(
        contentId, 
        userId, 
        'intermediate',
        { regenerate: false }
      );

      return { existed: false, quizzes: [quiz] };
    } catch (error: any) {
      logger.error('Error ensuring quizzes exist:', error);
      throw new Error(`Failed to ensure quizzes exist: ${error.message}`);
    }
  }

  /**
   * Start a quiz attempt
   */
  static async startQuizAttempt(
    quizId: string,
    userId: string
  ): Promise<IQuizAttempt> {
    const quiz = await this.getQuizById(quizId, userId);

    // Check for existing in-progress attempt
    const existingAttempt = await QuizAttempt.findOne({
      quizId,
      userId,
      status: 'in-progress',
    });

    if (existingAttempt) {
      logger.info(`Returning existing quiz attempt ${existingAttempt._id}`);
      return existingAttempt;
    }

    // Create new attempt
    const attempt = new QuizAttempt({
      quizId,
      contentId: quiz.contentId,
      userId,
      totalPoints: quiz.totalPoints,
      startedAt: new Date(),
      status: 'in-progress',
    });

    await attempt.save();

    logger.info(`Started quiz attempt ${attempt._id} for quiz ${quizId}`);

    return attempt;
  }

  /**
   * Submit quiz answers and calculate score
   */
  static async submitQuiz(
    attemptId: string,
    userId: string,
    submission: QuizSubmission
  ): Promise<QuizResult> {
    try {
      // Get attempt
      const attempt = await QuizAttempt.findOne({
        _id: attemptId,
        userId,
      }).populate('quizId');

      if (!attempt) {
        throw new Error('Quiz attempt not found');
      }

      if (attempt.status === 'completed') {
        throw new Error('Quiz already submitted');
      }

      const quiz = attempt.quizId as unknown as IQuiz;

      // Calculate scores
      const answers: IQuizAnswer[] = submission.answers.map((submittedAnswer) => {
        const question = quiz.questions[submittedAnswer.questionIndex];
        
        if (!question) {
          throw new Error(`Invalid question index: ${submittedAnswer.questionIndex}`);
        }

        const isCorrect = this.checkAnswer(
          submittedAnswer.userAnswer,
          question.correctAnswer,
          question.type
        );

        return {
          questionIndex: submittedAnswer.questionIndex,
          userAnswer: submittedAnswer.userAnswer,
          isCorrect,
          pointsEarned: isCorrect ? question.points : 0,
          timeSpent: submittedAnswer.timeSpent,
          timestamp: new Date(),
        };
      });

      // Calculate total score
      const score = answers.reduce((sum, a) => sum + a.pointsEarned, 0);
      const totalTime = answers.reduce((sum, a) => sum + a.timeSpent, 0);

      // Analyze performance by topic
      const { strongTopics, weakTopics } = this.analyzePerformanceByTopic(
        answers,
        quiz.questions
      );

      // Update attempt
      attempt.answers = answers;
      attempt.score = score;
      attempt.timeSpent = totalTime;
      attempt.completedAt = new Date();
      attempt.status = 'completed';
      attempt.performance.strongTopics = strongTopics;
      attempt.performance.weakTopics = weakTopics;

      await attempt.save();

      // Update quiz statistics
      await this.updateQuizStatistics(quiz._id as string, attempt);

      // Generate feedback
      const passed = attempt.percentage >= quiz.passingScore;
      const feedback = this.generateFeedback(attempt, quiz, passed);
      const suggestedDifficulty = this.calculateNextDifficulty(
        quiz.difficulty,
        attempt.percentage,
        attempt.performance.averageTimePerQuestion
      );

      attempt.feedback = {
        overallFeedback: feedback,
        nextDifficultyLevel: suggestedDifficulty,
      };

      await attempt.save();

      logger.info(
        `Quiz attempt ${attemptId} completed with score ${score}/${quiz.totalPoints} (${attempt.percentage}%)`
      );

      return {
        attempt,
        quiz,
        passed,
        feedback,
        suggestedDifficulty,
      };
    } catch (error: any) {
      logger.error('Error submitting quiz:', error);
      throw new Error(`Failed to submit quiz: ${error.message}`);
    }
  }

  /**
   * Check if an answer is correct
   */
  private static checkAnswer(
    userAnswer: string | string[],
    correctAnswer: string | string[],
    questionType: 'mcq' | 'truefalse' | 'fillin' | 'essay'
  ): boolean {
    // Normalize answers
    const normalizeAnswer = (ans: string): string =>
      ans.toLowerCase().trim().replace(/[^\w\s]/g, '');

    if (questionType === 'essay') {
      // Essay questions require manual grading (for MVP, mark as incorrect)
      return false;
    }

    if (Array.isArray(correctAnswer)) {
      // Multiple correct answers
      const userAnswers = Array.isArray(userAnswer) ? userAnswer : [userAnswer];
      const normalizedCorrect = correctAnswer.map(normalizeAnswer);
      const normalizedUser = userAnswers.map(normalizeAnswer);

      return normalizedUser.every((ans) => normalizedCorrect.includes(ans));
    } else {
      // Single correct answer
      const userAns = Array.isArray(userAnswer) ? userAnswer[0] : userAnswer;
      return normalizeAnswer(userAns) === normalizeAnswer(correctAnswer);
    }
  }

  /**
   * Analyze performance by topic
   */
  private static analyzePerformanceByTopic(
    answers: IQuizAnswer[],
    questions: any[]
  ): { strongTopics: string[]; weakTopics: string[] } {
    const topicPerformance: { [topic: string]: { correct: number; total: number } } = {};

    answers.forEach((answer) => {
      const question = questions[answer.questionIndex];
      const topics = question.tags || ['general'];

      topics.forEach((topic: string) => {
        if (!topicPerformance[topic]) {
          topicPerformance[topic] = { correct: 0, total: 0 };
        }
        topicPerformance[topic].total++;
        if (answer.isCorrect) {
          topicPerformance[topic].correct++;
        }
      });
    });

    const strongTopics: string[] = [];
    const weakTopics: string[] = [];

    Object.entries(topicPerformance).forEach(([topic, perf]) => {
      const percentage = (perf.correct / perf.total) * 100;
      if (percentage >= 80) {
        strongTopics.push(topic);
      } else if (percentage < 60) {
        weakTopics.push(topic);
      }
    });

    return { strongTopics, weakTopics };
  }

  /**
   * Generate personalized feedback
   */
  private static generateFeedback(
    attempt: IQuizAttempt,
    quiz: IQuiz,
    passed: boolean
  ): string {
    const percentage = attempt.percentage;

    let feedback = '';

    if (passed) {
      if (percentage >= 90) {
        feedback = 'Excellent work! You have mastered this material. ';
      } else if (percentage >= 80) {
        feedback = 'Great job! You have a strong understanding of the concepts. ';
      } else {
        feedback = 'Good work! You passed the quiz. ';
      }
    } else {
      feedback = 'Keep studying! Review the material and try again. ';
    }

    if (attempt.performance.weakTopics.length > 0) {
      feedback += `Focus on improving: ${attempt.performance.weakTopics.join(', ')}. `;
    }

    if (attempt.performance.strongTopics.length > 0) {
      feedback += `You're doing well with: ${attempt.performance.strongTopics.join(', ')}.`;
    }

    return feedback;
  }

  /**
   * Calculate next recommended difficulty level
   */
  private static calculateNextDifficulty(
    currentDifficulty: 'beginner' | 'intermediate' | 'advanced',
    percentage: number,
    avgTimePerQuestion: number
  ): 'beginner' | 'intermediate' | 'advanced' {
    // Fast completion: < 45s per question
    // Moderate: 45-90s per question
    const isFastCompletion = avgTimePerQuestion < 45;

    if (percentage >= 85 || (percentage >= 80 && isFastCompletion)) {
      // Increase difficulty
      if (currentDifficulty === 'beginner') return 'intermediate';
      if (currentDifficulty === 'intermediate') return 'advanced';
      return 'advanced';
    } else if (percentage < 50) {
      // Decrease difficulty
      if (currentDifficulty === 'advanced') return 'intermediate';
      if (currentDifficulty === 'intermediate') return 'beginner';
      return 'beginner';
    } else if (percentage < 60) {
      // Slightly decrease difficulty
      if (currentDifficulty === 'advanced') return 'intermediate';
      return currentDifficulty;
    }

    // Maintain current difficulty
    return currentDifficulty;
  }

  /**
   * Update quiz statistics
   */
  private static async updateQuizStatistics(
    quizId: string,
    attempt: IQuizAttempt
  ): Promise<void> {
    const quiz = await Quiz.findById(quizId);
    if (!quiz) return;

    const totalAttempts = quiz.statistics.totalAttempts + 1;
    const newAvgScore =
      (quiz.statistics.averageScore * quiz.statistics.totalAttempts + attempt.percentage) /
      totalAttempts;
    const newAvgTime =
      (quiz.statistics.averageTimeSpent * quiz.statistics.totalAttempts +
        attempt.timeSpent) /
      totalAttempts;

    quiz.statistics.totalAttempts = totalAttempts;
    quiz.statistics.averageScore = newAvgScore;
    quiz.statistics.averageTimeSpent = newAvgTime;
    quiz.statistics.completionRate =
      (quiz.statistics.completionRate * (totalAttempts - 1) +
        (attempt.status === 'completed' ? 100 : 0)) /
      totalAttempts;

    await quiz.save();
  }

  /**
   * Get quiz attempts for user
   */
  static async getQuizAttempts(
    userId: string,
    contentId?: string
  ): Promise<IQuizAttempt[]> {
    const query: any = { userId };
    if (contentId) {
      query.contentId = contentId;
    }

    const attempts = await QuizAttempt.find(query)
      .populate('quizId', 'title difficulty')
      .populate('contentId', 'title type')
      .sort({ createdAt: -1 })
      .limit(50);

    return attempts;
  }

  /**
   * Get quiz attempt by ID
   */
  static async getQuizAttemptById(
    attemptId: string,
    userId: string
  ): Promise<IQuizAttempt> {
    const attempt = await QuizAttempt.findOne({
      _id: attemptId,
      userId,
    })
      .populate('quizId')
      .populate('contentId', 'title type');

    if (!attempt) {
      throw new Error('Quiz attempt not found');
    }

    return attempt;
  }
}
