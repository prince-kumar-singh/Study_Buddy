import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as quizController from '../controllers/quiz.controller';

const router = Router();

// All quiz routes require authentication
router.use(authenticate);

/**
 * Generate quiz for content
 * POST /api/quiz/generate/:contentId
 */
router.post('/generate/:contentId', quizController.generateQuiz);

/**
 * Get quiz by ID
 * GET /api/quiz/:quizId
 */
router.get('/:quizId', quizController.getQuiz);

/**
 * Get quizzes by content ID
 * GET /api/quiz/content/:contentId
 */
router.get('/content/:contentId', quizController.getQuizzesByContent);

/**
 * Get quiz version history for specific difficulty
 * GET /api/quiz/content/:contentId/versions/:difficulty
 */
router.get('/content/:contentId/versions/:difficulty', quizController.getQuizVersions);

/**
 * Start quiz attempt
 * POST /api/quiz/:quizId/start
 */
router.post('/:quizId/start', quizController.startQuizAttempt);

/**
 * Submit quiz answers
 * POST /api/quiz/attempt/:attemptId/submit
 */
router.post('/attempt/:attemptId/submit', quizController.submitQuiz);

/**
 * Get quiz attempt results
 * GET /api/quiz/attempt/:attemptId
 */
router.get('/attempt/:attemptId', quizController.getQuizAttempt);

/**
 * Get user's quiz attempts
 * GET /api/quiz/attempts
 */
router.get('/attempts', quizController.getUserQuizAttempts);

/**
 * Regenerate quiz
 * POST /api/quiz/:quizId/regenerate
 */
router.post('/:quizId/regenerate', quizController.regenerateQuiz);

/**
 * Ensure quizzes exist for content (auto-generate if missing)
 * POST /api/quiz/content/:contentId/ensure
 */
router.post('/content/:contentId/ensure', quizController.ensureQuizzes);

export default router;
