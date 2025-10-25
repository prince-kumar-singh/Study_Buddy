import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth.middleware';
import { ApiError } from '../middleware/error.middleware';
import { 
  uploadSingle, 
  uploadMultiple, 
  validateUploadedFile, 
  validateUploadedFiles,
  getFileExtension,
  formatFileSize,
  FILE_UPLOAD_CONSTANTS
} from '../middleware/upload.middleware';
import { uploadToCloudinary } from '../config/cloudinary.config';
import { processUploadedFile } from '../services/ai/loaders/document.loader';
import { Content } from '../models/Content.model';
import { logger } from '../config/logger';
import { ContentProcessor } from '../services/processing/content.processor';
import { wsService } from '../config/websocket';
import { contentDeleteService } from '../services/content/delete.service';
import * as path from 'path';

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
 * Upload single document (PDF/DOCX/TXT) for processing
 * Max file size: 25MB
 */
router.post('/upload-document', 
  authenticate,
  (req: Request, res: Response, next: NextFunction) => {
    uploadSingle(req, res, (err: any) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new ApiError(400, `File size exceeds maximum allowed size of ${FILE_UPLOAD_CONSTANTS.MAX_FILE_SIZE_MB}MB`));
        }
        return next(new ApiError(400, err.message || 'File upload failed'));
      }
      next();
    });
  },
  [
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
      const file = req.file;
      
      // Validate uploaded file
      validateUploadedFile(file);

      if (!file) {
        throw new ApiError(400, 'No file uploaded');
      }

      const { title, description, tags } = req.body;

      // Get file type
      const fileExtension = getFileExtension(file.mimetype);
      const fileType = fileExtension === 'doc' ? 'docx' : fileExtension as 'pdf' | 'docx' | 'txt';

      logger.info(`Processing document upload: ${file.originalname} (${formatFileSize(file.size)}) for user ${userId}`);

      // Process document with LangChain loaders
      const documentResult = await processUploadedFile(
        file.buffer,
        file.originalname,
        fileType
      );

      logger.info(`Document loaded: ${documentResult.metadata.totalChunks} chunks, ${documentResult.metadata.totalCharacters} characters`);

      // Save to temporary file for Cloudinary upload
      const tempPath = path.join(__dirname, '../../temp', `${Date.now()}-${file.originalname}`);
      const fs = require('fs');
      if (!fs.existsSync(path.dirname(tempPath))) {
        fs.mkdirSync(path.dirname(tempPath), { recursive: true });
      }
      fs.writeFileSync(tempPath, file.buffer);

      // Upload to Cloudinary
      const cloudinaryResult = await uploadToCloudinary(
        tempPath,
        `study-buddy/documents/${fileType}`,
        'raw'
      );

      // Clean up temp file
      fs.unlinkSync(tempPath);

      logger.info(`File uploaded to Cloudinary: ${cloudinaryResult.public_id}`);

      // Create content document
      const content = await Content.create({
        userId: new mongoose.Types.ObjectId(userId),
        type: fileType,
        title: title || file.originalname,
        description,
        sourceUrl: cloudinaryResult.secure_url,
        cloudinaryPublicId: cloudinaryResult.public_id,
        tags: tags || [],
        status: 'pending',
        metadata: {
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
          uploadDate: new Date(),
          totalPages: documentResult.metadata.totalPages,
          totalCharacters: documentResult.metadata.totalCharacters,
          totalChunks: documentResult.metadata.totalChunks,
        },
        processingStages: {
          transcription: { status: 'completed', progress: 100 }, // Document already loaded
          vectorization: { status: 'pending', progress: 0 },
          summarization: { status: 'pending', progress: 0 },
          flashcardGeneration: { status: 'pending', progress: 0 },
          quizGeneration: { status: 'pending', progress: 0 },
        },
      });

      logger.info(`Document upload completed: ${content._id} by user ${userId}`);

      // Start processing automatically in background
      const contentId = (content._id as mongoose.Types.ObjectId).toString();
      contentProcessor.processDocumentContent(contentId, userId, documentResult.documents).catch((error) => {
        logger.error(`Background processing failed for content ${contentId}:`, error);
      });

      res.status(201).json({
        success: true,
        data: { 
          content,
          processingInfo: {
            totalChunks: documentResult.metadata.totalChunks,
            totalCharacters: documentResult.metadata.totalCharacters,
            totalPages: documentResult.metadata.totalPages,
          }
        },
        message: 'Document uploaded and queued for processing. Processing started automatically.',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/contents/upload-documents
 * Upload multiple documents (PDF/DOCX/TXT) for processing
 * Max 5 files per request, 25MB per file
 */
router.post('/upload-documents',
  authenticate,
  (req: Request, res: Response, next: NextFunction) => {
    uploadMultiple(req, res, (err: any) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new ApiError(400, `File size exceeds maximum allowed size of ${FILE_UPLOAD_CONSTANTS.MAX_FILE_SIZE_MB}MB`));
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return next(new ApiError(400, `Maximum ${FILE_UPLOAD_CONSTANTS.MAX_FILES} files allowed per upload`));
        }
        return next(new ApiError(400, err.message || 'File upload failed'));
      }
      next();
    });
  },
  [
    body('tags').optional().isArray(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ApiError(400, errors.array()[0].msg);
      }

      const userId = req.user!.id;
      const files = req.files as Express.Multer.File[];
      
      // Validate uploaded files
      validateUploadedFiles(files);

      const { tags } = req.body;

      logger.info(`Processing ${files.length} document uploads for user ${userId}`);

      const uploadedContents: any[] = [];

      // Process each file
      for (const file of files) {
        try {
          const fileExtension = getFileExtension(file.mimetype);
          const fileType = fileExtension === 'doc' ? 'docx' : fileExtension as 'pdf' | 'docx' | 'txt';

          // Process document with LangChain loaders
          const documentResult = await processUploadedFile(
            file.buffer,
            file.originalname,
            fileType
          );

          // Save to temporary file for Cloudinary upload
          const tempPath = path.join(__dirname, '../../temp', `${Date.now()}-${file.originalname}`);
          const fs = require('fs');
          if (!fs.existsSync(path.dirname(tempPath))) {
            fs.mkdirSync(path.dirname(tempPath), { recursive: true });
          }
          fs.writeFileSync(tempPath, file.buffer);

          // Upload to Cloudinary
          const cloudinaryResult = await uploadToCloudinary(
            tempPath,
            `study-buddy/documents/${fileType}`,
            'raw'
          );

          // Clean up temp file
          fs.unlinkSync(tempPath);

          // Create content document
          const content = await Content.create({
            userId: new mongoose.Types.ObjectId(userId),
            type: fileType,
            title: file.originalname,
            sourceUrl: cloudinaryResult.secure_url,
            cloudinaryPublicId: cloudinaryResult.public_id,
            tags: tags || [],
            status: 'pending',
            metadata: {
              fileName: file.originalname,
              fileSize: file.size,
              mimeType: file.mimetype,
              uploadDate: new Date(),
              totalPages: documentResult.metadata.totalPages,
              totalCharacters: documentResult.metadata.totalCharacters,
              totalChunks: documentResult.metadata.totalChunks,
            },
            processingStages: {
              transcription: { status: 'completed', progress: 100 },
              vectorization: { status: 'pending', progress: 0 },
              summarization: { status: 'pending', progress: 0 },
              flashcardGeneration: { status: 'pending', progress: 0 },
              quizGeneration: { status: 'pending', progress: 0 },
            },
          });

          uploadedContents.push({
            content,
            processingInfo: {
              totalChunks: documentResult.metadata.totalChunks,
              totalCharacters: documentResult.metadata.totalCharacters,
              totalPages: documentResult.metadata.totalPages,
            }
          });

          // Start processing automatically in background
          const contentId = (content._id as mongoose.Types.ObjectId).toString();
          contentProcessor.processDocumentContent(contentId, userId, documentResult.documents).catch((error) => {
            logger.error(`Background processing failed for content ${contentId}:`, error);
          });

        } catch (fileError) {
          logger.error(`Failed to process file ${file.originalname}:`, fileError);
          // Continue with other files
        }
      }

      logger.info(`Multiple document upload completed: ${uploadedContents.length} files for user ${userId}`);

      res.status(201).json({
        success: true,
        data: { 
          contents: uploadedContents,
          totalUploaded: uploadedContents.length,
          totalFiles: files.length,
        },
        message: `${uploadedContents.length} document(s) uploaded and queued for processing.`,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/contents/:id
 * Soft delete content (30-day recovery window)
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(400, 'Invalid content ID');
    }

    const result = await contentDeleteService.softDeleteContent(id, userId);

    if (!result.success) {
      throw new ApiError(404, result.message);
    }

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/contents/:id/restore
 * Restore soft-deleted content
 */
router.post('/:id/restore', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(400, 'Invalid content ID');
    }

    const result = await contentDeleteService.restoreContent(id, userId);

    if (!result.success) {
      throw new ApiError(404, result.message);
    }

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/contents/:id/resume
 * Resume failed or incomplete content processing
 * Automatically detects the last failed stage and resumes from there
 */
router.post('/:id/resume', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { fromStage } = req.body; // Optional: specify which stage to resume from

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(400, 'Invalid content ID');
    }

    // Validate fromStage if provided
    const validStages = ['transcription', 'vectorization', 'summarization', 'flashcardGeneration', 'quizGeneration'];
    if (fromStage && !validStages.includes(fromStage)) {
      throw new ApiError(400, `Invalid stage. Must be one of: ${validStages.join(', ')}`);
    }

    const content = await Content.findOne({
      _id: id,
      userId: new mongoose.Types.ObjectId(userId),
      isDeleted: false,
    });

    if (!content) {
      throw new ApiError(404, 'Content not found');
    }

    // Check if content is already completed
    if (content.status === 'completed') {
      return res.json({
        success: true,
        message: 'Content processing is already completed',
        data: { content },
      });
    }

    logger.info(`Resuming processing for content ${id} by user ${userId}${fromStage ? ` from stage: ${fromStage}` : ''}`);

    // Start resume processing in background
    contentProcessor.resumeProcessing(id, userId, fromStage).catch((error) => {
      logger.error(`Resume processing failed for content ${id}:`, error);
    });

    res.json({
      success: true,
      message: 'Content processing resumed',
      data: { 
        contentId: id,
        resumeStage: fromStage || 'auto-detected',
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/contents/:id/permanent
 * Permanently delete content and all related data
 */
router.delete('/:id/permanent', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(400, 'Invalid content ID');
    }

    const result = await contentDeleteService.permanentlyDeleteContent(id, userId, {
      deleteRelatedData: true,
      deleteFromCloudinary: true,
    });

    if (!result.success) {
      throw new ApiError(404, result.message);
    }

    res.json({
      success: true,
      message: result.message,
      data: {
        deletedCounts: result.deletedCounts,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/contents/bulk-delete
 * Bulk delete multiple contents
 */
router.post('/bulk-delete', 
  [
    body('contentIds').isArray({ min: 1 }).withMessage('At least one content ID required'),
    body('contentIds.*').isMongoId().withMessage('Invalid content ID format'),
    body('permanent').optional().isBoolean(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ApiError(400, errors.array()[0].msg);
      }

      const userId = req.user!.id;
      const { contentIds, permanent = false } = req.body;

      const result = await contentDeleteService.bulkDeleteContents(
        contentIds,
        userId,
        permanent
      );

      res.json({
        success: result.success,
        message: `${result.successCount} content(s) deleted successfully, ${result.failedCount} failed`,
        data: {
          successCount: result.successCount,
          failedCount: result.failedCount,
          results: result.results,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/contents/deleted
 * Get all deleted contents (within 30-day recovery window)
 */
router.get('/deleted/list', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const result = await contentDeleteService.getDeletedContents(userId, page, limit);

    res.json({
      success: true,
      data: {
        contents: result.contents,
        pagination: result.pagination,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/contents/:id/resume
 * Resume processing for paused content (e.g., after quota restoration)
 */
router.post('/:id/resume', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // Validate content ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(400, 'Invalid content ID');
    }

    // Find content and verify ownership
    const content = await Content.findById(id);
    
    if (!content) {
      throw new ApiError(404, 'Content not found');
    }

    if (content.userId.toString() !== userId) {
      throw new ApiError(403, 'Unauthorized to resume this content');
    }

    // Check if content is paused
    if (content.status !== 'paused') {
      throw new ApiError(400, `Content is not paused (current status: ${content.status})`);
    }

    logger.info(`Resuming processing for content ${id} by user ${userId}`);

    // Start async processing
    contentProcessor.resumeProcessing(id, userId).catch((error) => {
      logger.error(`Failed to resume processing for content ${id}:`, error);
    });

    res.json({
      success: true,
      message: 'Processing resumed successfully',
      data: {
        contentId: id,
        status: 'processing',
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
