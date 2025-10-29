import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import mongoose from 'mongoose';
import { askQuestion, askQuestionStream, generateFollowUpQuestions } from '../services/ai/chains/qa.chain';
import { QA } from '../models/QA.model';
import { User } from '../models/User.model';
import { ApiError } from '../middleware/error.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { qaRateLimiter } from '../middleware/rateLimit.middleware';
import { contentDeleteService } from '../services/content/delete.service';
import jwt from 'jsonwebtoken';
import { logger } from '../config/logger';

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

      // Get user
      const user = await User.findById(decoded.id);
      if (!user) {
        throw new ApiError(401, 'User not found');
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

// Ask a question with streaming support (Server-Sent Events)
router.post(
  '/ask-stream',
  qaRateLimiter,
  [
    body('contentId').notEmpty().withMessage('Content ID is required'),
    body('question')
      .trim()
      .isLength({ min: 3, max: 500 })
      .withMessage('Question must be between 3 and 500 characters'),
    body('sessionId').optional().isString().withMessage('Session ID must be a string'),
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

      // Get user
      const user = await User.findById(decoded.id);
      if (!user) {
        throw new ApiError(401, 'User not found');
      }

      const { contentId, question, sessionId } = req.body;

      // Get conversation history (filter by sessionId if provided)
      const historyQuery: any = {
        userId: user._id,
        contentId,
      };
      if (sessionId) {
        historyQuery.sessionId = sessionId;
      }

      const previousQAs = await QA.find(historyQuery)
        .sort({ createdAt: -1 })
        .limit(5);

      const conversationHistory = previousQAs.reverse().map((qa) => ({
        question: qa.question,
        answer: qa.answer,
      }));

      // Set headers for Server-Sent Events
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      let fullAnswer = '';
      let sourceSegments: any[] = [];

      try {
        // Stream the answer
        const stream = askQuestionStream(contentId, question, conversationHistory);

        for await (const chunk of stream) {
          if (chunk.done) {
            // Final chunk with source segments
            sourceSegments = chunk.sourceSegments || [];
            
            // Send completion event
            res.write(`event: complete\n`);
            res.write(`data: ${JSON.stringify({ sourceSegments })}\n\n`);
          } else {
            // Stream token
            fullAnswer += chunk.token;
            res.write(`event: token\n`);
            res.write(`data: ${JSON.stringify({ token: chunk.token })}\n\n`);
          }
        }

        // Save Q&A to database
        const qaData: any = {
          contentId,
          userId: user._id,
          question,
          answer: fullAnswer,
          sourceSegments,
          metadata: {
            responseTime: 0, // Not accurate for streaming
            model: 'gemini-2.0-flash-exp', // Current streaming model
          },
        };

        // Add sessionId if provided
        if (sessionId) {
          qaData.sessionId = sessionId;
        }

        const qa = await QA.create(qaData);



        // Send final metadata
        res.write(`event: metadata\n`);
        res.write(`data: ${JSON.stringify({ 
          qaId: qa._id,
          createdAt: qa.createdAt 
        })}\n\n`);

        res.end();

      } catch (streamError: any) {
        logger.error('Error in streaming Q&A:', streamError);
        res.write(`event: error\n`);
        res.write(`data: ${JSON.stringify({ 
          message: streamError.message || 'Failed to generate answer' 
        })}\n\n`);
        res.end();
      }

    } catch (error) {
      next(error);
    }
  }
);

// Generate follow-up questions
router.post(
  '/follow-up',
  authenticate,
  [
    body('question').notEmpty().withMessage('Question is required'),
    body('answer').notEmpty().withMessage('Answer is required'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ApiError(400, errors.array()[0].msg);
      }

      const { question, answer } = req.body;

      const followUpQuestions = await generateFollowUpQuestions(question, answer);

      res.json({
        success: true,
        data: {
          followUpQuestions,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get Q&A history
router.get('/history/:contentId', authenticate, async (req, res, next) => {
  try {
    const { contentId } = req.params;
    const userId = req.user!.id;

    const qas = await QA.find({
      userId,
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

/**
 * DELETE /api/qa/bulk-delete
 * Delete multiple Q&A records
 */
router.delete('/bulk-delete',
  authenticate,
  [
    body('qaIds').isArray({ min: 1 }).withMessage('At least one Q&A ID required'),
    body('qaIds.*').isMongoId().withMessage('Invalid Q&A ID format'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ApiError(400, errors.array()[0].msg);
      }

      const userId = req.user!.id;
      const { qaIds } = req.body;

      const result = await contentDeleteService.deleteQARecords(qaIds, userId);

      res.json({
        success: true,
        message: `${result.deletedCount} Q&A record(s) deleted successfully`,
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
 * DELETE /api/qa/:id
 * Delete a single Q&A record
 */
router.delete('/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      // Validate ObjectId
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ApiError(400, 'Invalid Q&A ID');
      }

      const result = await contentDeleteService.deleteQARecords([id], userId);

      if (result.deletedCount === 0) {
        throw new ApiError(404, 'Q&A record not found');
      }

      res.json({
        success: true,
        message: 'Q&A record deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
