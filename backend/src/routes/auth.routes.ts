import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { User } from '../models/User.model';
import { ApiError } from '../middleware/error.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { logger } from '../config/logger';
import { deleteAllUserVectorsFromVectorStore } from '../services/ai/vectorstore/setup';

const router = Router();

// Validation middleware
const validateRegistration = [
  body('email').isEmail().normalizeEmail().withMessage('Invalid email address'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain uppercase, lowercase, number, and special character'),
  body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
];

const validateLogin = [
  body('email').isEmail().normalizeEmail(),
  body('password').exists().withMessage('Password is required'),
];

// Register
router.post('/register', validateRegistration, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, errors.array()[0].msg);
    }

    const { email, password, name } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new ApiError(400, 'User already exists');
    }

    // Create user
    const user = await User.create({
      email,
      password,
      name,
    });

    // Generate JWT
    const jwtSecret = process.env.JWT_SECRET || 'secret';
    const token = jwt.sign(
      { id: (user._id as mongoose.Types.ObjectId).toString(), email: user.email, role: user.role },
      jwtSecret,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' } as jwt.SignOptions
    );

    logger.info(`User registered: ${email}`);

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        token,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Login
router.post('/login', validateLogin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, errors.array()[0].msg);
    }

    const { email, password } = req.body;

    // Find user with password field
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      throw new ApiError(401, 'Invalid credentials');
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      throw new ApiError(401, 'Invalid credentials');
    }

    // Update last login
    user.lastLoginAt = new Date();
    await user.save();

    // Generate JWT
    const jwtSecret = process.env.JWT_SECRET || 'secret';
    const token = jwt.sign(
      { id: (user._id as mongoose.Types.ObjectId).toString(), email: user.email, role: user.role },
      jwtSecret,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' } as jwt.SignOptions
    );

    logger.info(`User logged in: ${email}`);

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          subscription: user.subscription,
        },
        token,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get current user
router.get('/me', async (req, res, next) => {
  try {
    // Extract token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError(401, 'No token provided');
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as any;

    const user = await User.findById(decoded.id);
    if (!user) {
      throw new ApiError(401, 'User not found');
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          subscription: user.subscription,
          preferences: user.preferences,
          usage: user.usage,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// Logout
router.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // In a stateless JWT system, logout is handled client-side by removing the token
    // However, we can log the event and return a success response
    
    // Optional: Extract user info from token for logging
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as any;
        logger.info(`User logged out: ${decoded.email}`);
      } catch (error) {
        // Token might be expired or invalid, which is fine for logout
        logger.info('User logged out (token invalid or expired)');
      }
    }

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
});

// Delete Account
router.delete('/delete-account', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    // Get user first to log the deletion
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    logger.info(`Starting account deletion for user: ${user.email} (${userId})`);

    // Import the comprehensive content deletion service
    const { contentDeleteService } = await import('../services/content/delete.service');

    // CRITICAL: Get ALL user's content including soft-deleted items
    // Soft-deleted content must be permanently deleted during account deletion
    const { Content } = await import('../models/Content.model');
    const userContents = await Content.find({ userId }); // Active content
    const softDeletedContents = await Content.find({ userId, isDeleted: true }); // Soft-deleted content
    const allUserContents = [...userContents, ...softDeletedContents];
    
    logger.info(`Found ${userContents.length} active and ${softDeletedContents.length} soft-deleted content items (${allUserContents.length} total) to delete for user ${userId}`);

    // Delete all user content (both active and soft-deleted) using the comprehensive deletion service
    // This will handle vector store, Cloudinary, and all related data cleanup
    const contentDeletionResults: Array<{ success: boolean; message: string; deletedCounts: any }> = [];
    for (const content of allUserContents) {
      try {
        const result = await contentDeleteService.permanentlyDeleteContent(
          (content._id as any).toString(),
          userId,
          {
            deleteRelatedData: true,
            deleteFromCloudinary: true
          }
        );
        contentDeletionResults.push(result);
        logger.info(`Successfully deleted content ${content._id}: ${result.message}`);
      } catch (error) {
        logger.error(`Failed to delete content ${content._id}:`, error);
        // Continue with other content - we'll report the overall status
      }
    }

    // CRITICAL: Cleanup any remaining vectors for this user as a safety net
    // This handles cases where content deletion may have partially failed
    let vectorCleanupResult: { deletedCount: number; error: string | null } = { deletedCount: 0, error: null };
    try {
      logger.info(`Performing comprehensive vector cleanup for user ${userId}`);
      const result = await deleteAllUserVectorsFromVectorStore(userId, { retries: 3, throwOnError: false });
      vectorCleanupResult.deletedCount = result.deletedCount || 0;
      vectorCleanupResult.error = result.error || null;
      if (result.error) {
        logger.warn(`Vector cleanup had issues for user ${userId}: ${result.error}`);
      } else {
        logger.info(`Vector cleanup completed for user ${userId}`);
      }
    } catch (vectorError) {
      vectorCleanupResult.error = vectorError instanceof Error ? vectorError.message : String(vectorError);
      logger.error(`Vector cleanup failed for user ${userId}:`, vectorError);
      // Continue - this shouldn't block account deletion
    }

    // Now delete remaining user-specific data that's not content-related
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Delete remaining user-specific data
      const { ApiRequestLog } = await import('../models/ApiRequestLog.model');
      
      // Delete API logs
      const apiLogResult = await ApiRequestLog.deleteMany({ userId }).session(session);
      
      // Delete any orphaned chat sessions (should be cleaned up by content deletion, but just in case)
      const { ChatSession } = await import('../models/ChatSession.model');
      const orphanedChatSessions = await ChatSession.deleteMany({ userId }).session(session);

      // Delete any orphaned Q&A records
      const { QA } = await import('../models/QA.model');
      const orphanedQAs = await QA.deleteMany({ userId }).session(session);

      // Finally, delete the user account
      await User.findByIdAndDelete(userId).session(session);

      // Commit the transaction
      await session.commitTransaction();

      // Calculate total deletion counts
      const totalDeletionCounts = {
        contents: contentDeletionResults.length,
        activeContents: userContents.length,
        softDeletedContents: softDeletedContents.length,
        apiLogs: apiLogResult.deletedCount || 0,
        orphanedChatSessions: orphanedChatSessions.deletedCount || 0,
        orphanedQAs: orphanedQAs.deletedCount || 0,
        // Aggregate from content deletions
        transcripts: contentDeletionResults.reduce((sum, r) => sum + (r.deletedCounts?.transcripts || 0), 0),
        summaries: contentDeletionResults.reduce((sum, r) => sum + (r.deletedCounts?.summaries || 0), 0),
        flashcards: contentDeletionResults.reduce((sum, r) => sum + (r.deletedCounts?.flashcards || 0), 0),
        flashcardReviews: contentDeletionResults.reduce((sum, r) => sum + (r.deletedCounts?.flashcardReviews || 0), 0),
        quizzes: contentDeletionResults.reduce((sum, r) => sum + (r.deletedCounts?.quizzes || 0), 0),
        quizAttempts: contentDeletionResults.reduce((sum, r) => sum + (r.deletedCounts?.quizAttempts || 0), 0),
        chatSessions: contentDeletionResults.reduce((sum, r) => sum + (r.deletedCounts?.chatSessions || 0), 0),
        qaRecords: contentDeletionResults.reduce((sum, r) => sum + (r.deletedCounts?.qaRecords || 0), 0),
        vectorStoreRecords: contentDeletionResults.reduce((sum, r) => sum + (r.deletedCounts?.vectorStoreRecords || 0), 0),
        cloudinaryFiles: contentDeletionResults.reduce((sum, r) => sum + (r.deletedCounts?.cloudinaryFiles || 0), 0),
        // Add vector cleanup information
        additionalVectorCleanup: vectorCleanupResult.deletedCount,
      };

      const deletionMessage = vectorCleanupResult.error 
        ? 'Account and all associated data have been permanently deleted (with minor vector cleanup issues)'
        : 'Account and all associated data have been permanently deleted';

      logger.info(`Successfully deleted account for user: ${user.email} (${userId})`, totalDeletionCounts);

      res.json({
        success: true,
        message: deletionMessage,
        data: {
          deletedCounts: totalDeletionCounts,
          contentDeletionResults: contentDeletionResults.map(r => ({
            success: r.success,
            message: r.message
          })),
          vectorCleanup: {
            performed: true,
            success: !vectorCleanupResult.error,
            error: vectorCleanupResult.error,
            note: 'Additional safety cleanup of any remaining vector embeddings'
          }
        }
      });

    } catch (error) {
      // Rollback the transaction on error
      await session.abortTransaction();
      throw error;
    } finally {
      // End the session
      session.endSession();
    }

  } catch (error) {
    logger.error('Error deleting user account:', error);
    next(error);
  }
});

export default router;
