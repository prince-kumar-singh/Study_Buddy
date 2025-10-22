import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { askQuestion } from '../services/ai/chains/qa.chain';
import { QA } from '../models/QA.model';
import { User } from '../models/User.model';
import { ApiError } from '../middleware/error.middleware';
import { qaRateLimiter } from '../middleware/rateLimit.middleware';
import jwt from 'jsonwebtoken';

const router = Router();

// Ask a question with rate limiting
router.post(
  '/ask',
  qaRateLimiter,
  [
    body('contentId').notEmpty().withMessage('Content ID is required'),
    body('question')
      .trim()
      .isLength({ min: 3, max: 500 })
      .withMessage('Question must be between 3 and 500 characters'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ApiError(400, errors.array()[0].msg);
      }

      // Extract user from token
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new ApiError(401, 'No token provided');
      }

      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as any;

      // Check rate limit for free tier
      const user = await User.findById(decoded.id);
      if (!user) {
        throw new ApiError(401, 'User not found');
      }

      if (user.subscription.tier === 'free') {
        const freeLimit = parseInt(process.env.FREE_TIER_QA_LIMIT || '10', 10);
        if (user.usage.qaQuestionsThisWeek >= freeLimit) {
          throw new ApiError(429, 'Weekly Q&A limit reached. Upgrade to premium for unlimited questions.');
        }
      }

      const { contentId, question } = req.body;

      // Get conversation history
      const previousQAs = await QA.find({
        userId: user._id,
        contentId,
      })
        .sort({ createdAt: -1 })
        .limit(5);

      const conversationHistory = previousQAs.reverse().map((qa) => ({
        question: qa.question,
        answer: qa.answer,
      }));

      // Ask question using AI chain
      const result = await askQuestion(contentId, question, conversationHistory);

      // Save Q&A
      const qa = await QA.create({
        contentId,
        userId: user._id,
        question,
        answer: result.answer,
        sourceSegments: result.sourceSegments,
        metadata: {
          responseTime: result.responseTime,
          model: result.model,
          confidence: result.confidence,
        },
      });

      // Update user usage
      user.usage.qaQuestionsThisWeek += 1;
      await user.save();

      res.json({
        success: true,
        data: {
          qa: {
            id: qa._id,
            question: qa.question,
            answer: qa.answer,
            sourceSegments: qa.sourceSegments,
            createdAt: qa.createdAt,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get Q&A history
router.get('/history/:contentId', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError(401, 'No token provided');
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as any;

    const { contentId } = req.params;

    const qas = await QA.find({
      userId: decoded.id,
      contentId,
    })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      data: { qas },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
