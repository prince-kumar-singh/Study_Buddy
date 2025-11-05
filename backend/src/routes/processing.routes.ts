import { Router, Request, Response, NextFunction } from 'express';
import { param } from 'express-validator';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth.middleware';
import { ApiError } from '../middleware/error.middleware';
import { Content } from '../models/Content.model';
import { ContentProcessor } from '../services/processing/content.processor';
import { wsService } from '../config/websocket';
import { logger } from '../config/logger';

const router = Router();
const contentProcessor = new ContentProcessor(wsService);

// All routes require authentication
router.use(authenticate);

// Removed legacy manual start endpoint for YouTube content.

/**
 * GET /api/processing/status/:id
 * Get processing status for a content item
 */
router.get(
  '/status/:id',
  [param('id').isMongoId().withMessage('Invalid content ID')],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      const content = await Content.findOne({
        _id: id,
        userId: new mongoose.Types.ObjectId(userId),
        isDeleted: false,
      }).select('status processingStages metadata.error');

      if (!content) {
        throw new ApiError(404, 'Content not found');
      }

      res.json({
        success: true,
        data: {
          status: content.status,
          stages: content.processingStages,
          error: content.metadata?.error,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
