/**
 * Scheduled Jobs Service
 * 
 * Handles periodic background tasks including:
 * - Auto-resume paused content after quota restoration
 * - Cleanup expired data
 * - Performance monitoring
 */

import * as cron from 'node-cron';
import { Content, IContent } from '../../models/Content.model';
import { logger } from '../../config/logger';
import { ContentProcessor } from '../processing/content.processor';
import { wsService } from '../../config/websocket';
import { emailService } from '../email.service';
import mongoose from 'mongoose';

export class ScheduledJobsService {
  private contentProcessor: ContentProcessor;
  private jobs: Array<cron.ScheduledTask> = [];

  constructor() {
    this.contentProcessor = new ContentProcessor(wsService);
  }

  /**
   * Initialize all scheduled jobs
   */
  start(): void {
    logger.info('Starting scheduled jobs service...');

    // Auto-resume paused content every hour
    const autoResumeJob = cron.schedule('0 * * * *', async () => {
      await this.autoResumePausedContent();
    });
    this.jobs.push(autoResumeJob);

    // Check quota-paused content more frequently (every 15 minutes)
    const quotaCheckJob = cron.schedule('*/15 * * * *', async () => {
      await this.checkQuotaPausedContent();
    });
    this.jobs.push(quotaCheckJob);

    // Cleanup expired soft-deleted content daily at 2:00 AM
    const cleanupJob = cron.schedule('0 2 * * *', async () => {
      await this.cleanupExpiredContent();
    });
    this.jobs.push(cleanupJob);

    logger.info(`Started ${this.jobs.length} scheduled jobs`);
  }

  /**
   * Stop all scheduled jobs
   */
  stop(): void {
    logger.info('Stopping scheduled jobs...');
    this.jobs.forEach(job => job.stop());
    this.jobs = [];
  }

  /**
   * Auto-resume paused content after quota restoration
   * Runs every hour to check if any paused content can be resumed
   */
  private async autoResumePausedContent(): Promise<void> {
    try {
      logger.info('Running auto-resume job for paused content...');

      // Find all paused content with quota issues
      const pausedContents: IContent[] = await Content.find({
        status: 'paused',
        'metadata.pausedReason': 'quota_exceeded',
      }).limit(50); // Process max 50 at a time

      if (pausedContents.length === 0) {
        logger.info('No paused content found for auto-resume');
        return;
      }

      logger.info(`Found ${pausedContents.length} paused content(s) to check`);

      let resumedCount = 0;
      let skippedCount = 0;

      for (const content of pausedContents) {
        try {
          const quotaInfo = content.metadata?.quotaInfo;
          const contentId = (content._id as any).toString();
          const userId = content.userId.toString();

          // Check if quota should be restored
          if (quotaInfo?.estimatedRecoveryTime) {
            const recoveryTime = new Date(quotaInfo.estimatedRecoveryTime);
            const now = new Date();

            if (now >= recoveryTime) {
              logger.info(`Auto-resuming content ${contentId} (quota should be restored)`);
              
              // Attempt to resume processing
              await this.contentProcessor.resumeProcessing(contentId, userId);

              // Send email notification if configured
              await this.sendResumeNotificationEmail(content);

              resumedCount++;
            } else {
              const minutesUntilRecovery = Math.ceil(
                (recoveryTime.getTime() - now.getTime()) / (1000 * 60)
              );
              logger.debug(
                `Content ${contentId} still waiting for quota recovery (${minutesUntilRecovery} minutes)`
              );
              skippedCount++;
            }
          } else {
            // No recovery time set, try to resume anyway (may have been manually fixed)
            logger.info(`Auto-resuming content ${contentId} (no recovery time set)`);
            await this.contentProcessor.resumeProcessing(contentId, userId);
            
            // Send email notification if configured
            await this.sendResumeNotificationEmail(content);
            
            resumedCount++;
          }
        } catch (error) {
          logger.error(`Failed to auto-resume content ${content._id}:`, error);
          
          // If resuming fails due to quota still being exceeded, update recovery time
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (errorMessage.includes('quota') || errorMessage.includes('429')) {
            // Still quota issues, extend recovery time
            const newRecoveryTime = new Date(Date.now() + 60 * 60 * 1000); // +1 hour
            await Content.findByIdAndUpdate(content._id, {
              'metadata.quotaInfo.estimatedRecoveryTime': newRecoveryTime,
            });
            logger.info(`Extended recovery time for content ${content._id} to ${newRecoveryTime}`);
          }
        }
      }

      logger.info(
        `Auto-resume job completed: ${resumedCount} resumed, ${skippedCount} skipped`
      );
    } catch (error) {
      logger.error('Error in auto-resume job:', error);
    }
  }

  /**
   * Check quota-paused content and provide early warnings
   * Runs every 15 minutes for more frequent checks
   */
  private async checkQuotaPausedContent(): Promise<void> {
    try {
      const pausedContents = await Content.find({
        status: 'paused',
        'metadata.pausedReason': 'quota_exceeded',
      }).countDocuments();

      if (pausedContents > 0) {
        logger.info(`Currently ${pausedContents} content(s) paused due to quota limits`);
      }

      // Check if we're approaching quota limits (for future monitoring)
      // This is a placeholder for future quota monitoring integration
      // TODO: Integrate with Google AI API to check current quota usage
    } catch (error) {
      logger.error('Error checking quota-paused content:', error);
    }
  }

  /**
   * Send email notification when content auto-resumes
   */
  private async sendResumeNotificationEmail(content: IContent): Promise<void> {
    try {
      if (!emailService.isReady()) {
        logger.debug('Email service not configured, skipping notification');
        return;
      }

      // Fetch user data (assuming User model exists)
      const User = mongoose.model('User');
      const user = await User.findById(content.userId);

      if (!user) {
        logger.warn(`User not found for content ${content._id}`);
        return;
      }

      // Calculate paused duration
      const pausedAt = content.metadata?.pausedAt ? new Date(content.metadata.pausedAt) : new Date();
      const now = new Date();
      const durationMs = now.getTime() - pausedAt.getTime();
      const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
      const durationMinutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
      
      let pausedDuration = '';
      if (durationHours > 0) {
        pausedDuration = `${durationHours} hour${durationHours !== 1 ? 's' : ''}`;
        if (durationMinutes > 0) {
          pausedDuration += ` ${durationMinutes} minute${durationMinutes !== 1 ? 's' : ''}`;
        }
      } else {
        pausedDuration = `${durationMinutes} minute${durationMinutes !== 1 ? 's' : ''}`;
      }

      const emailData = {
        userName: (user as any).name || (user as any).email?.split('@')[0] || 'User',
        userEmail: (user as any).email,
        contentTitle: content.title,
        contentId: (content._id as any).toString(),
        contentType: content.type,
        pausedReason: content.metadata?.pausedReason || 'API quota limit reached',
        pausedDuration,
        frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
      };

      const success = await emailService.sendContentResumeEmail(emailData);

      if (success) {
        logger.info(`Resume notification email sent to ${emailData.userEmail} for content ${content._id}`);
      } else {
        logger.warn(`Failed to send resume notification email for content ${content._id}`);
      }
    } catch (error) {
      logger.error(`Error sending resume notification email for content ${content._id}:`, error);
      // Don't throw - email failure shouldn't break the auto-resume process
    }
  }

  /**
   * Cleanup expired soft-deleted content (after 30 days)
   * Permanently deletes content that was soft-deleted more than 30 days ago
   */
  private async cleanupExpiredContent(): Promise<void> {
    try {
      logger.info('Running cleanup job for expired soft-deleted content...');

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Find soft-deleted content older than 30 days
      const expiredContents: IContent[] = await Content.find({
        isDeleted: true,
        deletedAt: { $lt: thirtyDaysAgo }
      }).limit(50); // Process max 50 at a time

      if (expiredContents.length === 0) {
        logger.info('No expired soft-deleted content found');
        return;
      }

      logger.info(`Found ${expiredContents.length} expired content(s) to permanently delete`);

      // Import the content deletion service
      const { contentDeleteService } = await import('../content/delete.service');

      let deletedCount = 0;
      let failedCount = 0;

      for (const content of expiredContents) {
        try {
          const contentId = (content._id as any).toString();
          const userId = content.userId.toString();

          // Permanently delete the content and all related data
          const result = await contentDeleteService.permanentlyDeleteContent(
            contentId,
            userId,
            {
              deleteRelatedData: true,
              deleteFromCloudinary: true
            }
          );

          if (result.success) {
            deletedCount++;
            logger.info(`Successfully cleaned up expired content ${contentId}`);
          } else {
            failedCount++;
            logger.error(`Failed to cleanup expired content ${contentId}: ${result.message}`);
          }

        } catch (error) {
          failedCount++;
          logger.error(`Error cleaning up expired content ${content._id}:`, error);
        }
      }

      logger.info(`Cleanup job completed: ${deletedCount} deleted, ${failedCount} failed`);

    } catch (error) {
      logger.error('Error in cleanup job:', error);
    }
  }

  /**
   * Manually trigger auto-resume job (for testing)
   */
  async triggerAutoResume(): Promise<void> {
    await this.autoResumePausedContent();
  }

  /**
   * Manually trigger cleanup job (for testing)
   */
  async triggerCleanup(): Promise<void> {
    await this.cleanupExpiredContent();
  }

  /**
   * Get job status
   */
  getStatus(): { totalJobs: number; running: boolean } {
    return {
      totalJobs: this.jobs.length,
      running: this.jobs.length > 0,
    };
  }
}

// Singleton instance
export const scheduledJobsService = new ScheduledJobsService();
