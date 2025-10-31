import express from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { consistencyCheckService } from '../services/content/consistency-check.service';
import { ScheduledJobsService } from '../services/jobs/scheduled-jobs.service';
import { logger } from '../config/logger';

const router = express.Router();

/**
 * @route GET /api/admin/consistency/check/:contentId
 * @desc Check consistency for a specific content
 * @access Admin only
 */
router.get('/check/:contentId', authenticate, async (req, res) => {
  try {
    // TODO: Add admin role check middleware
    // For now, assuming authenticated users can check their own content
    
    const { contentId } = req.params;

    const report = await consistencyCheckService.checkContentConsistency(contentId);

    res.json({
      success: true,
      report,
    });
  } catch (error) {
    logger.error('Error checking content consistency:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check consistency',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @route GET /api/admin/consistency/scan
 * @desc Scan for inconsistencies across user's contents
 * @access Admin only
 */
router.get('/scan', authenticate, async (req, res) => {
  try {
    const userId = req.user?.id;
    const limit = parseInt(req.query.limit as string) || 100;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    const reports = await consistencyCheckService.scanForInconsistencies({
      userId,
      limit,
    });

    res.json({
      success: true,
      inconsistenciesFound: reports.length,
      reports,
      message: reports.length === 0 
        ? 'No inconsistencies found' 
        : `Found ${reports.length} inconsistencies`,
    });
  } catch (error) {
    logger.error('Error scanning for inconsistencies:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to scan for inconsistencies',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @route POST /api/admin/consistency/cleanup
 * @desc Cleanup orphaned vectors for specified content IDs
 * @access Admin only
 */
router.post('/cleanup', authenticate, async (req, res) => {
  try {
    // TODO: Add admin role check middleware
    
    const { contentIds } = req.body;

    if (!Array.isArray(contentIds) || contentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'contentIds array is required',
      });
    }

    if (contentIds.length > 50) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cleanup more than 50 content IDs at once',
      });
    }

    const result = await consistencyCheckService.cleanupOrphanedVectors(contentIds);

    res.json({
      success: result.success,
      cleanedCount: result.cleanedCount,
      errors: result.errors,
      message: result.success 
        ? `Successfully cleaned up ${result.cleanedCount} orphaned vectors`
        : `Cleanup completed with ${result.errors.length} errors`,
    });
  } catch (error) {
    logger.error('Error cleaning up orphaned vectors:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cleanup orphaned vectors',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @route GET /api/admin/consistency/health
 * @desc Check overall system consistency health
 * @access Admin only
 */
router.get('/health', authenticate, async (req, res) => {
  try {
    const userId = req.user?.id;
    const sampleSize = 50; // Check a sample of recent contents

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    const reports = await consistencyCheckService.scanForInconsistencies({
      userId,
      limit: sampleSize,
    });

    const healthStatus = {
      healthy: reports.length === 0,
      sampleSize,
      inconsistenciesFound: reports.length,
      consistencyRate: ((sampleSize - reports.length) / sampleSize * 100).toFixed(2) + '%',
      criticalIssues: reports.filter(r => 
        r.recommendation?.includes('CRITICAL')
      ).length,
      warnings: reports.filter(r => 
        r.recommendation?.includes('WARNING')
      ).length,
    };

    res.json({
      success: true,
      health: healthStatus,
      details: reports.length > 0 ? reports.slice(0, 10) : [], // Return first 10 issues
    });
  } catch (error) {
    logger.error('Error checking consistency health:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check consistency health',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @route POST /api/admin/consistency/cleanup/expired-content
 * @desc Manually trigger cleanup of expired soft-deleted content
 * @access Admin only
 */
router.post('/cleanup/expired-content', authenticate, async (req, res) => {
  try {
    // TODO: Add admin role check middleware
    logger.info('Manual cleanup of expired content triggered by admin');
    
    const jobsService = new ScheduledJobsService();
    await (jobsService as any).cleanupExpiredContent(); // Access private method for manual trigger
    
    res.json({
      success: true,
      message: 'Expired content cleanup completed successfully',
    });
  } catch (error) {
    logger.error('Error in manual expired content cleanup:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cleanup expired content',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @route POST /api/admin/consistency/cleanup/cloudinary-orphans
 * @desc Manually trigger cleanup of orphaned Cloudinary files
 * @access Admin only
 */
router.post('/cleanup/cloudinary-orphans', authenticate, async (req, res) => {
  try {
    // TODO: Add admin role check middleware
    logger.info('Manual cleanup of orphaned Cloudinary files triggered by admin');
    
    const jobsService = new ScheduledJobsService();
    await (jobsService as any).cleanupOrphanedCloudinaryFiles(); // Access private method for manual trigger
    
    res.json({
      success: true,
      message: 'Orphaned Cloudinary files cleanup completed successfully',
    });
  } catch (error) {
    logger.error('Error in manual Cloudinary cleanup:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cleanup orphaned Cloudinary files',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @route GET /api/admin/consistency/cleanup/status
 * @desc Get cleanup job statistics and status
 * @access Admin only
 */
router.get('/cleanup/status', authenticate, async (req, res) => {
  try {
    const { Content } = await import('../models/Content.model');
    const { cloudinary } = await import('../config/cloudinary.config');
    
    // Get soft-deleted content statistics
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const expiredSoftDeletedCount = await Content.countDocuments({
      isDeleted: true,
      deletedAt: { $lt: thirtyDaysAgo }
    });
    
    const recentSoftDeletedCount = await Content.countDocuments({
      isDeleted: true,
      deletedAt: { $gte: thirtyDaysAgo }
    });
    
    // Get Cloudinary orphaned files count
    let orphanedCloudinaryCount = 0;
    try {
      const searchResult = await cloudinary.search
        .expression('tags:soft-deleted')
        .max_results(500)
        .execute();
      orphanedCloudinaryCount = searchResult.resources?.length || 0;
    } catch (cloudinaryError) {
      logger.warn('Could not fetch Cloudinary orphaned files count:', cloudinaryError);
    }
    
    res.json({
      success: true,
      status: {
        expiredSoftDeletedContent: expiredSoftDeletedCount,
        recentSoftDeletedContent: recentSoftDeletedCount,
        orphanedCloudinaryFiles: orphanedCloudinaryCount,
        cleanupThreshold: '30 days',
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Error getting cleanup status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get cleanup status',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
