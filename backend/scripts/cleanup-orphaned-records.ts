/**
 * Script to Clean Up Orphaned Records
 * 
 * This script identifies and removes orphaned QuizAttempts, FlashcardReviews, 
 * and Quizzes that reference non-existent content.
 * 
 * Usage:
 *   node scripts/cleanup-orphaned-records.js [--dry-run] [--limit=1000]
 * 
 * Options:
 *   --dry-run    Show what would be deleted without actually deleting
 *   --limit=N    Process only N records at a time (default: 1000)
 */

import mongoose from 'mongoose';
import { Content } from '../src/models/Content.model';
import { Quiz } from '../src/models/Quiz.model';
import { QuizAttempt } from '../src/models/QuizAttempt.model';
import { Flashcard } from '../src/models/Flashcard.model';
import { FlashcardReview } from '../src/models/FlashcardReview.model';
import { logger } from '../src/config/logger';

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limitArg = args.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 1000;

interface CleanupStats {
  quizzes: number;
  quizAttempts: number;
  flashcardReviews: number;
  flashcardsWithOrphanedReviews: number;
}

async function connectDatabase() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/study_buddy';
  await mongoose.connect(mongoUri);
  logger.info('Connected to MongoDB');
}

async function findOrphanedQuizzes(): Promise<string[]> {
  logger.info('Scanning for orphaned quizzes...');
  
  const allContentIds = await Content.distinct('_id');
  const contentIdStrings = allContentIds.map(id => id.toString());
  
  const orphanedQuizzes = await Quiz.find({
    contentId: { $nin: allContentIds }
  }).select('_id contentId').limit(limit).lean();
  
  logger.info(`Found ${orphanedQuizzes.length} orphaned quizzes`);
  
  return orphanedQuizzes.map(q => q._id.toString());
}

async function findOrphanedQuizAttempts(): Promise<string[]> {
  logger.info('Scanning for orphaned quiz attempts...');
  
  const allContentIds = await Content.distinct('_id');
  
  const orphanedAttempts = await QuizAttempt.find({
    contentId: { $nin: allContentIds }
  }).select('_id contentId').limit(limit).lean();
  
  logger.info(`Found ${orphanedAttempts.length} orphaned quiz attempts`);
  
  return orphanedAttempts.map(a => a._id.toString());
}

async function findOrphanedFlashcardReviews(): Promise<string[]> {
  logger.info('Scanning for orphaned flashcard reviews...');
  
  const allContentIds = await Content.distinct('_id');
  
  const orphanedReviews = await FlashcardReview.find({
    contentId: { $nin: allContentIds }
  }).select('_id contentId flashcardId').limit(limit).lean();
  
  logger.info(`Found ${orphanedReviews.length} orphaned flashcard reviews`);
  
  return orphanedReviews.map(r => r._id.toString());
}

async function findFlashcardsWithOrphanedReviews(): Promise<string[]> {
  logger.info('Scanning for flashcard reviews referencing deleted flashcards...');
  
  const allFlashcardIds = await Flashcard.distinct('_id');
  
  const orphanedReviews = await FlashcardReview.find({
    flashcardId: { $nin: allFlashcardIds }
  }).select('_id flashcardId').limit(limit).lean();
  
  logger.info(`Found ${orphanedReviews.length} reviews referencing deleted flashcards`);
  
  return orphanedReviews.map(r => r._id.toString());
}

async function deleteOrphanedRecords(
  model: mongoose.Model<any>,
  ids: string[],
  modelName: string
): Promise<number> {
  if (ids.length === 0) {
    return 0;
  }

  if (isDryRun) {
    logger.info(`[DRY RUN] Would delete ${ids.length} orphaned ${modelName} records`);
    return 0;
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const result = await model.deleteMany(
      { _id: { $in: ids.map(id => new mongoose.Types.ObjectId(id)) } },
      { session }
    );

    await session.commitTransaction();
    
    const deletedCount = result.deletedCount || 0;
    logger.info(`✅ Deleted ${deletedCount} orphaned ${modelName} records`);
    
    return deletedCount;
  } catch (error) {
    await session.abortTransaction();
    logger.error(`❌ Failed to delete ${modelName} records:`, error);
    throw error;
  } finally {
    session.endSession();
  }
}

async function cleanupOrphanedRecords(): Promise<CleanupStats> {
  const stats: CleanupStats = {
    quizzes: 0,
    quizAttempts: 0,
    flashcardReviews: 0,
    flashcardsWithOrphanedReviews: 0,
  };

  try {
    // 1. Find and delete orphaned quiz attempts (must be before quizzes)
    const orphanedAttemptIds = await findOrphanedQuizAttempts();
    stats.quizAttempts = await deleteOrphanedRecords(
      QuizAttempt,
      orphanedAttemptIds,
      'QuizAttempt'
    );

    // 2. Find and delete orphaned quizzes
    const orphanedQuizIds = await findOrphanedQuizzes();
    stats.quizzes = await deleteOrphanedRecords(
      Quiz,
      orphanedQuizIds,
      'Quiz'
    );

    // 3. Find and delete orphaned flashcard reviews
    const orphanedReviewIds = await findOrphanedFlashcardReviews();
    stats.flashcardReviews = await deleteOrphanedRecords(
      FlashcardReview,
      orphanedReviewIds,
      'FlashcardReview (by contentId)'
    );

    // 4. Find and delete reviews referencing deleted flashcards
    const orphanedFlashcardReviewIds = await findFlashcardsWithOrphanedReviews();
    stats.flashcardsWithOrphanedReviews = await deleteOrphanedRecords(
      FlashcardReview,
      orphanedFlashcardReviewIds,
      'FlashcardReview (by flashcardId)'
    );

    return stats;
  } catch (error) {
    logger.error('Cleanup process failed:', error);
    throw error;
  }
}

async function generateCleanupReport(stats: CleanupStats) {
  console.log('\n' + '='.repeat(60));
  console.log('📊 ORPHANED RECORDS CLEANUP REPORT');
  console.log('='.repeat(60));
  
  if (isDryRun) {
    console.log('\n⚠️  DRY RUN MODE - No records were actually deleted\n');
  } else {
    console.log('\n✅ CLEANUP COMPLETED\n');
  }
  
  console.log('Records Processed:');
  console.log(`  • Orphaned Quizzes:              ${stats.quizzes.toString().padStart(6)}`);
  console.log(`  • Orphaned Quiz Attempts:        ${stats.quizAttempts.toString().padStart(6)}`);
  console.log(`  • Orphaned Flashcard Reviews:    ${stats.flashcardReviews.toString().padStart(6)}`);
  console.log(`  • Orphaned Reviews (flashcards): ${stats.flashcardsWithOrphanedReviews.toString().padStart(6)}`);
  console.log('  ' + '-'.repeat(35));
  
  const total = stats.quizzes + stats.quizAttempts + stats.flashcardReviews + stats.flashcardsWithOrphanedReviews;
  console.log(`  • Total Records ${isDryRun ? 'Found' : 'Deleted'}:        ${total.toString().padStart(6)}`);
  console.log('\n' + '='.repeat(60));

  // Recommendations
  if (isDryRun && total > 0) {
    console.log('\n💡 RECOMMENDATIONS:');
    console.log('  1. Review the counts above');
    console.log('  2. Backup your database before proceeding');
    console.log('  3. Run without --dry-run flag to delete orphaned records:');
    console.log('     node scripts/cleanup-orphaned-records.js');
    console.log('');
  } else if (total === 0) {
    console.log('\n✨ Database is clean! No orphaned records found.');
    console.log('');
  } else {
    console.log('\n✅ Cleanup completed successfully!');
    console.log('  • All orphaned records have been removed');
    console.log('  • Database integrity restored');
    console.log('');
  }
}

async function verifyDataIntegrity() {
  logger.info('Verifying data integrity after cleanup...');

  // Count remaining orphaned records
  const allContentIds = await Content.distinct('_id');
  const allFlashcardIds = await Flashcard.distinct('_id');

  const remainingOrphans = {
    quizzes: await Quiz.countDocuments({ contentId: { $nin: allContentIds } }),
    quizAttempts: await QuizAttempt.countDocuments({ contentId: { $nin: allContentIds } }),
    reviewsByContent: await FlashcardReview.countDocuments({ contentId: { $nin: allContentIds } }),
    reviewsByFlashcard: await FlashcardReview.countDocuments({ flashcardId: { $nin: allFlashcardIds } }),
  };

  const totalRemaining = 
    remainingOrphans.quizzes + 
    remainingOrphans.quizAttempts + 
    remainingOrphans.reviewsByContent + 
    remainingOrphans.reviewsByFlashcard;

  if (totalRemaining > 0) {
    console.log('\n⚠️  WARNING: Some orphaned records remain:');
    console.log(remainingOrphans);
    console.log('This may indicate records exceed the batch limit. Run the script again.');
  } else {
    console.log('\n✅ Data integrity verified - No orphaned records remain');
  }

  return totalRemaining === 0;
}

async function main() {
  console.log('\n🧹 Orphaned Records Cleanup Script');
  console.log('===================================\n');
  
  if (isDryRun) {
    console.log('🔍 Running in DRY RUN mode (no deletions will occur)\n');
  } else {
    console.log('⚠️  Running in LIVE mode (records will be deleted)\n');
    console.log('Press Ctrl+C within 5 seconds to cancel...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  try {
    await connectDatabase();

    const stats = await cleanupOrphanedRecords();
    await generateCleanupReport(stats);

    if (!isDryRun) {
      await verifyDataIntegrity();
    }

    logger.info('Cleanup script completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Cleanup script failed:', error);
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

// Run the script
main();
