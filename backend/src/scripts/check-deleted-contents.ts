import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Content } from '../models/Content.model';
import { logger } from '../config/logger';

dotenv.config();

/**
 * Script to check for deleted contents in the database
 */
async function checkDeletedContents() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/study-buddy';
    await mongoose.connect(mongoUri);
    logger.info('Connected to MongoDB');

    // Check for all deleted contents
    const deletedContents = await Content.find({ isDeleted: true })
      .select('title type userId deletedAt isDeleted')
      .lean();

    logger.info(`Found ${deletedContents.length} deleted content(s)`);
    
    if (deletedContents.length > 0) {
      deletedContents.forEach((content: any, index: number) => {
        const daysSinceDeletion = content.deletedAt
          ? Math.floor((Date.now() - content.deletedAt.getTime()) / (1000 * 60 * 60 * 24))
          : 0;
        
        logger.info(`\n${index + 1}. Content ID: ${content._id}`);
        logger.info(`   Title: ${content.title}`);
        logger.info(`   Type: ${content.type}`);
        logger.info(`   User ID: ${content.userId}`);
        logger.info(`   Deleted At: ${content.deletedAt}`);
        logger.info(`   Days Since Deletion: ${daysSinceDeletion}`);
        logger.info(`   Is Deleted Flag: ${content.isDeleted}`);
      });
    } else {
      logger.info('No deleted contents found in the database');
      logger.info('\nTo test the deleted items feature:');
      logger.info('1. Upload some content via the UI');
      logger.info('2. Delete it using the delete button');
      logger.info('3. The deleted content should appear in the Deleted Items page');
    }

    // Check for all contents (deleted and not deleted)
    const totalContents = await Content.countDocuments({});
    const activeContents = await Content.countDocuments({ isDeleted: false });
    
    logger.info(`\n=== Summary ===`);
    logger.info(`Total Contents: ${totalContents}`);
    logger.info(`Active Contents: ${activeContents}`);
    logger.info(`Deleted Contents: ${deletedContents.length}`);

  } catch (error) {
    logger.error('Error checking deleted contents:', error);
  } finally {
    await mongoose.disconnect();
    logger.info('\nDisconnected from MongoDB');
  }
}

// Run the script
checkDeletedContents()
  .then(() => {
    logger.info('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Script failed:', error);
    process.exit(1);
  });
