import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth.middleware';
import { ApiError } from '../middleware/error.middleware';
import { Content } from '../models/Content.model';
import { logger } from '../config/logger';
import { ContentProcessor } from '../services/processing/content.processor';
import { wsService } from '../config/websocket';

const router = Router();
const contentProcessor = new ContentProcessor(wsService);

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/contents
 * Get all contents for authenticated user
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    
    // Parse query parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const type = req.query.type as string;
    const status = req.query.status as string;
    const sortBy = req.query.sortBy as string || 'createdAt';
    const sortOrder = req.query.sortOrder as string === 'asc' ? 1 : -1;

    // Build query
    const query: any = {
      userId: new mongoose.Types.ObjectId(userId),
      isDeleted: false,
    };

    if (type && ['youtube', 'pdf', 'docx', 'txt'].includes(type)) {
      query.type = type;
    }

    if (status && ['pending', 'processing', 'completed', 'failed'].includes(status)) {
      query.status = status;
    }

    // Execute query with pagination
    const skip = (page - 1) * limit;
    const [contents, total] = await Promise.all([
      Content.find(query)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .select('-__v')
        .lean(),
      Content.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);

    logger.info(`Retrieved ${contents.length} contents for user ${userId}`);

    res.json({
      success: true,
      data: {
        contents,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/contents/:id
 * Get single content by ID
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(400, 'Invalid content ID');
    }

    const content = await Content.findOne({
      _id: id,
      userId: new mongoose.Types.ObjectId(userId),
      isDeleted: false,
    }).select('-__v');

    if (!content) {
      throw new ApiError(404, 'Content not found');
    }

    logger.info(`Retrieved content ${id} for user ${userId}`);

    res.json({
      success: true,
      data: { content },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/contents/upload-youtube
 * Upload YouTube video for processing
 */
router.post('/upload-youtube', 
  [
    body('url').isURL().withMessage('Valid YouTube URL required'),
    body('title').optional().trim().isLength({ min: 1, max: 200 }),
    body('description').optional().trim().isLength({ max: 1000 }),
    body('tags').optional().isArray(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ApiError(400, errors.array()[0].msg);
      }

      const userId = req.user!.id;
      const { url, title, description, tags } = req.body;

      // TODO: Validate YouTube URL format and extract video ID
      // TODO: Check video duration (max 3 hours)
      // TODO: Check video availability

      // Create content document
      const content = await Content.create({
        userId: new mongoose.Types.ObjectId(userId),
        type: 'youtube',
        title: title || 'YouTube Video',
        description,
        sourceUrl: url,
        tags: tags || [],
        status: 'pending',
        processingStages: {
          transcription: { status: 'pending', progress: 0 },
          vectorization: { status: 'pending', progress: 0 },
          summarization: { status: 'pending', progress: 0 },
          flashcardGeneration: { status: 'pending', progress: 0 },
          quizGeneration: { status: 'pending', progress: 0 },
        },
      });

      logger.info(`YouTube upload initiated: ${content._id} by user ${userId}`);

      // Start processing automatically in background
      const contentId = (content._id as mongoose.Types.ObjectId).toString();
      contentProcessor.processYouTubeContent(contentId, userId).catch((error) => {
        logger.error(`Background processing failed for content ${contentId}:`, error);
      });

      res.status(201).json({
        success: true,
        data: { content },
        message: 'YouTube video queued for processing. Processing started automatically.',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/contents/upload-document
 * Upload document (PDF/DOCX/TXT) for processing
 */
router.post('/upload-document', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // TODO: Implement file upload with multer
    // TODO: Validate file type and size (25MB max)
    // TODO: Upload to Google Cloud Storage
    // TODO: Create content document
    // TODO: Queue processing job

    throw new ApiError(501, 'Document upload not implemented yet');
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/contents/:id
 * Soft delete content
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(400, 'Invalid content ID');
    }

    const content = await Content.findOne({
      _id: id,
      userId: new mongoose.Types.ObjectId(userId),
      isDeleted: false,
    });

    if (!content) {
      throw new ApiError(404, 'Content not found');
    }

    // Soft delete (30-day recovery window)
    content.isDeleted = true;
    content.deletedAt = new Date();
    await content.save();

    logger.info(`Content soft deleted: ${id} by user ${userId}`);

    res.json({
      success: true,
      message: 'Content deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
