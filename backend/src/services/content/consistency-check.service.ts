import mongoose from 'mongoose';
import { Content } from '../../models/Content.model';
import { logger } from '../../config/logger';
import { getPineconeClient } from '../ai/vectorstore/setup';

export interface ConsistencyReport {
  contentId: string;
  status: 'consistent' | 'inconsistent' | 'unknown';
  details: {
    existsInMongoDB: boolean;
    existsInPinecone: boolean | null; // null if cannot check
    isDeleted?: boolean;
    deletedAt?: Date;
  };
  recommendation?: string;
}

/**
 * Check if a content exists in Pinecone vector store
 */
async function checkVectorStoreForContent(contentId: string): Promise<boolean | null> {
  try {
    const pineconeClient = getPineconeClient();
    if (!pineconeClient) {
      logger.warn('Pinecone client not initialized, cannot check vector store');
      return null;
    }

    const indexName = process.env.PINECONE_INDEX_NAME || 'study-buddy-transcripts';
    const index = pineconeClient.Index(indexName);

    // Query with metadata filter to check if vectors exist
    const queryResponse = await index.namespace('').query({
      vector: new Array(1536).fill(0), // Dummy vector for metadata-only query
      topK: 1,
      filter: { contentId: { $eq: contentId } },
      includeMetadata: true,
    });

    // If matches found, vectors exist
    return queryResponse.matches && queryResponse.matches.length > 0;
  } catch (error) {
    logger.error(`Error checking vector store for content ${contentId}:`, error);
    return null; // Cannot determine
  }
}

/**
 * Check consistency between MongoDB and Pinecone for a specific content
 */
export async function checkContentConsistency(contentId: string): Promise<ConsistencyReport> {
  try {
    // Check MongoDB
    const content = await Content.findById(contentId);
    const existsInMongoDB = content !== null;
    const isDeleted = content?.isDeleted || false;
    const deletedAt = content?.deletedAt;

    // Check Pinecone
    const existsInPinecone = await checkVectorStoreForContent(contentId);

    // Determine consistency status
    let status: 'consistent' | 'inconsistent' | 'unknown' = 'unknown';
    let recommendation: string | undefined;

    if (existsInPinecone === null) {
      status = 'unknown';
      recommendation = 'Cannot check Pinecone - client not initialized or query failed';
    } else if (!existsInMongoDB && !existsInPinecone) {
      status = 'consistent';
      recommendation = 'Content properly deleted from both systems';
    } else if (existsInMongoDB && existsInPinecone) {
      status = 'consistent';
      if (isDeleted) {
        recommendation = 'Content soft-deleted in MongoDB, vectors still in Pinecone (expected)';
      }
    } else if (!existsInMongoDB && existsInPinecone) {
      status = 'inconsistent';
      recommendation = '⚠ CRITICAL: Content deleted from MongoDB but vectors remain in Pinecone. Run cleanup.';
    } else if (existsInMongoDB && !existsInPinecone) {
      status = 'inconsistent';
      recommendation = '⚠ WARNING: Content exists in MongoDB but no vectors in Pinecone. May need re-processing.';
    }

    return {
      contentId,
      status,
      details: {
        existsInMongoDB,
        existsInPinecone,
        isDeleted,
        deletedAt,
      },
      recommendation,
    };
  } catch (error) {
    logger.error(`Error checking consistency for content ${contentId}:`, error);
    return {
      contentId,
      status: 'unknown',
      details: {
        existsInMongoDB: false,
        existsInPinecone: null,
      },
      recommendation: `Error during check: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Scan for inconsistencies across all contents
 * WARNING: This can be expensive for large datasets
 */
export async function scanForInconsistencies(
  options: { limit?: number; userId?: string } = {}
): Promise<ConsistencyReport[]> {
  const { limit = 100, userId } = options;

  try {
    const query: any = {};
    if (userId) {
      query.userId = new mongoose.Types.ObjectId(userId);
    }

    const contents = await Content.find(query).limit(limit).select('_id').lean();
    const reports: ConsistencyReport[] = [];

    logger.info(`Scanning ${contents.length} contents for consistency...`);

    for (const content of contents) {
      const contentId = (content._id as mongoose.Types.ObjectId).toString();
      const report = await checkContentConsistency(contentId);
      
      if (report.status === 'inconsistent') {
        reports.push(report);
        logger.warn(`Inconsistency found for content ${contentId}:`, report);
      }
    }

    logger.info(`Consistency scan complete. Found ${reports.length} inconsistencies out of ${contents.length} contents.`);

    return reports;
  } catch (error) {
    logger.error('Error scanning for inconsistencies:', error);
    throw error;
  }
}

/**
 * Cleanup orphaned vectors in Pinecone (vectors without corresponding MongoDB content)
 */
export async function cleanupOrphanedVectors(contentIds: string[]): Promise<{
  success: boolean;
  cleanedCount: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let cleanedCount = 0;

  try {
    const pineconeClient = getPineconeClient();
    if (!pineconeClient) {
      throw new Error('Pinecone client not initialized');
    }

    const indexName = process.env.PINECONE_INDEX_NAME || 'study-buddy-transcripts';
    const index = pineconeClient.Index(indexName);

    for (const contentId of contentIds) {
      try {
        // Verify content doesn't exist in MongoDB
        const content = await Content.findById(contentId);
        if (content) {
          logger.warn(`Content ${contentId} exists in MongoDB - skipping cleanup`);
          continue;
        }

        // Delete vectors from Pinecone
        await index.namespace('').deleteMany({
          contentId: { $eq: contentId },
        });

        cleanedCount++;
        logger.info(`Cleaned up orphaned vectors for content ${contentId}`);
      } catch (error) {
        const errorMsg = `Failed to cleanup vectors for ${contentId}: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
        logger.error(errorMsg);
      }
    }

    return {
      success: errors.length === 0,
      cleanedCount,
      errors,
    };
  } catch (error) {
    logger.error('Error during orphaned vectors cleanup:', error);
    throw error;
  }
}

export const consistencyCheckService = {
  checkContentConsistency,
  scanForInconsistencies,
  cleanupOrphanedVectors,
};
