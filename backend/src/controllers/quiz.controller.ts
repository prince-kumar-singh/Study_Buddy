import { Request, Response, NextFunction } from 'express';
import { QuizService } from '../services/quiz.service';
import { logger } from '../config/logger';

/**
 * Generate quiz for content
 * POST /api/quiz/generate/:contentId
 * Body: { difficulty?: string, regenerate?: boolean }
 * 
 * Note: By default, this endpoint will ALWAYS generate a new quiz
 * and deactivate any existing quiz of the same difficulty.
 * Pass regenerate: false to return existing quiz if present.
 */
export const generateQuiz = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { contentId } = req.params;
    const { difficulty = 'intermediate', regenerate = true } = req.body;
    const userId = (req as any).user.id;

    // Validate difficulty
    if (!['beginner', 'intermediate', 'advanced'].includes(difficulty)) {
      res.status(400).json({
        success: false,
        error: {
          message: 'Invalid difficulty level. Must be beginner, intermediate, or advanced',
        },
      });
      return;
    }

    logger.info(
      `${regenerate ? 'Regenerating' : 'Generating'} quiz for content ${contentId}, ` +
      `user ${userId}, difficulty ${difficulty}`
    );

    const quiz = await QuizService.generateQuizFromContent(
      contentId,
      userId,
      difficulty as 'beginner' | 'intermediate' | 'advanced',
      { regenerate }
    );

    res.status(201).json({
      success: true,
      data: quiz,
      message: regenerate ? 'Quiz regenerated successfully' : 'Quiz generated successfully',
    });
  } catch (error: any) {
    logger.error('Error in generateQuiz controller:', error);
    next(error);
  }
};

/**
 * Get quiz by ID
 * GET /api/quiz/:quizId
 */
export const getQuiz = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { quizId } = req.params;
    const userId = (req as any).user.id;

    const quiz = await QuizService.getQuizById(quizId, userId);

    // Don't send correct answers to the client
    const quizData = quiz.toObject();
    quizData.questions = quizData.questions.map((q: any) => ({
      question: q.question,
      type: q.type,
      options: q.options,
      difficulty: q.difficulty,
      points: q.points,
      // Remove correctAnswer and explanation
    }));

    res.json({
      success: true,
      data: quizData,
    });
  } catch (error: any) {
    logger.error('Error in getQuiz controller:', error);
    next(error);
  }
};

/**
 * Get quizzes by content ID
 * GET /api/quiz/content/:contentId?includeInactive=true
 */
export const getQuizzesByContent = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { contentId } = req.params;
    const { includeInactive = 'true' } = req.query;
    const userId = (req as any).user.id;

    const quizzes = await QuizService.getQuizzesByContent(
      contentId, 
      userId,
      includeInactive === 'true'
    );

    res.json({
      success: true,
      data: quizzes,
    });
  } catch (error: any) {
    logger.error('Error in getQuizzesByContent controller:', error);
    next(error);
  }
};

/**
 * Get quiz version history for specific difficulty
 * GET /api/quiz/content/:contentId/versions/:difficulty
 */
export const getQuizVersions = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { contentId, difficulty } = req.params;
    const userId = (req as any).user.id;

    // Validate difficulty
    if (!['beginner', 'intermediate', 'advanced'].includes(difficulty)) {
      res.status(400).json({
        success: false,
        error: {
          message: 'Invalid difficulty level. Must be beginner, intermediate, or advanced',
        },
      });
      return;
    }

    const quizzes = await QuizService.getQuizVersions(
      contentId,
      userId,
      difficulty as 'beginner' | 'intermediate' | 'advanced'
    );

    res.json({
      success: true,
      data: quizzes,
    });
  } catch (error: any) {
    logger.error('Error in getQuizVersions controller:', error);
    next(error);
  }
};

/**
 * Start quiz attempt
 * POST /api/quiz/:quizId/start
 */
export const startQuizAttempt = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { quizId } = req.params;
    const userId = (req as any).user.id;

    const attempt = await QuizService.startQuizAttempt(quizId, userId);

    res.status(201).json({
      success: true,
      data: attempt,
    });
  } catch (error: any) {
    logger.error('Error in startQuizAttempt controller:', error);
    next(error);
  }
};

/**
 * Submit quiz answers
 * POST /api/quiz/attempt/:attemptId/submit
 */
export const submitQuiz = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { attemptId } = req.params;
    const { answers } = req.body;
    const userId = (req as any).user.id;

    // Validate submission
    if (!answers || !Array.isArray(answers)) {
      res.status(400).json({
        success: false,
        error: {
          message: 'Invalid submission. Answers must be an array',
        },
      });
      return;
    }

    // Validate each answer
    for (const answer of answers) {
      if (
        typeof answer.questionIndex !== 'number' ||
        answer.userAnswer === undefined ||
        typeof answer.timeSpent !== 'number'
      ) {
        res.status(400).json({
          success: false,
          error: {
            message: 'Invalid answer format. Each answer must have questionIndex, userAnswer, and timeSpent',
          },
        });
        return;
      }
    }

    logger.info(`Submitting quiz attempt ${attemptId} with ${answers.length} answers`);

    const result = await QuizService.submitQuiz(attemptId, userId, { answers });

    res.json({
      success: true,
      data: {
        attempt: result.attempt,
        passed: result.passed,
        feedback: result.feedback,
        suggestedDifficulty: result.suggestedDifficulty,
      },
    });
  } catch (error: any) {
    logger.error('Error in submitQuiz controller:', error);
    next(error);
  }
};

/**
 * Get quiz attempt results
 * GET /api/quiz/attempt/:attemptId
 */
export const getQuizAttempt = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { attemptId } = req.params;
    const userId = (req as any).user.id;

    const attempt = await QuizService.getQuizAttemptById(attemptId, userId);

    res.json({
      success: true,
      data: attempt,
    });
  } catch (error: any) {
    logger.error('Error in getQuizAttempt controller:', error);
    next(error);
  }
};

/**
 * Get user's quiz attempts
 * GET /api/quiz/attempts
 */
export const getUserQuizAttempts = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const { contentId } = req.query;

    const attempts = await QuizService.getQuizAttempts(
      userId,
      contentId as string | undefined
    );

    res.json({
      success: true,
      data: attempts,
    });
  } catch (error: any) {
    logger.error('Error in getUserQuizAttempts controller:', error);
    next(error);
  }
};

/**
 * Regenerate quiz
 * POST /api/quiz/:quizId/regenerate
 */
export const regenerateQuiz = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { quizId } = req.params;
    const userId = (req as any).user.id;

    logger.info(`Regenerating quiz ${quizId} for user ${userId}`);

    const newQuiz = await QuizService.regenerateQuiz(quizId, userId);

    res.status(201).json({
      success: true,
      data: newQuiz,
      message: 'Quiz regenerated successfully',
    });
  } catch (error: any) {
    logger.error('Error in regenerateQuiz controller:', error);
    next(error);
  }
};

/**
 * Ensure quizzes exist for content (auto-generate if missing)
 * POST /api/quiz/content/:contentId/ensure
 */
export const ensureQuizzes = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { contentId } = req.params;
    const userId = (req as any).user.id;

    logger.info(`Ensuring quizzes exist for content ${contentId}, user ${userId}`);

    const result = await QuizService.ensureQuizzesExist(contentId, userId);

    res.json({
      success: true,
      data: {
        quizzes: result.quizzes,
        existed: result.existed,
        message: result.existed 
          ? 'Quizzes already exist' 
          : 'Quizzes auto-generated successfully',
      },
    });
  } catch (error: any) {
    logger.error('Error in ensureQuizzes controller:', error);
    next(error);
  }
};
