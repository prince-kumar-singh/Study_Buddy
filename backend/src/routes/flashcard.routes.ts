import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult, param } from 'express-validator';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth.middleware';
import { ApiError } from '../middleware/error.middleware';
import { contentDeleteService } from '../services/content/delete.service';
import { flashcardController } from '../services/ai/controllers/flashcard.controller';
import { Content } from '../models/Content.model';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/flashcards/due
 * Get due flashcards for review (must come before /:contentId)
 */
router.get('/due', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 20;

    const flashcards = await flashcardController.getDueFlashcards(userId, limit);

    res.json({
      success: true,
      data: {
        flashcards,
        count: flashcards.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/flashcards/create
 * Create a custom flashcard manually
 */
router.post('/create',
  [
    body('contentId').isMongoId().withMessage('Invalid content ID'),
    body('front').isString().trim().isLength({ min: 1, max: 500 }).withMessage('Front text must be 1-500 characters'),
    body('back').isString().trim().isLength({ min: 1, max: 2000 }).withMessage('Back text must be 1-2000 characters'),
    body('type').isIn(['mcq', 'truefalse', 'fillin', 'essay']).withMessage('Invalid flashcard type'),
    body('difficulty').isIn(['easy', 'medium', 'hard']).withMessage('Invalid difficulty level'),
    body('tags').optional().isArray().withMessage('Tags must be an array'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ApiError(400, errors.array()[0].msg);
      }

      const userId = req.user!.id;
      const { contentId, front, back, type, difficulty, tags } = req.body;

      // Verify content exists and user has access
      const content = await Content.findOne({
        _id: contentId,
        userId,
        deletedAt: null,
      });
      
      if (!content) {
        throw new ApiError(404, 'Content not found or access denied');
      }

      // Create custom flashcard
      const flashcard = await flashcardController.createCustomFlashcard(
        userId,
        contentId,
        front,
        back,
        type,
        difficulty,
        tags || []
      );

      res.status(201).json({
        success: true,
        message: 'Custom flashcard created successfully',
        data: { flashcard },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/flashcards/:id
 * Update a flashcard
 */
router.put('/:id',
  [
    param('id').isMongoId().withMessage('Invalid flashcard ID'),
    body('front').optional().isString().trim().isLength({ min: 1, max: 500 }).withMessage('Front text must be 1-500 characters'),
    body('back').optional().isString().trim().isLength({ min: 1, max: 2000 }).withMessage('Back text must be 1-2000 characters'),
    body('type').optional().isIn(['mcq', 'truefalse', 'fillin', 'essay']).withMessage('Invalid flashcard type'),
    body('difficulty').optional().isIn(['easy', 'medium', 'hard']).withMessage('Invalid difficulty level'),
    body('tags').optional().isArray().withMessage('Tags must be an array'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ApiError(400, errors.array()[0].msg);
      }

      const userId = req.user!.id;
      const { id } = req.params;
      const updates = req.body;

      const flashcard = await flashcardController.updateFlashcard(id, userId, updates);

      res.json({
        success: true,
        message: 'Flashcard updated successfully',
        data: { flashcard },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/flashcards/statistics
 * Get user flashcard statistics
 */
router.get('/statistics', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const statistics = await flashcardController.getFlashcardStatistics(userId);

    res.json({
      success: true,
      data: statistics,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/flashcards/:contentId
 * Get flashcards for a specific content
 */
router.get('/:contentId', 
  [param('contentId').isMongoId().withMessage('Invalid content ID')],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ApiError(400, errors.array()[0].msg);
      }

      const userId = req.user!.id;
      const { contentId } = req.params;

      const flashcards = await flashcardController.getFlashcardsByContent(contentId, userId);

      res.json({
        success: true,
        data: {
          flashcards,
          count: flashcards.length,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/flashcards/:id/review
 * Review a flashcard and update spaced repetition
 */
router.put('/:id/review',
  [
    param('id').isMongoId().withMessage('Invalid flashcard ID'),
    body('quality')
      .isInt({ min: 0, max: 5 })
      .withMessage('Quality rating must be between 0 and 5'),
    body('responseTime')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Response time must be a positive integer'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ApiError(400, errors.array()[0].msg);
      }

      const userId = req.user!.id;
      const { id } = req.params;
      const { quality, responseTime } = req.body;

      const flashcard = await flashcardController.reviewFlashcard(
        id,
        userId,
        quality,
        responseTime
      );

      res.json({
        success: true,
        message: 'Flashcard reviewed successfully',
        data: {
          flashcard,
          nextReview: flashcard.spacedRepetition.nextReviewDate,
          interval: flashcard.spacedRepetition.interval,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/flashcards/:id/reset
 * Reset flashcard progress
 */
router.put('/:id/reset',
  [param('id').isMongoId().withMessage('Invalid flashcard ID')],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ApiError(400, errors.array()[0].msg);
      }

      const userId = req.user!.id;
      const { id } = req.params;

      const flashcard = await flashcardController.resetFlashcard(id, userId);

      res.json({
        success: true,
        message: 'Flashcard progress reset successfully',
        data: { flashcard },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/flashcards/analytics/performance
 * Get user performance analytics
 */
router.get('/analytics/performance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const days = parseInt(req.query.days as string) || 30;

    const analytics = await flashcardController.getPerformanceAnalytics(userId, days);

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/flashcards/analytics/content/:contentId
 * Get content-specific analytics
 */
router.get('/analytics/content/:contentId',
  [param('contentId').isMongoId().withMessage('Invalid content ID')],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ApiError(400, errors.array()[0].msg);
      }

      const userId = req.user!.id;
      const { contentId } = req.params;

      const analytics = await flashcardController.getContentAnalytics(userId, contentId);

      res.json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/flashcards/bulk-delete
 * Delete multiple flashcards
 */
router.delete('/bulk-delete',
  [
    body('flashcardIds').isArray({ min: 1 }).withMessage('At least one flashcard ID required'),
    body('flashcardIds.*').isMongoId().withMessage('Invalid flashcard ID format'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ApiError(400, errors.array()[0].msg);
      }

      const userId = req.user!.id;
      const { flashcardIds } = req.body;

      const result = await contentDeleteService.deleteFlashcards(flashcardIds, userId);

      res.json({
        success: true,
        message: `${result.deletedCount} flashcard(s) deleted successfully`,
        data: {
          deletedCount: result.deletedCount,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/flashcards/:id
 * Delete a single flashcard
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(400, 'Invalid flashcard ID');
    }

    const result = await contentDeleteService.deleteFlashcards([id], userId);

    if (result.deletedCount === 0) {
      throw new ApiError(404, 'Flashcard not found');
    }

    res.json({
      success: true,
      message: 'Flashcard deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
