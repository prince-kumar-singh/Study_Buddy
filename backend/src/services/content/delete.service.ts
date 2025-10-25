import mongoose from 'mongoose';
import { Content } from '../../models/Content.model';
import { Flashcard } from '../../models/Flashcard.model';
import { Summary } from '../../models/Summary.model';
import { QA } from '../../models/QA.model';
import { Transcript } from '../../models/Transcript.model';
import { logger } from '../../config/logger';
import { v2 as cloudinary } from 'cloudinary';

export interface DeleteOptions {
  permanent?: boolean;
  deleteRelatedData?: boolean;
  deleteFromCloudinary?: boolean;
}

export class ContentDeleteService {
  /**
   * Soft delete content (30-day recovery window)
   */
  async softDeleteContent(
    contentId: string,
    userId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const content = await Content.findOne({
        _id: contentId,
        userId: new mongoose.Types.ObjectId(userId),
        isDeleted: false,
      });

      if (!content) {
        return { success: false, message: 'Content not found' };
      }

      content.isDeleted = true;
      content.deletedAt = new Date();
      await content.save();

      logger.info(`Content soft deleted: ${contentId} by user ${userId}`);

      return {
        success: true,
        message: 'Content deleted successfully. You can recover it within 30 days.',
      };
    } catch (error) {
      logger.error(`Error soft deleting content ${contentId}:`, error);
      throw error;
    }
  }

  /**
   * Restore soft-deleted content
   */
  async restoreContent(
    contentId: string,
    userId: string
  ): Promise<{ success: boolean; message: string }> {
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

      content.isDeleted = false;
      content.deletedAt = undefined;
      await content.save();

      logger.info(`Content restored: ${contentId} by user ${userId}`);

      return {
        success: true,
        message: 'Content restored successfully',
      };
    } catch (error) {
      logger.error(`Error restoring content ${contentId}:`, error);
      throw error;
    }
  }

  /**
   * Permanently delete content and all related data
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

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Find content
      const content = await Content.findOne({
        _id: contentId,
        userId: new mongoose.Types.ObjectId(userId),
      }).session(session);

      if (!content) {
        await session.abortTransaction();
        return {
          success: false,
          message: 'Content not found',
          deletedCounts: {},
        };
      }

      const deletedCounts: any = {
        content: 0,
        transcripts: 0,
        summaries: 0,
        flashcards: 0,
        qaRecords: 0,
        cloudinaryFiles: 0,
      };

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

        // Delete flashcards
        const flashcardResult = await Flashcard.deleteMany(
          { contentId: new mongoose.Types.ObjectId(contentId) },
          { session }
        );
        deletedCounts.flashcards = flashcardResult.deletedCount || 0;

        // Delete Q&A records
        const qaResult = await QA.deleteMany(
          { contentId: new mongoose.Types.ObjectId(contentId) },
          { session }
        );
        deletedCounts.qaRecords = qaResult.deletedCount || 0;

        logger.info(`Deleted related data for content ${contentId}:`, deletedCounts);
      }

      // Delete from Cloudinary if applicable
      if (deleteFromCloudinary && content.cloudinaryPublicId) {
        try {
          await cloudinary.uploader.destroy(content.cloudinaryPublicId, {
            resource_type: 'raw',
          });
          deletedCounts.cloudinaryFiles = 1;
          logger.info(`Deleted Cloudinary file: ${content.cloudinaryPublicId}`);
        } catch (cloudinaryError) {
          logger.error(`Failed to delete Cloudinary file:`, cloudinaryError);
          // Continue with deletion even if Cloudinary fails
        }
      }

      // Delete content document
      await Content.deleteOne({ _id: contentId }, { session });
      deletedCounts.content = 1;

      await session.commitTransaction();

      logger.info(`Content permanently deleted: ${contentId} by user ${userId}`, deletedCounts);

      return {
        success: true,
        message: 'Content and all related data permanently deleted',
        deletedCounts,
      };
    } catch (error) {
      await session.abortTransaction();
      logger.error(`Error permanently deleting content ${contentId}:`, error);
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Bulk delete multiple contents
   */
  async bulkDeleteContents(
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
   * Delete specific flashcards
   */
  async deleteFlashcards(
    flashcardIds: string[],
    userId: string
  ): Promise<{ success: boolean; deletedCount: number }> {
    try {
      const result = await Flashcard.deleteMany({
        _id: { $in: flashcardIds.map(id => new mongoose.Types.ObjectId(id)) },
        userId: new mongoose.Types.ObjectId(userId),
      });

      logger.info(`Deleted ${result.deletedCount} flashcards for user ${userId}`);

      return {
        success: true,
        deletedCount: result.deletedCount || 0,
      };
    } catch (error) {
      logger.error(`Error deleting flashcards:`, error);
      throw error;
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
}

export const contentDeleteService = new ContentDeleteService();
