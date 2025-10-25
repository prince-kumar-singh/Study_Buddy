import mongoose from 'mongoose';
import { config } from 'dotenv';
import { contentDeleteService } from '../services/content/delete.service';
import { logger } from '../config/logger';

// Load environment variables
config();

/**
 * Cleanup script for expired deleted contents
 * This should be run as a cron job (e.g., daily at midnight)
 * 
 * Usage: npx ts-node src/scripts/cleanup-expired-contents.ts
 */
async function cleanupExpiredContents() {
  try {
    logger.info('Starting cleanup of expired deleted contents...');

    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/study-buddy';
    await mongoose.connect(mongoUri);
    logger.info('Connected to MongoDB');

    // Run cleanup
    const deletedCount = await contentDeleteService.cleanupExpiredDeletedContents();

    logger.info(`Cleanup completed successfully. ${deletedCount} expired contents permanently deleted.`);

    // Disconnect
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');

    process.exit(0);
  } catch (error) {
    logger.error('Error during cleanup:', error);
    process.exit(1);
  }
}

// Run cleanup
cleanupExpiredContents();
