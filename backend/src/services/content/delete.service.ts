import mongoose from 'mongoose';
import { Content } from '../../models/Content.model';
import { Flashcard } from '../../models/Flashcard.model';
import { Summary } from '../../models/Summary.model';
import { QA } from '../../models/QA.model';
import { ChatSession } from '../../models/ChatSession.model';
import { Transcript } from '../../models/Transcript.model';
import { Quiz } from '../../models/Quiz.model';
import { QuizAttempt } from '../../models/QuizAttempt.model';
import { FlashcardReview } from '../../models/FlashcardReview.model';
import { logger } from '../../config/logger';
import { v2 as cloudinary } from 'cloudinary';
import { deleteContentFromVectorStore } from '../ai/vectorstore/setup';

export interface DeleteOptions {
  permanent?: boolean;
  deleteRelatedData?: boolean;
  deleteFromCloudinary?: boolean;
}

/**
 * Detailed result for a single content deletion operation
 * Tracks success/failure at each phase for comprehensive error reporting
 */
export interface ContentDeleteResult {
  contentId: string;
  success: boolean;
  message: string;
  phases: {
    validation: { success: boolean; error?: string };
    pinecone: { success: boolean; error?: string; deleted?: boolean };
    cloudinary: { success: boolean; error?: string; deleted?: boolean };
    mongodb: { success: boolean; error?: string; deletedCounts?: any };
  };
  timestamp: Date;
}

/**
 * Comprehensive result for bulk delete operations
 * Provides detailed breakdown of successes, failures, and partial failures
 */
export interface BulkDeleteResult {
  success: boolean;
  totalRequested: number;
  totalSucceeded: number;
  totalFailed: number;
  totalPartiallyFailed: number; // Items that succeeded in some phases but failed in others
  results: ContentDeleteResult[];
  summary: {
    pineconeDeletedCount: number;
    pineconeFailedCount: number;
    mongodbDeletedCount: number;
    mongodbFailedCount: number;
    cloudinaryDeletedCount: number;
    cloudinaryFailedCount: number;
  };
  processingTimeMs: number;
}

export class ContentDeleteService {
  /**
   * Soft delete content (30-day recovery window)
   * Marks content as deleted in MongoDB and tags Cloudinary files for cleanup
   */
  async softDeleteContent(
    contentId: string,
    userId: string
  ): Promise<{ success: boolean; message: string; cloudinaryMarked?: boolean }> {
    try {
      const content = await Content.findOne({
        _id: contentId,
        userId: new mongoose.Types.ObjectId(userId),
        isDeleted: false,
      });

      if (!content) {
        return { success: false, message: 'Content not found' };
      }

      // Mark Cloudinary file for soft deletion if it exists
      let cloudinaryMarked = false;
      if (content.cloudinaryPublicId) {
        try {
          const { markForSoftDeletion } = await import('../../config/cloudinary.config');
          const result = await markForSoftDeletion(
            content.cloudinaryPublicId,
            'raw', // Assuming documents are stored as raw files
            userId
          );
          cloudinaryMarked = result.success;
          
          if (!result.success) {
            logger.warn(`Failed to mark Cloudinary file for soft deletion: ${content.cloudinaryPublicId}`, result.error);
          }
        } catch (cloudinaryError) {
          logger.warn(`Error marking Cloudinary file for soft deletion:`, cloudinaryError);
          // Don't fail the entire operation for Cloudinary errors
        }
      }

      // Mark content as soft deleted in MongoDB
      content.isDeleted = true;
      content.deletedAt = new Date();
      await content.save();

      logger.info(`Content soft deleted: ${contentId} by user ${userId}${cloudinaryMarked ? ' (Cloudinary file marked)' : ''}`);

      return {
        success: true,
        message: 'Content deleted successfully. You can recover it within 30 days.',
        cloudinaryMarked
      };
    } catch (error) {
      logger.error(`Error soft deleting content ${contentId}:`, error);
      throw error;
    }
  }

  /**
   * Restore soft-deleted content
   * Restores content in MongoDB and removes soft-deletion tags from Cloudinary
   */
  async restoreContent(
    contentId: string,
    userId: string
  ): Promise<{ success: boolean; message: string; cloudinaryRestored?: boolean }> {
    try {
      const content = await Content.findOne({
        _id: contentId,
        userId: new mongoose.Types.ObjectId(userId),
        isDeleted: true,
      });

      if (!content) {
        return { success: false, message: 'Deleted content not found' };
      }

      // Check if within 30-day recovery window
      const daysSinceDeletion = content.deletedAt
        ? Math.floor((Date.now() - content.deletedAt.getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      if (daysSinceDeletion > 30) {
        return {
          success: false,
          message: 'Content cannot be restored after 30 days',
        };
      }

      // Remove soft deletion tags from Cloudinary file if it exists
      let cloudinaryRestored = false;
      if (content.cloudinaryPublicId) {
        try {
          const { cloudinary } = await import('../../config/cloudinary.config');
          
          // Remove soft-deletion tags
          const tagsToRemove = [
            'soft-deleted',
            `deleted-${content.deletedAt?.toISOString().split('T')[0]}`,
            `user-${userId}`
          ];
          
          for (const tag of tagsToRemove) {
            try {
              await cloudinary.uploader.remove_tag(tag, [content.cloudinaryPublicId], {
                resource_type: 'raw'
              });
            } catch (tagError) {
              // Individual tag removal failure is not critical
              logger.debug(`Could not remove tag ${tag} from ${content.cloudinaryPublicId}:`, tagError);
            }
          }
          
          cloudinaryRestored = true;
          logger.info(`Cloudinary soft-deletion tags removed for: ${content.cloudinaryPublicId}`);
        } catch (cloudinaryError) {
          logger.warn(`Error removing Cloudinary soft-deletion tags:`, cloudinaryError);
          // Don't fail the entire restoration for Cloudinary errors
        }
      }

      // Restore content in MongoDB
      content.isDeleted = false;
      content.deletedAt = undefined;
      await content.save();

      logger.info(`Content restored: ${contentId} by user ${userId}${cloudinaryRestored ? ' (Cloudinary tags removed)' : ''}`);

      return {
        success: true,
        message: 'Content restored successfully',
        cloudinaryRestored
      };
    } catch (error) {
      logger.error(`Error restoring content ${contentId}:`, error);
      throw error;
    }
  }

  /**
   * Permanently delete content and all related data
   * Implements two-phase commit pattern:
   * Phase 1: Delete from external services (Pinecone, Cloudinary)
   * Phase 2: Delete from MongoDB with transaction
   * If Phase 2 fails, Phase 1 deletions cannot be rolled back (eventual consistency)
   */
  async permanentlyDeleteContent(
    contentId: string,
    userId: string,
    options: DeleteOptions = {}
  ): Promise<{ success: boolean; message: string; deletedCounts: any }> {
    const {
      deleteRelatedData = true,
      deleteFromCloudinary = true,
    } = options;

    let vectorStoreDeleted = false;
    let cloudinaryDeleted = false;
    let cloudinaryPublicId: string | undefined;

    const deletedCounts: any = {
      content: 0,
      transcripts: 0,
      summaries: 0,
      flashcards: 0,
      flashcardReviews: 0,
      quizzes: 0,
      quizAttempts: 0,
      qaRecords: 0,
      chatSessions: 0,
      cloudinaryFiles: 0,
      vectorStoreRecords: 0,
    };

    try {
      // PHASE 0: Pre-check - Find content first without transaction
      const content = await Content.findOne({
        _id: contentId,
        userId: new mongoose.Types.ObjectId(userId),
      });

      if (!content) {
        return {
          success: false,
          message: 'Content not found',
          deletedCounts: {},
        };
      }

      cloudinaryPublicId = content.cloudinaryPublicId;

      // PHASE 1: Delete from external services BEFORE starting MongoDB transaction
      // This ensures external services are cleaned up before DB changes
      
      // Delete from vector store (Pinecone) - CRITICAL: Must succeed before DB deletion
      try {
        await deleteContentFromVectorStore(contentId, { 
          retries: 3, 
          throwOnError: true,
          userId: userId // Add userId for additional security
        });
        vectorStoreDeleted = true;
        deletedCounts.vectorStoreRecords = 1;
        logger.info(`✓ Phase 1a: Deleted vectors from Pinecone for content: ${contentId}`);
      } catch (vectorStoreError) {
        logger.error(`✗ Phase 1a FAILED: Could not delete vectors from Pinecone:`, vectorStoreError);
        throw new Error(
          `Failed to delete vector store data after 3 retries. Cannot proceed with content deletion to maintain consistency. Error: ${vectorStoreError instanceof Error ? vectorStoreError.message : String(vectorStoreError)}`
        );
      }

      // Delete from Cloudinary if applicable
      if (deleteFromCloudinary && cloudinaryPublicId) {
        try {
          const { deleteFromCloudinaryWithRetry } = await import('../../config/cloudinary.config');
          const result = await deleteFromCloudinaryWithRetry(cloudinaryPublicId, 'raw', {
            retries: 3,
            throwOnError: false,
            logErrors: true
          });
          
          if (result.success) {
            cloudinaryDeleted = result.deleted || false;
            deletedCounts.cloudinaryFiles = result.deleted ? 1 : 0;
            logger.info(`✓ Phase 1b: Cloudinary file ${result.deleted ? 'deleted' : 'not found'}: ${cloudinaryPublicId}`);
          } else {
            logger.warn(`⚠ Phase 1b: Failed to delete Cloudinary file (non-critical): ${result.error}`);
          }
        } catch (cloudinaryError) {
          logger.warn(`⚠ Phase 1b: Failed to delete Cloudinary file (non-critical):`, cloudinaryError);
          // Cloudinary failure is non-critical - file may not exist or may be cleaned up later
        }
      }

      // PHASE 2: Delete from MongoDB with transaction
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        // Verify content still exists (avoid race conditions)
        const contentToDelete = await Content.findOne({
          _id: contentId,
          userId: new mongoose.Types.ObjectId(userId),
        }).session(session);

        if (!contentToDelete) {
          await session.abortTransaction();
          logger.error(`Content ${contentId} not found in transaction - possible race condition`);
          throw new Error('Content not found during transaction');
        }

        // Delete related data if requested
        if (deleteRelatedData) {
          // Delete transcripts
          const transcriptResult = await Transcript.deleteMany(
            { contentId: new mongoose.Types.ObjectId(contentId) },
            { session }
          );
          deletedCounts.transcripts = transcriptResult.deletedCount || 0;

          // Delete summaries
          const summaryResult = await Summary.deleteMany(
            { contentId: new mongoose.Types.ObjectId(contentId) },
            { session }
          );
          deletedCounts.summaries = summaryResult.deletedCount || 0;

          // Delete flashcard reviews (must be deleted before flashcards due to reference)
          const flashcardReviewResult = await FlashcardReview.deleteMany(
            { contentId: new mongoose.Types.ObjectId(contentId) },
            { session }
          );
          deletedCounts.flashcardReviews = flashcardReviewResult.deletedCount || 0;

          // Delete flashcards
          const flashcardResult = await Flashcard.deleteMany(
            { contentId: new mongoose.Types.ObjectId(contentId) },
            { session }
          );
          deletedCounts.flashcards = flashcardResult.deletedCount || 0;

          // Delete quiz attempts (must be deleted before quizzes due to reference)
          const quizAttemptResult = await QuizAttempt.deleteMany(
            { contentId: new mongoose.Types.ObjectId(contentId) },
            { session }
          );
          deletedCounts.quizAttempts = quizAttemptResult.deletedCount || 0;

          // Delete quizzes
          const quizResult = await Quiz.deleteMany(
            { contentId: new mongoose.Types.ObjectId(contentId) },
            { session }
          );
          deletedCounts.quizzes = quizResult.deletedCount || 0;

          // Delete Q&A records
          const qaResult = await QA.deleteMany(
            { contentId: new mongoose.Types.ObjectId(contentId) },
            { session }
          );
          deletedCounts.qaRecords = qaResult.deletedCount || 0;

          // Delete chat sessions
          const chatSessionResult = await ChatSession.deleteMany(
            { contentId: new mongoose.Types.ObjectId(contentId) },
            { session }
          );
          deletedCounts.chatSessions = chatSessionResult.deletedCount || 0;

          logger.info(`✓ Phase 2a: Deleted related data for content ${contentId}:`, deletedCounts);
        }

        // Delete content document
        await Content.deleteOne({ _id: contentId }, { session });
        deletedCounts.content = 1;

        await session.commitTransaction();
        logger.info(`✓ Phase 2b: MongoDB transaction committed for content ${contentId}`);

        session.endSession();

        logger.info(`✓ SUCCESS: Content permanently deleted: ${contentId} by user ${userId}`, deletedCounts);

        return {
          success: true,
          message: 'Content and all related data permanently deleted',
          deletedCounts,
        };
      } catch (dbError) {
        await session.abortTransaction();
        session.endSession();
        
        logger.error(`✗ Phase 2 FAILED: MongoDB transaction error for content ${contentId}:`, dbError);
        
        // MongoDB failed but external services were already deleted
        // This is an inconsistent state that requires manual intervention
        logger.error(
          `⚠ INCONSISTENT STATE DETECTED: External services deleted but MongoDB failed!\n` +
          `  Content ID: ${contentId}\n` +
          `  Vector Store Deleted: ${vectorStoreDeleted}\n` +
          `  Cloudinary Deleted: ${cloudinaryDeleted}\n` +
          `  Action Required: Manual cleanup or re-process content ${contentId}`
        );
        
        throw new Error(
          `Database deletion failed after external services were cleaned up. ` +
          `Content ${contentId} is in an inconsistent state and requires manual review. ` +
          `Original error: ${dbError instanceof Error ? dbError.message : String(dbError)}`
        );
      }
    } catch (error) {
      logger.error(`✗ OVERALL FAILURE: Error permanently deleting content ${contentId}:`, error);
      throw error;
    }
  }

  /**
   * Bulk delete multiple contents with comprehensive error tracking
   * 
   * Features:
   * - Phase-level error tracking (validation, Pinecone, MongoDB, Cloudinary)
   * - Parallel processing with proper error isolation
   * - Detailed metrics for observability
   * - No rollback on partial failures (maintains individual content consistency)
   * 
   * @param contentIds - Array of content IDs to delete
   * @param userId - User ID performing the deletion
   * @param permanent - If true, permanently delete; if false, soft delete
   * @returns Comprehensive bulk delete result with per-item and aggregate statistics
   */
  async bulkDeleteContents(
    contentIds: string[],
    userId: string,
    permanent: boolean = false
  ): Promise<BulkDeleteResult> {
    const startTime = Date.now();
    const results: ContentDeleteResult[] = [];
    
    logger.info(`[BulkDelete] Starting bulk delete for user ${userId}: ${contentIds.length} items, permanent=${permanent}`);

    // Process deletions with proper error isolation
    // Use Promise.allSettled to ensure all deletions attempt even if some fail
    const deletePromises = contentIds.map(async (contentId): Promise<ContentDeleteResult> => {
      const result: ContentDeleteResult = {
        contentId,
        success: false,
        message: '',
        phases: {
          validation: { success: false },
          pinecone: { success: false },
          cloudinary: { success: false },
          mongodb: { success: false },
        },
        timestamp: new Date(),
      };

      try {
        if (permanent) {
          // For permanent deletion, track each phase individually
          result.phases = await this.permanentlyDeleteContentWithTracking(contentId, userId);
          
          // Determine overall success: must succeed in Pinecone AND MongoDB
          // Cloudinary is non-critical
          const criticalPhasesSucceeded = 
            result.phases.validation.success &&
            result.phases.pinecone.success && 
            result.phases.mongodb.success;
          
          result.success = criticalPhasesSucceeded;
          
          if (result.success) {
            result.message = 'Content permanently deleted successfully';
          } else if (result.phases.validation.success && result.phases.pinecone.success && !result.phases.mongodb.success) {
            result.message = `Partial failure: Pinecone deleted but MongoDB failed - INCONSISTENT STATE`;
            logger.error(`[BulkDelete] INCONSISTENT STATE for ${contentId}: Pinecone succeeded, MongoDB failed`);
          } else if (result.phases.validation.success && !result.phases.pinecone.success) {
            result.message = `Failed to delete from Pinecone: ${result.phases.pinecone.error}`;
          } else {
            result.message = `Validation failed: ${result.phases.validation.error}`;
          }
        } else {
          // Soft delete - simpler flow
          result.phases.validation.success = true;
          const softDeleteResult = await this.softDeleteContent(contentId, userId);
          result.phases.mongodb.success = softDeleteResult.success;
          result.success = softDeleteResult.success;
          result.message = softDeleteResult.message;
          
          if (!softDeleteResult.success) {
            result.phases.mongodb.error = softDeleteResult.message;
          }
        }
      } catch (error) {
        result.success = false;
        result.message = error instanceof Error ? error.message : 'Unknown error during deletion';
        logger.error(`[BulkDelete] Unexpected error for ${contentId}:`, error);
      }

      return result;
    });

    // Wait for all deletions to complete
    const settledResults = await Promise.allSettled(deletePromises);
    
    // Extract results from settled promises
    settledResults.forEach((settled, index) => {
      if (settled.status === 'fulfilled') {
        results.push(settled.value);
      } else {
        // Unexpected error in the deletion promise itself
        results.push({
          contentId: contentIds[index],
          success: false,
          message: `Promise rejection: ${settled.reason}`,
          phases: {
            validation: { success: false, error: 'Promise rejected' },
            pinecone: { success: false },
            cloudinary: { success: false },
            mongodb: { success: false },
          },
          timestamp: new Date(),
        });
        logger.error(`[BulkDelete] Promise rejected for ${contentIds[index]}:`, settled.reason);
      }
    });

    // Calculate aggregate statistics
    const totalSucceeded = results.filter(r => r.success).length;
    const totalFailed = results.filter(r => !r.success).length;
    
    // Partial failures: Pinecone succeeded but MongoDB failed (inconsistent state)
    const totalPartiallyFailed = results.filter(r => 
      !r.success && 
      r.phases.pinecone.success && 
      !r.phases.mongodb.success
    ).length;

    const summary = {
      pineconeDeletedCount: results.filter(r => r.phases.pinecone.success).length,
      pineconeFailedCount: results.filter(r => r.phases.pinecone.success === false && r.phases.pinecone.error).length,
      mongodbDeletedCount: results.filter(r => r.phases.mongodb.success).length,
      mongodbFailedCount: results.filter(r => r.phases.mongodb.success === false && r.phases.mongodb.error).length,
      cloudinaryDeletedCount: results.filter(r => r.phases.cloudinary.success).length,
      cloudinaryFailedCount: results.filter(r => r.phases.cloudinary.success === false && r.phases.cloudinary.error).length,
    };

    const processingTimeMs = Date.now() - startTime;

    // Log comprehensive metrics
    logger.info(
      `[BulkDelete] Completed for user ${userId}: ` +
      `${totalSucceeded} succeeded, ${totalFailed} failed, ${totalPartiallyFailed} partially failed. ` +
      `Pinecone: ${summary.pineconeDeletedCount}/${results.length}, ` +
      `MongoDB: ${summary.mongodbDeletedCount}/${results.length}, ` +
      `Cloudinary: ${summary.cloudinaryDeletedCount}/${results.length}. ` +
      `Processing time: ${processingTimeMs}ms`
    );

    // Alert on inconsistent states
    if (totalPartiallyFailed > 0) {
      logger.error(
        `[BulkDelete] ⚠ WARNING: ${totalPartiallyFailed} items in INCONSISTENT STATE (Pinecone deleted, MongoDB failed). ` +
        `Manual intervention may be required for: ${results.filter(r => !r.success && r.phases.pinecone.success).map(r => r.contentId).join(', ')}`
      );
    }

    return {
      success: totalSucceeded > 0,
      totalRequested: contentIds.length,
      totalSucceeded,
      totalFailed,
      totalPartiallyFailed,
      results,
      summary,
      processingTimeMs,
    };
  }

  /**
   * Enhanced permanent deletion with phase-level tracking
   * Wraps permanentlyDeleteContent and captures phase-specific results
   * 
   * @private Internal method for bulk delete tracking
   */
  private async permanentlyDeleteContentWithTracking(
    contentId: string,
    userId: string
  ): Promise<ContentDeleteResult['phases']> {
    const phases: ContentDeleteResult['phases'] = {
      validation: { success: false },
      pinecone: { success: false },
      cloudinary: { success: false },
      mongodb: { success: false },
    };

    try {
      // PHASE 0: Validation - Check if content exists
      const content = await Content.findOne({
        _id: contentId,
        userId: new mongoose.Types.ObjectId(userId),
      });

      if (!content) {
        phases.validation.success = false;
        phases.validation.error = 'Content not found or access denied';
        return phases;
      }

      phases.validation.success = true;

      const cloudinaryPublicId = content.cloudinaryPublicId;

      // PHASE 1a: Pinecone deletion (CRITICAL)
      try {
        await deleteContentFromVectorStore(contentId, { 
          retries: 3, 
          throwOnError: true,
          userId: userId // Add userId for additional security
        });
        phases.pinecone.success = true;
        phases.pinecone.deleted = true;
        logger.info(`[PhaseTracking] ✓ Pinecone deletion succeeded for ${contentId}`);
      } catch (pineconeError) {
        phases.pinecone.success = false;
        phases.pinecone.error = pineconeError instanceof Error ? pineconeError.message : String(pineconeError);
        logger.error(`[PhaseTracking] ✗ Pinecone deletion failed for ${contentId}:`, pineconeError);
        // Don't proceed if Pinecone fails - return early to prevent inconsistent state
        return phases;
      }

      // PHASE 1b: Cloudinary deletion (NON-CRITICAL)
      if (cloudinaryPublicId) {
        try {
          const { deleteFromCloudinaryWithRetry } = await import('../../config/cloudinary.config');
          const result = await deleteFromCloudinaryWithRetry(cloudinaryPublicId, 'raw', {
            retries: 2,
            throwOnError: false,
            logErrors: true
          });
          
          phases.cloudinary.success = result.success;
          phases.cloudinary.deleted = result.deleted;
          phases.cloudinary.error = result.error;
          
          if (result.success) {
            logger.info(`[PhaseTracking] ✓ Cloudinary deletion ${result.deleted ? 'succeeded' : 'completed (file not found)'} for ${contentId}`);
          } else {
            logger.warn(`[PhaseTracking] ⚠ Cloudinary deletion failed for ${contentId} (non-critical): ${result.error}`);
          }
        } catch (cloudinaryError) {
          phases.cloudinary.success = false;
          phases.cloudinary.error = cloudinaryError instanceof Error ? cloudinaryError.message : String(cloudinaryError);
          logger.warn(`[PhaseTracking] ⚠ Cloudinary deletion failed for ${contentId} (non-critical):`, cloudinaryError);
          // Continue despite Cloudinary failure
        }
      } else {
        phases.cloudinary.success = true; // No Cloudinary file to delete
        phases.cloudinary.deleted = false;
      }

      // PHASE 2: MongoDB deletion with transaction
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const deletedCounts: any = {
          content: 0,
          transcripts: 0,
          summaries: 0,
          flashcards: 0,
          flashcardReviews: 0,
          quizzes: 0,
          quizAttempts: 0,
          qaRecords: 0,
          chatSessions: 0,
        };

        // Delete related data (cascade)
        const transcriptResult = await Transcript.deleteMany(
          { contentId: new mongoose.Types.ObjectId(contentId) },
          { session }
        );
        deletedCounts.transcripts = transcriptResult.deletedCount || 0;

        const summaryResult = await Summary.deleteMany(
          { contentId: new mongoose.Types.ObjectId(contentId) },
          { session }
        );
        deletedCounts.summaries = summaryResult.deletedCount || 0;

        const flashcardReviewResult = await FlashcardReview.deleteMany(
          { contentId: new mongoose.Types.ObjectId(contentId) },
          { session }
        );
        deletedCounts.flashcardReviews = flashcardReviewResult.deletedCount || 0;

        const flashcardResult = await Flashcard.deleteMany(
          { contentId: new mongoose.Types.ObjectId(contentId) },
          { session }
        );
        deletedCounts.flashcards = flashcardResult.deletedCount || 0;

        const quizAttemptResult = await QuizAttempt.deleteMany(
          { contentId: new mongoose.Types.ObjectId(contentId) },
          { session }
        );
        deletedCounts.quizAttempts = quizAttemptResult.deletedCount || 0;

        const quizResult = await Quiz.deleteMany(
          { contentId: new mongoose.Types.ObjectId(contentId) },
          { session }
        );
        deletedCounts.quizzes = quizResult.deletedCount || 0;

        const qaResult = await QA.deleteMany(
          { contentId: new mongoose.Types.ObjectId(contentId) },
          { session }
        );
        deletedCounts.qaRecords = qaResult.deletedCount || 0;

        const chatSessionResult = await ChatSession.deleteMany(
          { contentId: new mongoose.Types.ObjectId(contentId) },
          { session }
        );
        deletedCounts.chatSessions = chatSessionResult.deletedCount || 0;

        // Delete content document
        await Content.deleteOne({ _id: contentId }, { session });
        deletedCounts.content = 1;

        await session.commitTransaction();
        phases.mongodb.success = true;
        phases.mongodb.deletedCounts = deletedCounts;
        logger.info(`[PhaseTracking] ✓ MongoDB deletion succeeded for ${contentId}:`, deletedCounts);
      } catch (mongoError) {
        await session.abortTransaction();
        phases.mongodb.success = false;
        phases.mongodb.error = mongoError instanceof Error ? mongoError.message : String(mongoError);
        logger.error(`[PhaseTracking] ✗ MongoDB deletion failed for ${contentId}:`, mongoError);
      } finally {
        session.endSession();
      }

      return phases;
    } catch (error) {
      logger.error(`[PhaseTracking] Unexpected error in permanentlyDeleteContentWithTracking for ${contentId}:`, error);
      // Mark all remaining phases as failed
      if (!phases.validation.success) {
        phases.validation.error = error instanceof Error ? error.message : String(error);
      }
      return phases;
    }
  }

  /**
   * Legacy bulk delete method - DEPRECATED
   * Use bulkDeleteContents() instead for better error tracking
   * Kept for backward compatibility
   * @deprecated
   */
  async bulkDeleteContentsLegacy(
    contentIds: string[],
    userId: string,
    permanent: boolean = false
  ): Promise<{
    success: boolean;
    successCount: number;
    failedCount: number;
    results: Array<{ contentId: string; success: boolean; message: string }>;
  }> {
    const results: Array<{ contentId: string; success: boolean; message: string }> = [];
    let successCount = 0;
    let failedCount = 0;

    for (const contentId of contentIds) {
      try {
        if (permanent) {
          const result = await this.permanentlyDeleteContent(contentId, userId);
          results.push({
            contentId,
            success: result.success,
            message: result.message,
          });
          if (result.success) successCount++;
          else failedCount++;
        } else {
          const result = await this.softDeleteContent(contentId, userId);
          results.push({
            contentId,
            success: result.success,
            message: result.message,
          });
          if (result.success) successCount++;
          else failedCount++;
        }
      } catch (error) {
        results.push({
          contentId,
          success: false,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        failedCount++;
      }
    }

    logger.info(`Bulk delete completed for user ${userId}: ${successCount} succeeded, ${failedCount} failed`);

    return {
      success: successCount > 0,
      successCount,
      failedCount,
      results,
    };
  }

  /**
   * Get all deleted contents (within recovery window)
   */
  async getDeletedContents(
    userId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<{
    contents: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    try {
      const query = {
        userId: new mongoose.Types.ObjectId(userId),
        isDeleted: true,
      };

      const skip = (page - 1) * limit;
      const [contents, total] = await Promise.all([
        Content.find(query)
          .sort({ deletedAt: -1 })
          .skip(skip)
          .limit(limit)
          .select('-__v')
          .lean(),
        Content.countDocuments(query),
      ]);

      // Add days until permanent deletion
      const contentsWithRecoveryInfo = contents.map((content: any) => {
        const daysSinceDeletion = content.deletedAt
          ? Math.floor((Date.now() - content.deletedAt.getTime()) / (1000 * 60 * 60 * 24))
          : 0;
        const daysUntilPermanentDeletion = Math.max(0, 30 - daysSinceDeletion);

        return {
          ...content,
          recoveryInfo: {
            daysSinceDeletion,
            daysUntilPermanentDeletion,
            canRecover: daysUntilPermanentDeletion > 0,
          },
        };
      });

      const totalPages = Math.ceil(total / limit);

      return {
        contents: contentsWithRecoveryInfo,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      };
    } catch (error) {
      logger.error(`Error retrieving deleted contents for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Clean up contents that exceeded 30-day recovery window
   */
  async cleanupExpiredDeletedContents(): Promise<number> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const expiredContents = await Content.find({
        isDeleted: true,
        deletedAt: { $lt: thirtyDaysAgo },
      });

      let deletedCount = 0;

      for (const content of expiredContents) {
        const contentId = (content._id as mongoose.Types.ObjectId).toString();
        const userId = (content.userId as mongoose.Types.ObjectId).toString();

        const result = await this.permanentlyDeleteContent(contentId, userId);
        if (result.success) {
          deletedCount++;
        }
      }

      logger.info(`Cleanup completed: ${deletedCount} expired contents permanently deleted`);

      return deletedCount;
    } catch (error) {
      logger.error(`Error cleaning up expired deleted contents:`, error);
      throw error;
    }
  }

  /**
   * Delete specific flashcards and their associated reviews
   */
  async deleteFlashcards(
    flashcardIds: string[],
    userId: string
  ): Promise<{ success: boolean; deletedCount: number; reviewsDeletedCount: number }> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Delete associated flashcard reviews first
      const reviewsResult = await FlashcardReview.deleteMany({
        flashcardId: { $in: flashcardIds.map(id => new mongoose.Types.ObjectId(id)) },
        userId: new mongoose.Types.ObjectId(userId),
      }, { session });

      // Delete flashcards
      const flashcardsResult = await Flashcard.deleteMany({
        _id: { $in: flashcardIds.map(id => new mongoose.Types.ObjectId(id)) },
        userId: new mongoose.Types.ObjectId(userId),
      }, { session });

      await session.commitTransaction();

      logger.info(
        `Deleted ${flashcardsResult.deletedCount} flashcards and ${reviewsResult.deletedCount} reviews for user ${userId}`
      );

      return {
        success: true,
        deletedCount: flashcardsResult.deletedCount || 0,
        reviewsDeletedCount: reviewsResult.deletedCount || 0,
      };
    } catch (error) {
      await session.abortTransaction();
      logger.error(`Error deleting flashcards:`, error);
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Delete specific Q&A records
   */
  async deleteQARecords(
    qaIds: string[],
    userId: string
  ): Promise<{ success: boolean; deletedCount: number }> {
    try {
      const result = await QA.deleteMany({
        _id: { $in: qaIds.map(id => new mongoose.Types.ObjectId(id)) },
        userId: new mongoose.Types.ObjectId(userId),
      });

      logger.info(`Deleted ${result.deletedCount} Q&A records for user ${userId}`);

      return {
        success: true,
        deletedCount: result.deletedCount || 0,
      };
    } catch (error) {
      logger.error(`Error deleting Q&A records:`, error);
      throw error;
    }
  }

  /**
   * Delete specific quizzes and their associated attempts
   */
  async deleteQuizzes(
    quizIds: string[],
    userId: string
  ): Promise<{ success: boolean; deletedCount: number; attemptsDeletedCount: number }> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Delete associated quiz attempts first
      const attemptsResult = await QuizAttempt.deleteMany({
        quizId: { $in: quizIds.map(id => new mongoose.Types.ObjectId(id)) },
        userId: new mongoose.Types.ObjectId(userId),
      }, { session });

      // Delete quizzes
      const quizzesResult = await Quiz.deleteMany({
        _id: { $in: quizIds.map(id => new mongoose.Types.ObjectId(id)) },
        userId: new mongoose.Types.ObjectId(userId),
      }, { session });

      await session.commitTransaction();

      logger.info(
        `Deleted ${quizzesResult.deletedCount} quizzes and ${attemptsResult.deletedCount} attempts for user ${userId}`
      );

      return {
        success: true,
        deletedCount: quizzesResult.deletedCount || 0,
        attemptsDeletedCount: attemptsResult.deletedCount || 0,
      };
    } catch (error) {
      await session.abortTransaction();
      logger.error(`Error deleting quizzes:`, error);
      throw error;
    } finally {
      session.endSession();
    }
  }
}

export const contentDeleteService = new ContentDeleteService();
